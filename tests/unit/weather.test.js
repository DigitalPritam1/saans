import test from 'node:test';
import assert from 'node:assert/strict';
import { getInversionRiskAnalysis, getWeatherData } from '../../src/services/weather.js';
import { weatherCache, getWeatherCacheKey } from '../../src/services/cache.js';
import { config } from '../../src/config.js';

test('getInversionRiskAnalysis correctly evaluates cold air and wind velocity', () => {
  // Cold morning with low wind (inversion risk)
  const riskBoth = getInversionRiskAnalysis(5, 12);
  assert.equal(riskBoth.hasRisk, true);
  assert.equal(riskBoth.text, 'Low wind and a cold morning trap smoke near the ground');

  // Low wind but warm afternoon
  const riskWind = getInversionRiskAnalysis(4, 25);
  assert.equal(riskWind.hasRisk, true);
  assert.ok(riskWind.text.includes('Calm winds'));

  // Cold temperature but brisk wind
  const noRiskCold = getInversionRiskAnalysis(16, 11);
  assert.equal(noRiskCold.hasRisk, false);
  assert.ok(noRiskCold.text.includes('Cold morning temperature'));

  // Normal temperature and wind
  const normal = getInversionRiskAnalysis(18, 24);
  assert.equal(normal.hasRisk, false);
  assert.ok(normal.text.includes('Moderate wind speed'));
});

test('getWeatherData parses Google Maps Weather API response and caches result', async () => {
  const originalFetch = global.fetch;
  const originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'AIzaSyTestMockKey';

  const mockResponse = {
    currentConditions: {
      temperature: { degrees: 14.2, unit: 'CELSIUS' },
      feelsLikeTemperature: { degrees: 13.8, unit: 'CELSIUS' },
      relativeHumidity: 72,
      wind: {
        speed: { value: 6.5, unit: 'KILOMETERS_PER_HOUR' },
        direction: { cardinal: 'NNW', degrees: 340 }
      },
      uvIndex: 1,
      weatherCondition: {
        description: { text: 'Dense Haze' },
        icon: 'HAZE'
      }
    }
  };

  global.fetch = async (url, opts) => {
    assert.ok(url.includes('weather.googleapis.com'));
    assert.equal(opts.headers['X-Goog-Api-Key'], 'AIzaSyTestMockKey');
    return {
      ok: true,
      status: 200,
      json: async () => mockResponse
    };
  };

  try {
    const lat = 28.61;
    const lng = 77.20;
    const res = await getWeatherData(lat, lng);

    assert.equal(res.temperature, 14);
    assert.equal(res.feelsLike, 14);
    assert.equal(res.humidity, 72);
    assert.equal(res.windSpeed, 6.5);
    assert.equal(res.windDirection, 'NNW');
    assert.equal(res.uvIndex, 1);
    assert.equal(res.condition, 'Dense Haze');
    assert.equal(res.inversionRisk.hasRisk, true);

    // Verify cache
    const cacheKey = getWeatherCacheKey(lat, lng);
    assert.ok(weatherCache.has(cacheKey));
  } finally {
    global.fetch = originalFetch;
    config.googleMapsApiKey = originalKey;
  }
});

test('getWeatherData handles upstream errors gracefully with 502', async () => {
  const originalFetch = global.fetch;
  const originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'AIzaSyTestMockKey';

  global.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => 'Internal Server Error'
  });

  try {
    await assert.rejects(async () => {
      await getWeatherData(12.34, 56.78);
    }, (err) => {
      assert.equal(err.statusCode, 502);
      assert.equal(err.message, 'Failed to fetch weather data');
      return true;
    });
  } finally {
    global.fetch = originalFetch;
    config.googleMapsApiKey = originalKey;
  }
});

test('getWeatherData returns null for omitted fields without inventing defaults', async () => {
  const originalFetch = global.fetch;
  const originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'AIzaSyTestMockKey';

  // Weather response with only temperature provided
  const sparseResponse = {
    currentConditions: {
      temperature: { degrees: 21.0, unit: 'CELSIUS' }
      // humidity, wind, uv, condition omitted
    }
  };

  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => sparseResponse
  });

  try {
    const res = await getWeatherData(19.07, 72.87);
    assert.equal(res.temperature, 21);
    assert.equal(res.feelsLike, null);
    assert.equal(res.humidity, null);
    assert.equal(res.windSpeed, null);
    assert.equal(res.windDirection, null);
    assert.equal(res.uvIndex, null);
    assert.equal(res.condition, null);
    assert.equal(res.inversionRisk, null);
  } finally {
    global.fetch = originalFetch;
    config.googleMapsApiKey = originalKey;
  }
});
