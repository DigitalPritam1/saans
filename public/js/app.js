/**
 * Saans (साँस) - Main Client Application Coordinator
 * Single-Page Application (vanilla JS, mobile-first, a11y-ready)
 */

import { fetchAqi, fetchPlan, sendChatMessage } from './api.js';
import { loadProfile, saveProfile, loadImpact, saveImpact, resetImpact } from './storage.js';
import { initPlacesAutocomplete, getCurrentCoordinates } from './geo.js';
import {
  DISCLAIMER,
  estimateWalkShiftExposure,
  estimateIndoorProtection,
  estimateCommuteShift
} from '/impact.js';

// Application State
const state = {
  activeTab: 'home',
  location: {
    name: 'Delhi NCR',
    lat: 28.6139,
    lng: 77.2090
  },
  aqiData: null,
  planData: null,
  profile: loadProfile(),
  impact: loadImpact(),
  chatLang: 'en',
  isGeneratingPlan: false,
  isSendingChat: false
};

// Curated Indoor Hacks grounded in Indian urban households (computed from transparent impact model)
const CURATED_HACKS = [
  {
    room: 'living',
    roomName: 'Living Room & Balcony',
    title: 'The Damp-Towel Sliding Door Barrier',
    tip: 'Place tightly rolled damp towels along the bottom tracks of balcony sliding doors and exterior door thresholds where winter drafts leak.',
    cost: 'free',
    costLabel: 'Free Hack',
    impact: `~${estimateIndoorProtection(300, false, true).percentReduction}% infiltration reduction`,
    explanation: estimateIndoorProtection(300, false, true).explanation
  },
  {
    room: 'kitchen',
    roomName: 'Kitchen',
    title: 'Tadka & Frying Exhaust Isolation Protocol',
    tip: 'Run the chimney or exhaust fan while preparing tadka, but strictly close doors connecting kitchen to living areas to prevent fine oil particulates from compounding outdoor smog.',
    cost: 'free',
    costLabel: 'Free Hack',
    impact: 'Prevents indoor PM2.5 spikes exceeding 450 µg/m³',
    explanation: 'Thermal oil aerosol confinement prevents localized PM2.5 compounding ambient winter smoke inside bedrooms.'
  },
  {
    room: 'bedroom',
    roomName: 'Bedroom',
    title: 'Damp Microfiber Mopping (Never Dry Brooming)',
    tip: 'Avoid dry jhadu (broom sweeping) which resuspends settled toxic fine dust into the breathing zone. Use a damp cloth or microfiber mop daily.',
    cost: 'free',
    costLabel: 'Free Hack',
    impact: 'Avoids ~40% resuspension of settled heavy particulates',
    explanation: 'Surface tension from damp water capillary action captures settled toxic particulate matter rather than aerosolizing it.'
  },
  {
    room: 'bedroom',
    roomName: 'Bedroom',
    title: 'Overnight Air-Purified Sanctuary',
    tip: 'If you have only one HEPA purifier, keep it in the bedroom with all doors and windows shut 30 minutes before sleep rather than in the large living room.',
    cost: 'free',
    costLabel: 'Free Hack',
    impact: `~${estimateIndoorProtection(300, true, false).percentReduction}% indoor PM2.5 drop`,
    explanation: estimateIndoorProtection(300, true, false).explanation
  },
  {
    room: 'general',
    roomName: 'General Home Care',
    title: 'Zero Agarbatti & Mosquito Coil Rule',
    tip: 'A single scented agarbatti or mosquito coil releases particulate matter equivalent to smoking 4-8 cigarettes in a sealed room. Switch to liquid electric diffusers or LED diyas.',
    cost: 'free',
    costLabel: 'Free Hack',
    impact: 'Instantly removes severe indoor VOCs and soot',
    explanation: 'Combustion elimination stops direct generation of indoor acrolein, formaldehyde, and carbon black.'
  },
  {
    room: 'living',
    roomName: 'Living Room',
    title: 'Sansevieria (Snake Plant) Nighttime O₂ Boost',
    tip: 'Snake plants (Sansevieria) and Areca palms release oxygen at night via Crassulacean Acid Metabolism and help bind airborne particulate surfaces.',
    cost: 'low',
    costLabel: 'Low Cost (₹150-₹300)',
    impact: 'Natural humidity & mild indoor air polishing',
    explanation: 'Foliage particulate deposition velocity increases slightly with broad-leaf indoor plants in closed spaces.'
  },
  {
    room: 'general',
    roomName: 'Entrance',
    title: 'Outdoor Shoe & Jacket Decontamination Zone',
    tip: 'Leave shoes and heavy winter jackets at the foyer entrance. Fine toxic dust from vehicle exhaust clings to outerwear and transfers to indoor carpets.',
    cost: 'free',
    costLabel: 'Free Hack',
    impact: 'Stops tracking street soot into indoor living quarters',
    explanation: 'Prevents drag-in transfer of coarse PM10 and brake dust from busy urban roadways.'
  },
  {
    room: 'bedroom',
    roomName: 'Bedroom / General',
    title: 'DIY Fan + HEPA Filter Box',
    tip: 'Fasten a standard replacement HEPA filter cartridge to the intake of an ordinary box fan or table fan using tape. Highly effective low-cost room filtration.',
    cost: 'low',
    costLabel: 'Low Cost (~₹800)',
    impact: 'Delivers 60-70% of commercial purifier CADR',
    explanation: 'Mechanical draw through dense HEPA microfiber captures 0.3-micron particles with minimal static pressure drop.'
  }
];

