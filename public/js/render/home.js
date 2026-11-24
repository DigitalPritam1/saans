/**
 * Saans (साँस) - Home Screen Renderer
 *
 * Implements:
 * - Plain words verdict answering parents' real questions within 3 seconds
 * - Band-tinted merged hero card with AQI suffix, band pill, relative time, and horizontal NAQI scale bar
 * - Horizontally scrollable metro cities strip with arrow key navigation
 * - Full pollutant grid: PM2.5, PM10, CO, NO2, SO2, O3 (3x2 grid, formatted units, dominant highlighted)
 * - "What to do now" action row: Air purifier, Windows, N95 mask, Outdoor activity
 * - Cigarette equivalent comparison with source disclosure (Berkeley Earth rule of thumb)
 * - Google Weather API card with temperature, feels-like, humidity, wind, UV, and inversion risk rule
 * - 2 answer tiles: "Best time to step out" and "Best time for windows" (top-aligned, 24px focal)
 * - 24-hour responsive full-width forecast bar chart with guide lines, legend, tooltips
 * - 3 personalized quick actions with "Done" buttons logging to impact
 * - Major cities comparison section sorted worst to best with current city pinned first
 */

import { icon } from '../ui/icons.js';
import { renderSmoothForecastChart, renderMiniGauge } from './forecastChart.js';

export { renderSmoothForecastChart, renderMiniGauge };

/**
 * Formats relative time from a timestamp (e.g. "just now", "2 min ago")
 * @param {number|Date} date
 * @returns {string}
 */
export function getRelativeTime(date) {
  if (!date) return 'just now';
  const past = typeof date === 'number' ? date : new Date(date).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - past) / 1000));

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return '1 min ago';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return '1 hr ago';
  return `${diffHours} hrs ago`;
}

/**
 * Builds plain language verdict for parents and families
 * @param {number} aqi
 * @param {string} band
 * @param {object} profile
 * @param {object} bestWindow
 * @returns {{ title: string, subtitle: string, isVulnerableWarning: boolean }}
 */
export function buildVerdictText(aqi, band, profile = {}, bestWindow = null) {
  const hasKids = profile.household?.includes('kids') || profile.household?.includes('infant');
  const hasElderly = profile.household?.includes('elderly');
  const hasAsthma = profile.household?.includes('asthma');
  const hasVulnerable = hasKids || hasElderly || hasAsthma;

  if (aqi > 400 || band === 'severe') {
    return {
      title: 'Air is hazardous outside today',
      subtitle: hasVulnerable
        ? 'Keep children, seniors, and asthma patients strictly indoors. Avoid all outdoor exercise.'
        : 'Avoid all outdoor exertion. Seal window gaps and run air purifiers in closed rooms.',
      isVulnerableWarning: true
    };
  }

  if (aqi > 300 || band === 'very_poor') {
    const windowText = bestWindow && bestWindow.start ? ` Cleaner air expected around ${bestWindow.start}.` : '';
    return {
      title: 'Unhealthy air across the city',
      subtitle: hasVulnerable
        ? `Keep vulnerable family members indoors.${windowText} Wear fitted N95 respirators if stepping out.`
        : `Morning smog inversion is heavy.${windowText} Shift outdoor workouts to the afternoon.`,
      isVulnerableWarning: hasVulnerable
    };
  }

  if (aqi > 200 || band === 'poor') {
    const windowText = bestWindow && bestWindow.start ? ` Best window to step out is ${bestWindow.start} to ${bestWindow.end}.` : '';
    return {
      title: 'Moderate to high smog',
      subtitle: `Air quality is poor during morning and evening rush hours.${windowText}`,
      isVulnerableWarning: false
    };
  }

  if (aqi > 100 || band === 'moderate') {
    return {
      title: 'Acceptable air quality',
      subtitle: 'Generally safe for most people. Sensitive members should limit prolonged heavy outdoor exertion.',
      isVulnerableWarning: false
    };
  }

  if (aqi > 50 || band === 'satisfactory') {
    return {
      title: 'Air quality is satisfactory',
      subtitle: 'Safe for daily outdoor activities, walks, and opening windows during daylight.',
      isVulnerableWarning: false
    };
  }

  return {
    title: 'Clean and fresh air',
    subtitle: 'Air quality is good. Great day for outdoor play, cycling, and natural room ventilation.',
    isVulnerableWarning: false
  };
}

