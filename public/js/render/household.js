/**
 * Saans (साँस) - My Household Sheet Renderer
 *
 * Implements:
 * - 3-step setup flow with a clear visual progress bar:
 *   Step 1: Where you live (Places Autocomplete, Use my location, City presets)
 *   Step 2: Who lives here (Large selectable cards with Lucide icons: kids, elderly, asthma, pregnancy)
 *   Step 3: How you live (Commute mode cards, 1-50 km slider, cooking fuel, purifiers, pets)
 * - Sticky footer with Back and Next/Save
 * - Privacy lock note: "Saved only on this device"
 */

import { icon } from '../ui/icons.js';
import { INDIAN_CITIES } from '../geo.js';

export let householdStep = 1;

export function setHouseholdStep(step) {
  householdStep = Math.max(1, Math.min(3, step));
}

export function renderHouseholdSheet(profile = {}) {
  const currentStep = householdStep;

  // Step indicators
  const steps = [
    { num: 1, title: 'Where' },
    { num: 2, title: 'Who' },
    { num: 3, title: 'How' }
  ];

  const progressBar = `
    <div class="household-stepper" role="progressbar" aria-valuenow="${currentStep}" aria-valuemin="1" aria-valuemax="3" aria-label="Household setup progress">
      <div class="stepper-dots">
        ${steps.map(s => `
          <div class="step-dot-wrap ${s.num === currentStep ? 'step-active' : s.num < currentStep ? 'step-complete' : ''}">
            <span class="step-dot">${s.num < currentStep ? icon('check', 14) : s.num}</span>
            <span class="step-dot-title">${s.title}</span>
          </div>
        `).join('')}
      </div>
      <div class="stepper-track">
        <div class="stepper-fill" style="width: ${((currentStep - 1) / 2) * 100}%"></div>
      </div>
    </div>
  `;

  // Step 1: Where you live
  const step1Content = `
    <div class="step-content ${currentStep === 1 ? 'step-visible' : 'step-hidden'}" id="household-step-1">
      <h2 class="step-title">Where do you live?</h2>
      <p class="step-desc">Air quality forecasts and inversion hours vary by city.</p>

      <div class="location-input-group">
        <label for="household-city-search" class="field-label">Search city or area</label>
        <div class="search-input-wrap" id="places-autocomplete-container">
          <span class="search-icon">${icon('search', 18)}</span>
          <input
            type="text"
            id="household-city-search"
            class="input-text"
            placeholder="e.g. Delhi NCR, Noida, Mumbai"
            value="${profile.city || ''}"
            autocomplete="off"
          />
        </div>
        <div id="city-search-error" class="field-error-msg" role="alert" style="display:none"></div>
      </div>

      <div class="or-divider"><span>or</span></div>

      <button type="button" class="btn btn-outline btn-use-location" id="btn-use-geolocation">
        ${icon('locate-fixed', 18)} Use my current location
      </button>

      <div class="popular-cities-wrap">
        <span class="popular-label">Popular cities:</span>
        <div class="city-pills-row">
          ${INDIAN_CITIES.slice(0, 8).map(c => `
            <button
              type="button"
              class="city-pill ${profile.city === c.name ? 'city-pill-active' : ''}"
              data-city="${c.name}"
              data-lat="${c.lat}"
              data-lng="${c.lng}"
            >
              ${c.name}
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Step 2: Who lives here
  const h = Array.isArray(profile.household) ? profile.household : [];
  const members = [
    { id: 'kids', icon: 'baby', title: 'Kids under 12', desc: 'Higher breathing rates and developing lungs' },
    { id: 'elderly', icon: 'users', title: 'Seniors 60+', desc: 'Susceptible to cardiovascular stress and bronchitis' },
    { id: 'asthma', icon: 'heart-pulse', title: 'Asthma or COPD', desc: 'Immediate bronchospasm risk from particulate peaks' },
    { id: 'pregnancy', icon: 'shield-check', title: 'Expecting mothers', desc: 'Placental barrier vulnerability to PM2.5' }
  ];

  const step2Content = `
    <div class="step-content ${currentStep === 2 ? 'step-visible' : 'step-hidden'}" id="household-step-2">
      <h2 class="step-title">Who lives in your home?</h2>
      <p class="step-desc">Select all who live with you so we tailor warning thresholds and routines.</p>

      <div class="member-cards-grid">
        ${members.map(m => {
          const isSelected = h.includes(m.id);
          return `
            <button
              type="button"
              class="selectable-card member-card ${isSelected ? 'card-selected' : ''}"
              data-member-id="${m.id}"
              aria-pressed="${isSelected}"
            >
              <div class="card-icon-wrap">${icon(m.icon, 24)}</div>
              <div class="card-info">
                <span class="card-title">${m.title}</span>
                <span class="card-desc">${m.desc}</span>
              </div>
              <div class="card-checkbox-indicator">
                ${isSelected ? icon('check', 16) : ''}
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Step 3: How you live
  const commute = profile.commute || 'two_wheeler';
  const km = profile.commuteDistanceKm || 8;
  const cooking = profile.cooking || 'lpg_png';

  const commuteModes = [
    { id: 'two_wheeler', icon: 'bike', label: '2-Wheeler' },
    { id: 'car_petrol', icon: 'car', label: 'Car (Petrol)' },
    { id: 'auto_rickshaw', icon: 'car', label: 'Auto' },
    { id: 'public_bus', icon: 'bus', label: 'Bus' },
    { id: 'metro', icon: 'train-front', label: 'Metro' },
    { id: 'walk_cycle', icon: 'bike', label: 'Walk / Cycle' }
  ];

  const step3Content = `
    <div class="step-content ${currentStep === 3 ? 'step-visible' : 'step-hidden'}" id="household-step-3">
      <h2 class="step-title">How does your household live?</h2>
      <p class="step-desc">Enables honest CO2 calculations and tailored indoor advice.</p>

      <!-- Commute Mode -->
      <div class="form-section">
        <label class="field-label">Primary commute mode</label>
        <div class="commute-grid">
          ${commuteModes.map(m => `
            <button
              type="button"
              class="commute-btn ${commute === m.id ? 'commute-btn-active' : ''}"
              data-commute-mode="${m.id}"
              aria-pressed="${commute === m.id}"
            >
              ${icon(m.icon, 20)}
              <span>${m.label}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Commute Distance Slider -->
      <div class="form-section">
        <div class="slider-header-row">
          <label for="commute-distance-range" class="field-label">One-way commute distance</label>
          <span class="slider-val-badge"><span id="km-display-val">${km}</span> km</span>
        </div>
        <input
          type="range"
          id="commute-distance-range"
          min="1"
          max="50"
          value="${km}"
          class="slider-input"
          aria-valuemin="1"
          aria-valuemax="50"
          aria-valuenow="${km}"
        />
        <div class="slider-ticks" aria-hidden="true">
          <span>1 km</span>
          <span>25 km</span>
          <span>50 km</span>
        </div>
      </div>

      <!-- Cooking fuel -->
      <div class="form-section">
        <label class="field-label">Primary cooking fuel</label>
        <div class="cooking-options-row">
          <button
            type="button"
            class="fuel-btn ${cooking === 'lpg_png' ? 'fuel-btn-active' : ''}"
            data-fuel="lpg_png"
            aria-pressed="${cooking === 'lpg_png'}"
          >
            ${icon('flame', 18)} LPG / Piped Gas
          </button>
          <button
            type="button"
            class="fuel-btn ${cooking === 'induction' ? 'fuel-btn-active' : ''}"
            data-fuel="induction"
            aria-pressed="${cooking === 'induction'}"
          >
            ${icon('zap', 18)} Electric Induction
          </button>
          <button
            type="button"
            class="fuel-btn ${cooking === 'biomass_chulha' ? 'fuel-btn-active' : ''}"
            data-fuel="biomass_chulha"
            aria-pressed="${cooking === 'biomass_chulha'}"
          >
            ${icon('flame', 18)} Traditional Biomass
          </button>
        </div>
      </div>

      <!-- Appliances & Pets -->
      <div class="form-section">
        <label class="field-label">Home equipment</label>
        <div class="toggles-grid">
          <label class="toggle-card">
            <input type="checkbox" id="toggle-purifier" ${profile.hasPurifier ? 'checked' : ''} />
            <span class="toggle-card-label">
              ${icon('fan', 18)} HEPA air purifier
            </span>
          </label>

          <label class="toggle-card">
            <input type="checkbox" id="toggle-plants" ${profile.hasPlants ? 'checked' : ''} />
            <span class="toggle-card-label">
              ${icon('leaf', 18)} Indoor plants
            </span>
          </label>

          <label class="toggle-card">
            <input type="checkbox" id="toggle-pets" ${profile.hasPets ? 'checked' : ''} />
            <span class="toggle-card-label">
              ${icon('shield-check', 18)} Household pets
            </span>
          </label>
        </div>
      </div>
    </div>
  `;

  return `
    <div class="household-sheet-inner">
      <div class="sheet-header">
        <div>
          <h1 class="sheet-title">My Household</h1>
          <p class="sheet-subtitle">Customises plans and emission estimates</p>
        </div>
        <button type="button" class="btn-close-sheet" id="btn-close-household" aria-label="Close household sheet">
          ${icon('x', 20)}
        </button>
      </div>

      ${progressBar}

      <div class="sheet-body">
        ${step1Content}
        ${step2Content}
        ${step3Content}
      </div>

      <div class="sheet-footer">
        <div class="privacy-note">
          ${icon('shield-check', 14)} Saved strictly on this device
        </div>
        <div class="footer-btns">
          ${currentStep > 1 ? `
            <button type="button" class="btn btn-outline" id="btn-household-back">
              ${icon('chevron-left', 16)} Back
            </button>
          ` : ''}
          ${currentStep < 3 ? `
            <button type="button" class="btn btn-primary" id="btn-household-next">
              Next ${icon('chevron-right', 16)}
            </button>
          ` : `
            <button type="button" class="btn btn-primary" id="btn-household-save">
              Save Household
            </button>
          `}
        </div>
      </div>
    </div>
  `;
}
