const test = require('node:test');
const assert = require('node:assert/strict');
const sizing = require('../web/sizing.js');

test('all published chart entries return their own sizes', () => {
  assert.equal(sizing.table.length,21);
  for (const row of sizing.table) assert.deepEqual(sizing.nearest(row.diameterMm), {...row,deltaMm:0});
});
test('all midpoints tie upward and neighbours remain on the correct side', () => {
  for (let i=1;i<sizing.table.length;i++) {
    const lower=sizing.table[i-1],upper=sizing.table[i],mid=(lower.diameterMm+upper.diameterMm)/2;
    assert.equal(sizing.nearest(mid).size,upper.size);
    assert.equal(sizing.nearest(mid-1e-5).size,lower.size);
    assert.equal(sizing.nearest(mid+1e-5).size,upper.size);
  }
});
test('conversion never clamps outside the published range or accepts invalid inputs', () => {
  for (const value of [14.09,22.21,NaN,Infinity,-1,null,undefined,'17']) assert.equal(sizing.nearest(value),null);
});
