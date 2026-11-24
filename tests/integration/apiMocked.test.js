import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import app from '../../server.js';
import { config } from '../../src/config.js';
import { aqiCache } from '../../src/services/cache.js';
import { setGenAIClient } from '../../src/services/gemini.js';

test('API GET /api/aqi with mocked Google Air Quality API returns compact JSON', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'test-key';
  aqiCache.clear();

  globalThis.fetch = async (url) => {
    if (url.includes('currentConditions')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          dateTime: '2026-11-24T06:00:00Z',
          indexes: [{ code: 'ind_cpcb', aqi: 310, category: 'Very Poor', dominantPollutant: 'pm25' }],
          healthRecommendations: { generalPopulation: 'Wear an N95 mask outdoors.' }
        })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        hourlyForecasts: [
          { dateTime: '2026-11-24T07:00:00Z', indexes: [{ code: 'ind_cpcb', aqi: 320, category: 'Very Poor' }] }
        ]
      })
    };
  };

  try {
    const res = await request(app).get('/api/aqi?lat=28.61&lng=77.20');
    assert.equal(res.status, 200);
    assert.equal(res.body.aqi, 310);
    assert.equal(res.body.category, 'Very poor');
    assert.equal(res.body.dominantPollutant, 'pm25');
    assert.ok(res.body.color);
    assert.equal(res.body.forecast.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    config.googleMapsApiKey = originalKey;
    aqiCache.clear();
  }
});

test('API POST /api/plan with mocked Gemini returns structured routine and alternatives', async () => {
  const mockPlan = {
    routine: [
      {
        time: '06:00 AM - 08:30 AM',
        action: 'Stay indoors with windows sealed',
        why: 'Morning temperature inversion traps heavy smoke',
        impact: {
          type: 'exposure',
          value: 70,
          unit: '% reduction',
          explanation: 'Avoids breathing ground-level inversion smog'
        }
      }
    ],
    indoorHacks: [
      {
        room: 'Balcony',
        tip: 'Damp towel barrier',
        cost: 'free',
        impact: 'Cuts infiltration'
      }
    ],
    alternatives: [
      {
        instead: 'Morning run in park',
        try: 'Spot-walking indoors',
        impact: 'Prevents toxic particulate inhalation'
      }
    ],
    doctorWarning: 'See a doctor immediately if experiencing persistent wheezing or breathlessness.'
  };

  setGenAIClient({
    models: {
      generateContent: async () => ({
        text: JSON.stringify(mockPlan)
      })
    }
  });

  try {
    const res = await request(app)
      .post('/api/plan')
      .send({
        aqi: 350,
        profile: {
          city: 'Noida',
          household: ['kids'],
          commute: 'metro_train'
        }
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.routine.length, 1);
    assert.equal(res.body.routine[0].time, '06:00 AM - 08:30 AM');
    assert.equal(res.body.routine[0].impact.type, 'exposure');
    assert.equal(res.body.alternatives.length, 1);
    assert.ok(res.body.doctorWarning.includes('See a doctor'));
  } finally {
    setGenAIClient(null);
  }
});

test('API POST /api/chat with mocked Gemini returns localized answer', async () => {
  setGenAIClient({
    models: {
      generateContent: async () => ({
        text: 'सुबह के समय बाहर टहलने से बचें क्योंकि इस समय स्मॉग जमीन के पास जमा रहता है। एन-95 मास्क अवश्य पहनें।'
      })
    }
  });

  try {
    const res = await request(app)
      .post('/api/chat')
      .send({
        message: 'क्या मैं आज सुबह टहलने जा सकता हूँ?',
        profile: { city: 'Delhi' },
        aqi: 320,
        lang: 'hi'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.lang, 'hi');
    assert.ok(res.body.reply.includes('सुबह'));
  } finally {
    setGenAIClient(null);
  }
});

import rateLimit from 'express-rate-limit';

test('Rate Limiter: enforces request threshold and returns 429 when exceeded', async () => {
  // Use a dedicated rate limiter instance to prevent interference from other concurrent tests
  const customLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests from this IP, please try again after a minute.' }
  });

  const testApp = express();
  testApp.use(customLimiter);
  testApp.get('/test-limit', (req, res) => res.json({ ok: true }));

  // Requests 1, 2, 3 succeed
  for (let i = 0; i < 3; i++) {
    const res = await request(testApp).get('/test-limit');
    assert.equal(res.status, 200);
  }

  // 4th request exceeds threshold and returns HTTP 429
  const limitedRes = await request(testApp).get('/test-limit');
  assert.equal(limitedRes.status, 429);
  assert.ok(limitedRes.body.error.includes('Too many requests'));
});

test('API GET /api/weather with mocked Weather API returns current conditions and inversion analysis', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'test-key';

  globalThis.fetch = async (url) => {
    assert.ok(url.includes('weather.googleapis.com'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        temperature: { degrees: 13.5 },
        feelsLikeTemperature: { degrees: 12.0 },
        relativeHumidity: 78,
        wind: { speed: { value: 5.0 }, direction: { cardinal: 'NW' } },
        uvIndex: 2,
        weatherCondition: { description: { text: 'Smoky' } }
      })
    };
  };

  try {
    const res = await request(app).get('/api/weather?lat=28.61&lng=77.20');
    assert.equal(res.status, 200);
    assert.equal(res.body.temperature, 14);
    assert.equal(res.body.humidity, 78);
    assert.equal(res.body.windSpeed, 5);
    assert.equal(res.body.inversionRisk.hasRisk, true);
    assert.equal(res.body.inversionRisk.text, 'Low wind and a cold morning trap smoke near the ground');
  } finally {
    globalThis.fetch = originalFetch;
    config.googleMapsApiKey = originalKey;
  }
});

test('API GET /api/weather returns 400 on missing coordinates', async () => {
  const res = await request(app).get('/api/weather');
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Validation failed');
});

test('API GET /api/cities returns 8 Indian metro cities with AQI and band', async () => {
  const res = await request(app).get('/api/cities');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.cities));
  assert.equal(res.body.cities.length, 8);

  const cityNames = res.body.cities.map(c => c.name);
  assert.ok(cityNames.includes('Delhi'));
  assert.ok(cityNames.includes('Mumbai'));
  assert.ok(cityNames.includes('Bengaluru'));

  const delhi = res.body.cities.find(c => c.name === 'Delhi');
  assert.ok(typeof delhi.aqi === 'number');
  assert.ok(delhi.band);
  assert.ok(delhi.category);
});
