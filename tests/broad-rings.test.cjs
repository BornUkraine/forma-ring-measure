'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cv = require('../web/vendor/opencv.js');
const engine = require('../web/engine.js');
// This module is a self-resolving thenable: never resolve a promise with cv.
const ready = new Promise(resolve => cv.then(() => resolve()));

/* Independent analytic pixel scenes. No private photographs, observed real
 * diameters, expected answers, or filenames are provided to the detector.
 * Physical accuracy is not established by these synthetic regressions.
 */
const markerPayload = [
  [1, 0, 0, 0],
  [1, 1, 0, 1],
  [0, 1, 0, 0],
  [1, 0, 1, 1]
];
const clamp = n => Math.max(0, Math.min(1, n));

function analyticScene(rings) {
  const width = 1400, height = 1000, pixelsPerMm = 10;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 245;
      for (const ring of rings) {
        const cx = ring.cx ?? 900, cy = ring.cy ?? 500;
        const verticalScale = ring.verticalScale ?? 1;
        const outerDistance = Math.hypot(x - cx, (y - cy) / verticalScale);
        const innerDistance = Math.hypot(x - cx - (ring.holeOffsetX ?? 0), (y - cy) / verticalScale);
        const outerCoverage = clamp(ring.outerMm * pixelsPerMm / 2 + 0.5 - outerDistance);
        const outsideHole = ring.solid ? 1 : clamp(innerDistance - ring.innerMm * pixelsPerMm / 2 + 0.5);
        const coverage = Math.min(outerCoverage, outsideHole);
        value = value * (1 - coverage) + 48 * coverage;
      }
      // A separate, physically specified 20 mm encoded marker at 10 px/mm.
      const mx = x - 100, my = y - 100;
      if (mx >= 0 && mx < 200 && my >= 0 && my < 200) {
        const col = Math.floor(mx / 200 * 6), row = Math.floor(my / 200 * 6);
        const black = col === 0 || row === 0 || col === 5 || row === 5 || markerPayload[row - 1][col - 1];
        value = black ? 20 : 250;
      }
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(value);
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

function blurPixels(image, radius) {
  const { width, height, data } = image;
  const horizontal = new Float32Array(width * height);
  const output = new Uint8ClampedArray(data.length);
  const span = 2 * radius + 1;
  const at = (x, y) => data[(y * width + Math.max(0, Math.min(width - 1, x))) * 4];
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += at(k, y);
    for (let x = 0; x < width; x += 1) {
      horizontal[y * width + x] = sum / span;
      sum += at(x + radius + 1, y) - at(x - radius, y);
    }
  }
  const hAt = (x, y) => horizontal[Math.max(0, Math.min(height - 1, y)) * width + x];
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += hAt(x, k);
    for (let y = 0; y < height; y += 1) {
      const i = (y * width + x) * 4, value = Math.round(sum / span);
      output[i] = output[i + 1] = output[i + 2] = value;
      output[i + 3] = 255;
      sum += hAt(x, y + radius + 1) - hAt(x, y - radius);
    }
  }
  return { width, height, data: output };
}

// Expectations and tolerances below are fixed before evaluating the detector.
const cases = [
  { name: 'broad circular opening 13 mm / 30 mm outer diameter', rings: [{ innerMm: 13, outerMm: 30 }], status: 'ok', diameterMm: 13 },
  { name: 'broader circular opening 19 mm / 48 mm outer diameter', rings: [{ innerMm: 19, outerMm: 48 }], status: 'ok', diameterMm: 19 },
  { name: 'broad annulus with an oval opening', rings: [{ innerMm: 13, outerMm: 30, verticalScale: 0.78 }], status: 'retake', code: 'non_circular' },
  { name: 'blurred broad circular opening', rings: [{ innerMm: 13, outerMm: 30 }], blur: 12, status: 'retake', code: 'blur' },
  { name: 'solid disk is not an annulus', rings: [{ outerMm: 30, solid: true }], status: 'retake', code: 'ring_not_found' },
  { name: 'markedly eccentric circular cut-out is not a supported ring', rings: [{ innerMm: 13, outerMm: 32, holeOffsetX: 50 }], status: 'retake', code: 'ring_not_found' },
  { name: 'two separate broad annuli are ambiguous', rings: [{ innerMm: 13, outerMm: 30, cx: 650, cy: 350 }, { innerMm: 13, outerMm: 30, cx: 1050, cy: 700 }], status: 'retake', code: 'multiple_rings' },
  { name: 'very small opening in a much larger disk exceeds the supported annulus range', rings: [{ innerMm: 14, outerMm: 48 }], status: 'retake', code: 'ring_not_found' }
];

for (const sample of cases) {
  test(`broad annulus pixels: ${sample.name}`, async () => {
    await ready;
    let image = analyticScene(sample.rings);
    if (sample.blur) image = blurPixels(image, sample.blur);
    const actual = engine.analyze(cv, image);
    assert.equal(actual.status, sample.status, JSON.stringify(actual));
    if (sample.status === 'ok') {
      assert.ok(Math.abs(actual.diameterMm - sample.diameterMm) <= 0.35,
        `${actual.diameterMm} mm vs independent analytic ${sample.diameterMm} mm`);
      assert.ok(actual.checks.every(check => check.pass), 'Every unchanged quality check must pass');
      assert.ok(Number.isFinite(actual.uncertaintyMm) && actual.uncertaintyMm > 0);
      assert.equal(actual.marker.corners.length, 4);
      assert.ok(actual.ring.points.length >= 12);
    } else {
      assert.equal(actual.code, sample.code, JSON.stringify(actual));
      assert.ok(actual.message && actual.guidance);
      assert.ok(!Number.isFinite(actual.diameterMm), 'Rejected inputs must not publish an estimate');
    }
  });
}
