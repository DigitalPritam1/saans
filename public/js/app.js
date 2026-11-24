/**
 * Saans (साँस) - Main Client Application Coordinator
 *
 * Coordinates state, navigation routing, API synchronization,
 * and modular view rendering.
 */

import { state } from './state.js';
import { fetchAqi, fetchPlan, sendChatMessage, fetchWeather, fetchCities } from './api.js';
import {
  saveProfile,
  logAction,
  undoAction,
  saveThemePreference
} from './storage.js';
import { initPlacesAutocomplete, getCurrentCoordinates, findKnownCity } from './geo.js';
import { initIconSprite, icon } from './ui/icons.js';
import { showToast } from './ui/toast.js';
import {
  buildVerdictText,
  computeDaytimeWindows,
  renderAqiGauge,
  renderHeroCard,
  renderAnswerTiles,
  renderQuickActions,
  renderForecastChart,
  renderPollutantGrid,
  renderMetroCitiesStrip,
  renderWhatToDoNow,
  renderWeatherCard,
  renderCitiesComparison,
  getRelativeTime,
  renderMiniGauge
} from './render/home.js';
import { renderPlanScreen } from './render/plan.js';
import { renderIndoorScreen, filterState, CURATED_HACKS } from './render/indoor.js';
import { renderHouseholdSheet, householdStep, setHouseholdStep } from './render/household.js';
import { renderChatScreen } from './render/chat.js';
import { renderImpactScreen } from './render/impact.js';
import { getCategoryFromAqi, estimateCigaretteEquivalent, computeWhatToDoNow } from '../impact.js';

// Sample fallback AQI data when live network call fails
const SAMPLE_AQI_DATA = {
  aqi: 325,
  scale: 'cpcb',
  displayName: 'India NAQI (CPCB)',
  category: 'Very poor',
  band: 'very_poor',
  dominantPollutant: 'pm25',
  color: '#b91c1c',
  bgColor: '#fee2e2',
  pollutants: [
    { code: 'pm25', displayName: 'PM2.5', concentration: { value: 195, units: 'µg/m³' } },
    { code: 'pm10', displayName: 'PM10', concentration: { value: 310, units: 'µg/m³' } },
    { code: 'no2', displayName: 'NO₂', concentration: { value: 68, units: 'µg/m³' } },
    { code: 'o3', displayName: 'O₃', concentration: { value: 42, units: 'µg/m³' } }
  ],
  healthRecommendations: {
    generalPopulation: 'Wear an N95 mask outdoors. Avoid morning jogs.'
  },
  forecast: Array.from({ length: 24 }, (_, i) => {
    const d = new Date();
    d.setHours(d.getHours() + i, 0, 0, 0);
    const hourVal = d.getHours();
    // Diurnal inversion simulation: high in morning/night, lower 12-5 PM
    let simAqi = 340;
    if (hourVal >= 12 && hourVal <= 17) simAqi = 190;
    else if (hourVal >= 6 && hourVal <= 10) simAqi = 380;
    const cat = getCategoryFromAqi(simAqi, 'cpcb');
    return {
      hour: d.toISOString(),
      aqi: simAqi,
      scale: 'cpcb',
      category: cat.label,
      band: cat.band,
      color: cat.color
    };
  }),
  forecastError: false
};

// Sample fallback Plan data when live network call fails
const SAMPLE_PLAN_DATA = {
  routine: [
    {
      time: '7:00 AM - 8:30 AM',
      action: 'Morning ventilation lock & purifier boost',
      why: 'Severe surface inversion traps winter smog. Keep windows locked and run purifier.',
      impact: {
        type: 'exposure',
        value: 55,
        unit: '% reduction',
        description: 'Draft-sealed room blocks cold particulate settling during peak surface inversion.'
      }
    },
    {
      time: '12:30 PM - 3:00 PM',
      action: 'Daytime window for essential errands',
      why: 'Solar heating disperses the boundary layer, bringing temporary AQI relief (~190).',
      impact: {
        type: 'exposure',
        value: 40,
        unit: '% lower PM2.5',
        description: 'Running essential errands in afternoon reduces total inhaled particulate mass.'
      }
    },
    {
      time: '6:00 PM - 8:00 PM',
      action: 'Commute switch & evening window lock',
      why: 'Evening rush hour and temperature drop cause sharp smog spike. Wear fitted N95.',
      impact: {
        type: 'exposure',
        value: 95,
        unit: '% less PM2.5 inhaled',
        description: 'Certified N95 filter media with secure seal eliminates coarse and fine particulates.'
      }
    }
  ],
  alternatives: [
    {
      insteadOf: 'Outdoor morning walk at 7:00 AM',
      tryThis: 'Indoor yoga stretches or walk at 1:00 PM',
      why: 'Morning physical exertion increases breathing volume 4x in peak surface smog.',
      impact: 'Avoid ~250 ug/m3 inhaled during peak morning inversion'
    },
    {
      insteadOf: 'Solo car commute in evening rush hour',
      tryThis: 'Take Delhi Metro or shared rapid transit',
      why: 'Avoids slow idling exhaust plumes and cuts city vehicular emissions.',
      impact: 'Save ~1.1 kg CO2 and 15 km tailpipe exposure'
    }
  ]
};

