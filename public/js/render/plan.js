/**
 * Saans (साँस) - Today's Plan Screen Renderer
 *
 * Implements:
 * - Header with location, AQI, Gemini generation timestamp, and Regenerate button
 * - Vulnerable member protocol doctor callout (h2 heading level for accessibility)
 * - Timeline layout: left-rail time, right-rail cards with current item highlighted
 * - Impact chip with Lucide icons (no space before percent), disclosure, and "Done" toggle
 * - "Swap these habits" 2-column grid with compact desktop comparison rows and mobile stacked
 */

import { icon } from '../ui/icons.js';

/**
 * Checks whether current profile has vulnerable members
 */
export function hasVulnerableMembers(profile = {}) {
  const h = Array.isArray(profile.household) ? profile.household : [];
  const v = Array.isArray(profile.vulnerable) ? profile.vulnerable : [];
  return (
    v.length > 0 ||
    h.includes('kids') ||
    h.includes('infant') ||
    h.includes('elderly') ||
    h.includes('asthma') ||
    h.includes('pregnancy')
  );
}

/**
 * Renders Today's Plan screen
 * @param {object} plan
 * @param {object} params
 * @param {string} params.city
 * @param {number} params.aqi
 * @param {object} params.profile
 * @param {string} params.generatedAt
 * @param {boolean} params.isLoading
 * @returns {string}
 */
export function renderPlanScreen(plan, { city, aqi, profile, generatedAt, isLoading = false }) {
  const isVulnerable = hasVulnerableMembers(profile);
  const routines = Array.isArray(plan?.routine) ? plan.routine : [];
  const alternatives = Array.isArray(plan?.alternatives) ? plan.alternatives : [];

  const timeDisplay = generatedAt || new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const doctorWarningMarkup = isVulnerable ? `
    <div class="doctor-warning-card" role="alert">
      <div class="doctor-warning-header">
        <span class="doctor-icon-wrap">${icon('heart-pulse', 20)}</span>
        <h2 class="doctor-warning-title">Vulnerable family protocol: See a doctor if</h2>
      </div>
      <ul class="doctor-warning-list">
        <li>Any family member experiences persistent wheezing or chest tightness</li>
        <li>Breathlessness occurs at rest or worsens while indoors</li>
        <li>Noticeable blue discoloration appears on lips, fingertips, or nail beds</li>
        <li>Unusual lethargy or feeding difficulties in infants and young children</li>
      </ul>
      <p class="doctor-disclaimer-note">
        Saans provides environmental exposure guidance only, not medical diagnosis or prescription.
      </p>
    </div>
  ` : '';

  const timelineMarkup = routines.length === 0 ? `
    <div class="empty-state-card">
      <p>Click "Generate plan" to construct a personalized smog protection routine for today.</p>
    </div>
  ` : `
    <div class="timeline-container">
      ${routines.map((item, idx) => {
        const isCurrent = idx === 0; // highlight next or current action
        const impact = item.impact || {};
        const chipIcon = impact.type === 'co2' ? 'train-front' : impact.type === 'money' ? 'sparkles' : 'shield-check';

        // Item 8: Remove space before percent sign everywhere ("95% less", "95% reduction")
        const rawUnit = impact.unit || '';
        const unitDisplay = rawUnit.startsWith('%') ? rawUnit : (rawUnit ? ` ${rawUnit}` : '');
        const impactLabel = `${impact.value || 0}${unitDisplay}`;

        return `
          <div class="timeline-item ${isCurrent ? 'timeline-item-active' : ''}">
            <div class="timeline-rail">
              <span class="timeline-dot"></span>
              <span class="timeline-line"></span>
            </div>

            <div class="timeline-content">
              <div class="timeline-time-badge">${item.time || 'All Day'}</div>

              <div class="plan-card ${isCurrent ? 'plan-card-active' : ''}">
                <div class="plan-card-top">
                  <h3 class="plan-card-action">${item.action}</h3>
                  <button
                    type="button"
                    class="action-done-btn plan-action-done-btn"
                    data-action-index="${idx}"
                    data-title="${encodeURIComponent(item.action)}"
                    data-type="${impact.type || 'exposure'}"
                    data-hours="${item.hours || 1.0}"
                    data-km="${item.km || 15}"
                    data-explanation="${encodeURIComponent(impact.explanation || '')}"
                    aria-label="Mark ${item.action} as completed"
                  >
                    ${icon('check', 16)} Done
                  </button>
                </div>

                <p class="plan-card-why">${item.why}</p>

                <div class="plan-card-footer">
                  <span class="impact-chip chip-${impact.type || 'exposure'}">
                    ${icon(chipIcon, 14)} ${impactLabel}
                  </span>

                  <details class="impact-disclosure">
                    <summary class="disclosure-trigger">
                      ${icon('info', 14)} How is this estimated?
                    </summary>
                    <p class="disclosure-body">
                      ${impact.explanation || 'Calculated using Central Pollution Control Board standard attenuation and emission factors.'}
                    </p>
                  </details>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Item 9: Compact 2-column row on desktop in a 2-column grid
  const alternativesMarkup = alternatives.length === 0 ? '' : `
    <div class="alternatives-section">
      <div class="section-header-row">
        <div>
          <h2 class="section-title">Swap these habits</h2>
          <p class="section-subtitle">Smarter alternatives for high-smog days</p>
        </div>
      </div>

      <div class="alternatives-grid">
        ${alternatives.map(alt => `
          <div class="alternative-card">
            <div class="alt-comparison-row">
              <div class="alt-column alt-instead">
                <span class="alt-label">Instead of</span>
                <p class="alt-text">${alt.instead}</p>
              </div>

              <div class="alt-arrow" aria-hidden="true">
                ${icon('arrow-right', 18)}
              </div>

              <div class="alt-column alt-try">
                <span class="alt-label">Try this</span>
                <p class="alt-text">${alt.try}</p>
              </div>
            </div>

            <div class="alt-footer">
              <span class="alt-impact-note">${icon('shield-check', 14)} ${alt.impact}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  return `
    <div class="plan-screen-wrap">
      <div class="plan-header-card">
        <div class="plan-header-main">
          <div class="plan-header-info">
            <h1 class="screen-title">Your plan for today</h1>
            <p class="plan-header-sub">
              ${city} · AQI ${aqi} · Generated ${timeDisplay} by Gemini
            </p>
          </div>

          <button
            type="button"
            class="btn btn-secondary btn-regenerate ${isLoading ? 'btn-loading' : ''}"
            id="btn-regenerate-plan"
            ${isLoading ? 'disabled' : ''}
            aria-label="Regenerate today's plan with Gemini"
          >
            ${icon('refresh-cw', 16, isLoading ? 'spin-icon' : '')}
            <span>${isLoading ? 'Generating...' : 'Regenerate'}</span>
          </button>
        </div>
      </div>

      ${doctorWarningMarkup}
      ${timelineMarkup}
      ${alternativesMarkup}
    </div>
  `;
}
