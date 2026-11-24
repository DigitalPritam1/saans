import test from 'node:test';
import assert from 'node:assert/strict';
import { getMetroCitiesAqi, METRO_CITIES } from '../../src/services/cities.js';
import { citiesCache } from '../../src/services/cache.js';
import { config } from '../../src/config.js';

test('getMetroCitiesAqi: returns sample baseline with isSample=true when API key is missing', async () => {
  citiesCache.clear();
  const originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = '';

  try {
    const list = await getMetroCitiesAqi();
    assert.equal(list.length, METRO_CITIES.length);
    assert.ok(list.every(c => c.isSample === true));
    assert.ok(list.every(c => c.unavailable === false));
    assert.ok(list.every(c => typeof c.aqi === 'number'));
  } finally {
    config.googleMapsApiKey = originalKey;
    citiesCache.clear();
  }
});

test('getMetroCitiesAqi: returns live data with isSample=false and caches when all succeed', async () => {
  citiesCache.clear();
  const originalKey = config.googleMapsApiKey;
  const originalFetch = global.fetch;
  config.googleMapsApiKey = 'AIzaSyTestKey';

  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      indexes: [
        { code: 'ind_cpcb', aqi: 180, category: 'Moderate', dominantPollutant: 'pm25' }
      ]
    })
  });

  try {
    const list = await getMetroCitiesAqi();
    assert.equal(list.length, METRO_CITIES.length);
    assert.ok(list.every(c => c.isSample === false));
    assert.ok(list.every(c => c.unavailable === false));
    assert.ok(list.every(c => c.aqi === 180));
    assert.ok(citiesCache.has('metro_cities'));
  } finally {
    global.fetch = originalFetch;
    config.googleMapsApiKey = originalKey;
    citiesCache.clear();
  }
});

test('getMetroCitiesAqi: marks failed city as unavailable, returns aqi=null, and does NOT cache response', async () => {
  citiesCache.clear();
  const originalKey = config.googleMapsApiKey;
  const originalFetch = global.fetch;
  config.googleMapsApiKey = 'AIzaSyTestKey';

  let callCount = 0;
  global.fetch = async () => {
    callCount++;
    // Let the first call (Delhi) fail with 500
    if (callCount === 1) {
      return {
        ok: false,
        status: 500,
        text: async () => 'Internal Error'
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        indexes: [
          { code: 'ind_cpcb', aqi: 140, category: 'Moderate', dominantPollutant: 'pm25' }
        ]
      })
    };
  };

  try {
    const list = await getMetroCitiesAqi();
    const failedCity = list.find(c => c.id === 'delhi');
    assert.ok(failedCity);
    assert.equal(failedCity.aqi, null);
    assert.equal(failedCity.category, 'No data');
    assert.equal(failedCity.unavailable, true);
    assert.equal(failedCity.isSample, false);

    // Verified: cache is NOT populated when any city fails
    assert.equal(citiesCache.has('metro_cities'), false);
  } finally {
    global.fetch = originalFetch;
    config.googleMapsApiKey = originalKey;
    citiesCache.clear();
  }
});