/**
 * Backward compatibility exports for integration tests
 */
export function initNavigation() {
  bindTabs();
}

export function renderAqiRing(aqi, category, color) {
  const cat = getCategoryFromAqi(aqi, 'cpcb');
  return renderAqiGauge(aqi, { color: color || cat.color, bg: cat.bg, label: category || cat.label }, 'cpcb');
}

/**
 * Initializes Theme based on preference
 */
function initTheme() {
  const pref = state.theme || 'system';
  if (pref === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (pref === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  const toggleBtn = document.getElementById('btn-theme-toggle');
  if (toggleBtn) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    toggleBtn.innerHTML = isDark ? icon('sun', 20) : icon('moon', 20);
    toggleBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const isDarkNow = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const next = isDarkNow ? 'light' : 'dark';

  document.documentElement.setAttribute('data-theme', next);
  saveThemePreference(next);
  state.theme = next;

  const toggleBtn = document.getElementById('btn-theme-toggle');
  if (toggleBtn) {
    toggleBtn.innerHTML = next === 'dark' ? icon('sun', 20) : icon('moon', 20);
    toggleBtn.setAttribute('aria-label', next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

/**
 * Navigation tabs router with roving tabindex and keyboard navigation
 */
function bindTabs() {
  const tabLists = document.querySelectorAll('[role="tablist"]');
  tabLists.forEach(tablist => {
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const target = tab.getAttribute('data-tab-target');
        navigateToTab(target);
      });

      tab.addEventListener('keydown', (e) => {
        let newIndex = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          newIndex = (index + 1) % tabs.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          newIndex = (index - 1 + tabs.length) % tabs.length;
        } else if (e.key === 'Home') {
          e.preventDefault();
          newIndex = 0;
        } else if (e.key === 'End') {
          e.preventDefault();
          newIndex = tabs.length - 1;
        }

        if (newIndex >= 0) {
          const nextTab = tabs[newIndex];
          const target = nextTab.getAttribute('data-tab-target');
          navigateToTab(target);
          nextTab.focus();
        }
      });
    });
  });

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (['home', 'plan', 'indoor', 'ask', 'impact'].includes(hash)) {
      navigateToTab(hash, false);
    }
  });

  // Initial tab from hash or default home
  const initialHash = window.location.hash.replace('#', '');
  if (['home', 'plan', 'indoor', 'ask', 'impact'].includes(initialHash)) {
    navigateToTab(initialHash, false);
  } else {
    navigateToTab('home', false);
  }
}

export function navigateToTab(tabName, updateHash = true) {
  state.activeTab = tabName;
  if (updateHash) {
    window.location.hash = tabName;
  }

  // Update active state and roving tabindex on nav buttons
  document.querySelectorAll('[data-tab-target]').forEach(btn => {
    const isMatch = btn.getAttribute('data-tab-target') === tabName;
    btn.classList.toggle('active-tab', isMatch);
    btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    btn.setAttribute('tabindex', isMatch ? '0' : '-1');
  });

  // Update visible pane
  document.querySelectorAll('.tab-pane').forEach(pane => {
    const isMatch = pane.id === `pane-${tabName}`;
    pane.classList.toggle('active-pane', isMatch);
  });

  // Render content if needed
  if (tabName === 'plan' && !state.planData && !state.isLoadingPlan) {
    loadPlan();
  } else if (tabName === 'indoor') {
    renderIndoorView();
  } else if (tabName === 'ask') {
    renderChatView();
  } else if (tabName === 'impact') {
    renderImpactView();
  }
}

/**
 * Loads AQI data from backend API
 */
export async function loadAqiData() {
  const homeContainer = document.getElementById('pane-home');
  if (!homeContainer) return;

  state.isLoadingAqi = true;
  state.aqiError = null;

  try {
    const [aqiResult, weatherResult, citiesResult] = await Promise.allSettled([
      fetchAqi(state.lat, state.lng),
      fetchWeather(state.lat, state.lng),
      fetchCities()
    ]);

    if (aqiResult.status === 'fulfilled') {
      state.aqiData = aqiResult.value;
      state.isSampleData = false;
    } else {
      console.warn('[Saans] Live AQI fetch failed. Using honest sample data:', aqiResult.reason?.message);
      state.aqiData = SAMPLE_AQI_DATA;
      state.isSampleData = true;
      state.aqiError = aqiResult.reason?.message;
    }

    if (weatherResult.status === 'fulfilled') {
      state.weatherData = weatherResult.value;
    } else {
      // Hide weather card quietly if request fails
      state.weatherData = null;
    }

    if (citiesResult.status === 'fulfilled') {
      state.citiesData = citiesResult.value;
    } else {
      state.citiesData = [];
    }

    state.aqiUpdatedAt = Date.now();
  } finally {
    state.isLoadingAqi = false;
    renderHomeView();
  }
}

