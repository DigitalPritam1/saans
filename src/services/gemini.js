import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { computeItemImpact } from '../../server/impact.js';

let genAIClient = null;

export function setGenAIClient(client) {
  genAIClient = client;
}

function getGenAI() {
  if (genAIClient) {
    return genAIClient;
  }
  if (!config.geminiApiKey) {
    const error = new Error('GEMINI_API_KEY is not configured on the server.');
    error.statusCode = 503;
    throw error;
  }
  genAIClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
  return genAIClient;
}

const PLAN_SYSTEM_INSTRUCTION = `You are Saans (साँस), an expert Urban Air Quality and Environmental Health Assistant tailored for Indian families dealing with severe winter smog (in cities like Delhi NCR, Mumbai, Kolkata, Lucknow, Kanpur, Patna, etc.).
Your mission is to provide realistic, hyper-practical daily routines, indoor air quality hacks, and sustainable alternatives that protect vulnerable family members (infants, elderly, asthma/COPD patients) while minimizing exposure and emissions.

CRITICAL INSTRUCTIONS:
1. Ground advice strictly in Indian urban realities: winter temperature inversion, unsealed window/door gaps, tadka/frying fumes compounding indoor PM2.5, room heaters vs natural ventilation, wet mopping vs dry sweeping, and multi-generational households.
2. MEDICAL BOUNDARY: NEVER provide medical diagnosis, clinical judgment, or drug prescriptions. All impact numbers are environmental models, not medical estimates.
3. VULNERABLE PROTOCOL: Always provide an explicit, serious "see a doctor if" warning highlighting signs: persistent wheezing, chest tightness, breathlessness at rest, blue discoloration of lips or nail beds, lethargy in infants.
4. HOUSEPLANTS HONESTY: If houseplants are mentioned in indoor hacks, honestly state: "Great for wellbeing and mild VOC reduction, but does not measurably reduce PM2.5. Keep doing it, but rely on purifiers or sealing for particles." Never claim plants filter PM2.5 or produce meaningful nighttime oxygen to purify smog.
5. NO UNSUPPORTED CLAIMS: Do not make unsupported claims such as agarbatti smoke equating to specific numbers of cigarettes, or generic 450 ug/m3 smog claims.
6. OUTPUT FORMAT: Respond ONLY with valid JSON matching the requested structure without any markdown backticks.`;

const CHAT_SYSTEM_INSTRUCTION = `You are Saans (साँस), a friendly, helpful, and empathetic Indian Urban Air Quality and Health Assistant.
You assist families living in Indian cities during winter smog and severe pollution episodes.
GUIDELINES:
- Provide short, grounded, highly practical answers (max 2-3 concise paragraphs or bullet points).
- Tailor the advice directly to the user's current AQI and household profile.
- Strictly adhere to the requested language ('en' for English, 'hi' for Hindi in Devanagari script, 'mr' for Marathi in Devanagari script).
- Culturally appropriate advice for Indian homes (e.g. wet mopping instead of sweeping, tadka ventilation, avoiding morning jogs during smog inversion, sealing doors with damp cloths, N95 masks).
- NEVER give medical diagnoses or prescribe medications. If medical symptoms (persistent wheezing, severe breathlessness) are mentioned, advise consulting a physician or pulmonologist immediately.`;

/**
 * Helper to run an async operation with a 10s timeout
 */
