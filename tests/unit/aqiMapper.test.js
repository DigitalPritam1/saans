import test from 'node:test';
import assert from 'node:assert/strict';
import { getAirQualityData, getCategoryFromAqi, selectBestIndex } from '../../src/services/airQuality.js';
import { config } from '../../src/config.js';
import { aqiCache } from '../../src/services/cache.js';

test('getCategoryFromAqi: derives band, label, and colors from numeric NAQI breakpoints', () => {
  // NAQI breakpoints: 0-50 Good, 51-100 Satisfactory, 101-200 Moderate, 201-300 Poor, 301-400 Very poor, 401-500 Severe
  assert.equal(getCategoryFromAqi(35).label, 'Good');
  assert.equal(getCategoryFromAqi(35).band, 'good');

  assert.equal(getCategoryFromAqi(85).label, 'Satisfactory');
  assert.equal(getCategoryFromAqi(85).band, 'satisfactory');

  assert.equal(getCategoryFromAqi(150).label, 'Moderate');
  assert.equal(getCategoryFromAqi(150).band, 'moderate');

  assert.equal(getCategoryFromAqi(250).label, 'Poor');
  assert.equal(getCategoryFromAqi(250).band, 'poor');

  assert.equal(getCategoryFromAqi(350).label, 'Very poor');
  assert.equal(getCategoryFromAqi(350).band, 'very_poor');

  assert.equal(getCategoryFromAqi(450).label, 'Severe');
  assert.equal(getCategoryFromAqi(450).band, 'severe');
});

test('selectBestIndex: prefers ind_cpcb and falls back to uaqi', () => {
  const withCpcb = [
    { code: 'uaqi', aqi: 45, displayName: 'Universal AQI' },
    { code: 'ind_cpcb', aqi: 280, displayName: 'India NAQI (CPCB)', dominantPollutant: 'pm25' }
  ];
  const selectedCpcb = selectBestIndex(withCpcb);
  assert.equal(selectedCpcb.code, 'ind_cpcb');
  assert.equal(selectedCpcb.aqi, 280);
  assert.equal(selectedCpcb.scale, 'cpcb');

  const uaqiOnly = [
    { code: 'uaqi', aqi: 75, displayName: 'Universal AQI', dominantPollutant: 'pm10' }
  ];
  const selectedUaqi = selectBestIndex(uaqiOnly);
  assert.equal(selectedUaqi.code, 'uaqi');
  assert.equal(selectedUaqi.aqi, 75);
  assert.equal(selectedUaqi.scale, 'uaqi');
});

test('AQI Response Mapper: parses Google Air Quality API response with ind_cpcb', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'test-maps-key';
  aqiCache.clear();

  let capturedHeaders = {};
  let capturedForecastBody = null;

  const mockCurrentResponse = {
    dateTime: '2026-11-24T06:00:00Z',
    regionCode: 'IN',
    indexes: [
      {
        code: 'ind_cpcb',
        displayName: 'India (NAQI)',
        aqi: 320,
        category: 'Ignored Google String',
        dominantPollutant: 'pm25'
      },
      {
        code: 'uaqi',
        displayName: 'Universal AQI',
        aqi: 78
      }
    ],
    pollutants: [
      { code: 'pm25', displayName: 'PM2.5', concentration: { value: 180, units: 'PARTS_PER_BILLION' } }
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
          { code: 'ind_cpcb', aqi: 340 }
        ]
      },
      {
        dateTime: '2026-11-24T08:00:00Z',
        indexes: [
          { code: 'ind_cpcb', aqi: 360 }
        ]
      }
    ]
  };

  globalThis.fetch = async (url, options) => {
    capturedHeaders = options.headers || {};
    if (url.includes('currentConditions:lookup')) {
      return {
        ok: true,
        status: 200,
        json: async () => mockCurrentResponse
      };
    }
    if (url.includes('forecast:lookup')) {
      capturedForecastBody = JSON.parse(options.body);
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
    // Key sent in X-Goog-Api-Key header
    assert.equal(capturedHeaders['X-Goog-Api-Key'], 'test-maps-key');
    // Forecast body has RFC 3339 UTC period and pageSize 24
    assert.ok(capturedForecastBody.period.startTime.endsWith('Z'));
    assert.ok(capturedForecastBody.period.endTime.endsWith('Z'));
    assert.equal(capturedForecastBody.pageSize, 24);

    assert.equal(data.aqi, 320);
    // Derived from numeric breakpoint 320 -> "Very poor"
    assert.equal(data.category, 'Very poor');
    assert.equal(data.dominantPollutant, 'pm25');
    assert.ok(data.color.startsWith('#'));
    assert.equal(data.healthRecommendations.generalPopulation, 'Wear an N95 mask outdoors.');
    assert.equal(data.forecast.length, 2);
    assert.equal(data.forecast[0].aqi, 340);
    assert.equal(data.forecast[0].category, 'Very poor');

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

test('AQI Response Mapper: falls back to uaqi when ind_cpcb is absent and sets scale', async () => {
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
        aqi: 85,
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
    assert.equal(data.aqi, 85);
    assert.equal(data.scale, 'uaqi');
    assert.equal(data.category, 'Excellent'); // 85 on uaqi is Excellent
    assert.equal(data.dominantPollutant, 'pm10');
  } finally {
    globalThis.fetch = originalFetch;
    config.googleMapsApiKey = originalKey;
    aqiCache.clear();
  }
});

test('AQI Response Mapper: sets forecastError: true if forecast call fails', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'test-maps-key';
  aqiCache.clear();

  globalThis.fetch = async (url) => {
    if (url.includes('currentConditions:lookup')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          dateTime: '2026-11-24T06:00:00Z',
          indexes: [{ code: 'ind_cpcb', aqi: 150 }]
        })
      };
    }
    // Forecast throws error
    return {
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    };
  };

  try {
    const data = await getAirQualityData(28.61, 77.20);
    assert.equal(data.aqi, 150);
    assert.equal(data.forecastError, true);
    assert.deepEqual(data.forecast, []);
  } finally {
    globalThis.fetch = originalFetch;
    config.googleMapsApiKey = originalKey;
    aqiCache.clear();
  }
});

test('AQI Response Mapper: properly maps timeout to 504', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'test-maps-key';
  aqiCache.clear();

  globalThis.fetch = async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  };

  try {
    await assert.rejects(
      async () => {
        await getAirQualityData(28.61, 77.20);
      },
      (err) => {
        assert.equal(err.statusCode, 504);
        assert.equal(err.message, 'Upstream service timed out. Please try again.');
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    config.googleMapsApiKey = originalKey;
    aqiCache.clear();
  }
});

test('AQI Response Mapper: properly maps upstream error responses to 502 without leaks', async () => {
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
        // Generic clean message, no internal API key or Google details leaked
        assert.equal(err.message, 'Failed to fetch air quality data');
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    config.googleMapsApiKey = originalKey;
    aqiCache.clear();
  }
});
