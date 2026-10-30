/* Published diameter values: Tiffany & Co. Rings Size Guide, accessed 2026-10-31.
 * https://www.tiffany.com/client-services/size-guide.html
 * The rounding policy below belongs to this application; see docs/SOURCES.md.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RingSizing = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const table = Object.freeze([
    { size: 3, diameterMm: 14.1 },
    { size: 3.5, diameterMm: 14.5 },
    { size: 4, diameterMm: 14.9 },
    { size: 4.5, diameterMm: 15.3 },
    { size: 5, diameterMm: 15.7 },
    { size: 5.5, diameterMm: 16.1 },
    { size: 6, diameterMm: 16.5 },
    { size: 6.5, diameterMm: 16.9 },
    { size: 7, diameterMm: 17.3 },
    { size: 7.5, diameterMm: 17.7 },
    { size: 8, diameterMm: 18.1 },
    { size: 8.5, diameterMm: 18.5 },
    { size: 9, diameterMm: 18.9 },
    { size: 9.5, diameterMm: 19.4 },
    { size: 10, diameterMm: 19.8 },
    { size: 10.5, diameterMm: 20.2 },
    { size: 11, diameterMm: 20.6 },
    { size: 11.5, diameterMm: 21.0 },
    { size: 12, diameterMm: 21.4 },
    { size: 12.5, diameterMm: 21.8 },
    { size: 13, diameterMm: 22.2 }
  ].map(function (row) { return Object.freeze(row); }));

  const source = Object.freeze({
    title: 'Tiffany & Co. Rings Size Guide — US sizes',
    url: 'https://www.tiffany.com/client-services/size-guide.html'
  });

  const roundingRule = 'Choose the closest published interior diameter in the Tiffany US half-size table; exact midpoint ties go to the larger size. No extrapolation outside 14.1–22.2 mm.';

  /** Returns a nearest table entry and its absolute diameter difference.
   * Input must be a finite number in millimetres, inside the published range.
   * Keep the full measurement precision when calling this function; round only
   * the displayed diameter afterwards.
   */
  function nearest(diameterMm) {
    if (typeof diameterMm !== 'number' || !Number.isFinite(diameterMm) ||
        diameterMm < table[0].diameterMm ||
        diameterMm > table[table.length - 1].diameterMm) {
      return null;
    }

    let selected = table[0];
    let distance = Math.abs(diameterMm - selected.diameterMm);
    const tieTolerance = Number.EPSILON * Math.max(1, Math.abs(diameterMm)) * 8;
    for (let i = 1; i < table.length; i += 1) {
      const nextDistance = Math.abs(diameterMm - table[i].diameterMm);
      // Ascending rows make the last of two numerically equal choices larger.
      if (nextDistance <= distance + tieTolerance) {
        selected = table[i];
        distance = nextDistance;
      }
    }
    return { size: selected.size, diameterMm: selected.diameterMm, deltaMm: distance };
  }

  return Object.freeze({ table: table, source: source, nearest: nearest, roundingRule: roundingRule });
}));