/**
 * Renders the Home View
 */
function renderHomeView() {
  const container = document.getElementById('pane-home');
  if (!container) return;

  const aqiObj = state.aqiData || SAMPLE_AQI_DATA;
  const aqiVal = aqiObj.aqi || 300;
  const bandInfo = getCategoryFromAqi(aqiVal, aqiObj.scale || 'cpcb');
  const daytimeWindows = computeDaytimeWindows(aqiObj.forecast || []);
  const verdict = buildVerdictText(aqiVal, bandInfo.band, state.profile, daytimeWindows.bestWindow);

  // Derive PM2.5 for cigarette equivalent
  const pm25Entry = aqiObj.pollutants?.find(p => p.code?.toLowerCase() === 'pm25');
  const pm25Conc = pm25Entry?.concentration?.value ?? (aqiVal * 0.6);
  const cigarette = estimateCigaretteEquivalent(pm25Conc);

  // Compute what to do now actions
  const whatToDo = computeWhatToDoNow(aqiVal, bandInfo.band, state.profile, daytimeWindows.bestWindow);

  // Update header city trigger text
  const cityTriggerText = document.getElementById('header-city-name');
  if (cityTriggerText) {
    cityTriggerText.textContent = state.profile.city || state.currentCity;
  }

  const sampleBannerMarkup = state.isSampleData ? `
    <div class="sample-data-banner" role="status">
      ${icon('info', 18)}
      <span>Showing sample data. Live station sensor at this location is currently offline.</span>
    </div>
  ` : '';

  const metroStripMarkup = renderMetroCitiesStrip(state.citiesData, state.profile.city || state.currentCity);
  const heroCardMarkup = renderHeroCard(aqiVal, bandInfo, verdict, state.aqiUpdatedAt || Date.now(), aqiObj.scale || 'cpcb');
  const pollutantGridMarkup = renderPollutantGrid(aqiObj.pollutants, aqiObj.dominantPollutant);
  const weatherCardMarkup = renderWeatherCard(state.weatherData);
  const answerTilesMarkup = renderAnswerTiles(aqiVal, bandInfo, daytimeWindows);
  const whatToDoMarkup = renderWhatToDoNow(whatToDo, cigarette);
  const forecastChartMarkup = renderForecastChart(aqiObj.forecast, daytimeWindows.bestWindowHours, daytimeWindows);
  const quickActionsMarkup = renderQuickActions(aqiVal, state.profile);
  const compareCitiesMarkup = renderCitiesComparison(state.citiesData, state.profile.city || state.currentCity);

  container.innerHTML = `
    ${sampleBannerMarkup}
    ${metroStripMarkup}

    <div class="home-top-grid">
      <div class="home-top-main">
        ${heroCardMarkup}
        ${pollutantGridMarkup}
      </div>
      <div class="home-top-side">
        ${weatherCardMarkup}
        ${answerTilesMarkup}
      </div>
    </div>

    ${whatToDoMarkup}
    ${forecastChartMarkup}
    ${quickActionsMarkup}
    ${compareCitiesMarkup}
  `;

  // Bind NAQI info button
  const naqiBtn = document.getElementById('btn-naqi-info');
  if (naqiBtn) {
    naqiBtn.addEventListener('click', () => {
      showToast('India NAQI (CPCB): 0-50 Good, 51-100 Satisfactory, 101-200 Moderate, 201-300 Poor, 301-400 Very Poor, 401-500 Severe.', 'info');
    });
  }

  // City switching handler
  const handleCitySwitch = (cityName, lat, lng) => {
    state.profile.city = cityName;
    state.currentCity = cityName;
    state.lat = Number(lat);
    state.lng = Number(lng);
    saveProfile(state.profile);
    loadAqiData();
    showToast(`Switched location to ${cityName}`, 'info');
  };

  container.querySelectorAll('.metro-city-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const city = chip.getAttribute('data-city');
      const lat = chip.getAttribute('data-lat');
      const lng = chip.getAttribute('data-lng');
      if (city && lat && lng) handleCitySwitch(city, lat, lng);
    });
  });

  container.querySelectorAll('.city-compare-card').forEach(card => {
    card.addEventListener('click', () => {
      const city = card.getAttribute('data-city');
      const lat = card.getAttribute('data-lat');
      const lng = card.getAttribute('data-lng');
      if (city && lat && lng) handleCitySwitch(city, lat, lng);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });

  // Cigarette disclosure button
  const cigToggle = document.getElementById('btn-cigarette-toggle');
  const cigPanel = document.getElementById('cigarette-disclosure-panel');
  if (cigToggle && cigPanel) {
    cigToggle.addEventListener('click', () => {
      const isExpanded = cigToggle.getAttribute('aria-expanded') === 'true';
      cigToggle.setAttribute('aria-expanded', String(!isExpanded));
      cigPanel.hidden = isExpanded;
      const chevron = cigToggle.querySelector('.disclosure-chevron');
      if (chevron) {
        chevron.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
      }
    });
  }

  // Bind Quick action Done buttons
  container.querySelectorAll('.quick-action-done-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const title = decodeURIComponent(btn.getAttribute('data-title') || 'Quick action');
      const type = btn.getAttribute('data-type') || 'exposure';
      const hours = Number(btn.getAttribute('data-hours')) || 1.0;
      const km = Number(btn.getAttribute('data-km')) || 15;
      const explanation = decodeURIComponent(btn.getAttribute('data-explanation') || '');

      logAction({
        title,
        type,
        hoursAvoided: type === 'exposure' ? hours : 0,
        co2SavedKg: type === 'co2' ? +((km * 0.075).toFixed(2)) : 0,
        moneySavedInr: type === 'co2' ? Math.round(km * 2.5) : 0,
        explanation
      });

      btn.classList.add('is-done');
      btn.innerHTML = `${icon('check', 16)} Done`;
      btn.disabled = true;
      showToast(`Logged: "${title}" added to your weekly impact!`, 'success');
    });
  });

  bindForecastInteractive();
}

