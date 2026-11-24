/**
 * Saans (साँस) - Transparent Impact Model (Client and Server Shared Logic)
 *
 * Provides verifiable, assumption-backed environmental and emission calculations.
 * Non-Medical Disclaimer:
 * All figures are mathematical approximations based on published urban environmental
 * studies and emissions registries. They do not constitute clinical or medical advice.
 */

export const DISCLAIMER = 'Estimates are environmental and emission models based on CPCB, BEE, and WHO standard factors; they do not constitute medical advice or clinical evaluations.';

/**
 * Derives band, label, color, and background from numeric AQI breakpoints
 * Implements Central Pollution Control Board (CPCB) NAQI scale
 * 0-50: Good, 51-100: Satisfactory, 101-200: Moderate, 201-300: Poor, 301-400: Very poor, 401-500: Severe
 *
 * @param {number} aqi
 * @param {'cpcb'|'uaqi'} [scale='cpcb']
 * @returns {{ band: string, label: string, color: string, bg: string }}
 */
export function getCategoryFromAqi(aqi, scale = 'cpcb') {
  const num = typeof aqi === 'number' && !isNaN(aqi) ? aqi : 0;

  if (scale === 'uaqi') {
    // Universal AQI is inverted (100 = best, 0 = worst)
    if (num >= 80) return { band: 'good', label: 'Excellent', color: '#15803D', bg: '#DCFCE7' };
    if (num >= 60) return { band: 'satisfactory', label: 'Good', color: '#4D7C0F', bg: '#ECFCCB' };
    if (num >= 40) return { band: 'moderate', label: 'Moderate', color: '#B45309', bg: '#FEF3C7' };
    if (num >= 20) return { band: 'poor', label: 'Poor', color: '#C2410C', bg: '#FFEDD5' };
    return { band: 'very_poor', label: 'Very poor', color: '#B91C1C', bg: '#FEE2E2' };
  }

  // CPCB National Air Quality Index (NAQI) for India
  if (num <= 50) return { band: 'good', label: 'Good', color: '#15803D', bg: '#DCFCE7' };
  if (num <= 100) return { band: 'satisfactory', label: 'Satisfactory', color: '#4D7C0F', bg: '#ECFCCB' };
  if (num <= 200) return { band: 'moderate', label: 'Moderate', color: '#B45309', bg: '#FEF3C7' };
  if (num <= 300) return { band: 'poor', label: 'Poor', color: '#C2410C', bg: '#FFEDD5' };
  if (num <= 400) return { band: 'very_poor', label: 'Very poor', color: '#B91C1C', bg: '#FEE2E2' };
  return { band: 'severe', label: 'Severe', color: '#831843', bg: '#FCE7F3' };
}

/**
 * Standard Assumptions and Emission Factors
 * Citing sources:
 * - CPCB (Central Pollution Control Board, India): Diurnal AQI inversion patterns
 * - BEE (Bureau of Energy Efficiency, India): Fuel economy and vehicular CO2 emission factors
 * - NIOSH / CPCB: Particulate respirator filtration efficacy
 * - EPA / WHO: Adult average respiratory minute ventilation during light activity (~1.2 m3/hour)
 */