// Fallback Plan for Instant First Render
const FALLBACK_PLAN = {
  routine: [
    {
      time: '05:30 AM - 09:30 AM',
      action: 'Keep all windows tightly shut; shift morning walks indoors',
      why: 'Severe thermal inversion traps vehicular exhaust and biomass smoke within 50 meters of the ground during cold morning hours.',
      impact: {
        type: 'exposure',
        value: 75,
        unit: '% exposure reduction',
        explanation: 'Avoids highest particulate concentration peak of the day'
      }
    },
    {
      time: '01:00 PM - 03:30 PM',
      action: 'Best window for brief cross-ventilation and outdoor errands',
      why: 'Solar heating warms the ground layer, expanding the planetary boundary layer and dispersing dense ground smog.',
      impact: {
        type: 'exposure',
        value: 40,
        unit: 'lower ambient PM2.5',
        explanation: 'Lowest smog density window across 24 hours'
      }
    },
    {
      time: '05:30 PM - 07:30 PM',
      action: 'Switch two-wheeler commute to Delhi Metro or wear a fitted N95',
      why: 'Evening traffic peak combined with sinking temperatures rapidly spikes unburnt hydrocarbons and PM2.5.',
      impact: {
        type: 'co2',
        value: 3.2,
        unit: 'kg CO₂ saved',
        explanation: 'Mass transit avoids heavy direct soot inhalation in traffic jams'
      }
    },
    {
      time: '08:30 PM - 10:00 PM',
      action: 'Seal balcony door draft with damp cloth; run bedroom purifier',
      why: 'Nighttime temperature drops compress the air column, causing smoke from neighborhood fires to settle.',
      impact: {
        type: 'money',
        value: 20,
        unit: '% purifier efficiency gain',
        explanation: 'Draft sealing prolongs HEPA filter lifespan'
      }
    }
  ],
  indoorHacks: CURATED_HACKS.slice(0, 4),
  alternatives: [
    {
      instead: 'Morning outdoor jogging at 6:30 AM',
      try: 'Indoor yoga, surya namaskar, or spot-jogging; walk at 2:00 PM if sunny',
      impact: 'Spares bronchial airways from inhaling ~200 µg/m³ PM2.5 deeply'
    },
    {
      instead: 'Open-air two-wheeler ride in peak evening smog',
      try: 'Air-conditioned metro train or shared electric bus with N95 mask',
      impact: 'Reduces direct toxic soot inhalation by up to 70%'
    },
    {
      instead: 'Burning decorative scented candles and agarbatti in winter',
      try: 'Warm water essential oil diffuser or closed-glass electric lanterns',
      impact: 'Eliminates acute indoor benzene and formaldehyde emissions'
    }
  ],
  doctorWarning: 'See a doctor immediately if any family member experiences persistent wheezing, breathlessness at rest, chest constriction, or blue discoloration around lips and fingertips.'
};

/* ==========================================================================
   Initialization
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initLocationHandlers();
  initHouseholdForm();
  initChat();
  initImpactTracker();
  initHacksFilter();

  // Load initial air quality data for default location
  loadLocationData(state.location.lat, state.location.lng, state.location.name);
});

/* ==========================================================================
   Navigation Controller (A11y tabs & keyboard navigation)
   ========================================================================== */
function initNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      switchSection(tab.dataset.target);
    });

    // Keyboard navigation (Arrow keys)
    tab.addEventListener('keydown', (e) => {
      let targetIndex = null;
      if (e.key === 'ArrowRight') {
        targetIndex = (index + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft') {
        targetIndex = (index - 1 + tabs.length) % tabs.length;
      }
      if (targetIndex !== null) {
        tabs[targetIndex].focus();
        switchSection(tabs[targetIndex].dataset.target);
      }
    });
  });

  // Hero button click leads to Today's Plan
  const heroPlanBtn = document.getElementById('btn-hero-view-plan');
  if (heroPlanBtn) {
    heroPlanBtn.addEventListener('click', () => {
      switchSection('plan');
    });
  }
}

function switchSection(targetId) {
  state.activeTab = targetId;

  document.querySelectorAll('.nav-tab').forEach((tab) => {
    const isTarget = tab.dataset.target === targetId;
    tab.classList.toggle('active', isTarget);
    tab.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  document.querySelectorAll('.app-section').forEach((sec) => {
    const isTarget = sec.id === `section-${targetId}`;
    sec.classList.toggle('active', isTarget);
    if (isTarget) {
      sec.removeAttribute('hidden');
    } else {
      sec.setAttribute('hidden', '');
    }
  });

  announceLive(`Navigated to ${targetId} section`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ==========================================================================
   Location Management
   ========================================================================== */
function initLocationHandlers() {
  // City Presets
  const chipButtons = document.querySelectorAll('.city-chips .chip-btn');
  chipButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      chipButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const lat = parseFloat(btn.dataset.lat);
      const lng = parseFloat(btn.dataset.lng);
      const name = btn.dataset.name;
      loadLocationData(lat, lng, name);
    });
  });

  // Use Current Location (Near Me)
  const btnNearMe = document.getElementById('btn-use-location');
  if (btnNearMe) {
    btnNearMe.addEventListener('click', async () => {
      try {
        btnNearMe.disabled = true;
        btnNearMe.classList.add('loading');
        announceLive('Requesting your current GPS coordinates...');
        const coords = await getCurrentCoordinates();
        chipButtons.forEach((b) => b.classList.remove('active'));
        loadLocationData(coords.lat, coords.lng, 'My Current Location');
      } catch (err) {
        showStatusBanner(err.message, 'warning');
      } finally {
        btnNearMe.disabled = false;
        btnNearMe.classList.remove('loading');
      }
    });
  }

  // Places Autocomplete
  const searchInput = document.getElementById('places-input');
  if (searchInput) {
    initPlacesAutocomplete(searchInput, (selected) => {
      chipButtons.forEach((b) => b.classList.remove('active'));
      loadLocationData(selected.lat, selected.lng, selected.name);
    });

    // Fallback: search on Enter
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
          announceLive(`Searching air quality for ${query}...`);
          // For cities, map common names if Autocomplete didn't trigger
          const matched = findCityCoords(query);
          if (matched) {
            loadLocationData(matched.lat, matched.lng, matched.name);
          } else {
            showStatusBanner(`Showing estimated regional smog data for ${query}.`, 'info');
            loadLocationData(state.location.lat, state.location.lng, query);
          }
        }
      }
    });
  }
}

function findCityCoords(name) {
  const q = name.toLowerCase();
  const presets = [
    { name: 'Delhi NCR', lat: 28.6139, lng: 77.2090, match: ['delhi', 'ncr', 'gurgaon', 'gurugram', 'faridabad', 'ghaziabad'] },
    { name: 'Noida', lat: 28.5355, lng: 77.3910, match: ['noida', 'greater noida'] },
    { name: 'Mumbai', lat: 19.0760, lng: 72.8777, match: ['mumbai', 'bombay', 'thane', 'navi mumbai'] },
    { name: 'Kolkata', lat: 22.5726, lng: 88.3639, match: ['kolkata', 'calcutta', 'howrah'] },
    { name: 'Lucknow', lat: 26.8467, lng: 80.9462, match: ['lucknow'] },
    { name: 'Patna', lat: 25.6127, lng: 85.1589, match: ['patna'] },
    { name: 'Kanpur', lat: 26.4499, lng: 80.3319, match: ['kanpur'] }
  ];
  return presets.find((p) => p.match.some((m) => q.includes(m)));
}