/**
 * Interactive scrubber and keyboard navigation for smooth forecast chart
 */
function bindForecastInteractive() {
  const container = document.getElementById('forecast-strip');
  if (!container) return;

  const scrollContainer = document.getElementById('forecast-scroll-container');
  const hitbox = container.querySelector('.forecast-chart-hitbox');
  const svg = container.querySelector('.forecast-smooth-chart-svg');
  const scrubberLine = document.getElementById('forecast-scrubber-line');
  const scrubberKnob = document.getElementById('forecast-scrubber-knob');
  const tooltipCard = document.getElementById('forecast-tooltip-card');
  const liveRegion = document.getElementById('forecast-scrubber-live');

  const tooltipTime = document.getElementById('tooltip-time');
  const tooltipDate = document.getElementById('tooltip-date');
  const tooltipGaugeSlot = document.getElementById('tooltip-gauge-slot');
  const tooltipAqiNum = document.getElementById('tooltip-aqi-num');
  const tooltipBandLabel = document.getElementById('tooltip-band-label');

  const forecast = state.aqiData?.forecast || [];
  if (!forecast.length || !hitbox || !svg) return;

  const numHours = forecast.length;
  const padLeft = 48;
  const padRight = 30;
  const padTop = 32;
  const padBottom = 38;
  const chartHeight = 220;
  const minWidthPerHour = 36;
  const chartWidth = Math.max(864, numHours * minWidthPerHour);
  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;
  const plotBottom = padTop + plotHeight;

  const aqiValues = forecast.map(f => f.aqi || 0);
  const maxAqi = Math.max(300, ...aqiValues);
  const yMax = Math.ceil((maxAqi + 40) / 50) * 50;
  const yMin = 0;

  // Compute point positions
  const points = forecast.map((item, idx) => {
    const x = padLeft + (idx / (numHours - 1)) * plotWidth;
    const aqi = Math.max(0, Math.min(yMax, item.aqi || 0));
    const y = plotBottom - ((aqi - yMin) / (yMax - yMin)) * plotHeight;
    return { x, y, aqi: item.aqi || 0, hour: item.hour, idx };
  });

  const updateScrubber = (idx) => {
    const clampedIdx = Math.max(0, Math.min(numHours - 1, idx));
    const point = points[clampedIdx];
    const cat = getCategoryFromAqi(point.aqi, 'cpcb');
    const d = new Date(point.hour);
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    if (scrubberLine) {
      scrubberLine.setAttribute('x1', point.x.toFixed(1));
      scrubberLine.setAttribute('x2', point.x.toFixed(1));
    }
    if (scrubberKnob) {
      scrubberKnob.setAttribute('cx', point.x.toFixed(1));
      scrubberKnob.setAttribute('cy', point.y.toFixed(1));
      scrubberKnob.setAttribute('fill', cat.color);
    }
    if (tooltipCard) {
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width / chartWidth;
      const scaleY = rect.height / chartHeight;
      const screenX = point.x * scaleX;
      const screenY = point.y * scaleY;
      const tooltipWidth = 145;
      const leftGutter = padLeft * scaleX;
      const rightBoundary = rect.width - padRight * scaleX;

      let left = screenX - tooltipWidth / 2;
      // Never cover y-axis labels on the left: flip to the right of the knob
      if (left < leftGutter + 8) {
        left = screenX + 16;
      } else if (left + tooltipWidth > rightBoundary) {
        // Flip to the left of the knob near right edge
        left = screenX - tooltipWidth - 16;
      }
      if (left < leftGutter + 4) left = leftGutter + 4;
      if (left + tooltipWidth > rect.width) left = rect.width - tooltipWidth - 6;

      let top = screenY - 82;
      if (top < 8) top = screenY + 16;
      tooltipCard.style.left = `${left.toFixed(0)}px`;
      tooltipCard.style.top = `${top.toFixed(0)}px`;
    }
    if (tooltipTime) tooltipTime.textContent = timeStr;
    if (tooltipDate) tooltipDate.textContent = dateStr;
    if (tooltipAqiNum) tooltipAqiNum.textContent = String(point.aqi);
    if (tooltipBandLabel) {
      tooltipBandLabel.textContent = cat.label;
    }
    if (tooltipGaugeSlot) {
      tooltipGaugeSlot.innerHTML = renderMiniGauge(point.aqi, cat.color, 36);
    }
    if (liveRegion) {
      liveRegion.textContent = `Forecast at ${timeStr}: AQI ${point.aqi}, ${cat.label}`;
    }
    hitbox.setAttribute('aria-valuenow', String(clampedIdx));
    hitbox.setAttribute('aria-valuetext', `${point.aqi} AQI, ${cat.label} at ${timeStr}`);
  };

  const getIndexFromPointerEvent = (e) => {
    const rect = svg.getBoundingClientRect();
    const scaleX = chartWidth / rect.width;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const svgX = (clientX - rect.left) * scaleX;
    const clampedSvgX = Math.max(padLeft, Math.min(chartWidth - padRight, svgX));
    const ratio = (clampedSvgX - padLeft) / plotWidth;
    return Math.round(ratio * (numHours - 1));
  };

  let isScrubbing = false;

  const showTooltip = () => {
    if (tooltipCard) tooltipCard.style.display = 'block';
  };

  const hideTooltip = () => {
    if (!isScrubbing && tooltipCard) tooltipCard.style.display = 'none';
  };

  const onPointerDown = (e) => {
    isScrubbing = true;
    showTooltip();
    updateScrubber(getIndexFromPointerEvent(e));
  };

  const onPointerMove = (e) => {
    if (!isScrubbing && e.type !== 'mousemove') return;
    showTooltip();
    updateScrubber(getIndexFromPointerEvent(e));
  };

  const onPointerUp = () => {
    isScrubbing = false;
  };

  hitbox.addEventListener('mousedown', onPointerDown);
  hitbox.addEventListener('mousemove', onPointerMove);
  hitbox.addEventListener('mouseenter', showTooltip);
  hitbox.addEventListener('mouseleave', hideTooltip);
  window.addEventListener('mouseup', onPointerUp);

  hitbox.addEventListener('touchstart', onPointerDown, { passive: true });
  hitbox.addEventListener('touchmove', onPointerMove, { passive: true });
  window.addEventListener('touchend', onPointerUp);

  hitbox.addEventListener('focus', () => {
    showTooltip();
    const currentVal = parseInt(hitbox.getAttribute('aria-valuenow') || '0', 10);
    updateScrubber(currentVal);
  });
  hitbox.addEventListener('blur', hideTooltip);

  hitbox.addEventListener('keydown', (e) => {
    showTooltip();
    const currentVal = parseInt(hitbox.getAttribute('aria-valuenow') || '0', 10);
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      updateScrubber(currentVal - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      updateScrubber(currentVal + 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      updateScrubber(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      updateScrubber(numHours - 1);
    }
  });

  // Mobile scroll centering on load
  if (scrollContainer) {
    const currentKnob = scrollContainer.querySelector('.forecast-current-knob');
    if (currentKnob) {
      const knobX = parseFloat(currentKnob.getAttribute('cx') || '0');
      const targetScroll = Math.max(0, knobX - scrollContainer.clientWidth / 2);
      scrollContainer.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }
  }
}

/**
 * Loads Today's Plan from Gemini backend
 */
export async function loadPlan() {
  state.isLoadingPlan = true;
  renderPlanView();

  try {
    const aqiVal = state.aqiData ? state.aqiData.aqi : 300;
    const daytimeWindows = computeDaytimeWindows(state.aqiData?.forecast || []);
    const data = await fetchPlan(state.profile, aqiVal, daytimeWindows);
    state.planData = data;
    state.planGeneratedAt = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch (err) {
    console.warn('[Saans] Gemini plan fetch failed, using sample plan data:', err.message);
    state.planData = SAMPLE_PLAN_DATA;
    state.planGeneratedAt = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } finally {
    state.isLoadingPlan = false;
    renderPlanView();
  }
}

/**
 * Renders Today's Plan View
 */
function renderPlanView() {
  const container = document.getElementById('pane-plan');
  if (!container) return;

  container.innerHTML = renderPlanScreen(state.planData, {
    city: state.profile.city || state.currentCity,
    aqi: state.aqiData?.aqi || 300,
    profile: state.profile,
    generatedAt: state.planGeneratedAt,
    isLoading: state.isLoadingPlan
  });

  const regenBtn = document.getElementById('btn-regenerate-plan');
  if (regenBtn) {
    regenBtn.addEventListener('click', () => loadPlan());
  }

  // Bind Done action buttons
  container.querySelectorAll('.action-done-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const title = decodeURIComponent(btn.getAttribute('data-title') || 'Completed action');
      const type = btn.getAttribute('data-type') || 'exposure';
      const hours = Number(btn.getAttribute('data-hours')) || 1.0;
      const km = Number(btn.getAttribute('data-km')) || 15;
      const explanation = decodeURIComponent(btn.getAttribute('data-explanation') || '');

      logAction({
        title,
        type,
        hoursAvoided: type === 'exposure' ? hours : 0,
        co2SavedKg: type === 'co2' ? +((km * 0.075).toFixed(2)) : 0,
        moneySavedInr: type === 'co2' ? Math.round(km * 2.5) : 0,
        explanation
      });

      btn.classList.add('is-done');
      btn.innerHTML = `${icon('check', 16)} Completed!`;
      btn.disabled = true;
      showToast(`Logged: "${title}" added to your weekly impact!`, 'success');
    });
  });
}