export const FACTORS = {
  // Respiratory ventilation rate (m3/hour) during light physical exertion (walking/commuting)
  ADULT_WALK_VENTILATION_M3_HR: 1.2,

  // Filtration and infiltration attenuation factors (0.0 to 1.0)
  N95_FILTRATION_EFFICIENCY: 0.95,       // NIOSH standard: 95% fine particle capture when well-fitted
  N95_LOOSE_EFFICIENCY: 0.70,            // Loose or poorly sealed mask leak penalty
  CLOSED_WINDOW_ATTENUATION: 0.35,       // Average indoor/outdoor PM2.5 ratio ~0.65 (35% reduction) in typical masonry building
  SEALED_WINDOW_ATTENUATION: 0.55,       // Damp-towel draft sealing cuts infiltration to ~0.45 I/O (55% reduction)
  HEPA_PURIFIER_ROOM_ATTENUATION: 0.80,  // Standard room purifier (CADR 250 m3/h) in semi-closed bedroom (80% reduction)

  // Transport Emissions (grams CO2 per passenger-kilometer)
  // Sources: BEE India / Delhi Metro Rail Corporation (DMRC) emission factor benchmarks
  EMISSIONS_G_CO2_PER_PKM: {
    car_petrol: 160,       // Average 1.2-1.5L petrol car with single occupant
    car_ac: 175,           // Petrol car with AC load
    two_wheeler: 90,       // 100-150cc 4-stroke motorcycle or scooter
    auto_rickshaw: 70,     // 4-stroke CNG auto-rickshaw per passenger
    public_bus: 30,        // Standard urban CNG/electric bus per passenger
    metro: 15,             // Electrified rapid transit (Delhi Metro grid mix)
    metro_train: 15,       // Alias for metro
    walk_cycle: 0          // Zero-emission active transit
  },

  // Cooking fuel emissions (grams CO2 equivalent per standard family meal)
  EMISSIONS_G_CO2_PER_MEAL: {
    biomass_chulha: 1200,  // Wood/dung chulha + high indoor black carbon
    biomass: 1200,         // Alias
    lpg_png: 340,          // Pressurized LPG/PNG burner
    lpg: 340,              // Alias
    induction: 180         // Electric induction cooktop (Indian national grid intensity)
  },

  // Fuel costs (INR per passenger-km approximation for urban India)
  COMMUTE_COST_INR_PER_KM: {
    car_petrol: 8.5,
    car_ac: 9.2,
    two_wheeler: 2.8,
    auto_rickshaw: 5.5,
    public_bus: 1.0,
    metro: 1.5,
    metro_train: 1.5,
    walk_cycle: 0
  }
};

/**
 * 1. Estimate PM2.5 exposure reduction from shifting outdoor activity to a cleaner hour
 * @param {number} peakPm25 - PM2.5 or AQI during peak inversion hour (e.g., 8:00 AM)
 * @param {number} cleanPm25 - PM2.5 or AQI during cleaner forecast hour (e.g., 2:30 PM)
 * @param {number} durationHours - Duration of walk or errand in hours (default 1.0)
 * @returns {object}
 */
export function estimateWalkShiftExposure(peakPm25, cleanPm25, durationHours = 1.0) {
  const peak = Math.max(0, Number(peakPm25) || 0);
  const clean = Math.max(0, Number(cleanPm25) || 0);
  const duration = Math.max(0.1, Number(durationHours) || 1.0);

  const diff = Math.max(0, peak - clean);
  const percentReduction = peak > 0 ? Math.round((diff / peak) * 100) : 0;

  // Inhaled particulate mass avoided = diff (ug/m3) * ventilation rate (m3/hr) * duration (hr)
  const avoidedMicrograms = Math.round(diff * FACTORS.ADULT_WALK_VENTILATION_M3_HR * duration);

  return {
    percentReduction,
    avoidedMicrograms,
    explanation: `Shifting a ${duration}h walk from peak smog (NAQI/PM2.5 ${peak}) to the cleaner afternoon window (${clean}) reduces direct particulate inhalation by ~${percentReduction}% (saving ~${avoidedMicrograms} µg PM2.5 intake).`,
    disclaimer: DISCLAIMER
  };
}

/**
 * 2. Estimate PM2.5 exposure reduction from wearing a certified N95 mask
 * @param {number} ambientPm25 - Ambient outdoor PM2.5 concentration (ug/m3)
 * @param {number} durationHours - Hours spent outdoors
 * @param {boolean} isWellFitted - Whether the mask is snugly sealed
 * @returns {object}
 */
export function estimateMaskProtection(ambientPm25, durationHours = 1.0, isWellFitted = true) {
  const pm25 = Math.max(0, Number(ambientPm25) || 0);
  const duration = Math.max(0.1, Number(durationHours) || 1.0);
  const efficiency = isWellFitted ? FACTORS.N95_FILTRATION_EFFICIENCY : FACTORS.N95_LOOSE_EFFICIENCY;

  const totalInhaledWithoutMask = pm25 * FACTORS.ADULT_WALK_VENTILATION_M3_HR * duration;
  const filteredMicrograms = Math.round(totalInhaledWithoutMask * efficiency);
  const percentReduction = Math.round(efficiency * 100);

  return {
    percentReduction,
    filteredMicrograms,
    explanation: `A ${isWellFitted ? 'fitted' : 'standard'} N95 respirator blocks ~${percentReduction}% of fine particulate matter, preventing ~${filteredMicrograms} µg PM2.5 from reaching deep airways over ${duration}h.`,
    disclaimer: DISCLAIMER
  };
}

