/**
 * Saans (साँस) - Local Storage and Impact State Manager
 *
 * All personal data stays strictly on device in browser localStorage.
 * Impact tallies start at 0 and auto-reset each Monday.
 */

const PROFILE_KEY = 'saans_profile';
const IMPACT_LOGS_KEY = 'saans_impact_logs';
const THEME_KEY = 'saans_theme';

export const DEFAULT_PROFILE = {
  city: 'Delhi NCR',
  lat: 28.6139,
  lng: 77.2090,
  household: ['kids'],
  commute: 'two_wheeler',
  commuteDistanceKm: 8,
  cooking: 'lpg_png',
  hasPurifier: false,
  hasPlants: true,
  hasPets: false
};

/**
 * Returns date string for the Monday of the current week (YYYY-MM-DD)
 */
export function getMondayOfCurrentWeek(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // day 0 is Sunday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().split('T')[0];
}

/**
 * Load household profile from localStorage
 * @returns {object}
 */
export function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch (_e) {
    return { ...DEFAULT_PROFILE };
  }
}

/**
 * Save household profile to localStorage
 * @param {object} profile
 */
export function saveProfile(profile) {
  try {
    const existing = loadProfile();
    const merged = { ...existing, ...profile };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
    return merged;
  } catch (_e) {
    return profile;
  }
}

/**
 * Load dated impact logs from localStorage.
 * Automatically filters or archives entries prior to the current Monday.
 * @returns {Array<object>}
 */
export function loadImpactLogs() {
  try {
    const raw = localStorage.getItem(IMPACT_LOGS_KEY);
    if (!raw) return [];
    const logs = JSON.parse(raw);
    if (!Array.isArray(logs)) return [];

    const currentMonday = getMondayOfCurrentWeek();
    // Keep logs from the current week
    return logs.filter(item => {
      if (!item.date) return false;
      return item.date >= currentMonday;
    });
  } catch (_e) {
    return [];
  }
}

/**
 * Save updated impact logs to localStorage
 * @param {Array<object>} logs
 */
export function saveImpactLogs(logs) {
  try {
    localStorage.setItem(IMPACT_LOGS_KEY, JSON.stringify(logs));
  } catch (_e) {
    // quota or privacy mode fallback
  }
}

/**
 * Log an action completion
 * @param {object} action
 * @param {string} action.title
 * @param {string} action.type - 'exposure' | 'co2' | 'money'
 * @param {number} action.hoursAvoided
 * @param {number} action.co2SavedKg
 * @param {number} action.moneySavedInr
 * @param {string} [action.explanation]
 * @returns {object} new entry
 */
export function logAction(action) {
  const logs = loadImpactLogs();
  const entry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    date: new Date().toISOString(),
    dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'short' }),
    title: action.title || 'Protective Action',
    type: action.type || 'exposure',
    hoursAvoided: Number(action.hoursAvoided) || 0,
    co2SavedKg: Number(action.co2SavedKg) || 0,
    moneySavedInr: Number(action.moneySavedInr) || 0,
    explanation: action.explanation || ''
  };

  logs.unshift(entry);
  saveImpactLogs(logs);
  return entry;
}

/**
 * Remove an action from the log (Undo)
 * @param {string} logId
 * @returns {Array<object>} updated logs
 */
export function undoAction(logId) {
  const logs = loadImpactLogs();
  const updated = logs.filter(l => l.id !== logId);
  saveImpactLogs(updated);
  return updated;
}

/**
 * Calculate weekly summary tallies from actual logs
 * @returns {{ hoursAvoided: number, co2SavedKg: number, moneySavedInr: number, count: number }}
 */
export function getWeeklyImpactSummary() {
  const logs = loadImpactLogs();
  return logs.reduce(
    (acc, curr) => {
      acc.hoursAvoided = +(acc.hoursAvoided + (curr.hoursAvoided || 0)).toFixed(1);
      acc.co2SavedKg = +(acc.co2SavedKg + (curr.co2SavedKg || 0)).toFixed(2);
      acc.moneySavedInr += Math.round(curr.moneySavedInr || 0);
      acc.count += 1;
      return acc;
    },
    { hoursAvoided: 0, co2SavedKg: 0, moneySavedInr: 0, count: 0 }
  );
}

/**
 * Theme preference manager
 */
export function loadThemePreference() {
  try {
    return localStorage.getItem(THEME_KEY) || 'system';
  } catch (_e) {
    return 'system';
  }
}

export function saveThemePreference(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (_e) {
    // ignore
  }
}
