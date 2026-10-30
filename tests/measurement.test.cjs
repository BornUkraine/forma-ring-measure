const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PNG}=require('pngjs');
const cv = require('../web/vendor/opencv.js');
const engine = require('../web/engine.js');
const expected = require('./expected.json');
const ready = new Promise(resolve => cv.then(() => resolve()));

for (const fixture of expected.fixtures) {
  test(`pixel analysis: ${fixture.file}`, async () => {
    await ready;
    const image = PNG.sync.read(fs.readFileSync(path.resolve(__dirname,'../web/samples',fixture.file)));
    const actual = engine.analyze(cv,image);
    assert.equal(actual.status,fixture.status,JSON.stringify(actual));
    if(fixture.status==='ok') {
      assert.ok(Math.abs(actual.diameterMm-fixture.diameterMm)<=fixture.toleranceMm,`${actual.diameterMm} vs ${fixture.diameterMm} mm`);
      assert.ok(actual.uncertaintyMm>0);
      assert.equal(actual.marker.corners.length,4);
      assert.ok(actual.ring.points.length>=12);
    } else {
      assert.ok(actual.message);
      assert.ok(actual.code);
      assert.ok(!Number.isFinite(actual.diameterMm),'A rejected image must not publish a diameter');
    }
  });
}
test('same pixels with no filenames or fixture metadata yield the same result',async()=>{
  await ready;
  const image=PNG.sync.read(fs.readFileSync(path.resolve(__dirname,'../web/samples/cutout-17.png')));
  const first=engine.analyze(cv,{data:image.data,width:image.width,height:image.height});
  const second=engine.analyze(cv,{data:new Uint8ClampedArray(image.data),width:image.width,height:image.height});
  assert.equal(first.status,'ok');
  assert.equal(first.diameterMm,second.diameterMm);
});