/**
 * 3. Estimate indoor PM2.5 exposure reduction from room sealing and HEPA filtration
 * @param {number} outdoorPm25 - Outdoor ambient PM2.5 (ug/m3)
 * @param {boolean} hasPurifier - Whether a mechanical HEPA purifier is operating
 * @param {boolean} isDraftSealed - Whether damp towel barriers or weatherstrips are applied
 * @returns {object}
 */
export function estimateIndoorProtection(outdoorPm25, hasPurifier = false, isDraftSealed = false) {
  const outdoor = Math.max(0, Number(outdoorPm25) || 0);

  let reductionFactor;
  if (hasPurifier) {
    reductionFactor = FACTORS.HEPA_PURIFIER_ROOM_ATTENUATION; // ~80%
  } else if (isDraftSealed) {
    reductionFactor = FACTORS.SEALED_WINDOW_ATTENUATION;       // ~55%
  } else {
    reductionFactor = FACTORS.CLOSED_WINDOW_ATTENUATION;       // ~35%
  }

  const percentReduction = Math.round(reductionFactor * 100);
  const estimatedIndoorPm25 = Math.round(outdoor * (1 - reductionFactor));

  let technique = 'Closed windows';
  if (hasPurifier) technique = 'HEPA air purifier in closed room';
  else if (isDraftSealed) technique = 'Damp-towel draft sealed balcony & doors';

  return {
    percentReduction,
    estimatedIndoorPm25,
    explanation: `${technique} reduces indoor particulate infiltration by ~${percentReduction}%, maintaining indoor PM2.5 around ${estimatedIndoorPm25} µg/m3 when outdoor air is ${outdoor} µg/m3.`,
    disclaimer: DISCLAIMER
  };
}

/**
 * 4. Estimate CO2 emissions and money saved by switching commute modes
 * @param {string} fromMode - Current transit mode (e.g. 'car_petrol', 'two_wheeler')
 * @param {string} toMode - Alternative mode (e.g. 'metro', 'public_bus', 'walk_cycle')
 * @param {number} distanceKm - One-way or roundtrip distance in kilometers
 * @returns {object}
 */
export function estimateCommuteShift(fromMode = 'two_wheeler', toMode = 'metro', distanceKm = 15) {
  const dist = Math.max(1, Number(distanceKm) || 15);

  const fromEmissions = FACTORS.EMISSIONS_G_CO2_PER_PKM[fromMode] ?? FACTORS.EMISSIONS_G_CO2_PER_PKM.two_wheeler;
  const toEmissions = FACTORS.EMISSIONS_G_CO2_PER_PKM[toMode] ?? FACTORS.EMISSIONS_G_CO2_PER_PKM.metro;

  const diffGramsPerKm = Math.max(0, fromEmissions - toEmissions);
  const savedCo2Kg = +((diffGramsPerKm * dist) / 1000).toFixed(2);

  // Monetary savings estimation
  const fromCost = FACTORS.COMMUTE_COST_INR_PER_KM[fromMode] ?? FACTORS.COMMUTE_COST_INR_PER_KM.two_wheeler;
  const toCost = FACTORS.COMMUTE_COST_INR_PER_KM[toMode] ?? FACTORS.COMMUTE_COST_INR_PER_KM.metro;
  const savedInr = Math.max(0, Math.round((fromCost - toCost) * dist));

  const formatModeName = (m) => m.replace(/_/g, ' ');

  return {
    savedCo2Kg,
    savedInr,
    distanceKm: dist,
    explanation: `Switching a ${dist} km commute from ${formatModeName(fromMode)} to ${formatModeName(toMode)} saves ~${savedCo2Kg} kg CO₂ and approx ₹${savedInr} in fuel/travel costs.`,
    disclaimer: DISCLAIMER
  };
}

/**
 * 5. Estimate CO2e emissions saved by cleaner cooking fuel options
 * @param {string} fromFuel - e.g. 'biomass_chulha' or 'lpg_png'
 * @param {string} toFuel - e.g. 'lpg_png' or 'induction'
 * @param {number} mealsPerDay - Number of meals cooked per day (default 3)
 * @returns {object}
 */
