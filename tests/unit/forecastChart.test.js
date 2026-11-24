import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonotoneCubicPath,
  buildForecastGradientStops
} from '../../public/js/render/forecastChart.js';

test('buildMonotoneCubicPath: empty and trivial point arrays return safe strings', () => {
  assert.equal(buildMonotoneCubicPath([]), '');
  assert.equal(buildMonotoneCubicPath([{ x: 10, y: 50 }]), 'M 10.0 50.0');
  assert.equal(buildMonotoneCubicPath([{ x: 0, y: 0 }, { x: 10, y: 20 }]), 'M 0.0 0.0 L 10.0 20.0');
});

test('buildMonotoneCubicPath: monotone path never overshoots flat or monotonic step data', () => {
  // Test 1: Constant line (flat segment)
  const flatPoints = [
    { x: 0, y: 150 },
    { x: 50, y: 150 },
    { x: 100, y: 150 },
    { x: 150, y: 150 }
  ];
  const flatPath = buildMonotoneCubicPath(flatPoints);
  // Verify all cubic control points stay at y = 150
  const flatMatches = [...flatPath.matchAll(/C\s+([\d.]+)\s+([\d.]+),\s+([\d.]+)\s+([\d.]+),\s+([\d.]+)\s+([\d.]+)/g)];
  assert.equal(flatMatches.length, 3);
  for (const m of flatMatches) {
    const cp1y = parseFloat(m[2]);
    const cp2y = parseFloat(m[4]);
    const endy = parseFloat(m[6]);
    assert.equal(cp1y, 150);
    assert.equal(cp2y, 150);
    assert.equal(endy, 150);
  }

  // Test 2: Monotonic step up (0 to 100)
  const stepPoints = [
    { x: 0, y: 100 },
    { x: 50, y: 100 },
    { x: 100, y: 200 },
    { x: 150, y: 200 }
  ];
  const stepPath = buildMonotoneCubicPath(stepPoints);
  const stepMatches = [...stepPath.matchAll(/C\s+([\d.]+)\s+([\d.]+),\s+([\d.]+)\s+([\d.]+),\s+([\d.]+)\s+([\d.]+)/g)];
  assert.equal(stepMatches.length, 3);
  for (const m of stepMatches) {
    const cp1y = parseFloat(m[2]);
    const cp2y = parseFloat(m[4]);
    const endy = parseFloat(m[6]);
    // Must never drop below 100 or exceed 200
    assert.ok(cp1y >= 100 && cp1y <= 200, `cp1y ${cp1y} must be between 100 and 200`);
    assert.ok(cp2y >= 100 && cp2y <= 200, `cp2y ${cp2y} must be between 100 and 200`);
    assert.ok(endy >= 100 && endy <= 200, `endy ${endy} must be between 100 and 200`);
  }

  // Test 3: Sharp peak (e.g. inversion spike)
  const peakPoints = [
    { x: 0, y: 50 },
    { x: 40, y: 300 }, // peak
    { x: 80, y: 50 }
  ];
  const peakPath = buildMonotoneCubicPath(peakPoints);
  const peakMatches = [...peakPath.matchAll(/C\s+([\d.]+)\s+([\d.]+),\s+([\d.]+)\s+([\d.]+),\s+([\d.]+)\s+([\d.]+)/g)];
  assert.equal(peakMatches.length, 2);
  for (const m of peakMatches) {
    const cp1y = parseFloat(m[2]);
    const cp2y = parseFloat(m[4]);
    const endy = parseFloat(m[6]);
    // Must strictly remain within [50, 300] (no overshoot above 300 or undershoot below 50)
    assert.ok(cp1y >= 50 && cp1y <= 300, `Peak control point cp1y ${cp1y} must stay within [50, 300]`);
    assert.ok(cp2y >= 50 && cp2y <= 300, `Peak control point cp2y ${cp2y} must stay within [50, 300]`);
    assert.ok(endy >= 50 && endy <= 300, `Peak point endy ${endy} must stay within [50, 300]`);
  }
});

test('buildForecastGradientStops: generates valid percentage stops and NAQI band colors', () => {
  const forecast = [
    { hour: '2026-11-24T00:00:00Z', aqi: 45 },  // Good (green)
    { hour: '2026-11-24T01:00:00Z', aqi: 85 },  // Satisfactory (light green)
    { hour: '2026-11-24T02:00:00Z', aqi: 150 }, // Moderate (yellow/amber)
    { hour: '2026-11-24T03:00:00Z', aqi: 240 }, // Poor (orange)
    { hour: '2026-11-24T04:00:00Z', aqi: 350 }, // Very poor (red)
    { hour: '2026-11-24T05:00:00Z', aqi: 450 }  // Severe (maroon)
  ];

  const stops = buildForecastGradientStops(forecast);
  assert.equal(stops.length, 6);

  // First stop at 0%, last stop at 100%
  assert.equal(stops[0].offset, '0.00%');
  assert.equal(stops[stops.length - 1].offset, '100.00%');

  // Verify band colors are present
  assert.ok(stops[0].color);
  assert.ok(stops[5].color);
  assert.notEqual(stops[0].color, stops[5].color);
});
