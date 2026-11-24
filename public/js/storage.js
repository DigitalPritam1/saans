/**
 * LocalStorage Service for Saans
 * Keeps user profile and weekly impact tally private on the device
 */

const STORAGE_KEYS = {
  PROFILE: 'saans_household_profile_v1',
  IMPACT: 'saans_impact_tally_v1',
  LOCATION: 'saans_last_location_v1'
};

const DEFAULT_PROFILE = {
  city: 'Delhi NCR',
  lat: 28.6139,
  lng: 77.2090,
  vulnerable: ['kids', 'elderly'],
  commute: 'two_wheeler',
  cooking: 'lpg_png',
  hasPurifier: false,
  hasPlants: true,
  hasPets: false
};

const DEFAULT_IMPACT = {
  exposureHours: 16.5,
  co2Saved: 12.8,
  moneySaved: 380,
  lastUpdated: new Date().toISOString()
};

export function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (!raw) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch (_e) {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
    return true;
  } catch (e) {
    console.error('[Storage] Error saving profile:', e);
    return false;
  }
}

export function loadImpact() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.IMPACT);
    if (!raw) return { ...DEFAULT_IMPACT };
    return { ...DEFAULT_IMPACT, ...JSON.parse(raw) };
  } catch (_e) {
    return { ...DEFAULT_IMPACT };
  }
}

export function saveImpact(impact) {
  try {
    localStorage.setItem(STORAGE_KEYS.IMPACT, JSON.stringify(impact));
    return true;
  } catch (e) {
    console.error('[Storage] Error saving impact:', e);
    return false;
  }
}

export function resetImpact() {
  const reset = {
    exposureHours: 0,
    co2Saved: 0,
    moneySaved: 0,
    lastUpdated: new Date().toISOString()
  };
  saveImpact(reset);
  return reset;
}
