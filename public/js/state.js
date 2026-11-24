/**
 * Saans (साँस) - Client Application State
 */

import { loadProfile, loadThemePreference } from './storage.js';

export const state = {
  currentCity: 'Delhi NCR',
  lat: 28.6139,
  lng: 77.2090,

  aqiData: null,
  isSampleData: false,
  isLoadingAqi: false,
  aqiError: null,
  aqiUpdatedAt: null,

  weatherData: null,
  citiesData: [],

  profile: loadProfile(),

  planData: null,
  isLoadingPlan: false,
  planGeneratedAt: null,

  activeTab: 'home',
  chatLanguage: 'en',
  chatMessages: [],
  isSendingChat: false,

  theme: loadThemePreference()
};
