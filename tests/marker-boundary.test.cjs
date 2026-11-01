'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const cv = require('../web/vendor/opencv.js');
const engine = require('../web/engine.js');
const ready = new Promise(resolve => cv.then(() => resolve()));

// Independent analytic geometry: a 200 px / 20 mm marker and a 230 px / 23 mm
// opening. Mild illumination variation, rotation and optical blur create two
// decodable marker quads. The adaptive inner border is straighter but smaller.
// The old minimum-angle-deviation selection measured that 23 mm opening as
// 26.36 mm. No private photograph or physical accuracy claim is involved.
function makeScene() {
  const width = 1000, height = 700, data = Buffer.alloc(width * height * 4);
  const pattern = ['111111', '110001', '111011', '101001', '110111', '111111'];
  let seed = 1741;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = (seed / 4294967296 - 0.5) * 3;
    const base = 243 + 5 * x / width - 5 * y / height + noise;
    let rgb = [base, base - 2, base - 6];
    const radius = Math.hypot(x - 620, y - 340);
    const coverage = Math.max(0, Math.min(1, radius - 115 + 0.5, 137 - radius + 0.5));
    const shine = 18 * Math.cos(Math.atan2(y - 340, x - 620) - 0.6);
    const metal = [58 + shine, 62 + shine, 59 + shine];
    rgb = rgb.map((value, i) => value * (1 - coverage) + metal[i] * coverage);
    if (x >= 110 && x < 310 && y >= 240 && y < 440) {
      const row = Math.floor((y - 240) * 6 / 200), col = Math.floor((x - 110) * 6 / 200);
      rgb = pattern[row][col] === '1' ? [24 + noise, 25 + noise, 23 + noise]
        : [249 + noise, 249 + noise, 247 + noise];
    }
    const i = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) data[i + channel] = Math.round(rgb[channel]);
    data[i + 3] = 255;
  }
  return { width, height, data };
}

test('marker scale uses the outer black edge instead of a straighter nested adaptive frame', async () => {
  await ready;
  const source = makeScene();
  const decoded = await sharp(source.data, { raw: { width: source.width, height: source.height, channels: 4 } })
    .rotate(13, { background: '#f5f3ef' }).blur(0.7).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const result = engine.analyze(cv, { data: decoded.data, width: decoded.info.width, height: decoded.info.height });
  assert.equal(result.status, 'ok', JSON.stringify(result));
  assert.ok(Math.abs(result.marker.pixelsPerMm - 10) < 0.1,
    `Nested frame corrupted the 200 px / 20 mm marker scale: ${result.marker.pixelsPerMm} px/mm`);
  assert.ok(Math.abs(result.diameterMm - 23) < 0.35,
    `Expected the independent 23 mm opening, got ${result.diameterMm} mm`);
});
