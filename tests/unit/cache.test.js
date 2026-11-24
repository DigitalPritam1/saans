import test from 'node:test';
import assert from 'node:assert/strict';
import { aqiCache, getAqiCacheKey } from '../../src/services/cache.js';

test('getAqiCacheKey rounds coordinates to 2 decimal places', () => {
  const key1 = getAqiCacheKey(28.613939, 77.209021);
  const key2 = getAqiCacheKey(28.614888, 77.208111);
  assert.equal(key1, '28.61,77.21');
  assert.equal(key2, '28.61,77.21');
  assert.equal(key1, key2, 'Nearby coordinates within ~1km should yield the same cache key');
});

test('aqiCache stores and retrieves data correctly', () => {
  const key = '28.61,77.21';
  const dummyData = { aqi: 310, category: 'Very Poor' };
  
  aqiCache.set(key, dummyData);
  const retrieved = aqiCache.get(key);
  assert.deepEqual(retrieved, dummyData);
});