async function loadLocationData(lat, lng, name) {
  state.location = { lat, lng, name };
  document.getElementById('active-location-name').textContent = name;
  hideStatusBanner();

  // Optimistic UI loading state
  document.getElementById('aqi-hero-value').textContent = '...';
  document.getElementById('aqi-hero-category').textContent = 'Fetching...';
  document.getElementById('forecast-strip').innerHTML = '<div class="forecast-skeleton">Loading hourly smog forecast...</div>';

  try {
    const data = await fetchAqi(lat, lng);
    state.aqiData = data;
    renderAqiRing(data);
    renderForecast(data.forecast || []);
    announceLive(`Air Quality in ${name} is ${data.aqi}, Category: ${data.category}`);

    // Regenerate or refresh plan with latest AQI data
    triggerPlanGeneration();
  } catch (err) {
    console.warn('[Saans] Live AQI fetch failed, falling back to cached or synthetic winter estimate:', err);
    // Graceful offline/missing key fallback for seamless presentation
    const fallbackAqi = {
      aqi: 342,
      category: 'Very Poor',
      dominantPollutant: 'pm25',
      color: '#CC0033',
      healthRecommendations: {
        generalPopulation: 'Wear an N95 mask outdoors. Avoid prolonged exertion during morning inversions.',
        elderly: 'Stay indoors with doors and windows sealed. Keep emergency rescue inhalers accessible.'
      },
      forecast: generateSyntheticForecast()
    };
    state.aqiData = fallbackAqi;
    renderAqiRing(fallbackAqi);
    renderForecast(fallbackAqi.forecast);
    renderPlan(FALLBACK_PLAN);

    if (err.status === 503 || err.message.includes('not configured')) {
      showStatusBanner('Google Air Quality API key is not yet configured in server environment. Displaying representative winter smog metrics for India.', 'info');
    } else {
      showStatusBanner(`Notice: ${err.message}. Using latest regional estimates.`, 'warning');
    }
  }
}

/* ==========================================================================
   AQI Ring & Metrics Renderer
   ========================================================================== */
function renderAqiRing(data) {
  const { aqi, category, dominantPollutant, healthRecommendations } = data;

  const valueEl = document.getElementById('aqi-hero-value');
  const catEl = document.getElementById('aqi-hero-category');
  const dominantEl = document.getElementById('aqi-hero-dominant');
  const healthText = document.getElementById('aqi-health-text');
  const meterCircle = document.getElementById('aqi-meter-circle');

  valueEl.textContent = aqi;
  catEl.textContent = category;

  // Pollutant formatting
  const pMap = {
    pm25: 'PM2.5 (Fine Particulate Matter)',
    pm10: 'PM10 (Inhalable Coarse Dust)',
    no2: 'NO₂ (Traffic Nitrogen Dioxide)',
    o3: 'O₃ (Ground-Level Ozone)',
    so2: 'SO₂ (Sulfur Dioxide)'
  };
  dominantEl.textContent = pMap[dominantPollutant?.toLowerCase()] || dominantPollutant || 'PM2.5';

  // Category Color Token Mapping (WCAG High-Contrast)
  const severityColors = {
    good: { stroke: '#15803D', bg: '#DCFCE7', text: '#15803D' },
    satisfactory: { stroke: '#4D7C0F', bg: '#ECFCCB', text: '#4D7C0F' },
    moderate: { stroke: '#B45309', bg: '#FEF3C7', text: '#B45309' },
    poor: { stroke: '#C2410C', bg: '#FFEDD5', text: '#C2410C' },
    'very poor': { stroke: '#B91C1C', bg: '#FEE2E2', text: '#B91C1C' },
    severe: { stroke: '#831843', bg: '#FCE7F3', text: '#831843' }
  };

  const key = category.toLowerCase().trim();
  const theme = severityColors[key] || severityColors['very poor'];

  catEl.style.backgroundColor = theme.bg;
  catEl.style.color = theme.text;

  // SVG Circle Stroke calculation: 2 * PI * 90 = 565.48
  const circumference = 565.48;
  const clampedAqi = Math.max(0, Math.min(aqi, 500));
  const offset = circumference - (clampedAqi / 500) * circumference;

  meterCircle.style.stroke = theme.stroke;
  meterCircle.style.strokeDashoffset = offset;

  // Health recommendation text
  const adv = healthRecommendations?.generalPopulation || healthRecommendations?.elderly;
  if (adv) {
    healthText.textContent = adv;
  } else if (aqi > 400) {
    healthText.textContent = 'Severe Emergency: Air is toxic for all age groups. Keep windows sealed, run purifiers continuously, and avoid stepping out.';
  } else if (aqi > 300) {
    healthText.textContent = 'Respiratory Hazard: Healthy adults will experience throat irritation; vulnerable members must wear certified N95 masks.';
  } else {
    healthText.textContent = 'Moderate to poor air quality. Sensitive individuals should reduce prolonged outdoor exertion during morning fog.';
  }
}

/* ==========================================================================
   24-Hour Forecast & Best Window Algorithm
   ========================================================================== */
