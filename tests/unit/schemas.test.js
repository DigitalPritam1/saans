import test from 'node:test';
import assert from 'node:assert/strict';
import { aqiQuerySchema, planBodySchema, chatBodySchema } from '../../src/validators/schemas.js';

test('aqiQuerySchema accepts valid coordinates', () => {
  const valid = aqiQuerySchema.parse({ lat: '28.61', lng: '77.20' });
  assert.equal(valid.lat, 28.61);
  assert.equal(valid.lng, 77.2);
});

test('aqiQuerySchema rejects out-of-range coordinates', () => {
  assert.throws(() => {
    aqiQuerySchema.parse({ lat: '95', lng: '77.20' });
  }, /Latitude must be between -90 and 90/);

  assert.throws(() => {
    aqiQuerySchema.parse({ lat: '28.61', lng: '185' });
  }, /Longitude must be between -180 and 180/);
});

test('planBodySchema accepts numeric AQI and valid profile', () => {
  const parsed = planBodySchema.parse({
    aqi: 280,
    profile: {
      city: 'Delhi',
      household: ['infant', 'elderly'],
      residenceType: 'apartment',
      hasPurifier: false
    }
  });
  assert.equal(parsed.aqi, 280);
  assert.equal(parsed.profile.city, 'Delhi');
});

test('planBodySchema accepts object AQI', () => {
  const parsed = planBodySchema.parse({
    aqi: { aqi: 350, category: 'Very Poor', dominantPollutant: 'pm25' }
  });
  assert.equal(parsed.aqi.aqi, 350);
});

test('chatBodySchema enforces language and message length constraints', () => {
  // Valid Hindi query
  const valid = chatBodySchema.parse({
    message: 'क्या सुबह वॉक पर जाना सुरक्षित है?',
    lang: 'hi'
  });
  assert.equal(valid.lang, 'hi');

  // Rejects invalid language
  assert.throws(() => {
    chatBodySchema.parse({
      message: 'Hello',
      lang: 'de'
    });
  }, /(Language must be one of 'en', 'hi', or 'mr'|Invalid option: expected one of "en"|"hi"|"mr")/);

  // Rejects message exceeding 500 characters
  const longMessage = 'A'.repeat(501);
  assert.throws(() => {
    chatBodySchema.parse({
      message: longMessage,
      lang: 'en'
    });
  }, /Message cannot exceed 500 characters/);
});
