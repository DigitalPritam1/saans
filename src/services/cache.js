import { LRUCache } from 'lru-cache';

// In-memory cache for Air Quality API responses (10 minutes TTL)
export const aqiCache = new LRUCache({
  max: 1000,
  ttl: 10 * 60 * 1000, // 10 minutes in milliseconds
  updateAgeOnGet: false
});

// In-memory cache for Google Weather API responses (10 minutes TTL)
export const weatherCache = new LRUCache({
  max: 1000,
  ttl: 10 * 60 * 1000,
  updateAgeOnGet: false
});

// In-memory cache for Metro Cities AQI strip (10 minutes TTL)
export const citiesCache = new LRUCache({
  max: 10,
  ttl: 10 * 60 * 1000,
  updateAgeOnGet: false
});

/**
 * Generate a cache key from latitude and longitude rounded to 2 decimal places (~1.1km)
 * @param {number} lat
 * @param {number} lng
 * @returns {string}
 */
export function getAqiCacheKey(lat, lng) {
  const roundedLat = Number(lat).toFixed(2);
  const roundedLng = Number(lng).toFixed(2);
  return `${roundedLat},${roundedLng}`;
}

export function getWeatherCacheKey(lat, lng) {
  const roundedLat = Number(lat).toFixed(2);
  const roundedLng = Number(lng).toFixed(2);
  return `weather:${roundedLat},${roundedLng}`;
}