function renderForecast(forecastItems = []) {
  const container = document.getElementById('forecast-strip');
  const windowPill = document.getElementById('best-window-pill');
  const windowDesc = document.getElementById('best-window-desc');

  if (!forecastItems || forecastItems.length === 0) {
    container.innerHTML = '<div class="forecast-skeleton">Hourly forecast unavailable.</div>';
    return;
  }

  // Find the optimal consecutive 2-3 hours with lowest AQI
  let bestStartIndex = 0;
  let minAvgAqi = Infinity;
  const windowSize = Math.min(3, forecastItems.length);

  for (let i = 0; i <= forecastItems.length - windowSize; i++) {
    const sum = forecastItems.slice(i, i + windowSize).reduce((acc, curr) => acc + (curr.aqi || 0), 0);
    const avg = sum / windowSize;
    if (avg < minAvgAqi) {
      minAvgAqi = avg;
      bestStartIndex = i;
    }
  }

  const bestEndIndex = bestStartIndex + windowSize - 1;

  // Render cards
  container.innerHTML = '';
  forecastItems.forEach((item, index) => {
    const isBest = index >= bestStartIndex && index <= bestEndIndex;
    const hourLabel = formatHour(item.hour);
    const aqi = item.aqi || 0;
    const cat = item.category || 'Moderate';

    const card = document.createElement('div');
    card.className = `forecast-item ${isBest ? 'best-window' : ''}`;
    card.innerHTML = `
      ${isBest ? '<span class="best-badge">Best</span>' : ''}
      <span class="forecast-hour">${hourLabel}</span>
      <span class="forecast-aqi">${aqi}</span>
      <span class="forecast-cat">${cat}</span>
    `;
    container.appendChild(card);
  });

  // Update Best Window Pill & Explainer Banner
  const startHourStr = formatHour(forecastItems[bestStartIndex]?.hour);
  const endHourStr = formatHour(forecastItems[bestEndIndex]?.hour);
  const bestSummary = `${startHourStr} - ${endHourStr}`;

  windowPill.innerHTML = `<span class="window-icon" aria-hidden="true">✨</span> Best Window: ${bestSummary}`;
  windowDesc.innerHTML = `
    The optimal window today is <strong>${bestSummary}</strong> (Estimated Avg NAQI ~${Math.round(minAvgAqi)}).
    Solar heating expands the lower boundary layer, making this the safest time for outdoor errands or quick 15-minute cross-ventilation.
  `;
}

function formatHour(isoString) {
  if (!isoString) return '--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch (_e) {
    return isoString;
  }
}

function generateSyntheticForecast() {
  const hours = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getTime() + i * 3600 * 1000);
    const h = d.getHours();
    // Diurnal inversion curve: high at night & early morning (350-420), dips at 1:00 PM - 4:00 PM (180-240)
    let aqi;
    if (h >= 5 && h <= 9) aqi = 410; // Morning rush + cold inversion
    else if (h >= 12 && h <= 16) aqi = 195; // Solar lifting
    else if (h >= 17 && h <= 21) aqi = 380; // Evening traffic
    else aqi = 340;

    hours.push({
      hour: d.toISOString(),
      aqi,
      category: aqi > 400 ? 'Severe' : aqi > 300 ? 'Very Poor' : aqi > 200 ? 'Poor' : 'Moderate'
    });
  }
  return hours;
}

/* ==========================================================================
   Household Profile Form
   ========================================================================== */
function initHouseholdForm() {
  const form = document.getElementById('household-form');
  const cityInput = document.getElementById('form-city');
  const commuteSelect = document.getElementById('form-commute');
  const cookingSelect = document.getElementById('form-cooking');
  const togglePurifier = document.getElementById('toggle-purifier');
  const togglePlants = document.getElementById('toggle-plants');
  const togglePets = document.getElementById('toggle-pets');
  const feedback = document.getElementById('profile-save-feedback');

  // Populate form from state
  const p = state.profile;
  cityInput.value = p.city || state.location.name;
  commuteSelect.value = p.commute || 'two_wheeler';
  cookingSelect.value = p.cooking || 'lpg_png';
  togglePurifier.checked = !!p.hasPurifier;
  togglePlants.checked = !!p.hasPlants;
  togglePets.checked = !!p.hasPets;

  document.querySelectorAll('input[name="vulnerable"]').forEach((cb) => {
    cb.checked = Array.isArray(p.vulnerable) && p.vulnerable.includes(cb.value);
  });

  // Handle Form Submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const selectedVulnerable = Array.from(document.querySelectorAll('input[name="vulnerable"]:checked')).map((c) => c.value);

    const updated = {
      city: cityInput.value.trim() || 'Delhi NCR',
      commute: commuteSelect.value,
      cooking: cookingSelect.value,
      vulnerable: selectedVulnerable,
      hasPurifier: togglePurifier.checked,
      hasPlants: togglePlants.checked,
      hasPets: togglePets.checked
    };

    state.profile = updated;
    saveProfile(updated);

    feedback.textContent = '✓ Profile saved! Updating your custom action plan...';
    announceLive('Profile successfully saved to your browser.');

    setTimeout(() => {
      feedback.textContent = '';
    }, 4000);

    triggerPlanGeneration();
  });
}