/**
 * Computes best and worst windows between 6 AM and 10 PM local time
 * @param {Array} forecast
 * @returns {{ bestWindow: object|null, worstWindow: object|null, bestWindowHours: number[] }}
 */
export function computeDaytimeWindows(forecast = []) {
  if (!Array.isArray(forecast) || forecast.length === 0) {
    return { bestWindow: null, worstWindow: null, bestWindowHours: [] };
  }

  const daytimeItems = forecast.map((item, index) => {
    const d = new Date(item.hour);
    const hourLocal = d.getHours();
    return { ...item, originalIndex: index, hourLocal };
  }).filter(item => item.hourLocal >= 6 && item.hourLocal <= 22);

  if (daytimeItems.length === 0) {
    return { bestWindow: null, worstWindow: null, bestWindowHours: [] };
  }

  let minWindow = null;
  let minAvgAqi = Infinity;
  let bestWindowHours = [];

  for (let i = 0; i < daytimeItems.length; i++) {
    for (let len = 2; len <= 3; len++) {
      if (i + len <= daytimeItems.length) {
        const slice = daytimeItems.slice(i, i + len);
        const sumAqi = slice.reduce((acc, curr) => acc + (curr.aqi || 0), 0);
        const avgAqi = sumAqi / len;

        if (avgAqi < minAvgAqi || (avgAqi === minAvgAqi && len > (minWindow ? minWindow.len : 0))) {
          minAvgAqi = avgAqi;
          const startTime = new Date(slice[0].hour).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          const endD = new Date(slice[slice.length - 1].hour);
          endD.setHours(endD.getHours() + 1);
          const endTime = endD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

          minWindow = {
            start: startTime,
            end: endTime,
            aqi: Math.round(avgAqi),
            len
          };
          bestWindowHours = slice.map(item => item.originalIndex);
        }
      }
    }
  }

  let maxWindow = null;
  let maxAvgAqi = -Infinity;

  for (let i = 0; i < daytimeItems.length; i++) {
    for (let len = 2; len <= 3; len++) {
      if (i + len <= daytimeItems.length) {
        const slice = daytimeItems.slice(i, i + len);
        const sumAqi = slice.reduce((acc, curr) => acc + (curr.aqi || 0), 0);
        const avgAqi = sumAqi / len;

        if (avgAqi > maxAvgAqi || (avgAqi === maxAvgAqi && len > (maxWindow ? maxWindow.len : 0))) {
          maxAvgAqi = avgAqi;
          const startTime = new Date(slice[0].hour).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          const endD = new Date(slice[slice.length - 1].hour);
          endD.setHours(endD.getHours() + 1);
          const endTime = endD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

          maxWindow = {
            start: startTime,
            end: endTime,
            aqi: Math.round(avgAqi),
            len
          };
        }
      }
    }
  }

  return { bestWindow: minWindow, worstWindow: maxWindow, bestWindowHours };
}

/**
 * Renders the Metro Cities quick select strip
 * @param {Array} cities
 * @param {string} currentCity
 * @returns {string}
 */
