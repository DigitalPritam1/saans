import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

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

TRANSPARENT IMPACT MODEL GUIDELINES:
Every impact metric must be strictly grounded in these verified environmental factors (never invent random percentages):
- Walk/Errand Shifting: Shifting out of morning inversion (AQI ~350-400) to afternoon (AQI ~180-220) achieves 40% to 75% particulate inhalation reduction.
- Respiratory Protection: Fitted N95 respirators block ~95% of fine PM2.5.
- Indoor Air Attenuation: Closed windows reduce outdoor infiltration by ~35%; Damp-towel draft sealing achieves ~55% reduction; HEPA room purifier in closed room achieves ~80% reduction.
- Commute Shifts: Switching from two-wheeler/car to Metro saves ~75-145g CO2 per passenger-km (~1.5 to 3.5 kg CO2 for a standard urban trip).
- Every routine action must include an impact object with type ("exposure" | "co2" | "money"), numeric value, unit, and a one-line explanation citing the assumption.

CRITICAL GUIDELINES:
1. Ground advice strictly in Indian urban realities: winter temperature inversion (smog trapped near ground between 5:00 AM - 10:00 AM and after 8:00 PM), unsealed window/door gaps, tadka/frying fumes compounding indoor PM2.5, agarbatti/dhoop smoke, room heaters vs natural ventilation, wet mopping vs dry sweeping, and multi-generational households.
2. MEDICAL BOUNDARY: NEVER provide medical diagnosis, clinical judgment, or drug prescriptions. All impact numbers are environmental models, not medical estimates.
3. VULNERABLE PROTOCOL: Always provide an explicit, serious "see a doctor if" guideline highlighting warning signs (persistent wheezing, chest tightness, breathlessness at rest, blue discoloration of lips or nail beds, lethargy in infants).
4. OUTPUT FORMAT: Respond ONLY with valid JSON matching the requested structure without any markdown backticks.`;

const CHAT_SYSTEM_INSTRUCTION = `You are Saans (साँस), a friendly, helpful, and empathetic Indian Urban Air Quality and Health Assistant.
You assist families living in Indian cities during winter smog and severe pollution episodes.
GUIDELINES:
- Provide short, grounded, highly practical answers (max 2-3 concise paragraphs or bullet points).
- Tailor the advice directly to the user's current AQI and household profile.
- Strictly adhere to the requested language ('en' for English, 'hi' for Hindi in Devanagari script, 'mr' for Marathi in Devanagari script).
- Culturally appropriate advice for Indian homes (e.g. wet mopping instead of sweeping, tadka ventilation, avoiding morning jogs during smog inversion, sealing doors with damp cloths, N95 masks).
- NEVER give medical diagnoses or prescribe medications. If medical symptoms (persistent wheezing, severe breathlessness) are mentioned, advise consulting a physician or pulmonologist immediately.`;

/**
 * Generate a structured daily smog action plan using Gemini
 * @param {object} params
 * @param {number|object} params.aqi
 * @param {object} params.profile
 * @returns {Promise<object>}
 */
export async function generatePlan({ aqi, profile }) {
  const ai = getGenAI();

  const aqiValue = typeof aqi === 'object' ? aqi.aqi : aqi;
  const aqiCategory = typeof aqi === 'object' ? aqi.category || '' : '';
  const dominantPollutant = typeof aqi === 'object' ? aqi.dominantPollutant || 'PM2.5' : 'PM2.5';

  const prompt = `Current Air Quality:
- AQI: ${aqiValue} (${aqiCategory})
- Dominant Pollutant: ${dominantPollutant}

User Household Profile:
${JSON.stringify(profile, null, 2)}

Generate a personalized, practical winter smog protection plan. Return JSON strictly in this structure:
{
  "routine": [
    {
      "time": "e.g., 06:00 AM - 09:00 AM",
      "action": "Specific routine adjustment",
      "why": "Reason based on inversion or peak traffic/smoke",
      "impact": {
        "type": "exposure", // must be "exposure" | "co2" | "money"
        "value": 70,
        "unit": "% exposure reduction",
        "explanation": "Brief metric explanation"
      }
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

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      systemInstruction: PLAN_SYSTEM_INSTRUCTION
    }
  });

  const responseText = response.text;
  try {
    const parsed = JSON.parse(responseText);
    // Ensure standard keys exist
    return {
      routine: Array.isArray(parsed.routine) ? parsed.routine : [],
      indoorHacks: Array.isArray(parsed.indoorHacks) ? parsed.indoorHacks : [],
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
      doctorWarning: parsed.doctorWarning || 'See a doctor immediately if any family member experiences persistent wheezing, breathlessness at rest, or chest tightness.'
    };
  } catch (_err) {
    const parseError = new Error('Failed to parse Gemini structured response');
    parseError.statusCode = 502;
    parseError.rawResponse = responseText;
    throw parseError;
  }
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

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: userContext,
    config: {
      systemInstruction: CHAT_SYSTEM_INSTRUCTION
    }
  });

  return {
    reply: response.text ? response.text.trim() : '',
    lang
  };
}
