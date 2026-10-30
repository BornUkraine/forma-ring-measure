import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { MARKER_PATTERN } = require('../web/engine.js');
const cell = 20 / 6;
const whites = MARKER_PATTERN.flatMap((row, y) => row.flatMap((black, x) => black ? [] : [
  `<rect x="${(20 + x * cell).toFixed(7)}" y="${(14 + y * cell).toFixed(7)}" width="${cell.toFixed(7)}" height="${cell.toFixed(7)}" fill="white"/>`,
])).join('\n    ');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="65mm" viewBox="0 0 60 65" role="img" aria-labelledby="title description">
  <title id="title">RingMeasure 20 mm calibration marker</title>
  <desc id="description">Print at 100 percent actual size. The encoded black square's outside edges must measure exactly 20 by 20 millimetres. Check with a ruler before taking a photo. Do not fit to page.</desc>
  <rect width="60" height="65" fill="white"/>
  <g fill="#141c1a" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">
    <text x="30" y="6" font-size="3.2" font-weight="700">RINGMEASURE</text>
    <text x="30" y="10" font-size="2.3">20 mm calibration marker</text>
  </g>
  <g shape-rendering="crispEdges">
    <rect x="20" y="14" width="20" height="20" fill="black"/>
    ${whites}
  </g>
  <g stroke="#141c1a" stroke-width="0.2" fill="none">
    <path d="M20 37v3 M40 37v3 M20 38.5h20"/>
    <path d="M20 38.5l1.4 -0.6v1.2z M40 38.5l-1.4 -0.6v1.2z" fill="#141c1a"/>
  </g>
  <g fill="#141c1a" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">
    <text x="30" y="43" font-size="2.8" font-weight="700">20 mm outside edge</text>
    <text x="30" y="49" font-size="2.6">Print at 100% / actual size</text>
    <text x="30" y="53" font-size="2.4">Do not use “fit to page”</text>
    <text x="30" y="58" font-size="2.2">Verify both sides with a ruler.</text>
    <text x="30" y="61.5" font-size="2.2">Keep the white margin around the square.</text>
  </g>
</svg>
`;

const output = fileURLToPath(new URL('../web/marker.svg', import.meta.url));
await writeFile(output, svg, 'utf8');
console.log(`Generated ${output}`);
