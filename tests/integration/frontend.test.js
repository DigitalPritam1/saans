import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../server.js';

test('GET / serves index.html with UTF-8 and correct title', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /html/);
  assert.match(res.text, /Saans/);
  assert.match(res.text, /साँस/);
  assert.match(res.text, /Today's Plan/);
  assert.match(res.text, /Indoor Hacks/);
  assert.match(res.text, /My Household/);
  assert.match(res.text, /Ask Saans/);
  assert.match(res.text, /Impact/);
});

test('GET /css/style.css serves valid stylesheet', async () => {
  const res = await request(app).get('/css/style.css');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /css/);
  assert.match(res.text, /--color-accent/);
  assert.match(res.text, /prefers-reduced-motion/);
  assert.match(res.text, /prefers-color-scheme/);
});

test('GET /js/app.js serves valid ES module', async () => {
  const res = await request(app).get('/js/app.js');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /javascript/);
  assert.match(res.text, /initNavigation/);
  assert.match(res.text, /renderAqiRing/);
});

test('GET /js/api.js serves valid ES module', async () => {
  const res = await request(app).get('/js/api.js');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /javascript/);
  assert.match(res.text, /fetchAqi/);
});

test('GET /js/storage.js serves storage manager module', async () => {
  const res = await request(app).get('/js/storage.js');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /javascript/);
  assert.match(res.text, /loadProfile/);
});

test('GET /js/geo.js serves geolocation & places loader module', async () => {
  const res = await request(app).get('/js/geo.js');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /javascript/);
  assert.match(res.text, /initPlacesAutocomplete/);
});

test('GET /impact.js serves transparent impact model to client', async () => {
  const res = await request(app).get('/impact.js');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /javascript/);
  assert.match(res.text, /estimateWalkShiftExposure/);
  assert.match(res.text, /estimateIndoorProtection/);
  assert.match(res.text, /do not constitute medical advice/);
});