async function callWithTimeout(fn, timeoutMs = 10000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('Upstream service timed out. Please try again.');
      err.statusCode = 504;
      err.isTimeout = true;
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate a structured daily smog action plan using Gemini
 * @param {object} params
 * @param {number|object} params.aqi
 * @param {object} params.profile
 * @param {object} [params.windows]
 * @returns {Promise<object>}
 */
export async function generatePlan({ aqi, profile = {}, windows }) {
  const ai = getGenAI();

  const aqiValue = typeof aqi === 'object' && aqi !== null ? aqi.aqi : Number(aqi) || 300;
  const aqiCategory = typeof aqi === 'object' && aqi !== null ? aqi.category || '' : '';
  const dominantPollutant = typeof aqi === 'object' && aqi !== null ? aqi.dominantPollutant || 'PM2.5' : 'PM2.5';

  let windowContext = '';
  if (windows && windows.bestWindow && windows.worstWindow) {
    const best = windows.bestWindow;
    const worst = windows.worstWindow;
    windowContext = `
Forecast Windows:
- Best window today: ${best.start} to ${best.end} (AQI ${best.aqi}).
- Worst window today: ${worst.start} to ${worst.end} (AQI ${worst.aqi}).
Rule: You must use these exact hours for outdoor activities. If the best window is in the afternoon (12:00 PM to 05:00 PM), mention solar heating lifting the inversion layer. If the best window is not in the afternoon, do not say solar heating lifts the inversion. If the best window AQI is still Severe (>400), instruct the user to do indoor workouts only.`;
  }

  const prompt = `Current Air Quality:
- AQI: ${aqiValue} (${aqiCategory})
- Dominant Pollutant: ${dominantPollutant}${windowContext}

User Household Profile:
${JSON.stringify(profile, null, 2)}

Generate a personalized, practical winter smog protection plan. Return JSON strictly in this structure:
{
  "routine": [
    {
      "time": "e.g., 06:00 AM - 09:00 AM",
      "action": "Specific routine adjustment",
      "why": "Reason based on inversion or peak traffic/smoke",
      "actionType": "walk_shift", // MUST be one of: "walk_shift", "n95", "purifier", "windows_closed", "draft_seal", "commute_switch", "cooking_switch", "other"
      "hours": 1.0, // estimated hours if applicable
      "km": ${Number(profile.commuteDistanceKm) || 15} // commute distance if applicable
    }
  ],
  "indoorHacks": [
    {
      "room": "e.g., Living Room & Balcony Door",
      "tip": "Practical hack like damp towel barrier under door gap",
      "cost": "free", // must be "free" | "low" | "one-time"
      "impact": "Concrete indoor air benefit"
    }
  ],
  "alternatives": [
    {
      "instead": "Habit to avoid (e.g. morning walk at 6:30 AM in park)",
      "try": "Better alternative (e.g. indoor spot-walking, walk at 2:30 PM when sun lifts inversion)",
      "impact": "Quantifiable or qualitative benefit"
    }
  ],
  "doctorWarning": "Immediate medical advice line: See a doctor if any family member experiences persistent wheezing, breathlessness at rest, chest tightness, or blue lips/fingertips."
}`;

  let response;
  try {
    response = await callWithTimeout(() =>
      ai.models.generateContent({
        model: config.geminiModel,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          systemInstruction: PLAN_SYSTEM_INSTRUCTION
        }
      })
    );
  } catch (err) {
    if (err.statusCode === 504 || err.isTimeout) {
      throw err;
    }
    console.error('Gemini generatePlan error:', err.message || err);
    const upstreamError = new Error('Failed to generate plan');
    upstreamError.statusCode = 502;
    throw upstreamError;
  }

  const responseText = response.text;
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch (_err) {
    console.error('Failed to parse Gemini JSON response:', responseText);
    const parseError = new Error('Failed to generate plan');
    parseError.statusCode = 502;
    throw parseError;
  }

  const routineItems = Array.isArray(parsed.routine) ? parsed.routine : [];
  
  // Calculate verified transparent impact metrics on the server for every routine item
  const enrichedRoutine = routineItems.map((item) => {
    const calculatedImpact = computeItemImpact(item, aqiValue, profile);
    return {
      time: item.time || '',
      action: item.action || '',
      why: item.why || '',
      actionType: item.actionType || 'other',
      hours: item.hours || 1.0,
      km: item.km || profile.commuteDistanceKm || 15,
      impact: calculatedImpact
    };
  });

  return {
    routine: enrichedRoutine,
    indoorHacks: Array.isArray(parsed.indoorHacks) ? parsed.indoorHacks : [],
    alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
    doctorWarning: parsed.doctorWarning || 'See a doctor immediately if any family member experiences persistent wheezing, breathlessness at rest, or chest tightness.'
  };
}

/**
 * Handle conversational user questions about smog, routines, and air quality
 * @param {object} params
 * @param {string} params.message
 * @param {object} params.profile
 * @param {number|object} params.aqi
 * @param {string} params.lang
 * @returns {Promise<object>}
 */
export async function generateChatResponse({ message, profile, aqi, lang }) {
  const ai = getGenAI();

  const langNames = {
    en: 'English',
    hi: 'Hindi (हिंदी)',
    mr: 'Marathi (मराठी)'
  };

  const targetLang = langNames[lang] || 'English';

  const userContext = `Language: Respond strictly in ${targetLang}.
Current AQI: ${typeof aqi === 'object' ? JSON.stringify(aqi) : aqi}
User Profile: ${JSON.stringify(profile)}
User Query: "${message}"`;

  let response;
  try {
    response = await callWithTimeout(() =>
      ai.models.generateContent({
        model: config.geminiModel,
        contents: userContext,
        config: {
          systemInstruction: CHAT_SYSTEM_INSTRUCTION
        }
      })
    );
  } catch (err) {
    if (err.statusCode === 504 || err.isTimeout) {
      throw err;
    }
    console.error('Gemini generateChatResponse error:', err.message || err);
    const upstreamError = new Error('Failed to generate chat response');
    upstreamError.statusCode = 502;
    throw upstreamError;
  }

  return {
    reply: response.text ? response.text.trim() : '',
    lang
  };
}
