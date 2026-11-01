'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cv = require('../web/vendor/opencv.js');
const engine = require('../web/engine.js');
const ready = new Promise(resolve => cv.then(() => resolve()));

// Independent analytic scenes, not derivatives of the private photographs.
// Dimensions below define the geometry before analysis. Expected diameters and
// object labels are never part of the RGBA-only engine input.
const marker = ['111111', '110001', '111011', '101001', '110111', '111111'];
const clamp = n => Math.max(0, Math.min(1, n));
const mix = (a, b, coverage) => a.map((value, i) => value * (1 - coverage) + b[i] * coverage);

function makeScene({ diameterMm = 22, oval = false, obstruction = false, shadowOnly = false, circularShadow = false, metalWidthPx = 12 } = {}) {
  const width = 1400, height = 1000, pxPerMm = 10;
  const data = new Uint8ClampedArray(width * height * 4);
  const cx = 980, cy = 480, radius = diameterMm * pxPerMm / 2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = x - cx, dy = (y - cy) / (oval ? 0.78 : 1);
    const r = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
    let rgb = [238, 238, 238];
    if (shadowOnly) {
      // A broad, warm annular shadow with smooth transitions, without metal.
      // Its colour and closed shape alone must not establish a measurable rim.
      const strength = Math.exp(-0.5 * ((r - radius) / 20) ** 2);
      rgb = mix(rgb, [145, 112, 60], strength);
    } else {
      // Soft displaced shadow inside the aperture creates a competing bright
      // hole. Metal's true inner edge remains at the declared radius.
      const displaced = Math.hypot(dx + radius * 0.24, dy - radius * 0.17);
      const shadow = circularShadow ? clamp((r - radius * 0.65 + 1) / 2)
        : clamp((displaced - radius * 0.65 + 10) / 20);
      const holeCoverage = clamp(radius + 0.5 - r);
      rgb = mix(rgb, [238 - 145 * shadow, 238 - 145 * shadow, 238 - 145 * shadow], holeCoverage);
      // Vary the brightness around the gold band to represent highlights;
      // radial geometry is independent of this illumination variation.
      const highlight = 25 * Math.sin(angle * 5) ** 8;
      const metal = [164 + highlight, 112 + highlight, 45 + highlight];
      const band = Math.min(clamp(r - radius + 0.5), clamp(radius + metalWidthPx + 0.5 - r));
      rgb = mix(rgb, metal, band);
    }
    if (obstruction) {
      // A second warm object has a fully obscured opening and soft exterior.
      // Measuring only the readable ring would incorrectly ignore ambiguity.
      const secondRadius = Math.hypot(x - 570, y - 670);
      const coverage = clamp((108 - secondRadius) / 12);
      rgb = mix(rgb, [145, 120, 100], coverage);
    }
    if (x >= 90 && x < 290 && y >= 90 && y < 290) {
      const row = Math.floor((y - 90) * 6 / 200), col = Math.floor((x - 90) * 6 / 200);
      rgb = marker[row][col] === '1' ? [18, 18, 18] : [250, 250, 250];
    }
    const i = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) data[i + channel] = Math.round(rgb[channel]);
    data[i + 3] = 255;
  }
  return { width, height, data };
}

for (const diameterMm of [14, 22]) {
  test(`warm metal rim survives a displaced soft internal shadow: ${diameterMm} mm`, async () => {
    await ready;
    const result = engine.analyze(cv, makeScene({ diameterMm }));
    assert.equal(result.status, 'ok', JSON.stringify(result));
    assert.equal(result.diagnostics.boundaryMethod, 'chromatic-rim');
    assert.ok(Math.abs(result.diameterMm - diameterMm) < 0.35,
      `Metal opening ${diameterMm} mm, actual ${result.diameterMm} mm`);
    assert.ok(result.checks.every(check => check.pass));
  });
}

test('a readable gold ring and a second obscured warm object are ambiguous', async () => {
  await ready;
  const result = engine.analyze(cv, makeScene({ obstruction: true }));
  assert.equal(result.status, 'retake', JSON.stringify(result));
  assert.equal(result.code, 'multiple_rings');
  assert.equal(result.diameterMm, undefined);
});

test('a smooth coloured annular shadow without metal cannot publish a diameter', async () => {
  await ready;
  const result = engine.analyze(cv, makeScene({ shadowOnly: true }));
  assert.equal(result.status, 'retake', JSON.stringify(result));
  assert.equal(result.diameterMm, undefined);
});

test('warm metal detection must preserve an oval aperture instead of forcing a circle', async () => {
  await ready;
  const result = engine.analyze(cv, makeScene({ oval: true }));
  assert.equal(result.status, 'retake', JSON.stringify(result));
  assert.equal(result.code, 'non_circular');
  assert.equal(result.diameterMm, undefined);
});

test('failed warm-rim refinement cannot fall back to a smaller circular shadow', async () => {
  await ready;
  // A broad gold band is outside the narrow-rim path, while its hard circular
  // inner shadow is deceptively stable in grayscale. The true opening is22mm,
  // never the14.3mm bright patch. Either find the real edge or refuse.
  const diameterMm = 22;
  const result = engine.analyze(cv, makeScene({ diameterMm, circularShadow: true, metalWidthPx: 48 }));
  if (result.status === 'ok') {
    assert.ok(Math.abs(result.diameterMm - diameterMm) < 0.35,
      `Fallback accepted circular shadow instead of ${diameterMm} mm metal opening: ${result.diameterMm}; ${JSON.stringify(result.diagnostics)}`);
  } else {
    assert.equal(result.status, 'retake');
    assert.equal(result.diameterMm, undefined);
  }
});
