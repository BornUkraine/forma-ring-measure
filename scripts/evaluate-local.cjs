#!/usr/bin/env node
'use strict';

/* Private-photo evaluation using the production engine, without browser UI.
 * node scripts/evaluate-local.cjs artifacts/my-set/manifest.json
 *   --output-dir artifacts/my-set/run-name
 *
 * Manifest: {baseDir?: ".", physicalMarkerDimensionsMm?: null,
 *   images: [{id?: "photo-1", file: "photo.jpg", objectId?: "A",
 *     expectedStatus?: "ok"|"retake", expectedCode?: "multiple_rings",
 *     approximateReferenceMm?: 16, referenceNote?: "User's approximate value"}]}
 * Original file paths resolve relative to manifest/baseDir. Expected outcomes
 * and approximate references are report metadata only; analyze receives only
 * decoded pixels and dimensions. Reference differences are NOT accuracy errors.
 * Keep manifests, reports and generated overlays in ignored artifacts/.
 * The output directory must not already contain report.json or overlay files.
 * Expectation mismatches are recorded; input/execution/integrity errors exit 1.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rounded = value => +value.toFixed(2);
const MAX_BYTES = 20 * 1024 * 1024, MAX_PIXELS = 40e6, MAX_SIDE = 1600;
const usage = 'Usage: node scripts/evaluate-local.cjs <private-manifest.json> --output-dir <private-output-directory>';

function argsFrom(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return null;
  let manifest, output;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--output-dir') {
      if (!argv[i + 1] || argv[i + 1].startsWith('-')) throw Error('--output-dir needs a path.');
      output = path.resolve(argv[++i]);
    } else if (argv[i].startsWith('-')) throw Error('Unknown option: ' + argv[i]);
    else if (manifest) throw Error('Pass exactly one manifest.');
    else manifest = path.resolve(argv[i]);
  }
  if (!manifest || !output) throw Error(usage);
  return { manifest, output };
}

function escaped(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function contour(points) {
  if (!Array.isArray(points) || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return '';
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + (points.length ? 'Z' : '');
}

async function overlay(decoded, result, id, output) {
  const { width, height } = decoded.info;
  const label = result.status === 'ok'
    ? `${id}: ${result.diameterMm.toFixed(2)} mm; assumes a physical 20 mm marker`
    : `${id}: RETAKE / ${result.code || 'unknown'}`;
  const fontSize = Math.max(10, Math.min(19, width / 65));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <path d="${contour(result.marker?.corners)}" stroke="#12bf80" stroke-width="3" fill="none"/>
    <path d="${contour(result.ring?.points)}" stroke="#f4ad26" stroke-width="2" fill="none"/>
    <rect x="8" y="8" width="${width - 16}" height="${fontSize * 2.6}" rx="6" fill="#172d27" opacity=".88"/>
    <text x="16" y="${12 + fontSize * 1.5}" font-family="Arial,sans-serif" font-size="${fontSize}" fill="white">${escaped(label)}</text>
  </svg>`;
  await sharp(decoded.data, { raw: { width, height, channels: 4 } })
    .composite([{ input: Buffer.from(svg) }]).png().toFile(output);
}

function comparisonAfterAnalysis(entry, result) {
  const reference = entry.approximateReferenceMm;
  const hasReference = Number.isFinite(reference) && reference > 0;
  return {
    approximateReferenceMm: hasReference ? reference : null,
    referenceNote: entry.referenceNote || null,
    differenceFromApproximateReferenceMm: hasReference && result.status === 'ok' ? result.diameterMm - reference : null,
    absoluteDifferenceFromApproximateReferenceMm: hasReference && result.status === 'ok' ? Math.abs(result.diameterMm - reference) : null,
    interpretation: 'Comparison only. An approximate user reference and an unverified print scale do not establish physical accuracy.',
    referencePassedToEngine: false,
  };
}

async function main() {
  const options = argsFrom(process.argv.slice(2));
  if (!options) { console.log(usage); return; }
  const manifestBytes = fs.readFileSync(options.manifest);
  const manifest = JSON.parse(manifestBytes);
  if (!Array.isArray(manifest.images) || !manifest.images.length) throw Error('Manifest needs a nonempty images array.');
  const base = path.resolve(path.dirname(options.manifest), manifest.baseDir || '.');
  const reportPath = path.join(options.output, 'report.json');
  const images = manifest.images.map((entry, index) => {
    if (!entry || typeof entry.file !== 'string' || !entry.file) throw Error(`Image ${index + 1} needs a file path.`);
    if (entry.expectedStatus && !['ok', 'retake'].includes(entry.expectedStatus)) throw Error(`Invalid expectedStatus for image ${index + 1}.`);
    if (entry.approximateReferenceMm != null && !(Number.isFinite(entry.approximateReferenceMm) && entry.approximateReferenceMm > 0)) throw Error(`Invalid approximateReferenceMm for image ${index + 1}.`);
    const id = String(entry.id || `photo-${index + 1}`);
    const safeId = id.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'photo';
    return { entry, id, file: path.resolve(base, entry.file), overlayName: `${String(index + 1).padStart(3, '0')}-${safeId}-overlay.png` };
  });
  for (const outputPath of [reportPath, ...images.map(item => path.join(options.output, item.overlayName))]) {
    if (fs.existsSync(outputPath)) throw Error('Refusing to overwrite existing evidence: ' + outputPath);
  }
  fs.mkdirSync(options.output, { recursive: true });
  const enginePath = path.join(root, 'web', 'engine.js');
  const engineSha256 = hash(fs.readFileSync(enginePath));
  const engine = require(enginePath);
  const gitHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const gitDiff = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', 'web/engine.js'], { cwd: root });
  const initStart = performance.now();
  const cv = require('../web/vendor/opencv.js');
  // OpenCV is a self-resolving thenable: do not resolve this promise with cv.
  await new Promise(resolve => cv.then(() => resolve()));
  const engineStartupMs = rounded(performance.now() - initStart);
  const results = [];
  for (const { entry, id, file, overlayName } of images) {
    const row = { id, name: path.basename(file), file, objectId: entry.objectId || null,
      expectedStatus: entry.expectedStatus || null, expectedCode: entry.expectedCode || null };
    try {
      const started = performance.now();
      const size = fs.statSync(file).size;
      if (!size || size > MAX_BYTES) throw Error('Input must be nonempty and at most 20 MB.');
      const bytes = fs.readFileSync(file);
      row.originalBytes = bytes.length;
      row.originalSha256 = hash(bytes);
      const readAt = performance.now();
      const meta = await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata();
      if (!['jpeg', 'png', 'webp'].includes(meta.format)) throw Error('Only JPEG, PNG and WebP are supported.');
      if ((meta.pages || 1) > 1) throw Error('Animated/multipage input is excluded from this deterministic local evaluator.');
      const swapped = [5, 6, 7, 8].includes(meta.orientation);
      const originalWidth = swapped ? meta.height : meta.width, originalHeight = swapped ? meta.width : meta.height;
      if (!originalWidth || !originalHeight || Math.min(originalWidth, originalHeight) < 100 || originalWidth * originalHeight > MAX_PIXELS) throw Error('Input dimensions must be at least 100 px per side and at most 40 megapixels.');
      const scale = Math.min(1, MAX_SIDE / Math.max(originalWidth, originalHeight));
      const width = Math.round(originalWidth * scale), height = Math.round(originalHeight * scale);
      const decoded = await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
        .rotate().flatten({ background: '#ffffff' }).resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
        .toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const decodedAt = performance.now();
      const result = engine.analyze(cv, { data: decoded.data, width: decoded.info.width, height: decoded.info.height });
      const finished = performance.now();
      row.dimensions = { originalWidth, originalHeight, analysisWidth: width, analysisHeight: height };
      row.originalMetadata = { width: meta.width, height: meta.height, orientation: meta.orientation || null, format: meta.format };
      row.result = result;
      row.comparison = comparisonAfterAnalysis(entry, result);
      row.expectedStatusMatches = entry.expectedStatus ? result.status === entry.expectedStatus : null;
      row.expectedCodeMatches = entry.expectedCode ? result.code === entry.expectedCode : null;
      row.timing = { readAndHashMs: rounded(readAt - started), decodeResizeMs: rounded(decodedAt - readAt),
        engineMs: rounded(finished - decodedAt), timeToResultMs: rounded(finished - started), engineStartupExcluded: true, overlayExcluded: true };
      const overlayPath = path.join(options.output, overlayName);
      await overlay(decoded, result, id, overlayPath);
      row.diagnosticOverlay = overlayPath;
      row.originalFileUnchanged = hash(fs.readFileSync(file)) === row.originalSha256;
      if (!row.originalFileUnchanged) throw Error('Original file changed during evaluation.');
    } catch (error) {
      row.error = error.message;
      process.exitCode = 1;
    }
    results.push(row);
    console.log(JSON.stringify({ id, status: row.result?.status || 'error', code: row.result?.code || null,
      diameterMm: row.result?.diameterMm ?? null, referenceDifferenceMm: row.comparison?.differenceFromApproximateReferenceMm ?? null,
      timeToResultMs: row.timing?.timeToResultMs ?? null, error: row.error || undefined }));
  }
  const engineUnchanged = hash(fs.readFileSync(enginePath)) === engineSha256;
  const manifestUnchanged = hash(fs.readFileSync(options.manifest)) === hash(manifestBytes);
  if (!engineUnchanged || !manifestUnchanged) process.exitCode = 1;
  const report = {
    createdAt: new Date().toISOString(), scope: 'Private local evidence; original photos and generated overlays must not be published by this evaluator.',
    engineVersion: engine.version, engineFileSha256: engineSha256, engineSourceUnchangedDuringEvaluation: engineUnchanged,
    repoHeadCommit: gitHead.status === 0 ? gitHead.stdout.trim() : null,
    engineDiffersFromHead: gitDiff.status === 0 ? false : gitDiff.status === 1 ? true : null,
    manifestSha256: hash(manifestBytes), manifestUnchangedDuringEvaluation: manifestUnchanged,
    manifestNote: manifest.note || null, runtime: process.version, decoder: `sharp ${sharp.versions.sharp}`, engineStartupMs,
    preprocessing: 'EXIF orientation; white alpha background; sRGB RGBA; longest side at most 1600 px with rounded dimensions. No sharpening or inserted geometry. Sharp Lanczos3 differs from browser canvas interpolation.',
    timingScope: 'Node local read/hash/decode/engine only; cold initialization and overlay generation reported/excluded separately. Not browser end-to-end latency.',
    physicalMarkerDimensionsMm: manifest.physicalMarkerDimensionsMm || null,
    assumedMarkerSideMm: 20, groundTruthUsedByAlgorithm: false, physicalAccuracyEstablished: false,
    accepted: results.filter(row => row.result?.status === 'ok').length,
    retakes: results.filter(row => row.result?.status === 'retake').length,
    errors: results.filter(row => row.error).length, total: results.length, results,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log('Saved ' + reportPath);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
