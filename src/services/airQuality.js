import { config } from '../config.js';
import { aqiCache, getAqiCacheKey } from './cache.js';

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
 * Picks the best index from Google Air Quality API response
 * Strictly prefers India local AQI code 'ind_cpcb'
 * If ind_cpcb is missing, returns uaqi with scale: 'uaqi'
 *
 * @param {Array} indexes
 * @returns {{ aqi: number, code: string, scale: 'cpcb'|'uaqi'|'other', dominantPollutant: string, displayName: string }}
 */
export function selectBestIndex(indexes = []) {
  if (!Array.isArray(indexes) || indexes.length === 0) {
    return { aqi: 0, code: 'unknown', scale: 'cpcb', dominantPollutant: 'pm25', displayName: 'India NAQI (CPCB)' };
  }

  // 1. Prefer India CPCB National Air Quality Index
  const cpcb = indexes.find(idx => idx.code === 'ind_cpcb');
  if (cpcb) {
    return {
      aqi: cpcb.aqi ?? 0,
      code: 'ind_cpcb',
      scale: 'cpcb',
      dominantPollutant: cpcb.dominantPollutant || 'pm25',
      displayName: cpcb.displayName || 'India NAQI (CPCB)'
    };
  }

  // 2. Fall back to Universal AQI (UAQI) - marked with scale 'uaqi'
  const uaqi = indexes.find(idx => idx.code === 'uaqi');
  if (uaqi) {
    return {
      aqi: uaqi.aqi ?? 0,
      code: 'uaqi',
      scale: 'uaqi',
      dominantPollutant: uaqi.dominantPollutant || 'pm25',
      displayName: uaqi.displayName || 'Universal AQI'
    };
  }

  // 3. Fall back to primary index
  const first = indexes[0];
  return {
    aqi: first.aqi ?? 0,
    code: first.code || 'unknown',
    scale: 'other',
    dominantPollutant: first.dominantPollutant || 'pm25',
    displayName: first.displayName || 'Air Quality Index'
  };
}

/**
 * Calculates RFC 3339 UTC start and end times for Google Air Quality forecast
 * Start: next full UTC hour
 * End: start + 23 hours (24 hour window)
 */
export function getForecastUtcWindow(baseDate = new Date()) {
  const start = new Date(Date.UTC(
    baseDate.getUTCFullYear(),
    baseDate.getUTCMonth(),
    baseDate.getUTCDate(),
    baseDate.getUTCHours() + 1,
    0, 0, 0
  ));
  const end = new Date(start.getTime() + 23 * 3600 * 1000);
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString()
  };
}

/**
 * Fetches current AQI conditions and 24h hourly forecast from Google Air Quality API
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<object>}
 */
export async function getAirQualityData(lat, lng) {
  const cacheKey = getAqiCacheKey(lat, lng);
  const cached = aqiCache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  if (!config.googleMapsApiKey) {
    const error = new Error('GOOGLE_MAPS_API_KEY is not configured on the server.');
    error.statusCode = 503;
    throw error;
  }

  // Header-based API key (API keys never appear in URL query strings)
  const currentConditionsUrl = 'https://airquality.googleapis.com/v1/currentConditions:lookup';
  const forecastUrl = 'https://airquality.googleapis.com/v1/forecast:lookup';

  const requestHeaders = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': config.googleMapsApiKey
  };

  const currentBody = {
    location: { latitude: lat, longitude: lng },
    customLocalAqis: [{ regionCode: 'IN', aqi: 'ind_cpcb' }],
    extraComputations: [
      'HEALTH_RECOMMENDATIONS',
      'DOMINANT_POLLUTANT_CONCENTRATION',
      'POLLUTANT_CONCENTRATION',
      'LOCAL_AQI'
    ],
    languageCode: 'en'
  };

  const { startTime, endTime } = getForecastUtcWindow();
  const forecastBody = {
    location: { latitude: lat, longitude: lng },
    period: { startTime, endTime },
    pageSize: 24,
    customLocalAqis: [{ regionCode: 'IN', aqi: 'ind_cpcb' }],
    extraComputations: [
      'LOCAL_AQI',
      'DOMINANT_POLLUTANT_CONCENTRATION',
      'POLLUTANT_CONCENTRATION'
    ],
    languageCode: 'en'
  };

  // 10-second timeout controller for upstream requests
  const timeoutMs = 10000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let currentRes;
  let forecastRes;

  try {
    [currentRes, forecastRes] = await Promise.all([
      fetch(currentConditionsUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(currentBody),
        signal: controller.signal
      }),
      fetch(forecastUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(forecastBody),
        signal: controller.signal
      })
    ]);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('[AirQuality] Upstream request timed out after 10s');
      const timeoutError = new Error('Upstream service timed out. Please try again.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    console.error('[AirQuality] Upstream network fetch error:', err.message);
    const networkError = new Error('Failed to fetch air quality data');
    networkError.statusCode = 502;
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
  }

  // Handle Current Conditions failure: log server-side, leak nothing to client
  if (!currentRes.ok) {
    const errText = await currentRes.text().catch(() => '');
    console.error(`[AirQuality] Google Air Quality API currentConditions error (${currentRes.status}):`, errText);
    const error = new Error('Failed to fetch air quality data');
    error.statusCode = 502;
    throw error;
  }

  const currentData = await currentRes.json();

  // Forecast processing: log failure and flag forecastError instead of silently returning empty array
  let forecastItems = [];
  let forecastError = false;

  if (forecastRes.ok) {
    const forecastData = await forecastRes.json();
    if (Array.isArray(forecastData.hourlyForecasts)) {
      forecastItems = forecastData.hourlyForecasts.map(hf => {
        const bestIdx = selectBestIndex(hf.indexes);
        const cat = getCategoryFromAqi(bestIdx.aqi, bestIdx.scale);
        return {
          hour: hf.dateTime,
          aqi: bestIdx.aqi,
          scale: bestIdx.scale,
          category: cat.label,
          band: cat.band,
          color: cat.color
        };
      });
    }
  } else {
    const forecastErrText = await forecastRes.text().catch(() => '');
    console.error(`[AirQuality] Google Air Quality API forecast error (${forecastRes.status}):`, forecastErrText);
    forecastError = true;
  }

  const primaryIndex = selectBestIndex(currentData.indexes);
  const aqi = primaryIndex.aqi;
  const scale = primaryIndex.scale;
  const categoryInfo = getCategoryFromAqi(aqi, scale);
  const dominantPollutant = primaryIndex.dominantPollutant || 'pm25';

  // Extract individual pollutant readings for Home screen row
  const pollutants = Array.isArray(currentData.pollutants)
    ? currentData.pollutants.map(p => ({
        code: p.code,
        displayName: p.displayName || p.code?.toUpperCase(),
        concentration: p.concentration ? {
          value: p.concentration.value,
          units: p.concentration.units || 'ug/m3'
        } : null
      }))
    : [];

  const healthRecommendations = currentData.healthRecommendations || {};

  const result = {
    aqi,
    scale,
    displayName: primaryIndex.displayName,
    category: categoryInfo.label,
    band: categoryInfo.band,
    dominantPollutant,
    color: categoryInfo.color,
    bgColor: categoryInfo.bg,
    pollutants,
    healthRecommendations,
    forecast: forecastItems,
    forecastError
  };

  // Cache response for 10 minutes
  aqiCache.set(cacheKey, result);

  return result;
}