export function renderMetroCitiesStrip(cities = [], currentCity = 'Delhi NCR') {
  if (!Array.isArray(cities) || cities.length === 0) return '';
  const isSample = cities.some(c => c.isSample);

  return `
    <section class="metro-strip-section" aria-label="Metro cities air quality quick select">
      <div class="metro-strip-header-row">
        <span class="metro-strip-title">Major Metros</span>
        ${isSample ? `<span class="metro-sample-badge">Sample data</span>` : ''}
      </div>
      <div class="metro-strip-fade-wrapper">
        <div class="metro-strip-scroll" role="region" tabindex="0" aria-label="Metro cities. Use horizontal scroll or arrow keys to explore.">
          ${cities.map(c => {
            const isActive = c.name.toLowerCase() === (currentCity || '').toLowerCase() ||
                             (currentCity || '').toLowerCase().includes(c.name.toLowerCase());
            const isNoData = c.unavailable || c.aqi === null;
            const labelAqi = isNoData ? 'No data' : `AQI ${c.aqi}, ${c.category}`;
            return `
              <button
                type="button"
                class="metro-city-chip ${isActive ? 'metro-city-chip-active' : ''} ${isNoData ? 'metro-city-chip-nodata' : ''}"
                data-city="${c.name}"
                data-lat="${c.lat}"
                data-lng="${c.lng}"
                aria-pressed="${isActive ? 'true' : 'false'}"
                aria-label="${c.name}: ${labelAqi}"
              >
                ${!isNoData ? renderMiniGauge(c.aqi, c.color, 24) : ''}
                <span class="metro-city-name">${c.name}</span>
                <span class="metro-city-pill" style="background:${isNoData ? '#64748b' : c.color}; color:#ffffff;">
                  ${isNoData ? 'No data' : c.aqi}
                </span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    </section>
  `;
}

/**
 * Renders the full-width horizontal 6-segment NAQI scale bar with white-ringed knob
 * @param {number} aqi
 * @param {object} bandInfo
 * @returns {string}
 */
export function renderNaqiScaleBar(aqi, bandInfo) {
  const clamped = Math.max(0, Math.min(500, aqi));
  const markerLeft = ((clamped / 500) * 100).toFixed(1);

  return `
    <div class="naqi-scale-container" aria-label="India NAQI Scale">
      <div class="naqi-scale-track" role="meter" aria-label="Current AQI ${aqi}, ${bandInfo.label}" aria-valuenow="${aqi}" aria-valuemin="0" aria-valuemax="500">
        <div class="naqi-scale-seg" style="width: 10%; background: var(--aqi-good);" title="Good (0-50)"></div>
        <div class="naqi-scale-seg" style="width: 10%; background: var(--aqi-sat);" title="Satisfactory (51-100)"></div>
        <div class="naqi-scale-seg" style="width: 20%; background: var(--aqi-mod);" title="Moderate (101-200)"></div>
        <div class="naqi-scale-seg" style="width: 20%; background: var(--aqi-poor);" title="Poor (201-300)"></div>
        <div class="naqi-scale-seg" style="width: 20%; background: var(--aqi-verypoor);" title="Very poor (301-400)"></div>
        <div class="naqi-scale-seg" style="width: 20%; background: var(--aqi-severe);" title="Severe (401-500)"></div>
        <div class="naqi-scale-knob" style="left: ${markerLeft}%;" aria-hidden="true">
          <div class="scale-knob-dot" style="background: ${bandInfo.color};"></div>
        </div>
      </div>
      <div class="naqi-scale-ticks" aria-hidden="true">
        <span class="scale-tick" style="left: 0%;">0</span>
        <span class="scale-tick scale-tick-50" style="left: 10%;">50</span>
        <span class="scale-tick" style="left: 20%;">100</span>
        <span class="scale-tick" style="left: 40%;">200</span>
        <span class="scale-tick" style="left: 60%;">300</span>
        <span class="scale-tick" style="left: 80%;">400</span>
        <span class="scale-tick" style="left: 100%;">500</span>
      </div>
    </div>
  `;
}

/**
 * Renders the 240px 270-degree radial gradient gauge with value knob
 * @param {number} aqi
 * @param {object} bandInfo
 * @param {'cpcb'|'uaqi'} scale
 * @returns {string}
 */
export function renderAqiGauge(aqi, bandInfo, scale = 'cpcb') {
  const maxScale = scale === 'uaqi' ? 100 : 500;
  const clamped = Math.max(0, Math.min(aqi, maxScale));
  const ratio = clamped / maxScale;

  const radius = 92;
  const cx = 120;
  const cy = 120;
  const strokeWidth = 14;
  const fullCircumference = 2 * Math.PI * radius; // ~578.05
  const arcLength = fullCircumference * 0.75; // ~433.54
  const strokeDashoffset = arcLength * (1 - ratio);

  // Knob position along 270-degree arc from 135 deg to 405 deg (45 deg)
  const angleDeg = 135 + ratio * 270;
  const angleRad = (angleDeg * Math.PI) / 180;
  const knobX = cx + radius * Math.cos(angleRad);
  const knobY = cy + radius * Math.sin(angleRad);

  return `
    <div class="aqi-gauge-card" role="region" aria-label="Current Air Quality Gauge">
      <div class="gauge-svg-wrap">
        <svg class="gauge-svg" viewBox="0 0 240 240" width="240" height="240" aria-hidden="true">
          <defs>
            <linearGradient id="hero-naqi-arc-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#15803D" />
              <stop offset="20%" stop-color="#4D7C0F" />
              <stop offset="40%" stop-color="#B45309" />
              <stop offset="60%" stop-color="#C2410C" />
              <stop offset="80%" stop-color="#B91C1C" />
              <stop offset="100%" stop-color="#831843" />
            </linearGradient>
            <filter id="gauge-knob-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-opacity="0.35" />
            </filter>
          </defs>

          <!-- Inactive background track -->
          <circle
            cx="${cx}" cy="${cy}" r="${radius}"
            class="gauge-track"
            fill="none"
            stroke="var(--border-subtle)"
            stroke-width="${strokeWidth}"
            stroke-dasharray="${arcLength.toFixed(1)} ${fullCircumference.toFixed(1)}"
            stroke-linecap="round"
            transform="rotate(135 ${cx} ${cy})"
          />

          <!-- Gradient arc track -->
          <circle
            cx="${cx}" cy="${cy}" r="${radius}"
            fill="none"
            stroke="url(#hero-naqi-arc-gradient)"
            stroke-width="${strokeWidth}"
            stroke-dasharray="${arcLength.toFixed(1)} ${fullCircumference.toFixed(1)}"
            stroke-dashoffset="${strokeDashoffset.toFixed(1)}"
            stroke-linecap="round"
            transform="rotate(135 ${cx} ${cy})"
            class="gauge-value-arc"
          />

          <!-- White-ringed value knob with soft shadow -->
          <circle
            cx="${knobX.toFixed(2)}"
            cy="${knobY.toFixed(2)}"
            r="10"
            fill="${bandInfo.color}"
            stroke="#ffffff"
            stroke-width="3"
            filter="url(#gauge-knob-shadow)"
            class="gauge-knob-circle"
          />
        </svg>

        <div class="gauge-center-content">
          <div class="gauge-number-wrap">
            <span class="gauge-number" id="aqi-value-display">${aqi}</span>
            <span class="gauge-aqi-suffix">AQI</span>
          </div>
          <span class="gauge-band-badge band-text-${bandInfo.band}" style="background:${bandInfo.bg}; border: 1px solid ${bandInfo.color}33">
            ${bandInfo.label}
          </span>
        </div>
      </div>
      <span class="gauge-scale-caption">India NAQI (CPCB)</span>
    </div>
  `;
}

/**
 * Renders the merged Hero Card (Verdict on left, Gauge on right, full-width scale bar below)
 * @param {number} aqi
 * @param {object} bandInfo
 * @param {object} verdict
 * @param {number|Date} updatedTimestamp
 * @param {'cpcb'|'uaqi'} scale
 * @returns {string}
 */
export function renderHeroCard(aqi, bandInfo, verdict, updatedTimestamp = Date.now(), scale = 'cpcb') {
  const relTime = getRelativeTime(updatedTimestamp);
  const fullTime = new Date(updatedTimestamp || Date.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return `
    <div
      class="hero-combined-card"
      style="background: radial-gradient(circle at 85% 40%, ${bandInfo.color}14 0%, var(--bg-surface) 65%);"
      aria-live="polite"
    >
      <div class="hero-card-main">
        <div class="hero-verdict-col">
          <div class="hero-verdict-content">
            <h1 class="verdict-title">${verdict.title}</h1>
            <p class="verdict-subtitle">${verdict.subtitle}</p>
          </div>
          <div class="hero-meta-row">
            <span class="hero-updated-time" id="hero-updated-time" title="${fullTime}">
              Updated ${relTime} · Source: Google Air Quality API
            </span>
            <button type="button" class="btn-naqi-info" id="btn-naqi-info" aria-label="Learn about India NAQI scale">
              ${icon('info', 16)}
            </button>
          </div>
        </div>
        <div class="hero-gauge-col">
          ${renderAqiGauge(aqi, bandInfo, scale)}
        </div>
      </div>
      <div class="hero-scale-row">
        ${renderNaqiScaleBar(aqi, bandInfo)}
      </div>
    </div>
  `;
}

/**
 * Formats raw pollutant unit
 * @param {string} rawUnit
 * @param {string} code
 * @returns {string}
 */
function formatUnit(rawUnit = 'ug/m3', code = '') {
  if (!rawUnit) return code === 'co' ? 'mg/m³' : 'µg/m³';
  let u = rawUnit;
  if (/micrograms_per_cubic_meter|ug\/m3/i.test(u)) return 'µg/m³';
  if (/parts_per_billion|ppb/i.test(u)) return 'ppb';
  if (/parts_per_million|ppm/i.test(u)) return 'ppm';
  if (/milligrams_per_cubic_meter|mg\/m3/i.test(u)) return 'mg/m³';
  return u;
}

/**
 * Renders full 6-pollutant grid: PM2.5, PM10, CO, NO2, SO2, O3 (3x2 on desktop, 2 cols on mobile)
 * @param {Array} pollutants
 * @param {string} dominant
 * @returns {string}
 */
export function renderPollutantGrid(pollutants = [], dominant = 'pm25') {
  const defs = [
    { code: 'pm25', name: 'PM2.5', icon: 'wind', defaultVal: 195 },
    { code: 'pm10', name: 'PM10', icon: 'cloud-fog', defaultVal: 310 },
    { code: 'no2', name: 'NO₂', icon: 'smoke', defaultVal: 68 },
    { code: 'o3', name: 'O₃', icon: 'sun', defaultVal: 42 },
    { code: 'co', name: 'CO', icon: 'car', defaultVal: 1.4 },
    { code: 'so2', name: 'SO₂', icon: 'flame', defaultVal: 18 }
  ];

  const map = {};
  if (Array.isArray(pollutants)) {
    pollutants.forEach(p => {
      if (p.code) map[p.code.toLowerCase()] = p;
    });
  }

  const itemsMarkup = defs.map(d => {
    const entry = map[d.code];
    const isDominant = dominant && dominant.toLowerCase().includes(d.code);
    const rawVal = entry?.concentration?.value;
    const value = rawVal != null ? (d.code === 'co' ? Number(rawVal.toFixed(1)) : Math.round(rawVal)) : d.defaultVal;
    const unit = formatUnit(entry?.concentration?.units, d.code);

    return `
      <div class="pollutant-card ${isDominant ? 'dominant-pollutant' : ''}">
        <div class="pollutant-top">
          <div class="pollutant-title-row">
            <span class="pollutant-icon">${icon(d.icon, 16)}</span>
            <span class="pollutant-name">${d.name}</span>
          </div>
          ${isDominant ? `<span class="dominant-tag" aria-label="Dominant pollutant"><span class="dominant-dot" aria-hidden="true"></span>Main</span>` : ''}
        </div>
        <div class="pollutant-value-row">
          <span class="pollutant-val">${value}</span>
          <span class="pollutant-unit">${unit}</span>
        </div>
      </div>
    `;
  }).join('');

  return `
    <section class="pollutants-section" aria-label="Major pollutants concentrations">
      <div class="section-header-row">
        <div>
          <h2 class="section-title">Major pollutants</h2>
          <p class="section-subtitle">Key particulate and gas concentrations driving today's index</p>
        </div>
      </div>
      <div class="pollutants-grid-full">
        ${itemsMarkup}
      </div>
    </section>
  `;
}

/**
 * Backward compatibility alias for renderPollutantRow
 */
export function renderPollutantRow(pollutants, dominant) {
  return renderPollutantGrid(pollutants, dominant);
}

/**
 * Renders the compact "What to do now" action row + Cigarette equivalent card
 * @param {object} actions - From computeWhatToDoNow
 * @param {object} cigarette - From estimateCigaretteEquivalent
 * @returns {string}
 */
export function renderWhatToDoNow(actions, cigarette) {
  const items = [
    actions.purifier,
    actions.windows,
    actions.mask,
    actions.outdoor
  ];

  return `
    <section class="what-to-do-section" aria-label="What to do now based on current air quality">
      <div class="section-header-row">
        <div>
          <h2 class="section-title">What to do now</h2>
          <p class="section-subtitle">Real-time protective advice tailored to current smog and your household</p>
        </div>
      </div>

      <div class="action-status-grid">
        ${items.map(item => `
          <div class="action-status-card">
            <div class="action-status-icon-wrap">${icon(item.icon, 20)}</div>
            <div class="action-status-info">
              <span class="action-status-label">${item.label}</span>
              <span class="action-status-badge status-${item.level}">${item.status}</span>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Cigarette Equivalent Comparison -->
      <div class="cigarette-comparison-card">
        <div class="cigarette-main-row">
          <div class="cigarette-icon-square">${icon('smoke', 20)}</div>
          <div class="cigarette-content">
            <p class="cigarette-headline">${cigarette.text}</p>
            <button
              type="button"
              class="disclosure-btn btn-cigarette-disclosure"
              id="btn-cigarette-toggle"
              aria-expanded="false"
              aria-controls="cigarette-disclosure-panel"
            >
              <span>How is this estimated?</span>
              ${icon('chevron-down', 14, 'disclosure-chevron')}
            </button>
          </div>
        </div>
        <div id="cigarette-disclosure-panel" class="disclosure-panel" hidden>
          <p class="cigarette-disclosure-text">
            ${cigarette.explanation}
          </p>
        </div>
      </div>
    </section>
  `;
}

/**
 * Renders Google Weather API card with plain-words smog connection line
 * @param {object} weather
 * @returns {string}
 */
export function renderWeatherCard(weather) {
  if (!weather || weather.temperature === null || typeof weather.temperature !== 'number') return '';

  const feelsText = weather.feelsLike !== null ? ` · Feels like ${weather.feelsLike}°C` : '';
  const conditionText = weather.condition ? weather.condition : 'Current weather';

  return `
    <div class="weather-card" aria-label="Current Weather Conditions">
      <div class="weather-card-top">
        <div class="weather-temp-col">
          <div class="weather-temp-row">
            <span class="weather-temp-number">${weather.temperature}°</span>
            <span class="weather-temp-unit">C</span>
          </div>
          <span class="weather-condition-label">${conditionText}${feelsText}</span>
        </div>
        <span class="weather-icon-badge">${icon('thermometer', 24)}</span>
      </div>

      <div class="weather-metrics-grid">
        ${weather.humidity !== null ? `
          <div class="weather-metric-item">
            <span class="weather-metric-label">${icon('droplets', 14)} Humidity</span>
            <span class="weather-metric-val">${weather.humidity}%</span>
          </div>
        ` : ''}
        ${weather.windSpeed !== null ? `
          <div class="weather-metric-item">
            <span class="weather-metric-label">${icon('wind', 14)} Wind</span>
            <span class="weather-metric-val">${weather.windSpeed} km/h ${weather.windDirection || ''}</span>
          </div>
        ` : ''}
        ${weather.uvIndex !== null ? `
          <div class="weather-metric-item">
            <span class="weather-metric-label">${icon('sun', 14)} UV Index</span>
            <span class="weather-metric-val">${weather.uvIndex}</span>
          </div>
        ` : ''}
      </div>

      ${weather.inversionRisk?.text ? `
        <div class="weather-inversion-note ${weather.inversionRisk.hasRisk ? 'inversion-risk-alert' : ''}">
          ${icon('info', 16)}
          <span>${weather.inversionRisk.text}</span>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Renders the 2 Answer Tiles (Top aligned, 24px focal time, tight spacing)
 * @param {number} aqi
 * @param {object} bandInfo
 * @param {object} daytimeWindows
 * @returns {string}
 */
export function renderAnswerTiles(aqi, bandInfo, daytimeWindows) {
  const { bestWindow } = daytimeWindows;

  let stepOutTime = 'Avoid outdoors';
  let stepOutDetail = 'Air quality is severe. Stay indoors.';
  let stepOutIcon = 'cloud-fog';

  if (aqi <= 100) {
    stepOutTime = 'Safe all day';
    stepOutDetail = 'Air is clean. Great time for walks or play.';
    stepOutIcon = 'sun';
  } else if (bestWindow && bestWindow.aqi <= 350) {
    stepOutTime = `${bestWindow.start} - ${bestWindow.end}`;
    stepOutDetail = `Cleanest forecast window (AQI ~${bestWindow.aqi}). Wear an N95 if stepping out.`;
    stepOutIcon = 'clock';
  }

  let windowTime = 'Keep shut today';
  let windowDetail = 'High infiltration of outdoor PM2.5. Rely on indoor filtration.';
  let windowIcon = 'door-closed';

  if (aqi <= 100) {
    windowTime = 'Open freely';
    windowDetail = 'Outdoor air is fresh. Ventilate living areas freely.';
    windowIcon = 'wind';
  } else if (bestWindow && bestWindow.aqi <= 180) {
    windowTime = `${bestWindow.start} - ${bestWindow.end}`;
    windowDetail = 'Brief 20-min cross-ventilation when solar warmth lifts inversion.';
    windowIcon = 'fan';
  } else if (bestWindow) {
    windowTime = 'Keep windows shut today';
    windowDetail = `Least bad air around ${bestWindow.start} (AQI ~${bestWindow.aqi}), but still unhealthy for natural ventilation.`;
    windowIcon = 'door-closed';
  }

  return `
    <div class="answer-tiles-grid">
      <div class="answer-tile">
        <div class="answer-tile-header">
          <span class="answer-icon-wrap">${icon(stepOutIcon, 20)}</span>
          <span class="answer-tile-tag">Best time to step out</span>
        </div>
        <h2 class="answer-tile-title answer-time-focal">${stepOutTime}</h2>
        <p class="answer-tile-detail">${stepOutDetail}</p>
      </div>

      <div class="answer-tile">
        <div class="answer-tile-header">
          <span class="answer-icon-wrap">${icon(windowIcon, 20)}</span>
          <span class="answer-tile-tag">Best time for windows</span>
        </div>
        <h2 class="answer-tile-title answer-time-focal">${windowTime}</h2>
        <p class="answer-tile-detail">${windowDetail}</p>
      </div>
    </div>
  `;
}

/**
 * Renders 3 personalized quick actions based on profile with "Done" buttons
 * @param {number} aqi
 * @param {object} profile
 * @returns {string}
 */
export function renderQuickActions(aqi, profile = {}) {
  const actions = [];
  const hasKids = profile.household?.includes('kids') || profile.household?.includes('infant');
  const hasPurifier = profile.hasPurifier !== false;
  const isTransitUser = profile.commute === 'car' || profile.commute === 'two_wheeler';

  if (hasKids) {
    actions.push({
      icon: 'shield-check',
      title: 'Wear fitted N95 respirator',
      desc: "Ensure snug fit over child's nose and chin before stepping out",
      chip: '95% PM2.5 block',
      chipType: 'exposure'
    });
  } else {
    actions.push({
      icon: 'clock',
      title: 'Shift errands to afternoon',
      desc: 'Avoid peak morning inversion hours when ground smog is densest',
      chip: '40% less inhaled',
      chipType: 'exposure'
    });
  }

  if (hasPurifier) {
    actions.push({
      icon: 'fan',
      title: 'Run bedroom purifier on auto',
      desc: 'Keep bedroom door closed to maintain clean air envelope',
      chip: '~80% indoor drop',
      chipType: 'exposure'
    });
  } else {
    actions.push({
      icon: 'door-closed',
      title: 'Draft-seal main balcony door',
      desc: 'Roll a damp towel under door gap to block smog drafts',
      chip: '~55% infiltration cut',
      chipType: 'exposure'
    });
  }

  if (isTransitUser) {
    actions.push({
      icon: 'train-front',
      title: 'Switch commute to Metro / Bus',
      desc: 'Avoid heavy roadside exhaust fumes while saving commute emissions',
      chip: 'Save ~1.1 kg CO2',
      chipType: 'co2'
    });
  } else {
    actions.push({
      icon: 'flame',
      title: 'Run exhaust during tadka / frying',
      desc: 'Prevent kitchen fumes from doubling indoor PM2.5 levels',
      chip: 'Clean indoor air',
      chipType: 'exposure'
    });
  }

  return `
    <section class="quick-actions-section" aria-label="Personalized quick actions">
      <div class="section-header-row">
        <div>
          <h2 class="section-title">Personalized quick actions</h2>
          <p class="section-subtitle">Based on your household profile</p>
        </div>
      </div>
      <div class="quick-actions-grid">
        ${actions.map(act => `
          <div class="action-card">
            <div class="action-card-top">
              <span class="action-icon-square">${icon(act.icon, 20)}</span>
              <span class="impact-chip chip-${act.chipType}">
                ${icon(act.chipType === 'co2' ? 'train-front' : 'shield-check', 13)} ${act.chip}
              </span>
            </div>
            <h3 class="action-card-title">${act.title}</h3>
            <p class="action-card-desc">${act.desc}</p>
            <div class="action-card-bottom">
              <button
                type="button"
                class="btn btn-secondary quick-action-done-btn"
                data-title="${encodeURIComponent(act.title)}"
                data-type="${act.chipType}"
                data-hours="1.0"
                data-km="15"
                data-explanation="${encodeURIComponent(act.desc)}"
              >
                ${icon('check', 14)} Done
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

/**
 * Renders 24-hour forecast chart
 * @param {Array} forecast
 * @param {Array} bestWindowHours
 * @param {object} daytimeWindows
 * @returns {string}
 */
export function renderForecastChart(forecast = [], _bestWindowHours = [], daytimeWindows = null) {
  if (!Array.isArray(forecast) || forecast.length === 0) {
    return `
      <section class="forecast-section" aria-label="24-hour air quality forecast timeline">
        <div class="section-header-row">
          <div>
            <h2 class="section-title">24-hour forecast</h2>
            <p class="section-subtitle">Hourly India NAQI predictions</p>
          </div>
        </div>
        <div class="empty-state-card">
          <p>Hourly forecast data is temporarily unavailable from the weather station.</p>
        </div>
      </section>
    `;
  }

  return `
    <section class="forecast-section" role="region" aria-label="24-hour air quality forecast timeline" id="forecast-strip" tabindex="0">
      <div class="section-header-row">
        <div>
          <h2 class="section-title">24-hour forecast</h2>
          <p class="section-subtitle">Hourly India NAQI predictions. Shaded area highlights the cleanest daytime hours.</p>
        </div>
      </div>

      <div class="forecast-chart-card">
        ${renderSmoothForecastChart(forecast, daytimeWindows, 0)}
      </div>
    </section>
  `;
}

/**
 * Renders Major Cities Comparison section sorted worst to best with "Your city" pinned first
 * @param {Array} cities
 * @param {string} currentCity
 * @returns {string}
 */
export function renderCitiesComparison(cities = [], currentCity = 'Delhi NCR') {
  if (!Array.isArray(cities) || cities.length === 0) return '';

  const mapped = cities.map(c => {
    const isCurrent = c.name.toLowerCase() === (currentCity || '').toLowerCase() ||
                      (currentCity || '').toLowerCase().includes(c.name.toLowerCase());
    return { ...c, isCurrent };
  });

  // Sort: current city first, then worst to best (highest AQI to lowest AQI)
  const currentItem = mapped.find(c => c.isCurrent);
  const others = mapped.filter(c => !c.isCurrent).sort((a, b) => (b.aqi || 0) - (a.aqi || 0));
  const sorted = currentItem ? [currentItem, ...others] : others;

  return `
    <section class="compare-cities-section" aria-label="Major Cities Air Quality Comparison">
      <div class="section-header-row">
        <div>
          <h2 class="section-title">Compare cities</h2>
          <p class="section-subtitle">Real-time NAQI index across major Indian metropolitan areas</p>
        </div>
      </div>

      <div class="compare-cities-grid">
        ${sorted.map(c => {
          const isNoData = c.unavailable || c.aqi === null;
          const leftColor = isNoData ? '#64748b' : c.color;
          return `
            <div
              class="city-compare-card ${c.isCurrent ? 'city-compare-current' : ''}"
              style="border-left: 4px solid ${leftColor};"
              role="button"
              tabindex="0"
              data-city="${c.name}"
              data-lat="${c.lat}"
              data-lng="${c.lng}"
              aria-label="${c.name}${c.isCurrent ? ' (Your selected city)' : ''}: ${isNoData ? 'No data' : `AQI ${c.aqi}, ${c.category}`}"
            >
              <div class="city-compare-top">
                <div class="city-compare-title-row">
                  <span class="city-compare-name">${c.name}</span>
                  ${c.isCurrent ? `<span class="city-current-badge">Your city</span>` : ''}
                </div>
                <span class="city-compare-pill" style="background:${leftColor}; color:#ffffff;">
                  ${isNoData ? 'No data' : c.aqi}
                </span>
              </div>
              <div class="city-compare-bottom">
                <span class="city-compare-band ${isNoData ? '' : `band-text-${c.band}`}">${isNoData ? 'Unavailable' : c.category}</span>
                <span class="city-compare-pollutant">Dominant: PM2.5</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;
}