/**
 * Renders Indoor Hacks View
 */
function renderIndoorView() {
  const container = document.getElementById('pane-indoor');
  if (!container) return;

  container.innerHTML = renderIndoorScreen(CURATED_HACKS);

  // Bind room & cost filter chips
  container.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const filterType = btn.getAttribute('data-filter-type');
      const val = btn.getAttribute('data-filter-value');
      if (filterType === 'room') filterState.room = val;
      if (filterType === 'cost') filterState.cost = val;
      renderIndoorView();
    });
  });

  // Item 11: Bind "Why this works" disclosure buttons with rotating chevron
  container.querySelectorAll('.hack-disclosure-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
      const targetId = btn.getAttribute('aria-controls');
      const targetBody = document.getElementById(targetId);
      if (targetBody) {
        targetBody.hidden = isExpanded;
      }
    });
  });

  // Bind "I did this" buttons
  container.querySelectorAll('.btn-hack-done').forEach(btn => {
    btn.addEventListener('click', () => {
      const title = decodeURIComponent(btn.getAttribute('data-title') || 'Indoor Hack');
      const actionType = btn.getAttribute('data-action-type');

      logAction({
        title,
        type: 'exposure',
        hoursAvoided: actionType === 'purifier' ? 2.0 : 1.0,
        co2SavedKg: 0,
        moneySavedInr: 0,
        explanation: 'Indoor mitigation action reduced direct PM2.5 infiltration.'
      });

      btn.classList.add('is-done');
      btn.innerHTML = `${icon('check', 14)} Logged`;
      btn.disabled = true;
      showToast(`Great work! "${title}" added to weekly impact.`, 'success');
    });
  });
}

