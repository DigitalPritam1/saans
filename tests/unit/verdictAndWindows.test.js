import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerdictText, computeDaytimeWindows } from '../../public/js/render/home.js';

test('buildVerdictText: returns severe warning when AQI > 400', () => {
  const verdict = buildVerdictText(420, 'severe', { household: ['kids'] });
  assert.equal(verdict.title, 'Air is hazardous outside today');
  assert.ok(verdict.subtitle.includes('children, seniors, and asthma patients strictly indoors'));
  assert.equal(verdict.isVulnerableWarning, true);
});

test('buildVerdictText: returns very poor warning with window when AQI between 301 and 400', () => {
  const bestWindow = { start: '1:00 PM', end: '3:00 PM', aqi: 190 };
  const verdict = buildVerdictText(340, 'very_poor', { household: ['elderly'] }, bestWindow);
  assert.equal(verdict.title, 'Unhealthy air across the city');
  assert.ok(verdict.subtitle.includes('Cleaner air expected around 1:00 PM'));
  assert.equal(verdict.isVulnerableWarning, true);
});

test('buildVerdictText: returns safe status when AQI <= 50', () => {
  const verdict = buildVerdictText(35, 'good', {});
  assert.equal(verdict.title, 'Clean and fresh air');
  assert.ok(verdict.subtitle.includes('outdoor play, cycling, and natural room ventilation'));
  assert.equal(verdict.isVulnerableWarning, false);
});

test('computeDaytimeWindows: filters strictly between 6 AM and 10 PM local time and finds best 2-3 hour window', () => {
  // Mock 24-hour forecast
  const baseDate = new Date('2026-11-24T00:00:00Z');
  const forecast = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(baseDate.getTime() + i * 3600000);
    const h = d.getHours();
    // Night (0-5, 23): very high 450
    // Morning (6-11): 380
    // Afternoon (13-15): cleanest 160
    // Evening (18-22): 320
    let aqi = 450;
    if (h >= 13 && h <= 15) aqi = 160;
    else if (h >= 6 && h <= 11) aqi = 380;
    else if (h >= 18 && h <= 22) aqi = 320;

    return {
      hour: d.toISOString(),
      aqi
    };
  });

  const { bestWindow, worstWindow, bestWindowHours } = computeDaytimeWindows(forecast);

  assert.ok(bestWindow);
  assert.ok(worstWindow);
  assert.equal(bestWindowHours.length, 3);
  // Cleanest average was 160
  assert.equal(bestWindow.aqi, 160);
  assert.ok(worstWindow.aqi >= 350);
});

test('computeDaytimeWindows: returns nulls safely on empty forecast', () => {
  const { bestWindow, worstWindow, bestWindowHours } = computeDaytimeWindows([]);
  assert.equal(bestWindow, null);
  assert.equal(worstWindow, null);
  assert.deepEqual(bestWindowHours, []);
});
