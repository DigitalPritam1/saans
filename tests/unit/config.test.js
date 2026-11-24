import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../../src/config.js';

test('config provides default gemini-3.8-flash model', () => {
  assert.equal(typeof config.geminiModel, 'string');
  assert.ok(
    config.geminiModel.length > 0,
    'Gemini model must be specified'
  );
  // Default value should be gemini-3.8-flash unless set in process.env
  if (!process.env.GEMINI_MODEL) {
    assert.equal(config.geminiModel, 'gemini-3.8-flash');
  }
});