export function estimateCookingFuelShift(fromFuel = 'biomass_chulha', toFuel = 'lpg_png', mealsPerDay = 3) {
  const fromEmissions = FACTORS.EMISSIONS_G_CO2_PER_MEAL[fromFuel] ?? FACTORS.EMISSIONS_G_CO2_PER_MEAL.biomass_chulha;
  const toEmissions = FACTORS.EMISSIONS_G_CO2_PER_MEAL[toFuel] ?? FACTORS.EMISSIONS_G_CO2_PER_MEAL.lpg_png;

  const diffGramsPerMeal = Math.max(0, fromEmissions - toEmissions);
  const dailySavedKg = +((diffGramsPerMeal * mealsPerDay) / 1000).toFixed(2);
  const weeklySavedKg = +(dailySavedKg * 7).toFixed(1);

  return {
    dailySavedKg,
    weeklySavedKg,
    explanation: `Switching from ${fromFuel.replace(/_/g, ' ')} to ${toFuel.replace(/_/g, ' ')} prevents ~${weeklySavedKg} kg CO₂e weekly and eliminates toxic indoor soot.`,
    disclaimer: DISCLAIMER
  };
}

/**
 * 6. Compute impact for any routine action using the server impact model
 * Ensures every number displayed comes directly from this verified model
 *
 * @param {object} item
 * @param {number} ambientAqi
 * @param {object} profile
 * @returns {{ type: 'exposure'|'co2'|'money', value: number, unit: string, explanation: string }}
 */
export function computeItemImpact(item, ambientAqi = 300, profile = {}) {
  const type = item.actionType || 'other';
  const hours = Math.max(0.25, Number(item.hours) || 1.0);
  const km = Math.max(1, Number(item.km) || Number(profile.commuteDistanceKm) || 15);
  const aqi = typeof ambientAqi === 'number' && !isNaN(ambientAqi) ? ambientAqi : 300;

  switch (type) {
    case 'walk_shift': {
      const cleanAqi = Math.max(30, Math.round(aqi * 0.55));
      const res = estimateWalkShiftExposure(aqi, cleanAqi, hours);
      return {
        type: 'exposure',
        value: res.percentReduction,
        unit: '% reduction',
        explanation: res.explanation
      };
    }
    case 'n95': {
      const res = estimateMaskProtection(aqi, hours, true);
      return {
        type: 'exposure',
        value: res.percentReduction,
        unit: '% reduction',
        explanation: res.explanation
      };
    }
    case 'purifier': {
      const res = estimateIndoorProtection(aqi, true, false);
      return {
        type: 'exposure',
        value: res.percentReduction,
        unit: '% reduction',
        explanation: res.explanation
      };
    }
    case 'draft_seal': {
      const res = estimateIndoorProtection(aqi, false, true);
      return {
        type: 'exposure',
        value: res.percentReduction,
        unit: '% reduction',
        explanation: res.explanation
      };
    }
    case 'windows_closed': {
      const res = estimateIndoorProtection(aqi, false, false);
      return {
        type: 'exposure',
        value: res.percentReduction,
        unit: '% reduction',
        explanation: res.explanation
      };
    }
    case 'commute_switch': {
      const from = profile.commute || 'two_wheeler';
      const to = from === 'metro' || from === 'metro_train' ? 'walk_cycle' : 'metro';
      const res = estimateCommuteShift(from, to, km);
      return {
        type: 'co2',
        value: res.savedCo2Kg,
        unit: 'kg CO2',
        explanation: res.explanation
      };
    }
    case 'cooking_switch': {
      const fromFuel = profile.cooking || 'biomass_chulha';
      const res = estimateCookingFuelShift(fromFuel, 'lpg_png', 3);
      return {
        type: 'co2',
        value: res.dailySavedKg,
        unit: 'kg CO2/day',
        explanation: res.explanation
      };
    }
    default: {
      return {
        type: 'exposure',
        value: 35,
        unit: '% reduction',
        explanation: 'Timed schedule adjustment reduces direct exposure during peak concentration periods.'
      };
    }
  }
}

/**
 * 6. Estimate cigarette equivalent from 24-hour PM2.5 exposure
 * Citing source:
 * Berkeley Earth rule of thumb: ~22 µg/m³ of PM2.5 inhaled over 24 hours
 * roughly equals the particulate health burden of 1 cigarette per day.
 *
 * @param {number} pm25 - 24-hour average PM2.5 concentration in µg/m³
 * @returns {{ cigarettes: number, raw: number, text: string, explanation: string, source: string }}
 */
