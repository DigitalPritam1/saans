import { config } from '../config.js';
import { aqiCache, getAqiCacheKey } from './cache.js';

/**
 * Normalizes color from Google Air Quality API or calculates fallback based on NAQI
 * @param {object|undefined} apiColor
 * @param {number} aqi
 * @returns {string} Hex color string
 */
function normalizeColor(apiColor, aqi) {
  if (apiColor && typeof apiColor.red === 'number') {
    const r = apiColor.red <= 1 ? Math.round(apiColor.red * 255) : Math.round(apiColor.red);
    const g = apiColor.green <= 1 ? Math.round(apiColor.green * 255) : Math.round(apiColor.green);
    const b = apiColor.blue <= 1 ? Math.round(apiColor.blue * 255) : Math.round(apiColor.blue);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
  }

  // Standard Indian NAQI color scale
  if (aqi <= 50) return '#00B050'; // Good (Green)
  if (aqi <= 100) return '#92D050'; // Satisfactory (Light Green)
  if (aqi <= 200) return '#FFDE33'; // Moderate (Yellow)
  if (aqi <= 300) return '#FF9933'; // Poor (Orange)
  if (aqi <= 400) return '#CC0033'; // Very Poor (Red)
  return '#7E0023'; // Severe (Maroon)
}

/**
 * Normalizes category label based on NAQI if missing from API
 * @param {string|undefined} category
 * @param {number} aqi
 * @returns {string}
 */
function normalizeCategory(category, aqi) {
  if (category && category.trim()) {
    return category.trim();
  }
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Satisfactory';
  if (aqi <= 200) return 'Moderate';
  if (aqi <= 300) return 'Poor';
  if (aqi <= 400) return 'Very Poor';
  return 'Severe';
}

/**
 * Picks the best AQI index (prefers India NAQI 'aqi_in', falls back to 'uaqi' or first available)
 * @param {Array} indexes
 * @returns {object}
 */
function selectBestIndex(indexes = []) {
  if (!Array.isArray(indexes) || indexes.length === 0) {
    return { aqi: 0, category: 'Unknown', dominantPollutant: 'pm25' };
  }
  const naqiIndex = indexes.find(idx => idx.code === 'aqi_in');
  if (naqiIndex) return naqiIndex;

  const uaqiIndex = indexes.find(idx => idx.code === 'uaqi');
  if (uaqiIndex) return uaqiIndex;

  return indexes[0];
}

/**
 * Fetches current AQI conditions and 24h hourly forecast from Google Air Quality API
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

  const currentConditionsUrl = `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${config.googleMapsApiKey}`;
  const forecastUrl = `https://airquality.googleapis.com/v1/forecast:lookup?key=${config.googleMapsApiKey}`;

  const currentBody = {
    location: {
      latitude: lat,
      longitude: lng
    },
    extraComputations: [
      'HEALTH_RECOMMENDATIONS',
      'DOMINANT_POLLUTANT_CONCENTRATION',
      'POLLUTANT_CONCENTRATION',
      'LOCAL_AQI'
    ],
    languageCode: 'en'
  };

  const forecastBody = {
    location: {
      latitude: lat,
      longitude: lng
    },
    period: {
      hours: 24
    },
    extraComputations: [
      'LOCAL_AQI',
      'DOMINANT_POLLUTANT_CONCENTRATION'
    ],
    languageCode: 'en'
  };

  // Fetch current conditions and hourly forecast in parallel
  const [currentRes, forecastRes] = await Promise.all([
    fetch(currentConditionsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentBody)
    }),
    fetch(forecastUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forecastBody)
    })
  ]);

  if (!currentRes.ok) {
    const errText = await currentRes.text();
    const error = new Error(`Google Air Quality API currentConditions error (${currentRes.status}): ${errText}`);
    error.statusCode = currentRes.status === 403 || currentRes.status === 400 ? 502 : currentRes.status;
    throw error;
  }

  const currentData = await currentRes.json();

  let forecastItems = [];
  if (forecastRes.ok) {
    const forecastData = await forecastRes.json();
    if (Array.isArray(forecastData.hourlyForecasts)) {
      forecastItems = forecastData.hourlyForecasts.map(hf => {
        const bestIdx = selectBestIndex(hf.indexes);
        return {
          hour: hf.dateTime,
          aqi: bestIdx.aqi ?? 0,
          category: normalizeCategory(bestIdx.category, bestIdx.aqi ?? 0)
        };
      });
    }
  }

  const primaryIndex = selectBestIndex(currentData.indexes);
  const aqi = primaryIndex.aqi ?? 0;
  const category = normalizeCategory(primaryIndex.category, aqi);
  const dominantPollutant = primaryIndex.dominantPollutant || 'pm25';
  const color = normalizeColor(primaryIndex.color, aqi);
  const healthRecommendations = currentData.healthRecommendations || {};

  const result = {
    aqi,
    category,
    dominantPollutant,
    color,
    healthRecommendations,
    forecast: forecastItems
  };

  // Cache response for 10 minutes
  aqiCache.set(cacheKey, result);

  return result;
}
