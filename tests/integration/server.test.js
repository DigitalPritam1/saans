import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../server.js';

test('GET /healthz returns 200 with service status', async () => {
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.service, 'saans-api');
});

test('GET /api/config returns restricted maps API key structure', async () => {
  const res = await request(app).get('/api/config');
  assert.equal(res.status, 200);
  assert.ok('mapsApiKey' in res.body);
});

test('GET /api/aqi returns 400 when coordinates are missing', async () => {
  const res = await request(app).get('/api/aqi');
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Validation failed');
  assert.ok(Array.isArray(res.body.details));
  assert.equal(res.body.stack, undefined, 'Stack trace must never leak to client');
});

test('GET /api/aqi returns 400 when latitude is out of bounds', async () => {
  const res = await request(app).get('/api/aqi?lat=120&lng=77.2');
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Validation failed');
});

test('POST /api/plan returns 400 when body is invalid', async () => {
  const res = await request(app).post('/api/plan').send({});
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Validation failed');
});

test('POST /api/chat returns 400 when message is empty or missing', async () => {
  const res = await request(app).post('/api/chat').send({ message: '', lang: 'en' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Validation failed');
});

test('POST /api/chat returns 400 when message exceeds 500 characters', async () => {
  const res = await request(app).post('/api/chat').send({
    message: 'x'.repeat(501),
    lang: 'en'
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Validation failed');
});

test('POST /api/chat returns 400 on unsupported language', async () => {
  const res = await request(app).post('/api/chat').send({
    message: 'Valid message',
    lang: 'es'
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Validation failed');
});

test('POST with payload exceeding 10kb returns 413 error', async () => {
  const largeObject = {
    message: 'x',
    data: 'a'.repeat(12 * 1024) // 12kb
  };
  const res = await request(app).post('/api/plan').send(largeObject);
  assert.equal(res.status, 413);
  assert.equal(res.body.error, 'Payload exceeds 10kb limit');
  assert.equal(res.body.stack, undefined);
});

test('Central error handler never leaks stack traces', async () => {
  const res = await request(app).get('/api/aqi?lat=invalid&lng=invalid');
  assert.equal(res.status, 400);
  assert.equal(res.body.stack, undefined);
});
