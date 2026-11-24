/**
 * Saans (साँस) - Impact Tracker Screen Renderer
 *
 * Implements:
 * - 3 KPI cards with 7-day SVG sparklines (hidden with "No data yet" when 0, dot on today when data exists)
 * - Friendly empty weekly state with "See today's plan" button when no actions logged
 * - Activity log list with model impacts and Undo functionality
 * - Transparent "How we estimate this" documentation section citing CPCB and BEE factors
 */

import { icon } from '../ui/icons.js';
import { getWeeklyImpactSummary, loadImpactLogs } from '../storage.js';
import { DISCLAIMER, FACTORS } from '../../impact.js';

/**
 * Generates small SVG sparkline path or "No data yet"
 * Item 15: With no data, hide and show "No data yet". With data, draw proper 7-day sparkline with dot on today.
 */
function createSparklineSvg(dataPoints = [0, 0, 0, 0, 0, 0, 0], strokeColor = 'var(--color-accent)') {
  const hasData = Array.isArray(dataPoints) && dataPoints.some(v => v > 0);
  if (!hasData) {
    return `<span class="sparkline-no-data">No data yet</span>`;
  }

  const width = 84;
  const height = 28;
  const max = Math.max(1, ...dataPoints);
  const min = 0;

  const points = dataPoints.map((val, idx) => {
    const x = (idx / (dataPoints.length - 1)) * (width - 10) + 5;
    const y = height - ((val - min) / (max - min)) * (height - 10) - 5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Today dot index (0 = Mon, 6 = Sun)
  const todayIdx = (new Date().getDay() + 6) % 7;
  const todayVal = dataPoints[todayIdx] || 0;
  const dotX = ((todayIdx / (dataPoints.length - 1)) * (width - 10) + 5).toFixed(1);
  const dotY = (height - ((todayVal - min) / (max - min)) * (height - 10) - 5).toFixed(1);

  return `
    <svg class="sparkline-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <polyline
        fill="none"
        stroke="${strokeColor}"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        points="${points}"
      />
      <circle cx="${dotX}" cy="${dotY}" r="3.5" fill="${strokeColor}" class="sparkline-today-dot" />
    </svg>
  `;
}

/**
 * Renders the Impact Tracker Screen
 */
export function renderImpactScreen() {
  const summary = getWeeklyImpactSummary();
  const logs = loadImpactLogs();

  // Aggregate actions by weekday for the weekly chart
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayCounts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const dayExposure = [0, 0, 0, 0, 0, 0, 0];
  const dayCo2 = [0, 0, 0, 0, 0, 0, 0];

  logs.forEach(item => {
    if (item.date) {
      const d = new Date(item.date);
      const dayIdx = (d.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
      const dayName = days[dayIdx];
      if (dayName) {
        dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
        dayExposure[dayIdx] += item.hoursAvoided || 0;
        dayCo2[dayIdx] += item.co2SavedKg || 0;
      }
    }
  });

  const maxDayCount = Math.max(3, ...Object.values(dayCounts));
  const hasWeeklyData = logs.length > 0;

  // Item 16: Friendly empty state with icon and "See today's plan" button
  const weeklyChartContent = !hasWeeklyData ? `
    <div class="empty-weekly-state">
      <div class="empty-icon-circle">${icon('calendar-clock', 28)}</div>
      <h3 class="empty-weekly-title">No protective actions recorded this week</h3>
      <p class="empty-weekly-desc">
        Complete actions in Today's Plan or Indoor Hacks to build your family's smog protection tally.
      </p>
      <button type="button" class="btn btn-primary btn-see-plan" id="btn-see-today-plan">
        ${icon('calendar-clock', 16)} See today's plan
      </button>
    </div>
  ` : `
    <div class="weekly-bar-chart" aria-label="Weekly protective actions chart" role="img">
      ${days.map(day => {
        const count = dayCounts[day] || 0;
        const barHeightPct = Math.round((count / maxDayCount) * 100);
        return `
          <div class="chart-day-col">
            <span class="chart-bar-count">${count > 0 ? count : ''}</span>
            <div class="chart-bar-slot">
              <div class="chart-bar-fill" style="height: ${barHeightPct}%"></div>
            </div>
            <span class="chart-day-label">${day}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;

  return `
    <div class="impact-screen-wrap">
      <div class="impact-header">
        <h1 class="screen-title">Your family's impact this week</h1>
        <p class="screen-subtitle">
          Transparent metrics from verified actions. Resets every Monday.
        </p>
      </div>

      <!-- 3 KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">Peak exposure avoided</span>
            ${createSparklineSvg(dayExposure, 'var(--teal-600)')}
          </div>
          <div class="kpi-number-row">
            <span class="kpi-number">${summary.hoursAvoided}</span>
            <span class="kpi-unit">hours</span>
          </div>
          <p class="kpi-footnote">Shifted out of ground inversion windows</p>
        </div>

        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">CO2 emissions prevented</span>
            ${createSparklineSvg(dayCo2, 'var(--aqi-good)')}
          </div>
          <div class="kpi-number-row">
            <span class="kpi-number">${summary.co2SavedKg}</span>
            <span class="kpi-unit">kg CO₂</span>
          </div>
          <p class="kpi-footnote">Transit switches and clean cooking</p>
        </div>

        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">Estimated fuel saved</span>
            ${createSparklineSvg([0, 0, 0, 0, 0, 0, summary.moneySavedInr], 'var(--teal-700)')}
          </div>
          <div class="kpi-number-row">
            <span class="kpi-unit">₹</span>
            <span class="kpi-number">${summary.moneySavedInr}</span>
          </div>
          <p class="kpi-footnote">Public transit vs personal vehicles</p>
        </div>
      </div>

      <!-- Weekly Activity Chart -->
      <div class="weekly-chart-card">
        <div class="section-header-row">
          <div>
            <h2 class="section-title">Protective actions by day</h2>
            <p class="section-subtitle">${summary.count} total actions completed this week</p>
          </div>
        </div>

        ${weeklyChartContent}
      </div>

      <!-- Activity Log -->
      <div class="activity-log-section">
        <div class="section-header-row">
          <div>
            <h2 class="section-title">Logged actions</h2>
            ${logs.length > 0 ? `<p class="section-subtitle">Click Undo to reverse any entry</p>` : ''}
          </div>
        </div>

        ${logs.length === 0 ? `
          <div class="empty-state-card">
            <p>No actions logged yet this week. Mark items as "Done" in Today's Plan or Indoor Hacks to track your family's progress.</p>
          </div>
        ` : `
          <div class="activity-log-list">
            ${logs.map(item => {
              const d = new Date(item.date);
              const timeStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
              return `
                <div class="activity-item" data-log-id="${item.id}">
                  <div class="activity-info">
                    <span class="activity-title">${item.title}</span>
                    <span class="activity-time">${timeStr}</span>
                    ${item.explanation ? `<p class="activity-explanation">${item.explanation}</p>` : ''}
                  </div>
                  <button
                    type="button"
                    class="btn-undo-action"
                    data-undo-id="${item.id}"
                    aria-label="Undo action: ${item.title}"
                  >
                    ${icon('undo-2', 14)} Undo
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <!-- How we estimate this -->
      <div class="model-factors-card">
        <div class="section-header-row">
          <div>
            <h2 class="section-title">How we estimate this</h2>
            <p class="section-subtitle">Every number shown in Saans comes from published environmental engineering and emissions benchmarks</p>
          </div>
        </div>

        <ul class="factors-list">
          <li>
            <strong>N95 Respirator Filtration:</strong> Assumes ${Math.round(FACTORS.N95_FILTRATION_EFFICIENCY * 100)}% filtration efficiency for fitted NIOSH/CPCB approved particulate masks.
          </li>
          <li>
            <strong>Closed Windows & Draft Sealing:</strong> Standard Indian masonry buildings have an indoor/outdoor ratio of ~0.65 (${Math.round(FACTORS.CLOSED_WINDOW_ATTENUATION * 100)}% reduction). Damp-towel draft sealing cuts infiltration to ~0.45 (${Math.round(FACTORS.SEALED_WINDOW_ATTENUATION * 100)}% reduction).
          </li>
          <li>
            <strong>HEPA Room Purifier:</strong> Running a certified purifier in a closed room reduces ambient particulate infiltration by ~${Math.round(FACTORS.HEPA_PURIFIER_ROOM_ATTENUATION * 100)}%.
          </li>
          <li>
            <strong>Commute Mode CO2 Factors:</strong> Two-wheelers emit ~${FACTORS.EMISSIONS_G_CO2_PER_PKM.two_wheeler} g CO2/km; petrol cars emit ~${FACTORS.EMISSIONS_G_CO2_PER_PKM.car_petrol} g CO2/km; electrified Metro transit emits ~${FACTORS.EMISSIONS_G_CO2_PER_PKM.metro} g CO2/km (BEE India / DMRC standards).
          </li>
        </ul>

        <div class="disclaimer-callout">
          ${icon('info', 16)}
          <span>${DISCLAIMER}</span>
        </div>
      </div>
    </div>
  `;
}
