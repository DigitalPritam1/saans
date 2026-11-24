/**
 * Saans (साँस) - Smooth Monotone Forecast Line Chart & Mini Gauge Component
 *
 * Implements Section 10 of the design reference:
 * - Monotone cubic spline curve (Fritsch-Carlson, guaranteed zero overshoot)
 * - Stroke colored by NAQI band using linearGradient built from hourly points
 * - Subtle dotted fill pattern under the curve
 * - Faint vertical grid lines every 3 hours
 * - Past and current hour solid stroke, future hours dashed stroke
 * - White-ringed knob at current hour with soft shadow
 * - Best daytime window highlighted with light shaded band and label
 * - Interactive scrubber (hover, drag, tap, arrow keys)
 * - Floating tooltip card with time, date, mini gauge, AQI, and band (flips near edges)
 * - Full accessibility: role="img", aria-label summary, and aria-live polite region for scrubber values
 */

import { getCategoryFromAqi } from '../../impact.js';
import { icon } from '../ui/icons.js';

/**
 * Computes a smooth monotone cubic Hermite spline SVG path string
 * guaranteed never to overshoot extrema (Fritsch-Carlson method).
 *
 * @param {Array<{x: number, y: number}>} points
 * @returns {string} SVG path 'd' attribute
 */
export function buildMonotoneCubicPath(points = []) {
  if (!Array.isArray(points) || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  const n = points.length;
  // Step 1: Secants Delta_k
  const deltas = new Array(n - 1);
  for (let k = 0; k < n - 1; k++) {
    const dx = points[k + 1].x - points[k].x;
    deltas[k] = dx === 0 ? 0 : (points[k + 1].y - points[k].y) / dx;
  }

  // Step 2: Slopes d_k
  const d = new Array(n);
  d[0] = deltas[0];
  d[n - 1] = deltas[n - 2];
  for (let k = 1; k < n - 1; k++) {
    if (deltas[k - 1] * deltas[k] <= 0) {
      d[k] = 0;
    } else {
      d[k] = (deltas[k - 1] + deltas[k]) / 2;
    }
  }

  // Step 3: Fritsch-Carlson monotonic limiter
  for (let k = 0; k < n - 1; k++) {
    if (deltas[k] === 0) {
      d[k] = 0;
      d[k + 1] = 0;
    } else {
      const alpha = d[k] / deltas[k];
      const beta = d[k + 1] / deltas[k];
      if (alpha < 0) d[k] = 0;
      if (beta < 0) d[k + 1] = 0;
      const mag2 = alpha * alpha + beta * beta;
      if (mag2 > 9) {
        const tau = 3 / Math.sqrt(mag2);
        d[k] = tau * alpha * deltas[k];
        d[k + 1] = tau * beta * deltas[k];
      }
    }
  }

  // Step 4: Generate cubic Bezier segments
  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let k = 0; k < n - 1; k++) {
    const dx = (points[k + 1].x - points[k].x) / 3;
    const cp1x = points[k].x + dx;
    const cp1y = points[k].y + d[k] * dx;
    const cp2x = points[k + 1].x - dx;
    const cp2y = points[k + 1].y - d[k + 1] * dx;
    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${points[k + 1].x.toFixed(1)} ${points[k + 1].y.toFixed(1)}`;
  }

  return path;
}

/**
 * Builds array of gradient stop objects for linearGradient along x-axis
 *
 * @param {Array<{hour: string, aqi: number}>} forecast
 * @returns {Array<{offset: string, color: string, aqi: number}>}
 */
export function buildForecastGradientStops(forecast = []) {
  if (!Array.isArray(forecast) || forecast.length === 0) return [];
  const n = forecast.length;
  if (n === 1) {
    const cat = getCategoryFromAqi(forecast[0].aqi || 0, 'cpcb');
    return [
      { offset: '0%', color: cat.color, aqi: forecast[0].aqi || 0 },
      { offset: '100%', color: cat.color, aqi: forecast[0].aqi || 0 }
    ];
  }

  return forecast.map((item, idx) => {
    const offset = `${((idx / (n - 1)) * 100).toFixed(2)}%`;
    const cat = getCategoryFromAqi(item.aqi || 0, 'cpcb');
    return {
      offset,
      color: cat.color,
      aqi: item.aqi || 0
    };
  });
}

/**
 * Renders a mini 40px gradient arc gauge with white-ringed knob
 * Reused in chart tooltips and metro city chips
 *
 * @param {number} aqi
 * @param {string} bandColor
 * @param {number} size - Pixel dimension (e.g. 40)
 * @returns {string} SVG HTML markup
 */
export function renderMiniGauge(aqi = 0, bandColor = '#15803D', size = 40) {
  const clamped = Math.max(0, Math.min(500, aqi));
  const ratio = clamped / 500;
  const radius = 13;
  const cx = 20;
  const cy = 20;
  const strokeWidth = 3.5;
  const circ = 2 * Math.PI * radius; // ~81.68
  const arcLength = circ * 0.75; // ~61.26

  const angleDeg = 135 + ratio * 270;
  const angleRad = (angleDeg * Math.PI) / 180;
  const knobX = cx + radius * Math.cos(angleRad);
  const knobY = cy + radius * Math.sin(angleRad);

  return `
    <svg class="mini-gauge-svg" viewBox="0 0 40 40" width="${size}" height="${size}" role="img" aria-label="AQI ${aqi}">
      <circle
        cx="${cx}" cy="${cy}" r="${radius}"
        fill="none"
        stroke="var(--border-subtle)"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${arcLength.toFixed(1)} ${circ.toFixed(1)}"
        stroke-linecap="round"
        transform="rotate(135 ${cx} ${cy})"
      />
      <circle
        cx="${cx}" cy="${cy}" r="${radius}"
        fill="none"
        stroke="url(#global-naqi-arc-gradient)"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${arcLength.toFixed(1)} ${circ.toFixed(1)}"
        stroke-linecap="round"
        transform="rotate(135 ${cx} ${cy})"
      />
      <circle
        cx="${knobX.toFixed(1)}"
        cy="${knobY.toFixed(1)}"
        r="3.2"
        fill="${bandColor}"
        stroke="#ffffff"
        stroke-width="1.5"
      />
    </svg>
  `;
}

/**
 * Renders the smooth monotone forecast line chart with scrubber and tooltip
 *
 * @param {Array<{hour: string, aqi: number}>} forecast
 * @param {object} daytimeWindows
 * @param {number} currentHourIndex
 * @returns {string}
 */
export function renderSmoothForecastChart(forecast = [], daytimeWindows = {}, currentHourIndex = 0) {
  if (!Array.isArray(forecast) || forecast.length === 0) {
    return `
      <div class="forecast-empty-state">
        <p>No 24-hour forecast data currently available.</p>
      </div>
    `;
  }

  const { bestWindow, bestWindowHours = [] } = daytimeWindows || {};

  // Find min and max for y-scale
  const aqiValues = forecast.map(f => f.aqi || 0);
  const maxAqi = Math.max(300, ...aqiValues);
  const yMax = Math.ceil((maxAqi + 40) / 50) * 50; // rounded ceiling
  const yMin = 0;

  // Layout dimensions
  const numHours = forecast.length;
  const minWidthPerHour = 36;
  const chartWidth = Math.max(864, numHours * minWidthPerHour);
  const chartHeight = 220;

  const padLeft = 48;
  const padRight = 30;
  const padTop = 32;
  const padBottom = 38;

  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;
  const plotBottom = padTop + plotHeight;

  // Map data to x, y coordinates
  const points = forecast.map((item, idx) => {
    const x = padLeft + (idx / (numHours - 1)) * plotWidth;
    const aqi = Math.max(0, Math.min(yMax, item.aqi || 0));
    const y = plotBottom - ((aqi - yMin) / (yMax - yMin)) * plotHeight;
    return {
      x,
      y,
      aqi: item.aqi || 0,
      hour: item.hour,
      idx
    };
  });

  // Current hour point
  const currIdx = Math.max(0, Math.min(numHours - 1, currentHourIndex));
  const currentPoint = points[currIdx];
  const currentCategory = getCategoryFromAqi(currentPoint.aqi, 'cpcb');

  // Solid path (past & current: 0 to currIdx)
  const solidPoints = points.slice(0, currIdx + 1);
  const solidPath = buildMonotoneCubicPath(solidPoints);

  // Dashed path (future: currIdx to end)
  const dashedPoints = points.slice(currIdx);
  const dashedPath = buildMonotoneCubicPath(dashedPoints);

  // Full path for dotted area fill
  const fullCurvePath = buildMonotoneCubicPath(points);
  const areaPath = `${fullCurvePath} L ${points[points.length - 1].x.toFixed(1)} ${plotBottom} L ${points[0].x.toFixed(1)} ${plotBottom} Z`;

  // Gradient stops for stroke
  const gradientStops = buildForecastGradientStops(forecast);
  const stopsMarkup = gradientStops.map(s => `
    <stop offset="${s.offset}" stop-color="${s.color}" />
  `).join('');

  // Best window light shaded band
  let bestWindowMarkup = '';
  if (bestWindowHours && bestWindowHours.length > 0) {
    const firstIdx = Math.max(0, bestWindowHours[0]);
    const lastIdx = Math.min(points.length - 1, bestWindowHours[bestWindowHours.length - 1]);
    const x1 = points[firstIdx].x;
    const x2 = points[lastIdx].x;
    const bandWidth = Math.max(30, x2 - x1);
    const badgeX = x1 + bandWidth / 2;

    bestWindowMarkup = `
      <g class="forecast-best-window-band">
        <rect
          x="${x1.toFixed(1)}"
          y="${padTop}"
          width="${bandWidth.toFixed(1)}"
          height="${plotHeight}"
          fill="var(--aqi-good-bg)"
          opacity="0.45"
          rx="6"
        />
        <line
          x1="${x1.toFixed(1)}" y1="${padTop}"
          x2="${x1.toFixed(1)}" y2="${plotBottom}"
          stroke="var(--aqi-good)" stroke-width="1.5" stroke-dasharray="3 3"
        />
        <line
          x1="${x2.toFixed(1)}" y1="${padTop}"
          x2="${x2.toFixed(1)}" y2="${plotBottom}"
          stroke="var(--aqi-good)" stroke-width="1.5" stroke-dasharray="3 3"
        />
        <g transform="translate(${badgeX.toFixed(1)}, ${padTop + 14})">
          <rect x="-42" y="-10" width="84" height="20" rx="10" fill="var(--aqi-good)" />
          <text x="0" y="3.5" fill="#ffffff" font-size="10.5" font-weight="700" text-anchor="middle">Best window</text>
        </g>
      </g>
    `;
  }

  // Faint vertical grid lines every 3 hours with time labels (drop any label closer than 40px to its neighbour)
  const candidateIndices = [];
  points.forEach((p, idx) => {
    const d = new Date(p.hour);
    const h = d.getHours();
    if (h % 3 === 0 || idx === 0 || idx === points.length - 1) {
      candidateIndices.push(idx);
    }
  });

  const visibleGridPoints = [];
  let lastLabelX = -999;
  candidateIndices.forEach((idx, i) => {
    const p = points[idx];
    if (i === candidateIndices.length - 1 && visibleGridPoints.length > 0) {
      const prevX = visibleGridPoints[visibleGridPoints.length - 1].x;
      if (p.x - prevX < 40) {
        return; // Drop colliding end label
      }
    }
    if (p.x - lastLabelX >= 40) {
      visibleGridPoints.push(p);
      lastLabelX = p.x;
    }
  });

  const gridLinesMarkup = visibleGridPoints.map(p => {
    const d = new Date(p.hour);
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
    return `
      <g class="forecast-grid-mark">
        <line
          x1="${p.x.toFixed(1)}" y1="${padTop}"
          x2="${p.x.toFixed(1)}" y2="${plotBottom}"
          stroke="var(--border-subtle)" stroke-width="1" stroke-dasharray="2 3"
        />
        <text
          x="${p.x.toFixed(1)}" y="${plotBottom + 18}"
          text-anchor="middle"
          fill="var(--text-secondary)"
          font-size="11"
          font-weight="500"
        >${timeStr}</text>
      </g>
    `;
  });

  // Horizontal reference guide lines (100, 200, 300, 400 all visible with comfortable gutter)
  const horizontalGuides = [100, 200, 300, 400].filter(val => val < yMax).map(val => {
    const y = plotBottom - ((val - yMin) / (yMax - yMin)) * plotHeight;
    return `
      <g class="forecast-horiz-guide">
        <line
          x1="${padLeft}" y1="${y.toFixed(1)}"
          x2="${(chartWidth - padRight).toFixed(1)}" y2="${y.toFixed(1)}"
          stroke="var(--border-subtle)" stroke-width="1" stroke-dasharray="3 4" opacity="0.6"
        />
        <text
          x="${padLeft - 8}" y="${(y + 3).toFixed(1)}"
          text-anchor="end"
          fill="var(--text-muted)"
          font-size="10"
        >${val}</text>
      </g>
    `;
  }).join('');

  // Initial scrubber position set at current hour
  const initScrubX = currentPoint.x.toFixed(1);
  const initScrubY = currentPoint.y.toFixed(1);
  const initHourDate = new Date(currentPoint.hour);
  const initTimeStr = initHourDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const initDateStr = initHourDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Summary text for screen readers
  const peakItem = forecast.reduce((max, curr) => (curr.aqi > max.aqi ? curr : max), forecast[0]);
  const peakTime = new Date(peakItem.hour).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
  const bestWindowDesc = bestWindow && bestWindow.start ? ` Best window between ${bestWindow.start} and ${bestWindow.end}.` : '';
  const chartAriaLabel = `Hourly air quality forecast line chart for the next 24 hours. Peak AQI of ${peakItem.aqi} around ${peakTime}.${bestWindowDesc}`;

  return `
    <div class="forecast-card-inner">
      <div class="forecast-scroll-wrap">
        <div class="forecast-swipe-hint" aria-hidden="true">
          ${icon('compass', 13)} Swipe for more hours
        </div>

        <div class="forecast-scroll-container" id="forecast-scroll-container" tabindex="0" role="region" aria-label="Scrollable 24-hour forecast timeline">
          <div class="forecast-scroll-track" style="min-width: ${chartWidth}px; position: relative;">
            <svg
              class="forecast-smooth-chart-svg"
              viewBox="0 0 ${chartWidth} ${chartHeight}"
              width="100%"
              height="${chartHeight}"
              preserveAspectRatio="none"
              role="img"
              aria-label="${chartAriaLabel}"
            >
              <defs>
                <linearGradient id="forecast-line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  ${stopsMarkup}
                </linearGradient>

                <linearGradient id="global-naqi-arc-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#15803D" />
                  <stop offset="20%" stop-color="#4D7C0F" />
                  <stop offset="40%" stop-color="#B45309" />
                  <stop offset="60%" stop-color="#C2410C" />
                  <stop offset="80%" stop-color="#B91C1C" />
                  <stop offset="100%" stop-color="#831843" />
                </linearGradient>

                <pattern id="forecast-dotted-pattern" width="8" height="8" patternUnits="userSpaceOnUse">
                  <circle cx="4" cy="4" r="1.1" fill="var(--text-muted)" opacity="0.25" />
                </pattern>

                <filter id="forecast-knob-shadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.35" />
                </filter>
              </defs>

              ${horizontalGuides}
              ${bestWindowMarkup}
              ${gridLinesMarkup.join('')}

              <!-- Dotted area fill under curve -->
              <path
                d="${areaPath}"
                fill="url(#forecast-dotted-pattern)"
                aria-hidden="true"
              />

              <!-- Solid line: past and current hours -->
              ${solidPath ? `
                <path
                  d="${solidPath}"
                  fill="none"
                  stroke="url(#forecast-line-gradient)"
                  stroke-width="3.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                />
              ` : ''}

              <!-- Dashed line: future hours -->
              ${dashedPath ? `
                <path
                  d="${dashedPath}"
                  fill="none"
                  stroke="url(#forecast-line-gradient)"
                  stroke-width="3"
                  stroke-dasharray="5 5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                />
              ` : ''}

              <!-- Ringed knob on current hour -->
              <circle
                class="forecast-current-knob"
                cx="${currentPoint.x.toFixed(1)}"
                cy="${currentPoint.y.toFixed(1)}"
                r="6.5"
                fill="${currentCategory.color}"
                stroke="#ffffff"
                stroke-width="2.5"
                filter="url(#forecast-knob-shadow)"
                aria-hidden="true"
              />

              <!-- Interactive scrubber vertical line -->
              <line
                id="forecast-scrubber-line"
                class="forecast-scrubber-line"
                x1="${initScrubX}" y1="${padTop}"
                x2="${initScrubX}" y2="${plotBottom}"
                stroke="var(--text-primary)"
                stroke-width="1.5"
                stroke-dasharray="3 3"
                aria-hidden="true"
              />

              <!-- Scrubber knob -->
              <circle
                id="forecast-scrubber-knob"
                class="forecast-scrubber-knob"
                cx="${initScrubX}"
                cy="${initScrubY}"
                r="7"
                fill="${currentCategory.color}"
                stroke="#ffffff"
                stroke-width="2.5"
                filter="url(#forecast-knob-shadow)"
                aria-hidden="true"
              />

            </svg>

            <!-- Full transparent overlay capturing pointer & touch interactions -->
            <div
              class="forecast-chart-hitbox"
              style="position: absolute; left: ${padLeft}px; top: ${padTop}px; width: ${plotWidth}px; height: ${plotHeight}px; cursor: ew-resize; z-index: 5;"
              role="slider"
              tabindex="0"
              aria-label="Forecast hour scrubber"
              aria-valuemin="0"
              aria-valuemax="${numHours - 1}"
              aria-valuenow="${currIdx}"
              aria-valuetext="${currentPoint.aqi} AQI, ${currentCategory.label} at ${initTimeStr}"
            ></div>

            <!-- Floating Scrubber Tooltip Card (hidden on initial load) -->
            <div
              id="forecast-tooltip-card"
              class="forecast-tooltip-card"
              style="display: none; left: ${Math.max(10, currentPoint.x - 70).toFixed(0)}px; top: ${Math.max(6, currentPoint.y - 82).toFixed(0)}px;"
              aria-hidden="true"
            >
              <div class="tooltip-time-row">
                <span class="tooltip-time" id="tooltip-time">${initTimeStr}</span>
                <span class="tooltip-date" id="tooltip-date">${initDateStr}</span>
              </div>
              <div class="tooltip-body-row">
                <div class="tooltip-gauge-slot" id="tooltip-gauge-slot">
                  ${renderMiniGauge(currentPoint.aqi, currentCategory.color, 36)}
                </div>
                <div class="tooltip-val-col">
                  <div class="tooltip-aqi-row">
                    <span class="tooltip-aqi-num" id="tooltip-aqi-num">${currentPoint.aqi}</span>
                    <span class="tooltip-aqi-unit">AQI</span>
                  </div>
                  <span class="tooltip-band-label" id="tooltip-band-label">
                    ${currentCategory.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Live region announcing scrubber changes for screen readers -->
      <div id="forecast-scrubber-live" class="sr-only" aria-live="polite"></div>

      <!-- Forecast Color Legend Bar (All NAQI categories represented) -->
      <div class="forecast-legend-bar" aria-label="NAQI forecast category legend">
        <div class="legend-item"><span class="legend-swatch" style="background:var(--aqi-good)"></span><span>Good</span></div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--aqi-sat)"></span><span>Satisfactory</span></div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--aqi-mod)"></span><span>Moderate</span></div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--aqi-poor)"></span><span>Poor</span></div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--aqi-verypoor)"></span><span>Very poor</span></div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--aqi-severe)"></span><span>Severe</span></div>
      </div>
    </div>
  `;
}
