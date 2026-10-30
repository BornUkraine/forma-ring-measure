'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const cv = require('../web/vendor/opencv.js');
const engine = require('../web/engine.js');
const expected = require('./edge-expected.json');
// Do not resolve with cv: this OpenCV build is a self-resolving thenable.
const ready = new Promise(resolve => cv.then(() => resolve()));

for (const fixture of expected.fixtures) {
  test(`edge pixels: ${fixture.file}`, async () => {
    await ready;
    const input=PNG.sync.read(fs.readFileSync(path.resolve(__dirname,'../web/samples',fixture.file)));
    // Only pixels and dimensions reach the detector; no filename, expected
    // diameter, transformation matrix, or classification is provided.
    const actual=engine.analyze(cv,{width:input.width,height:input.height,data:input.data});
    assert.equal(actual.status,fixture.status,JSON.stringify(actual));
    if(fixture.status==='ok') {
      assert.ok(Math.abs(actual.diameterMm-fixture.diameterMm)<=fixture.toleranceMm,
        `${actual.diameterMm} mm vs ${fixture.diameterMm} mm; tolerance ${fixture.toleranceMm} mm`);
      assert.equal(actual.marker.corners.length,4);
      assert.ok(actual.ring.points.length>=12,'Result must identify an inner boundary');
      assert.ok(Number.isFinite(actual.uncertaintyMm)&&actual.uncertaintyMm>0);
    } else {
      assert.ok(actual.message,'Rejection must include retake guidance');
      assert.ok(actual.code,'Rejection must identify its cause');
      assert.ok(!Number.isFinite(actual.diameterMm),'An unsupported photo must not publish a diameter');
    }
  });
}
