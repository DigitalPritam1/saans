import { config } from '../config.js';
import { citiesCache } from './cache.js';
import { selectBestIndex, getCategoryFromAqi } from './airQuality.js';

export const METRO_CITIES = [
  { id: 'delhi', name: 'Delhi', lat: 28.6139, lng: 77.2090, fallbackAqi: 325 },
  { id: 'mumbai', name: 'Mumbai', lat: 19.0760, lng: 72.8777, fallbackAqi: 165 },
  { id: 'kolkata', name: 'Kolkata', lat: 22.5726, lng: 88.3639, fallbackAqi: 215 },
  { id: 'bengaluru', name: 'Bengaluru', lat: 12.9716, lng: 77.5946, fallbackAqi: 62 },
  { id: 'chennai', name: 'Chennai', lat: 13.0827, lng: 80.2707, fallbackAqi: 78 },
  { id: 'pune', name: 'Pune', lat: 18.5204, lng: 73.8567, fallbackAqi: 142 },
  { id: 'lucknow', name: 'Lucknow', lat: 26.8467, lng: 80.9462, fallbackAqi: 285 },
  { id: 'hyderabad', name: 'Hyderabad', lat: 17.3850, lng: 78.4867, fallbackAqi: 118 }
];

/**
 * Fetches current AQI overview for top 8 Indian metro cities
 * Cached for 10 minutes
 *
 * @returns {Promise<Array<object>>}
 */
export async function getMetroCitiesAqi() {
  const cacheKey = 'metro_cities';
  const cached = citiesCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (!config.googleMapsApiKey) {
    // Return sample baseline data when Google API key is not configured
    const sampleResults = METRO_CITIES.map(c => {
      const cat = getCategoryFromAqi(c.fallbackAqi, 'cpcb');
      return {
        id: c.id,
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        aqi: c.fallbackAqi,
        band: cat.band,
        category: cat.label,
        color: cat.color,
        bgColor: cat.bg,
        dominantPollutant: 'pm25',
        isSample: true,
        unavailable: false
      };
    });
    citiesCache.set(cacheKey, sampleResults);
    return sampleResults;
  }

  const currentConditionsUrl = 'https://airquality.googleapis.com/v1/currentConditions:lookup';
  const requestHeaders = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': config.googleMapsApiKey
  };

  const timeoutMs = 8000;
  const fetchPromises = METRO_CITIES.map(async (city) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(currentConditionsUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          location: { latitude: city.lat, longitude: city.lng },
          customLocalAqis: [{ regionCode: 'IN', aqi: 'ind_cpcb' }],
          extraComputations: ['LOCAL_AQI'],
          languageCode: 'en'
        }),
        signal: controller.signal
      });

      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`Upstream ${res.status}`);
      }

      const data = await res.json();
      const bestIdx = selectBestIndex(data.indexes);
      const cat = getCategoryFromAqi(bestIdx.aqi, bestIdx.scale);

      return {
        id: city.id,
        name: city.name,
        lat: city.lat,
        lng: city.lng,
        aqi: bestIdx.aqi,
        band: cat.band,
        category: cat.label,
        color: cat.color,
        bgColor: cat.bg,
        dominantPollutant: bestIdx.dominantPollutant || 'pm25',
        isSample: false,
        unavailable: false
      };
    } catch (_err) {
      clearTimeout(timer);
      return {
        id: city.id,
        name: city.name,
        lat: city.lat,
        lng: city.lng,
        aqi: null,
        band: null,
        category: 'No data',
        color: '#64748b',
        bgColor: '#f1f5f9',
        dominantPollutant: null,
        isSample: false,
        unavailable: true
      };
    }
  });

  const settled = await Promise.all(fetchPromises);
  const hasFailures = settled.some(c => c.unavailable);
  if (!hasFailures) {
    citiesCache.set(cacheKey, settled);
  }
  return settled;
}