/* ==========================================================================
   Today's Plan (Gemini Integration & Renderers)
   ========================================================================== */
async function triggerPlanGeneration() {
  if (state.isGeneratingPlan) return;
  state.isGeneratingPlan = true;

  const routineContainer = document.getElementById('routine-list');
  const refreshBtn = document.getElementById('btn-regenerate-plan');
  if (refreshBtn) refreshBtn.disabled = true;

  routineContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Gemini is tailoring practical smog routines for your household...</p>
    </div>
  `;

  try {
    const aqiPayload = state.aqiData ? state.aqiData.aqi : 340;
    const plan = await fetchPlan(state.profile, aqiPayload);
    state.planData = plan;
    renderPlan(plan);
    announceLive("Today's smog action plan has been refreshed.");
  } catch (err) {
    console.warn('[Saans] Live plan generation failed, rendering grounded fallback plan:', err);
    state.planData = FALLBACK_PLAN;
    renderPlan(FALLBACK_PLAN);
  } finally {
    state.isGeneratingPlan = false;
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

// Bind plan refresh button
document.getElementById('btn-regenerate-plan')?.addEventListener('click', () => {
  triggerPlanGeneration();
});

function renderPlan(plan) {
  const routineList = document.getElementById('routine-list');
  const altList = document.getElementById('alternatives-list');
  const doctorWarning = document.getElementById('doctor-warning-text');
  const contextLabel = document.getElementById('plan-context-label');

  if (contextLabel) {
    const city = state.profile.city || state.location.name;
    const aqi = state.aqiData ? state.aqiData.aqi : 340;
    contextLabel.textContent = `Tailored for ${city} (AQI ${aqi}) with ${state.profile.vulnerable?.length || 0} vulnerable sensitivities.`;
  }

  // Doctor warning
  if (doctorWarning && plan.doctorWarning) {
    doctorWarning.textContent = plan.doctorWarning;
  }

  // Render Routine Cards
  routineList.innerHTML = '';
  const routines = Array.isArray(plan.routine) ? plan.routine : FALLBACK_PLAN.routine;

  routines.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'routine-card';

    const impact = item.impact || {};
    const impactType = (impact.type || 'exposure').toLowerCase();
    const impactVal = impact.value ? `${impact.value}${impact.unit ? ' ' + impact.unit : ''}` : 'High Impact';

    card.innerHTML = `
      <div class="routine-card-header">
        <span class="routine-time-badge">🕒 ${escapeHTML(item.time || 'Schedule')}</span>
        <span class="impact-chip ${impactType}">🛡️ ${escapeHTML(impactVal)}</span>
      </div>
      <h4 class="routine-action">${escapeHTML(item.action || '')}</h4>
      <p class="routine-why">${escapeHTML(item.why || '')}</p>
      ${impact.explanation ? `<p class="routine-impact-expl" style="font-size:0.78125rem;color:var(--color-text-light);margin-top:6px;"><em>Model factor: ${escapeHTML(impact.explanation)}</em></p>` : ''}
    `;
    routineList.appendChild(card);
  });

  // Render Alternatives Cards
  altList.innerHTML = '';
  const alts = Array.isArray(plan.alternatives) ? plan.alternatives : FALLBACK_PLAN.alternatives;

  alts.forEach((alt) => {
    const card = document.createElement('div');
    card.className = 'alt-card';
    card.innerHTML = `
      <div class="alt-instead">❌ Instead of: ${escapeHTML(alt.instead || '')}</div>
      <div class="alt-try">✅ Try: ${escapeHTML(alt.try || '')}</div>
      <div class="alt-impact">💡 Impact: ${escapeHTML(alt.impact || '')}</div>
    `;
    altList.appendChild(card);
  });
}

/* ==========================================================================
   Indoor Hacks (Room by Room)
   ========================================================================== */
function initHacksFilter() {
  const chips = document.querySelectorAll('.hacks-filter-bar .filter-chip');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => {
        c.classList.remove('active');
        c.setAttribute('aria-selected', 'false');
      });
      chip.classList.add('active');
      chip.setAttribute('aria-selected', 'true');
      renderHacks(chip.dataset.room);
    });
  });

  // Initial render
  renderHacks('all');
}

function renderHacks(filterRoom = 'all') {
  const container = document.getElementById('hacks-grid');
  container.innerHTML = '';

  const filtered = filterRoom === 'all' ? CURATED_HACKS : CURATED_HACKS.filter((h) => h.room === filterRoom);

  filtered.forEach((hack) => {
    const card = document.createElement('div');
    card.className = 'hack-card';
    card.innerHTML = `
      <div>
        <div class="hack-header">
          <span class="hack-room-tag">${escapeHTML(hack.roomName)}</span>
          <span class="cost-tag ${hack.cost}">${escapeHTML(hack.costLabel)}</span>
        </div>
        <h4 class="hack-title">${escapeHTML(hack.title)}</h4>
        <p class="hack-tip">${escapeHTML(hack.tip)}</p>
      </div>
      <div>
        <span class="hack-impact">Impact: ${escapeHTML(hack.impact)}</span>
        ${hack.explanation ? `<p class="hack-model-expl" style="font-size:0.75rem;color:var(--color-text-light);margin-top:6px;line-height:1.35;"><em>Model factor: ${escapeHTML(hack.explanation)}</em></p>` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

/* ==========================================================================
   Ask Saans (Multilingual AI Chat)
   ========================================================================== */
function initChat() {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input-text');
  const messages = document.getElementById('chat-messages');

  // Language Radios
  document.querySelectorAll('input[name="chat-lang"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      state.chatLang = e.target.value;
      announceLive(`Switched response language to ${e.target.value}`);
    });
  });

  // Suggested Prompts
  document.querySelectorAll('.suggest-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.prompt;
      input.focus();
    });
  });

  // Submit Handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query || state.isSendingChat) return;

    state.isSendingChat = true;
    input.value = '';

    // Render User Message
    appendChatBubble('user', query);

    // Render Temporary Loading Bubble
    const loadingId = 'loading-' + Date.now();
    const loadingBubble = document.createElement('div');
    loadingBubble.id = loadingId;
    loadingBubble.className = 'chat-bubble saans-bubble';
    loadingBubble.innerHTML = `
      <div class="bubble-avatar" aria-hidden="true">🌱</div>
      <div class="bubble-content"><div class="spinner" style="width:16px;height:16px;margin:0 0 0 4px;border-width:2px;"></div></div>
    `;
    messages.appendChild(loadingBubble);
    messages.scrollTop = messages.scrollHeight;

    try {
      const aqiVal = state.aqiData ? state.aqiData.aqi : 340;
      const response = await sendChatMessage(query, state.profile, aqiVal, state.chatLang);
      document.getElementById(loadingId)?.remove();
      appendChatBubble('saans', response.reply);
      announceLive('Saans responded to your query.');
    } catch (_err) {
      document.getElementById(loadingId)?.remove();
      const fallbackReplies = {
        en: "During severe smog, avoid outdoor exertion between 5 AM and 10 AM. Ensure N95 masks fit snugly with no nose bridge leaks, and seal window gaps with damp cloths. See a doctor if you experience wheezing or chest tightness.",
        hi: "गंभीर स्मॉग के दौरान सुबह 5 से 10 बजे के बीच बाहर निकलने से बचें। बाहर जाते समय N95 मास्क अवश्य पहनें और खिड़कियों की दरारों को गीले तौलिये से सील करें। सांस फूलने या सीने में जकड़न पर तुरंत डॉक्टर से मिलें।",
        mr: "तीव्र धुक्यादरम्यान सकाळी ५ ते १० या वेळेत घराबाहेर पडणे टाळा. बाहेर जाताना N95 मास्क व्यवस्थित वापरा आणि खिडक्यांच्या फटी ओल्या कपड्याने बंद करा. धाप लागल्यास तातडीने डॉक्टरांचा सल्ला घ्या."
      };
      const text = fallbackReplies[state.chatLang] || fallbackReplies.en;
      appendChatBubble('saans', text);
    } finally {
      state.isSendingChat = false;
    }
  });
}