/**
 * Renders Ask Saans Chat View
 */
function renderChatView() {
  const container = document.getElementById('pane-ask');
  if (!container) return;

  container.innerHTML = renderChatScreen(state.chatMessages, {
    currentLang: state.chatLanguage,
    aqi: state.aqiData?.aqi || 300,
    profile: state.profile,
    isSending: state.isSendingChat
  });

  // Bind Language buttons
  container.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.chatLanguage = btn.getAttribute('data-lang') || 'en';
      renderChatView();
    });
  });

  // Bind suggested question chips
  container.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = decodeURIComponent(chip.getAttribute('data-prompt') || '');
      handleSendChatMessage(prompt);
    });
  });

  // Form submit & auto-grow textarea
  const form = document.getElementById('chat-form');
  const textarea = document.getElementById('chat-input-textarea');
  const charCounter = document.getElementById('chat-char-counter');

  if (textarea) {
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
      if (charCounter) {
        charCounter.textContent = `${textarea.value.length} / 500`;
      }
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (form) form.requestSubmit();
      }
    });
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = textarea?.value.trim();
      if (text) {
        handleSendChatMessage(text);
      }
    });
  }

  // Scroll to bottom
  const msgsArea = document.getElementById('chat-messages-container');
  if (msgsArea) {
    msgsArea.scrollTop = msgsArea.scrollHeight;
  }
}

async function handleSendChatMessage(text) {
  if (!text || state.isSendingChat) return;

  const nowStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  state.chatMessages.push({
    role: 'user',
    text,
    time: nowStr,
    lang: state.chatLanguage
  });

  state.isSendingChat = true;
  renderChatView();

  try {
    const res = await sendChatMessage(text, state.profile, state.aqiData?.aqi || 300, state.chatLanguage);
    state.chatMessages.push({
      role: 'assistant',
      text: res.reply,
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      lang: res.lang || state.chatLanguage
    });
  } catch (_err) {
    state.chatMessages.push({
      role: 'assistant',
      text: 'Sorry, I could not connect to the advisory service. Please check your connection and try again.',
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      lang: 'en'
    });
  } finally {
    state.isSendingChat = false;
    renderChatView();
  }
}

