import test from 'node:test';
import assert from 'node:assert/strict';
import { getAirQualityData } from '../../src/services/airQuality.js';
import { config } from '../../src/config.js';
import { aqiCache } from '../../src/services/cache.js';

test('AQI Response Mapper: parses Google Air Quality API response with Indian NAQI (aqi_in)', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'test-maps-key';
  aqiCache.clear();

  const mockCurrentResponse = {
    dateTime: '2026-11-24T06:00:00Z',
    regionCode: 'IN',
    indexes: [
      {
        code: 'aqi_in',
        displayName: 'India (NAQI)',
        aqi: 320,
        category: 'Very Poor',
        dominantPollutant: 'pm25',
        color: { red: 0.85, green: 0.15, blue: 0.15 }
      },
      {
        code: 'uaqi',
        displayName: 'Universal AQI',
        aqi: 78,
        category: 'Poor'
      }
    ],
    healthRecommendations: {
      generalPopulation: 'Wear an N95 mask outdoors.',
      elderly: 'Avoid outdoor exertion.'
    }
  };

  const mockForecastResponse = {
    hourlyForecasts: [
      {
        dateTime: '2026-11-24T07:00:00Z',
        indexes: [
          { code: 'aqi_in', aqi: 340, category: 'Very Poor' }
        ]
      },
      {
        dateTime: '2026-11-24T08:00:00Z',
        indexes: [
          { code: 'aqi_in', aqi: 360, category: 'Very Poor' }
        ]
      }
    ]
  };

  globalThis.fetch = async (url) => {
    if (url.includes('currentConditions:lookup')) {
      return {
        ok: true,
        status: 200,
        json: async () => mockCurrentResponse
      };
    }
    if (url.includes('forecast:lookup')) {
      return {
        ok: true,
        status: 200,
        json: async () => mockForecastResponse
      };
    }
    throw new Error('Unknown URL: ' + url);
  };

  try {
    const data = await getAirQualityData(28.6139, 77.2090);
    assert.equal(data.aqi, 320);
    assert.equal(data.category, 'Very Poor');
    assert.equal(data.dominantPollutant, 'pm25');
    assert.ok(data.color.startsWith('#'));
    assert.equal(data.healthRecommendations.generalPopulation, 'Wear an N95 mask outdoors.');
    assert.equal(data.forecast.length, 2);
    assert.equal(data.forecast[0].aqi, 340);
    assert.equal(data.forecast[0].category, 'Very Poor');

    // Second call should come from cache
    const cachedData = await getAirQualityData(28.6140, 77.2091);
    assert.equal(cachedData.cached, true);
    assert.equal(cachedData.aqi, 320);
  } finally {
    globalThis.fetch = originalFetch;
    config.googleMapsApiKey = originalKey;
    aqiCache.clear();
  }
});

test('AQI Response Mapper: falls back to uaqi when aqi_in is absent and calculates standard NAQI colors', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'test-maps-key';
  aqiCache.clear();

  const mockCurrentResponse = {
    dateTime: '2026-11-24T06:00:00Z',
    indexes: [
      {
        code: 'uaqi',
        displayName: 'Universal AQI',
        aqi: 45,
        dominantPollutant: 'pm10'
      }
    ]
  };

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => mockCurrentResponse
  });

  try {
    const data = await getAirQualityData(19.0760, 72.8777);
    assert.equal(data.aqi, 45);
    assert.equal(data.category, 'Good'); // Normalized from <= 50
    assert.equal(data.dominantPollutant, 'pm10');
    assert.equal(data.color, '#00B050'); // Good green
  } finally {
    globalThis.fetch = originalFetch;
    config.googleMapsApiKey = originalKey;
    aqiCache.clear();
  }
});

test('AQI Response Mapper: properly maps upstream error responses', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'test-maps-key';
  aqiCache.clear();

  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    text: async () => 'API key not authorized for Air Quality API'
  });

  try {
    await assert.rejects(
      async () => {
        await getAirQualityData(28.61, 77.20);
      },
      (err) => {
        assert.equal(err.statusCode, 502);
        assert.ok(err.message.includes('Air Quality API'));
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    config.googleMapsApiKey = originalKey;
    aqiCache.clear();
  }
});