function appendChatBubble(sender, text) {
  const messages = document.getElementById('chat-messages');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${sender === 'user' ? 'user-bubble' : 'saans-bubble'}`;

  const avatar = sender === 'user' ? '👤' : '🌱';
  bubble.innerHTML = `
    <div class="bubble-avatar" aria-hidden="true">${avatar}</div>
    <div class="bubble-content"><p>${escapeHTML(text)}</p></div>
  `;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

/* ==========================================================================
   Impact Tracker (Powered by Transparent Model)
   ========================================================================== */
function initImpactTracker() {
  renderImpact();

  // Quick Action Log Buttons
  document.querySelectorAll('.btn-log').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      let expAdd = 0;
      let co2Add = 0;
      let moneyAdd = 0;
      let actionExplanation = '';

      const ambientAqi = state.aqiData ? state.aqiData.aqi : 340;

      if (type === 'walk_shift') {
        const est = estimateWalkShiftExposure(ambientAqi, 190, 2.5);
        expAdd = 2.5;
        actionExplanation = est.explanation;
      } else if (type === 'metro_commute') {
        const fromMode = state.profile.commute || 'two_wheeler';
        const est = estimateCommuteShift(fromMode, 'metro', 15);
        co2Add = est.savedCo2Kg;
        moneyAdd = est.savedInr;
        expAdd = 1.0;
        actionExplanation = est.explanation;
      } else if (type === 'door_seal') {
        const est = estimateIndoorProtection(ambientAqi, false, true);
        expAdd = 4.0;
        actionExplanation = est.explanation;
      } else if (type === 'no_smoke') {
        expAdd = 3.0;
        actionExplanation = 'Eliminating indoor agarbatti/dhoop smoke stops direct combustion generation of indoor acrolein and formaldehyde.';
      }

      state.impact.exposureHours = +(state.impact.exposureHours + expAdd).toFixed(1);
      state.impact.co2Saved = +(state.impact.co2Saved + co2Add).toFixed(1);
      state.impact.moneySaved = +(state.impact.moneySaved + moneyAdd);
      state.impact.lastUpdated = new Date().toISOString();

      saveImpact(state.impact);
      renderImpact(actionExplanation);

      // Visual feedback
      btn.style.transform = 'scale(0.97)';
      setTimeout(() => {
        btn.style.transform = '';
      }, 150);
      announceLive(`Logged action! Added to your weekly impact tally. ${actionExplanation}`);
    });
  });

  // Reset Week
  document.getElementById('btn-reset-impact')?.addEventListener('click', () => {
    if (confirm('Reset your weekly protection and emission savings tally?')) {
      state.impact = resetImpact();
      renderImpact();
      announceLive('Weekly impact tally has been reset.');
    }
  });
}

function renderImpact(latestExplanation = '') {
  const expEl = document.getElementById('impact-exposure-hours');
  const co2El = document.getElementById('impact-co2-saved');
  const moneyEl = document.getElementById('impact-money-saved');

  if (expEl) expEl.textContent = state.impact.exposureHours;
  if (co2El) co2El.textContent = state.impact.co2Saved;
  if (moneyEl) moneyEl.textContent = `₹${state.impact.moneySaved}`;

  // Update dynamic methodology / explanation text if an action was just logged
  const methodDesc = document.querySelector('.methodology-card');
  if (methodDesc && latestExplanation) {
    let recentBanner = document.getElementById('recent-action-expl');
    if (!recentBanner) {
      recentBanner = document.createElement('div');
      recentBanner.id = 'recent-action-expl';
      recentBanner.style.cssText = 'padding:10px 14px;background-color:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;margin-bottom:12px;font-size:0.8125rem;color:#166534;';
      methodDesc.prepend(recentBanner);
    }
    recentBanner.innerHTML = `<strong>Latest Logged Impact:</strong> ${escapeHTML(latestExplanation)} <br><small style="color:#15803D;"><em>${DISCLAIMER}</em></small>`;
  }
}

/* ==========================================================================
   Helpers & A11y Announcements
   ========================================================================== */
function announceLive(message) {
  const announcer = document.getElementById('live-announcer');
  if (announcer) {
    announcer.textContent = message;
  }
}

function showStatusBanner(msg, type = 'info') {
  const banner = document.getElementById('status-banner');
  if (banner) {
    banner.textContent = msg;
    banner.classList.remove('hidden');
    if (type === 'warning') {
      banner.style.backgroundColor = '#FEF2F2';
      banner.style.borderColor = '#FCA5A5';
      banner.style.color = '#991B1B';
    } else {
      banner.style.backgroundColor = '#FEF3C7';
      banner.style.borderColor = '#FCD34D';
      banner.style.color = '#92400E';
    }
  }
}

function hideStatusBanner() {
  const banner = document.getElementById('status-banner');
  if (banner) {
    banner.classList.add('hidden');
  }
}

function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