/**
 * Renders Impact Tracker View
 */
function renderImpactView() {
  const container = document.getElementById('pane-impact');
  if (!container) return;

  container.innerHTML = renderImpactScreen();

  // Bind Undo buttons
  container.querySelectorAll('.btn-undo-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-undo-id');
      if (id) {
        undoAction(id);
        renderImpactView();
        showToast('Action removed from weekly log.', 'info');
      }
    });
  });

  // Item 16: Bind See Today's Plan button
  const seePlanBtn = container.querySelector('#btn-see-today-plan');
  if (seePlanBtn) {
    seePlanBtn.addEventListener('click', () => {
      navigateToTab('plan');
    });
  }
}

let householdOpenerElement = null;

function closeHouseholdSheet() {
  const overlay = document.getElementById('household-modal');
  if (!overlay || !overlay.classList.contains('sheet-open')) return;
  overlay.classList.remove('sheet-open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = ''; // Item 17: restore page scroll
  if (householdOpenerElement && typeof householdOpenerElement.focus === 'function') {
    householdOpenerElement.focus(); // Item 17: return focus to opening button
  }
  householdOpenerElement = null;
}

/**
 * Household Sheet Modal Logic
 * Item 17: Focus trap, close on Escape and backdrop click, return focus to opener, disable page scroll
 */
function bindHouseholdModal() {
  const overlay = document.getElementById('household-modal');
  const openButtons = document.querySelectorAll('.btn-open-household');
  const cityTrigger = document.getElementById('btn-header-city');

  const openSheet = (e) => {
    if (!overlay) return;
    householdOpenerElement = e?.currentTarget || document.activeElement;
    setHouseholdStep(1);
    overlay.innerHTML = renderHouseholdSheet(state.profile);
    overlay.classList.add('sheet-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden'; // Item 17: disable page scroll
    bindHouseholdSheetEvents();

    // Focus first interactive element inside sheet
    const focusable = overlay.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  };

  openButtons.forEach(btn => btn.addEventListener('click', openSheet));
  if (cityTrigger) cityTrigger.addEventListener('click', openSheet);

  // Item 17: Focus trap inside dialog and close on Escape
  overlay?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeHouseholdSheet();
      return;
    }

    if (e.key === 'Tab') {
      const focusable = Array.from(overlay.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(el => el.offsetParent !== null);

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl || !overlay.contains(document.activeElement)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl || !overlay.contains(document.activeElement)) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
  });

  // Item 17: Close on backdrop click
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeHouseholdSheet();
    }
  });
}

