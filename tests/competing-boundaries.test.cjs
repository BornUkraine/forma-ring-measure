'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cv = require('../web/vendor/opencv.js');
const engine = require('../web/engine.js');
const ready = new Promise(resolve => cv.then(() => resolve()));

// Independent analytic geometry: an18mm aperture is inside a broad metal band
// with a darker, more saturated decorative ridge at24mm. The ridge is metal,
// but it is NOT the opening. No private image, measurement, or filename enters
// this generator or the pixel-only engine call.
const payload = ['111111', '110001', '111011', '101001', '110111', '111111'];
const clamp = n => Math.max(0, Math.min(1, n));
const mix = (a, b, fraction) => a.map((value, i) => value * (1 - fraction) + b[i] * fraction);
const describe = result => JSON.stringify({ status: result.status, code: result.code, diameterMm: result.diameterMm, diagnostics: result.diagnostics });

function competingEdges({ weakInner = false, oval = false, neutralInner = false } = {}) {
  const width = 1200, height = 900, scale = 10;
  const innerRadius = 18 * scale / 2, ridgeRadius = 24 * scale / 2;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = x - 850, dy = y - 470;
    const outerDistance = Math.hypot(dx, dy);
    const innerDistance = Math.hypot(dx, dy / (oval ? 0.75 : 1));
    let rgb = [210, 210, 210];
    const bandCoverage = Math.min(clamp(innerDistance - innerRadius + 0.5), clamp(ridgeRadius + 10.5 - outerDistance));
    const innerMetal = neutralInner
      ? (weakInner ? [195, 195, 195] : [150, 150, 150])
      : (weakInner ? [195, 187, 171] : [150, 142, 126]);
    rgb = mix(rgb, innerMetal, bandCoverage);
    const ridgeCoverage = Math.min(clamp(outerDistance - ridgeRadius + 0.5), clamp(ridgeRadius + 10.5 - outerDistance));
    rgb = mix(rgb, [105, 80, 40], ridgeCoverage);
    if (x >= 90 && x < 290 && y >= 90 && y < 290) {
      const black = payload[Math.floor((y - 90) * 6 / 200)][Math.floor((x - 90) * 6 / 200)] === '1';
      rgb = black ? [18, 18, 18] : [250, 250, 250];
    }
    const i = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) data[i + channel] = Math.round(rgb[channel]);
    data[i + 3] = 255;
  }
  return { data, width, height };
}

test('a sharper warm outer ridge cannot replace the real inner metal edge', async () => {
  await ready;
  for (const neutralInner of [false, true]) for (const weakInner of [false, true]) {
    const actual = engine.analyze(cv, competingEdges({ weakInner, neutralInner }));
    if (actual.status === 'ok') {
      assert.ok(Math.abs(actual.diameterMm - 18) < 0.4,
        `Accepted decorative24mm ridge instead of18mm aperture (weakInner=${weakInner}, neutralInner=${neutralInner}): ${describe(actual)}`);
    } else {
      assert.equal(actual.status, 'retake');
      assert.equal(actual.diameterMm, undefined);
    }
  }
});

test('a round decorative outer ridge must not hide an oval metal opening', async () => {
  await ready;
  for (const neutralInner of [false, true]) {
    const actual = engine.analyze(cv, competingEdges({ oval: true, neutralInner }));
    assert.equal(actual.status, 'retake', describe(actual));
    assert.equal(actual.diameterMm, undefined);
  }
});
