'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cv = require('../web/vendor/opencv.js');
const engine = require('../web/engine.js');
const ready = new Promise(resolve => cv.then(() => resolve()));

// Independent pixel geometry. A displaced, softly edged shadow lies INSIDE
// the metal opening; accepting its smaller bright aperture is a wrong answer.
// These are safety tests, not physical accuracy evidence or private photos.
function scene(diameterMm, options = {}) {
  const width = 1100, height = 800, scale = 10;
  const data = new Uint8ClampedArray(width * height * 4);
  const payload = ['111111', '110001', '111011', '101001', '110111', '111111'];
  const cx = 750, cy = 400, radius = diameterMm * scale / 2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
    const shadowRadius = Math.hypot(dx + radius * .18, dy - radius * .22);
    const transition = Math.max(0, Math.min(1, (shadowRadius - radius * .78 + 6) / 12));
    let rgb = [235, 235, 235];
    if (r < radius) rgb = rgb.map(v => v - 135 * transition);
    if (r >= radius && r < radius + 12) {
      const a = Math.atan2(dy, dx);
      const value = options.reflective ? 95 + 65 * Math.sin(a * 5) ** 8 : 55;
      rgb = options.reflective ? [value + 45, value + 15, value - 25] : [value, value, value];
    }
    if (options.noMetal && r >= radius) rgb = [235, 235, 235];
    if (x >= 100 && x < 300 && y >= 100 && y < 300) {
      const black = payload[Math.floor((y - 100) * 6 / 200)][Math.floor((x - 100) * 6 / 200)] === '1';
      rgb = black ? [15, 15, 15] : [250, 250, 250];
    }
    const i = (y * width + x) * 4;
    [data[i], data[i + 1], data[i + 2]] = rgb;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

for (const diameter of [15, 21]) for (const reflective of [false, true]) {
  test(`shadow cannot replace metal boundary: ${diameter} mm, reflective=${reflective}`, async () => {
    await ready;
    const result = engine.analyze(cv, scene(diameter, { reflective }));
    if (result.status === 'ok') {
      assert.ok(Math.abs(result.diameterMm - diameter) < .45,
        `Accepted shadow/outer edge instead of ${diameter} mm metal opening: ${result.diameterMm}`);
    } else {
      assert.equal(result.status, 'retake');
      assert.equal(result.diameterMm, undefined);
    }
  });
}

test('a shadow patch without a metal annulus cannot publish a diameter', async () => {
  await ready;
  const result = engine.analyze(cv, scene(21, { noMetal: true }));
  assert.equal(result.status, 'retake');
  assert.equal(result.diameterMm, undefined);
});
