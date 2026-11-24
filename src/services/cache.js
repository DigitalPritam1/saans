import { LRUCache } from 'lru-cache';

// In-memory cache for Air Quality API responses (10 minutes TTL)
export const aqiCache = new LRUCache({
  max: 1000,
  ttl: 10 * 60 * 1000, // 10 minutes in milliseconds
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
