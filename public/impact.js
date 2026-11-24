/**
 * Saans (साँस) - Transparent Impact Model (Client & Server Shared Logic)
 * 
 * Provides verifiable, assumption-backed environmental & emission calculations.
 * Non-Medical Disclaimer:
 * All figures are mathematical approximations based on published urban environmental
 * studies and emissions registries. They do not constitute clinical or medical advice.
 */

export const DISCLAIMER = "Estimates are environmental and emission models based on CPCB, BEE, and WHO standard factors; they do not constitute medical advice or clinical evaluations.";

/**
 * Standard Assumptions & Emission Factors
 * Citing sources:
 * - CPCB (Central Pollution Control Board, India): Diurnal AQI inversion patterns
 * - BEE (Bureau of Energy Efficiency, India): Fuel economy and vehicular CO2 emission factors
 * - NIOSH / CPCB: Particulate respirator filtration efficacy
 * - EPA / WHO: Adult average respiratory minute ventilation during light activity (~1.2 m³/hour)
 */
export const FACTORS = {
  // Respiratory ventilation rate (m³/hour) during light physical exertion (walking/commuting)
  ADULT_WALK_VENTILATION_M3_HR: 1.2,
  
  // Filtration and infiltration attenuation factors (0.0 to 1.0)
  N95_FILTRATION_EFFICIENCY: 0.95,       // NIOSH standard: 95% fine particle capture when well-fitted
  N95_LOOSE_EFFICIENCY: 0.70,            // Loose or poorly sealed mask leak penalty
  CLOSED_WINDOW_ATTENUATION: 0.35,       // Average indoor/outdoor PM2.5 ratio ~0.65 (35% reduction) in typical masonry building
  SEALED_WINDOW_ATTENUATION: 0.55,       // Damp-towel draft sealing cuts infiltration to ~0.45 I/O (55% reduction)
  HEPA_PURIFIER_ROOM_ATTENUATION: 0.80,  // Standard room purifier (CADR 250 m³/h) in semi-closed bedroom (80% reduction)

  // Transport Emissions (grams CO2 per passenger-kilometer)
  // Sources: BEE India / Delhi Metro Rail Corporation (DMRC) emission factor benchmarks
  EMISSIONS_G_CO2_PER_PKM: {
    car_petrol: 160,       // Average 1.2-1.5L petrol car with single occupant
    car_ac: 175,           // Petrol car with AC load
    two_wheeler: 90,       // 100-150cc 4-stroke motorcycle or scooter
    auto_rickshaw: 70,     // 4-stroke CNG auto-rickshaw per passenger
    public_bus: 30,        // Standard urban CNG/electric bus per passenger
    metro: 15,             // Electrified rapid transit (Delhi Metro grid mix)
    walk_cycle: 0          // Zero-emission active transit
  },

  // Cooking fuel emissions (grams CO2 equivalent per standard family meal)
  EMISSIONS_G_CO2_PER_MEAL: {
    biomass_chulha: 1200,  // Wood/cow-dung chulha + high indoor black carbon
    lpg_png: 340,          // Pressurized LPG/PNG burner
    induction: 180         // Electric induction cooktop (Indian national grid intensity)
  },

  // Fuel costs (INR per passenger-km approximation for urban India)
  COMMUTE_COST_INR_PER_KM: {
    car_petrol: 8.5,
    two_wheeler: 2.8,
    metro: 1.5,
    public_bus: 1.0,
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
  
  // Inhaled particulate mass avoided = diff (µg/m³) * ventilation rate (m³/hr) * duration (hr)
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
 * @param {number} ambientPm25 - Ambient outdoor PM2.5 concentration (µg/m³)
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
    explanation: `A ${isWellFitted ? 'fitted' : 'standard'} N95 respirator blocks ~${percentReduction}% of fine particulate matter, preventing ~${filteredMicrograms} µg PM2.5 from reaching deep alveolar airways over ${duration}h.`,
    disclaimer: DISCLAIMER
  };
}

/**
 * 3. Estimate indoor PM2.5 exposure reduction from room sealing and HEPA filtration
 * @param {number} outdoorPm25 - Outdoor ambient PM2.5 (µg/m³)
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
    explanation: `${technique} reduces indoor particulate infiltration by ~${percentReduction}%, maintaining indoor PM2.5 around ${estimatedIndoorPm25} µg/m³ when outdoor air is ${outdoor} µg/m³.`,
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
    explanation: `Switching from ${fromFuel.replace('_', ' ')} to ${toFuel.replace('_', ' ')} prevents ~${weeklySavedKg} kg CO₂e weekly and dramatically reduces indoor polycyclic aromatic hydrocarbons (PAHs).`,
    disclaimer: DISCLAIMER
  };
}
