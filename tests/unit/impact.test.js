import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISCLAIMER,
  FACTORS,
  estimateWalkShiftExposure,
  estimateMaskProtection,
  estimateIndoorProtection,
  estimateCommuteShift,
  estimateCookingFuelShift,
  estimateCigaretteEquivalent,
  computeWhatToDoNow
} from '../../server/impact.js';

test('server/impact.js exports standard documented factors', () => {
  assert.equal(FACTORS.ADULT_WALK_VENTILATION_M3_HR, 1.2);
  assert.equal(FACTORS.N95_FILTRATION_EFFICIENCY, 0.95);
  assert.equal(FACTORS.SEALED_WINDOW_ATTENUATION, 0.55);
  assert.equal(FACTORS.HEPA_PURIFIER_ROOM_ATTENUATION, 0.80);
  assert.ok(DISCLAIMER.includes('do not constitute medical advice'));
});

test('estimateWalkShiftExposure calculates correct percentage and mass avoided', () => {
  // Peak AQI 400 down to clean afternoon 200 over 1 hour
  const res = estimateWalkShiftExposure(400, 200, 1.0);
  assert.equal(res.percentReduction, 50);
  // (400 - 200) * 1.2 * 1.0 = 240 µg
  assert.equal(res.avoidedMicrograms, 240);
  assert.ok(res.explanation.includes('reduces direct particulate inhalation by ~50%'));
  assert.ok(res.explanation.includes('saving ~240 µg PM2.5 intake'));
  assert.equal(res.disclaimer, DISCLAIMER);
});

test('estimateMaskProtection computes N95 filtration correctly', () => {
  const fitted = estimateMaskProtection(200, 1.0, true);
  assert.equal(fitted.percentReduction, 95);
  // 200 * 1.2 * 1.0 * 0.95 = 228 µg
  assert.equal(fitted.filteredMicrograms, 228);
  assert.ok(fitted.explanation.includes('blocks ~95%'));

  const loose = estimateMaskProtection(200, 1.0, false);
  assert.equal(loose.percentReduction, 70);
  assert.ok(loose.explanation.includes('blocks ~70%'));
});

test('estimateIndoorProtection estimates attenuation for closed, sealed, and purifier rooms', () => {
  const closed = estimateIndoorProtection(300, false, false);
  assert.equal(closed.percentReduction, 35);
  assert.equal(closed.estimatedIndoorPm25, 195); // 300 * 0.65
  assert.ok(closed.explanation.includes('Closed windows reduces indoor particulate infiltration by ~35%'));

  const sealed = estimateIndoorProtection(300, false, true);
  assert.equal(sealed.percentReduction, 55);
  assert.equal(sealed.estimatedIndoorPm25, 135); // 300 * 0.45
  assert.ok(sealed.explanation.includes('Damp-towel draft sealed balcony & doors reduces indoor particulate infiltration by ~55%'));

  const purifier = estimateIndoorProtection(300, true, false);
  assert.equal(purifier.percentReduction, 80);
  assert.equal(purifier.estimatedIndoorPm25, 60); // 300 * 0.20
  assert.ok(purifier.explanation.includes('HEPA air purifier in closed room reduces indoor particulate infiltration by ~80%'));
});

test('estimateCommuteShift computes CO2 and monetary savings per km', () => {
  // 15 km commute from two-wheeler (90 g/km) to metro (15 g/km)
  // (90 - 15) * 15 / 1000 = 1.125 -> 1.13 kg
  const res = estimateCommuteShift('two_wheeler', 'metro', 15);
  assert.equal(res.savedCo2Kg, 1.13);
  assert.ok(res.savedInr >= 15);
  assert.ok(res.explanation.includes('saves ~1.13 kg CO₂'));
  assert.ok(res.explanation.includes('approx ₹'));
  assert.equal(res.disclaimer, DISCLAIMER);
});

test('estimateCookingFuelShift computes daily and weekly emissions', () => {
  // Biomass (1200g) to LPG (340g) for 3 meals
  // (1200 - 340) * 3 / 1000 = 2.58 kg/day -> 18.06 kg/week (approx 18.1 kg)
  const res = estimateCookingFuelShift('biomass_chulha', 'lpg_png', 3);
  assert.equal(res.dailySavedKg, 2.58);
  assert.equal(res.weeklySavedKg, 18.1);
  assert.ok(res.explanation.includes('prevents ~18.1 kg CO₂e weekly'));
});

test('estimateCigaretteEquivalent computes cigarettes from PM2.5 via Berkeley Earth formula', () => {
  // 176 µg/m³ -> 176 / 22 = 8 cigarettes
  const res8 = estimateCigaretteEquivalent(176);
  assert.equal(res8.cigarettes, 8);
  assert.equal(res8.text, 'Breathing this air for 24 hours is roughly like smoking 8 cigarettes.');
  assert.ok(res8.explanation.includes('Berkeley Earth'));

  // 33 µg/m³ -> 33 / 22 = 1.5 cigarettes (rounded to 1 decimal under 2)
  const res1_5 = estimateCigaretteEquivalent(33);
  assert.equal(res1_5.cigarettes, 1.5);
  assert.equal(res1_5.text, 'Breathing this air for 24 hours is roughly like smoking 1.5 cigarettes.');

  // 0 or invalid
  const res0 = estimateCigaretteEquivalent(0);
  assert.equal(res0.cigarettes, 0);
  assert.equal(res0.text, 'Breathing this air for 24 hours is roughly like smoking 0 cigarettes.');
});

test('computeWhatToDoNow determines correct action statuses for various AQI bands and profiles', () => {
  // Severe air (AQI 350) with vulnerable family
  const severeVulnerable = computeWhatToDoNow(350, 'very_poor', { vulnerable: ['kids', 'asthma'] });
  assert.equal(severeVulnerable.purifier.status, 'Turn on');
  assert.equal(severeVulnerable.windows.status, 'Keep closed');
  assert.equal(severeVulnerable.mask.status, 'Must');
  assert.equal(severeVulnerable.outdoor.status, 'Avoid');

  // Moderate air (AQI 150) without vulnerable
  const moderateNormal = computeWhatToDoNow(150, 'moderate', { vulnerable: [] });
  assert.equal(moderateNormal.purifier.status, 'Turn on');
  assert.equal(moderateNormal.mask.status, 'Optional');
  assert.equal(moderateNormal.outdoor.status, 'Limit');

  // Moderate air with daytime window allowing ventilation
  const moderateWindow = computeWhatToDoNow(150, 'moderate', { vulnerable: [] }, { aqi: 180, start: '12:00 PM', end: '3:00 PM' });
  assert.equal(moderateWindow.windows.status, 'Ventilate at best time');

  // Good air (AQI 40)
  const cleanAir = computeWhatToDoNow(40, 'good', {});
  assert.equal(cleanAir.purifier.status, 'Not needed');
  assert.equal(cleanAir.windows.status, 'Open');
  assert.equal(cleanAir.mask.status, 'Not needed');
  assert.equal(cleanAir.outdoor.status, 'OK');
});