export function estimateCigaretteEquivalent(pm25) {
  const conc = typeof pm25 === 'number' && !isNaN(pm25) && pm25 > 0 ? pm25 : 0;
  const raw = conc / 22;
  const cigarettes = raw < 2 ? Number(raw.toFixed(1)) : Math.round(raw);
  const plural = cigarettes === 1 ? 'cigarette' : 'cigarettes';

  return {
    cigarettes,
    raw: Number(raw.toFixed(2)),
    text: `Breathing this air for 24 hours is roughly like smoking ${cigarettes} ${plural}.`,
    explanation: 'Rough comparison based on the Berkeley Earth rule of thumb (~22 µg/m³ PM2.5 over 24 hours equals ~1 cigarette/day). For risk awareness only, not medical advice.',
    source: 'Berkeley Earth (Muller & Muller)'
  };
}

/**
 * 7. Action row statuses driven by NAQI and household profile
 * Pure function providing immediate guidance across:
 * - Air purifier: Turn on / Optional / Not needed
 * - Windows: Keep closed / Ventilate at best time / Open
 * - N95 mask: Must / Recommended / Not needed (Must whenever vulnerable members go out above Poor)
 * - Outdoor activity: Avoid / Limit / OK
 *
 * @param {number} aqi
 * @param {string} band
 * @param {object} profile
 * @param {object} [bestWindow]
 * @returns {{ purifier: object, windows: object, mask: object, outdoor: object }}
 */
export function computeWhatToDoNow(aqi, band, profile = {}, bestWindow = null) {
  const num = typeof aqi === 'number' && !isNaN(aqi) ? aqi : 300;
  const h = Array.isArray(profile.household) ? profile.household : [];
  const v = Array.isArray(profile.vulnerable) ? profile.vulnerable : [];
  const isVulnerable = (
    v.length > 0 ||
    h.includes('kids') ||
    h.includes('infant') ||
    h.includes('elderly') ||
    h.includes('asthma') ||
    h.includes('pregnancy') ||
    Boolean(profile.asthma) ||
    Boolean(profile.elderly) ||
    Boolean(profile.kids)
  );

  // 1. Air purifier
  let purifier;
  if (num <= 50) {
    purifier = { status: 'Not needed', level: 'ok', icon: 'fan', label: 'Air purifier' };
  } else if (num <= 100) {
    purifier = { status: 'Optional', level: 'optional', icon: 'fan', label: 'Air purifier' };
  } else {
    purifier = { status: 'Turn on', level: 'severe', icon: 'fan', label: 'Air purifier' };
  }

  // 2. Windows
  let windows;
  if (num <= 50) {
    windows = { status: 'Open', level: 'ok', icon: 'door-open', label: 'Windows' };
  } else if (bestWindow && bestWindow.aqi <= 200) {
    windows = { status: 'Ventilate at best time', level: 'moderate', icon: 'clock', label: 'Windows' };
  } else {
    windows = { status: 'Keep closed', level: 'severe', icon: 'door-closed', label: 'Windows' };
  }

  // 3. N95 mask
  let mask;
  if (num <= 100) {
    mask = { status: 'Not needed', level: 'ok', icon: 'shield-check', label: 'N95 mask' };
  } else if (num <= 200) {
    if (isVulnerable) {
      mask = { status: 'Recommended', level: 'warning', icon: 'shield-alert', label: 'N95 mask' };
    } else {
      mask = { status: 'Optional', level: 'optional', icon: 'shield', label: 'N95 mask' };
    }
  } else {
    // num > 200 (Poor, Very Poor, Severe)
    if (isVulnerable) {
      mask = { status: 'Must', level: 'severe', icon: 'shield-alert', label: 'N95 mask' };
    } else {
      mask = { status: 'Recommended', level: 'warning', icon: 'shield', label: 'N95 mask' };
    }
  }

  // 4. Outdoor activity
  let outdoor;
  if (num <= 100) {
    outdoor = { status: 'OK', level: 'ok', icon: 'footprints', label: 'Outdoor activity' };
  } else if (num <= 200) {
    outdoor = { status: 'Limit', level: 'warning', icon: 'footprints', label: 'Outdoor activity' };
  } else {
    outdoor = { status: 'Avoid', level: 'severe', icon: 'footprints', label: 'Outdoor activity' };
  }

  return { purifier, windows, mask, outdoor };
}