function bindHouseholdSheetEvents() {
  const overlay = document.getElementById('household-modal');
  if (!overlay) return;

  const closeBtn = document.getElementById('btn-close-household');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeHouseholdSheet();
    });
  }

  // Setup Places Autocomplete on step 1 search input
  const cityInput = document.getElementById('household-city-search');
  const placesContainer = document.getElementById('places-autocomplete-container');
  const searchError = document.getElementById('city-search-error');

  if (cityInput) {
    initPlacesAutocomplete(
      placesContainer || cityInput,
      ({ lat, lng, name }) => {
        state.profile.city = name;
        state.profile.lat = lat;
        state.profile.lng = lng;
        state.lat = lat;
        state.lng = lng;
        state.currentCity = name;
        if (cityInput) cityInput.value = name;
        if (searchError) searchError.style.display = 'none';
      },
      (errMsg) => {
        if (searchError) {
          searchError.textContent = errMsg;
          searchError.style.display = 'block';
        }
      }
    );

    cityInput.addEventListener('change', () => {
      const match = findKnownCity(cityInput.value);
      if (match) {
        state.profile.city = match.name;
        state.profile.lat = match.lat;
        state.profile.lng = match.lng;
        state.lat = match.lat;
        state.lng = match.lng;
        state.currentCity = match.name;
        if (searchError) searchError.style.display = 'none';
      } else if (cityInput.value.trim() && !state.profile.city.toLowerCase().includes(cityInput.value.trim().toLowerCase())) {
        if (searchError) {
          searchError.textContent = 'City not found. Please choose from suggested cities or use your location.';
          searchError.style.display = 'block';
        }
      }
    });
  }

  // Use my location button
  const geoBtn = document.getElementById('btn-use-geolocation');
  if (geoBtn) {
    geoBtn.addEventListener('click', async () => {
      geoBtn.disabled = true;
      geoBtn.textContent = 'Locating...';
      try {
        const coords = await getCurrentCoordinates();
        state.profile.lat = coords.lat;
        state.profile.lng = coords.lng;
        state.profile.city = 'My Location';
        state.lat = coords.lat;
        state.lng = coords.lng;
        state.currentCity = 'My Location';
        if (cityInput) cityInput.value = 'My Location';
        showToast('Location updated successfully!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        geoBtn.disabled = false;
        geoBtn.innerHTML = `${icon('locate-fixed', 18)} Use my current location`;
      }
    });
  }

  // Popular city pills
  overlay.querySelectorAll('.city-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const name = pill.getAttribute('data-city');
      const lat = Number(pill.getAttribute('data-lat'));
      const lng = Number(pill.getAttribute('data-lng'));
      state.profile.city = name;
      state.profile.lat = lat;
      state.profile.lng = lng;
      state.lat = lat;
      state.lng = lng;
      state.currentCity = name;
      if (cityInput) cityInput.value = name;
      if (searchError) searchError.style.display = 'none';
      overlay.querySelectorAll('.city-pill').forEach(p => p.classList.remove('city-pill-active'));
      pill.classList.add('city-pill-active');
    });
  });

  // Step 2: Member card selections
  overlay.querySelectorAll('.member-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-member-id');
      const list = state.profile.household || [];
      const idx = list.indexOf(id);
      if (idx > -1) list.splice(idx, 1);
      else list.push(id);
      state.profile.household = [...list];
      card.classList.toggle('card-selected', list.includes(id));
      card.setAttribute('aria-pressed', list.includes(id) ? 'true' : 'false');
      const checkWrap = card.querySelector('.card-checkbox-indicator');
      if (checkWrap) checkWrap.innerHTML = list.includes(id) ? icon('check', 16) : '';
    });
  });

  // Step 3: Commute Mode
  overlay.querySelectorAll('.commute-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-commute-mode');
      state.profile.commute = mode;
      overlay.querySelectorAll('.commute-btn').forEach(b => b.classList.remove('commute-btn-active'));
      btn.classList.add('commute-btn-active');
    });
  });

  // Step 3: Commute Distance Slider
  const slider = document.getElementById('commute-distance-range');
  const kmValDisplay = document.getElementById('km-display-val');
  if (slider && kmValDisplay) {
    slider.addEventListener('input', () => {
      kmValDisplay.textContent = slider.value;
      state.profile.commuteDistanceKm = Number(slider.value);
    });
  }

  // Step 3: Cooking Fuel
  overlay.querySelectorAll('.fuel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fuel = btn.getAttribute('data-fuel');
      state.profile.cooking = fuel;
      overlay.querySelectorAll('.fuel-btn').forEach(b => b.classList.remove('fuel-btn-active'));
      btn.classList.add('fuel-btn-active');
    });
  });

  // Step 3: Equipment checkboxes
  const purifierBox = document.getElementById('toggle-purifier');
  if (purifierBox) {
    purifierBox.addEventListener('change', () => {
      state.profile.hasPurifier = purifierBox.checked;
    });
  }
  const plantsBox = document.getElementById('toggle-plants');
  if (plantsBox) {
    plantsBox.addEventListener('change', () => {
      state.profile.hasPlants = plantsBox.checked;
    });
  }
  const petsBox = document.getElementById('toggle-pets');
  if (petsBox) {
    petsBox.addEventListener('change', () => {
      state.profile.hasPets = petsBox.checked;
    });
  }

  // Stepper Back & Next buttons
  const backBtn = document.getElementById('btn-household-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      setHouseholdStep(householdStep - 1);
      overlay.innerHTML = renderHouseholdSheet(state.profile);
      bindHouseholdSheetEvents();
    });
  }

  const nextBtn = document.getElementById('btn-household-next');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      setHouseholdStep(householdStep + 1);
      overlay.innerHTML = renderHouseholdSheet(state.profile);
      bindHouseholdSheetEvents();
    });
  }

  const saveBtn = document.getElementById('btn-household-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveProfile(state.profile);
      closeHouseholdSheet();
      showToast('Household settings saved!', 'success');
      // Refresh views with updated profile
      loadAqiData();
      if (state.activeTab === 'plan') loadPlan();
    });
  }
}

/**
 * Bootstrap on DOM ready
 */
export function initApp() {
  initIconSprite();
  initTheme();
  bindTabs();
  bindHouseholdModal();

  const themeToggle = document.getElementById('btn-theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // Refresh relative time label every 60 seconds
  setInterval(() => {
    const updatedEl = document.getElementById('hero-updated-time');
    if (updatedEl && state.aqiUpdatedAt) {
      const rel = getRelativeTime(state.aqiUpdatedAt);
      const full = new Date(state.aqiUpdatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      updatedEl.textContent = `Updated ${rel} · Source: Google Air Quality API`;
      updatedEl.setAttribute('title', full);
    }
  }, 60000);

  loadAqiData();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initApp);
}
