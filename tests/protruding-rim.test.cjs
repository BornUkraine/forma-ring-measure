'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cv = require('../web/vendor/opencv.js');
const engine = require('../web/engine.js');
const ready = new Promise(resolve => cv.then(() => resolve()));

// Independently specified analytic pixels: none are private-photo derivatives.
// The opening is 13 or 23 mm, deliberately separate from the user's references.
// Exterior ornaments change only the OUTSIDE of the band; they must neither
// move the measured inner edge nor justify accepting a shadow or partial arc.
const marker = ['111111', '110001', '111011', '101001', '110111', '111111'];
const clamp = value => Math.max(0, Math.min(1, value));
const blend = (under, over, amount) => under.map((value, channel) => value * (1 - amount) + over[channel] * amount);

function scene(options = {}) {
  const width = 1400, height = 1000, scale = 10;
  const data = new Uint8ClampedArray(width * height * 4);
  const rings = [{ cx: options.clipped ? width - 35 : 980, cy: 470, diameterMm: options.diameterMm ?? 23, ...options }];
  if (options.multiple) rings.push({ cx: 580, cy: 730, diameterMm: 13 });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let rgb = [244, 244, 244];
    for (const ring of rings) {
      const radius = ring.diameterMm * scale / 2;
      const dx = x - ring.cx, dy = y - ring.cy, distance = Math.hypot(dx, dy);
      if (distance > radius + 80) continue;
      const verticalScale = ring.oval ? 0.78 : 1;
      const apertureDistance = Math.hypot(dx, dy / verticalScale);
      const angle = Math.atan2(dy, dx);

      // A broad displaced paper shadow creates a competing bright aperture.
      // The shadow itself fades softly outside the object, so missing metal
      // cannot accidentally acquire a hard edge from the scene generator.
      const displaced = Math.hypot(dx + radius * 0.24, dy - radius * 0.18);
      const shadow = ring.circularShadow
        ? clamp((distance - radius * 0.62 + 0.5))
        : clamp((displaced - radius * 0.68 + 9) / 18);
      const fade = clamp((radius + 55 - distance) / 35);
      rgb = blend(rgb, [74, 74, 74], shadow * fade);

      if (ring.shadowOnly) {
        // Smooth weakly warm annular shade: colour, topology and a plausible
        // circular silhouette do not constitute evidence of a metal edge.
        const strength = Math.exp(-0.5 * ((distance - radius) / 18) ** 2);
        rgb = blend(rgb, [155, 141, 131], strength);
      } else {
        const holeOutside = clamp(apertureDistance - radius + 0.5);
        const outerInside = clamp(radius + 8.5 - distance);
        let coverage = Math.min(holeOutside, outerInside);
        // Three unequal ornaments attach only outside the circular aperture.
        // They change the external silhouette without changing its true hole.
        const ornaments = [[Math.PI - 0.65, 23], [Math.PI, 31], [Math.PI + 0.65, 18]];
        for (const [direction, ornamentRadius] of ornaments) {
          const ox = (radius + 10) * Math.cos(direction), oy = (radius + 10) * Math.sin(direction);
          const ornament = clamp(ornamentRadius + 0.5 - Math.hypot(dx - ox, dy - oy));
          coverage = Math.max(coverage, Math.min(holeOutside, ornament));
        }
        // Only 140 degrees remain visible in this unsupported scene. A small
        // ellipse residual from these points must not imply a complete hole.
        if (ring.shortArc && Math.abs(angle) > 70 * Math.PI / 180) coverage = 0;
        const highlight = 34 * Math.sin(angle * 4 + 0.3) ** 8;
        // R-B=24 everywhere: weaker colour than the 35/40/45 seed thresholds.
        // The metal/paper luminance transition is still deliberately sharp.
        rgb = blend(rgb, [160 + highlight, 146 + highlight, 136 + highlight], coverage);
      }
    }
    if (x >= 100 && x < 300 && y >= 100 && y < 300) {
      const row = Math.floor((y - 100) * 6 / 200), column = Math.floor((x - 100) * 6 / 200);
      rgb = marker[row][column] === '1' ? [18, 18, 18] : [250, 250, 250];
    }
    const index = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) data[index + channel] = Math.round(rgb[channel]);
    data[index + 3] = 255;
  }
  return { width, height, data };
}

function noDiameter(result) {
  assert.equal(result.status, 'retake', JSON.stringify(result));
  assert.ok(!Number.isFinite(result.diameterMm), 'A refusal must not publish an estimate');
  assert.ok(result.code && result.message && result.guidance, 'Refusal needs actionable feedback');
}

function correctInnerDiameter(result, diameterMm) {
  assert.equal(result.status, 'ok', JSON.stringify(result));
  assert.ok(Math.abs(result.diameterMm - diameterMm) <= 0.45,
    `Expected independent inner diameter ${diameterMm} mm, received ${result.diameterMm}; do not measure the shadow or exterior ornaments`);
  assert.ok(result.checks.every(check => check.pass), 'All ordinary quality gates must pass');
  assert.equal(result.marker.corners.length, 4);
  assert.ok(result.ring.points.length >= 12, 'Accepted result needs a boundary overlay');
  const expectedRadiusPixels = diameterMm * 10 / 2;
  const largestOverlayError = Math.max(...result.ring.points.map(point =>
    Math.abs(Math.hypot(point.x - 980, point.y - 470) - expectedRadiusPixels)));
  assert.ok(largestOverlayError <= 4.5,
    `Overlay must follow the independent inner circle, not merely report its diameter; largest radial error ${largestOverlayError} px`);
}

for (const diameterMm of [13, 23]) {
  test(`weak warm inner rim with asymmetric exterior ornaments: ${diameterMm} mm`, async () => {
    await ready;
    correctInnerDiameter(engine.analyze(cv, scene({ diameterMm })), diameterMm);
  });
}

test('an oval hole inside a circular exterior with ornaments is still unsupported', async () => {
  await ready;
  noDiameter(engine.analyze(cv, scene({ diameterMm: 23, oval: true })));
});

test('a smooth weakly warm annular shadow without metal cannot become a ring', async () => {
  await ready;
  noDiameter(engine.analyze(cv, scene({ diameterMm: 23, shadowOnly: true })));
});

test('a clean short metal arc cannot stand in for the missing rest of the rim', async () => {
  await ready;
  noDiameter(engine.analyze(cv, scene({ diameterMm: 23, shortArc: true })));
});

test('a smaller sharp circular shadow cannot replace a weak warm metal opening', async () => {
  await ready;
  const diameterMm = 23;
  const result = engine.analyze(cv, scene({ diameterMm, circularShadow: true }));
  // This is a valid physical opening with misleading illumination. Correct
  // measurement or an honest refusal is safe; measuring the 14.26 mm bright
  // patch or the larger exterior is not.
  if (result.status === 'ok') correctInnerDiameter(result, diameterMm);
  else noDiameter(result);
});

test('an ornamented weak warm ring cut by the image border cannot publish a diameter', async () => {
  await ready;
  noDiameter(engine.analyze(cv, scene({ diameterMm: 23, clipped: true })));
});

test('two ornamented weak warm rings remain ambiguous', async () => {
  await ready;
  const result = engine.analyze(cv, scene({ diameterMm: 23, multiple: true }));
  noDiameter(result);
  assert.equal(result.code, 'multiple_rings');
});
