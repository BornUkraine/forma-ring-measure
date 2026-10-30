#!/usr/bin/env node
'use strict';

/* Evaluate browser-exported reports for untouched internet photographs.
 *
 * node scripts/evaluate-real.cjs tests/real-photo-manifest.json
 *   [--output artifacts/real-photo-results.json]
 *   [--reports artifacts/real-report-paths.json]
 *   [--engine]  Use local real-pixel decoding/core evaluation instead of reports.
 *
 * A manifest must declare expectedOutcomesRecordedBeforeEvaluation:true and
 * images:[{file,sourceUrl,author,license,sha256?,expectedStatus,expectedCode?,
 *          reportFile,groundTruth?}]. Paths are relative to the manifest.
 * Optional baseDir applies to original files only. A --reports JSON file maps
 * original filenames to report paths, relative to that mapping file.
 *
 * Default report-import mode does not decode, modify or fabricate pixels: the
 * real browser app processes each original and exports its JSON report.
 * --engine instead decodes the original locally with sharp and invokes the
 * unchanged measurement engine; it does not claim browser end-to-end evidence.
 * Neither mode changes originals or inserts calibration geometry. Matching
 * names/hashes provide an evidence link, not cryptographic browser attestation.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');

const projectRoot = path.resolve(__dirname, '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const relative = (filename) => path.relative(projectRoot, filename).split(path.sep).join('/');
const finiteNonnegative = (value) => Number.isFinite(value) && value >= 0;

function parseArgs(args) {
  const options = { manifest: null, output: path.join(projectRoot, 'artifacts', 'real-photo-results.json'), reports: null, engine: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--engine') { options.engine = true; continue; }
    if (arg === '--output' || arg === '--reports') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${arg} needs a path.`);
      options[arg.slice(2)] = path.resolve(args[++i]);
    } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (options.manifest) throw new Error('Pass exactly one manifest path.');
    else options.manifest = path.resolve(arg);
  }
  if (!options.manifest) throw new Error('A manifest path is required. Use --help for usage.');
  return options;
}

function expectedFor(entry) {
  const status = entry.expectedStatus || entry.expected?.status || entry.status;
  const code = entry.expectedCode || entry.expected?.code || entry.code || null;
  if (!['ok', 'retake'].includes(status)) throw new Error(`Expected status for ${entry.file || '(unnamed input)'} must be ok or retake.`);
  return { status, code };
}

function groundTruthFor(entry) {
  const gt = entry.groundTruth;
  if (!gt) return { valid: false, reason: 'No independently measured diameter was supplied.', declared: null };
  const source = gt.sourceUrl || gt.source || null;
  const valid = Number.isFinite(gt.diameterMm) && gt.diameterMm > 0
    && gt.independentlyMeasured === true
    && typeof gt.method === 'string' && gt.method.trim().length > 0
    && typeof source === 'string' && source.trim().length > 0;
  return {
    valid,
    reason: valid
      ? 'Manifest declares an independently measured diameter with method and source; the evaluator does not independently authenticate that declaration.'
      : 'Ground truth is incomplete or not declared independently measured; no diameter error is calculated.',
    declared: gt,
  };
}

function validateBrowserReport(report, originalFile) {
  if (!report || typeof report !== 'object') throw new Error('Browser report is not a JSON object.');
  if (report.input?.name !== path.basename(originalFile)) {
    throw new Error(`Browser report input name ${JSON.stringify(report.input?.name)} does not match original ${JSON.stringify(path.basename(originalFile))}.`);
  }
  if (report.input.syntheticExample !== false) throw new Error('Report must come from a normal file upload, not an application synthetic example.');
  if (!['ok', 'retake'].includes(report.measurement?.status)) throw new Error('Browser report has no supported measurement status.');
  if (report.measurement.status === 'ok' && (!Number.isFinite(report.measurement.diameterMm) || report.measurement.diameterMm <= 0)) {
    throw new Error('An accepted measurement must contain a positive finite diameter.');
  }
  if (report.measurement.status === 'retake' && report.measurement.diameterMm != null) {
    throw new Error('A retake report must not publish a diameter.');
  }
  if (report.measurement.status === 'retake' && !report.measurement.code) throw new Error('A retake report must include a reason code.');
  if (!finiteNonnegative(report.timing?.timeToResultMs)) throw new Error('Browser report has no valid measured time-to-result.');
  return report;
}

function evaluate(options) {
  const manifestBytes = fs.readFileSync(options.manifest);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.expectedOutcomesRecordedBeforeEvaluation !== true) {
    throw new Error('Record expected outcomes in the manifest before evaluating, and set expectedOutcomesRecordedBeforeEvaluation:true.');
  }
  const entries = manifest.images || manifest.photos || manifest.fixtures;
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('Manifest must contain a nonempty images array.');
  const manifestDir = path.dirname(options.manifest);
  const originalsDir = manifest.baseDir ? path.resolve(manifestDir, manifest.baseDir) : manifestDir;
  const mapping = options.reports ? JSON.parse(fs.readFileSync(options.reports, 'utf8')) : {};
  const mappingDir = options.reports ? path.dirname(options.reports) : manifestDir;
  const protectedPaths = new Set([options.manifest, options.reports].filter(Boolean).map((p) => path.resolve(p).toLowerCase()));
  for (const entry of entries) {
    if (typeof entry.file !== 'string' || !entry.file) throw new Error('Every manifest entry needs an original file path.');
    expectedFor(entry);
    protectedPaths.add(path.resolve(originalsDir, entry.file).toLowerCase());
    const mapped = mapping[entry.file] || mapping[path.basename(entry.file)];
    const reportPath = mapped ? path.resolve(mappingDir, mapped) : entry.reportFile ? path.resolve(manifestDir, entry.reportFile) : null;
    if (reportPath) protectedPaths.add(reportPath.toLowerCase());
  }
  if (protectedPaths.has(path.resolve(options.output).toLowerCase())) throw new Error('Output must not overwrite an original photo, manifest, mapping or browser report.');

  const results = entries.map((entry) => {
    const expected = expectedFor(entry);
    const originalFile = path.resolve(originalsDir, entry.file);
    const mapped = mapping[entry.file] || mapping[path.basename(entry.file)];
    const reportFile = mapped ? path.resolve(mappingDir, mapped) : entry.reportFile ? path.resolve(manifestDir, entry.reportFile) : null;
    const groundTruth = groundTruthFor(entry);
    const result = {
      file: relative(originalFile),
      inputType: 'real-internet-photograph',
      title: entry.title || null,
      sourceUrl: entry.sourceUrl || entry.source?.url || null,
      imageUrl: entry.imageUrl || entry.source?.imageUrl || null,
      author: entry.author || entry.source?.author || null,
      license: entry.license || entry.source?.license || null,
      licenseUrl: entry.licenseUrl || entry.source?.licenseUrl || null,
      originalSha256: null,
      expectedOriginalSha256: entry.sha256 || entry.originalSha256 || null,
      originalBytes: null,
      sourceFileUnchanged: false,
      browserReportFile: reportFile ? relative(reportFile) : null,
      browserReportSha256: null,
      expectedStatus: expected.status,
      expectedCode: expected.code,
      expectedReason: entry.reason || entry.expected?.reason || null,
      actualStatus: null,
      actualCode: null,
      actualDiameterMm: null,
      uncertaintyMm: null,
      groundTruth,
      expectedDiameterMm: groundTruth.valid ? groundTruth.declared.diameterMm : null,
      absoluteErrorMm: null,
      accuracyEvaluated: false,
      timeToResultMs: null,
      engineProcessingMs: null,
      passed: false,
    };
    try {
      const originalBytes = fs.readFileSync(originalFile);
      result.originalSha256 = sha256(originalBytes);
      result.originalBytes = originalBytes.length;
      if (result.expectedOriginalSha256 && result.originalSha256 !== result.expectedOriginalSha256.toLowerCase()) {
        throw new Error('Original SHA-256 does not match the hash recorded in the manifest.');
      }
      if (!reportFile) throw new Error('No browser report path supplied. Set reportFile or pass --reports.');
      const reportBytes = fs.readFileSync(reportFile);
      result.browserReportSha256 = sha256(reportBytes);
      const report = validateBrowserReport(JSON.parse(reportBytes.toString('utf8')), originalFile);
      const actual = report.measurement;
      result.browserReportGeneratedAt = report.generatedAt || null;
      result.browserApplication = report.application || null;
      result.reportInputMatchesOriginalName = true;
      result.browserDimensions = {
        originalWidth: report.input.originalWidth ?? null,
        originalHeight: report.input.originalHeight ?? null,
        analysisWidth: report.input.analysisWidth ?? null,
        analysisHeight: report.input.analysisHeight ?? null,
      };
      result.actualStatus = actual.status;
      result.actualCode = actual.code || null;
      result.actualDiameterMm = actual.status === 'ok' ? actual.diameterMm : null;
      result.uncertaintyMm = actual.status === 'ok' && Number.isFinite(actual.uncertaintyMm) ? actual.uncertaintyMm : null;
      result.actualMessage = actual.message || null;
      result.actualGuidance = actual.guidance || null;
      result.scaleEstablished = !!actual.marker;
      result.timeToResultMs = report.timing.timeToResultMs;
      result.timingIncludes = report.timing.includes || null;
      result.engineProcessingMs = finiteNonnegative(actual.metrics?.processingMs) ? actual.metrics.processingMs : null;
      result.variableCost = report.variableCost || null;
      result.qualityChecks = actual.checks || [];
      result.reportValidationStatus = report.validationStatus || null;
      if (actual.status === 'ok' && groundTruth.valid) {
        result.absoluteErrorMm = Math.abs(actual.diameterMm - groundTruth.declared.diameterMm);
        result.accuracyEvaluated = true;
      }
      const tolerance = entry.toleranceMm ?? entry.expected?.toleranceMm ?? groundTruth.declared?.toleranceMm;
      result.expectedToleranceMm = finiteNonnegative(tolerance) ? tolerance : null;
      const statusPassed = actual.status === expected.status;
      const codePassed = !expected.code || actual.code === expected.code;
      const errorPassed = result.absoluteErrorMm === null || result.expectedToleranceMm === null || result.absoluteErrorMm <= result.expectedToleranceMm;
      result.sourceFileUnchanged = sha256(fs.readFileSync(originalFile)) === result.originalSha256;
      result.passed = statusPassed && codePassed && errorPassed && result.sourceFileUnchanged;
    } catch (error) {
      result.evaluationError = error.message;
    }
    return result;
  });

  const report = {
    reportVersion: '1.0',
    evaluatedAt: new Date().toISOString(),
    runtime: process.version,
    manifestFile: relative(options.manifest),
    manifestSha256: sha256(manifestBytes),
    expectedOutcomesRecordedBeforeEvaluation: true,
    expectationsRecordedAt: manifest.expectationsRecordedAt || manifest.createdAt || manifest.preparedOn || null,
    purpose: manifest.purpose || null,
    applicationUrl: manifest.applicationUrl || null,
    method: 'Each original photograph is uploaded through the normal browser application. This evaluator validates the exported browser JSON reports and original-file hashes; it does not run a decoder, change pixels, insert a marker or infer a missing scale.',
    evidenceLimit: 'Report filename matching and recorded hashes support reproducibility; they are not a cryptographic attestation that a report was produced from those bytes. Source author/license and independent ground truth are manifest metadata assertions.',
    timingScope: 'Times are copied from actual browser exports. Time-to-result includes browser image decoding, local engine startup when needed and measurement; excludes file selection. Engine-only time is reported separately when available.',
    physicalAccuracyClaim: 'No general physical accuracy claim follows from this run. Real photos with no scale test safe refusal only; diameter error is evaluated only for accepted measurements with a manifest-declared independently measured diameter, method and source.',
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    acceptedMeasurements: results.filter((r) => r.actualStatus === 'ok').length,
    retakes: results.filter((r) => r.actualStatus === 'retake').length,
    independentlyMeasuredErrorsEvaluated: results.filter((r) => r.accuracyEvaluated).length,
    results,
  };
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return report;
}

async function evaluateEngine(options) {
  const manifestBytes = fs.readFileSync(options.manifest);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.expectedOutcomesRecordedBeforeEvaluation !== true) throw new Error('Record expected outcomes before evaluation and set expectedOutcomesRecordedBeforeEvaluation:true.');
  const entries = manifest.images || manifest.photos || manifest.fixtures;
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('Manifest must contain a nonempty images array.');
  const manifestDir = path.dirname(options.manifest);
  const originalsDir = manifest.baseDir ? path.resolve(manifestDir, manifest.baseDir) : manifestDir;
  const outputPath = path.resolve(options.output).toLowerCase();
  if (outputPath === options.manifest.toLowerCase() || entries.some((e) => path.resolve(originalsDir, e.file).toLowerCase() === outputPath)) {
    throw new Error('Output must not overwrite an original photo or manifest.');
  }
  for (const entry of entries) expectedFor(entry);
  let sharp;
  try { sharp = require('sharp'); }
  catch (_) { throw new Error('Engine mode requires the pinned development dependency sharp from package.json. Run npm install before retrying.'); }
  const runtimeStart = performance.now();
  const cv = require('../web/vendor/opencv.js');
  // Emscripten resolves cv.then to itself; never await that object directly.
  await new Promise((resolve) => cv.then(() => resolve()));
  const engine = require('../web/engine.js');
  const engineStartupMs = +(performance.now() - runtimeStart).toFixed(2);
  const results = [];
  for (const entry of entries) {
    const expected = expectedFor(entry);
    const originalFile = path.resolve(originalsDir, entry.file);
    const groundTruth = groundTruthFor(entry);
    const result = {
      file: relative(originalFile), inputType: 'real-internet-photograph',
      title: entry.title || null, sourceUrl: entry.sourceUrl || entry.source?.url || null,
      imageUrl: entry.imageUrl || null, author: entry.author || entry.source?.author || null,
      license: entry.license || entry.source?.license || null, licenseUrl: entry.licenseUrl || null,
      originalSha256: null, expectedOriginalSha256: entry.sha256 || entry.originalSha256 || null,
      originalBytes: null, sourceFileUnchanged: false,
      expectedStatus: expected.status, expectedCode: expected.code, expectedReason: entry.reason || null,
      actualStatus: null, actualCode: null, actualDiameterMm: null, uncertaintyMm: null,
      groundTruth, expectedDiameterMm: groundTruth.valid ? groundTruth.declared.diameterMm : null,
      absoluteErrorMm: null, accuracyEvaluated: false,
      readMs: null, decodeAndResizeMs: null, engineProcessingMs: null, timeToResultMs: null,
      browserEndToEndMs: null, paidApiCostUsd: 0, passed: false,
    };
    try {
      const started = performance.now();
      const bytes = fs.readFileSync(originalFile);
      const readDone = performance.now();
      result.originalBytes = bytes.length;
      result.originalSha256 = sha256(bytes);
      if (result.expectedOriginalSha256 && result.expectedOriginalSha256.toLowerCase() !== result.originalSha256) throw new Error('Original SHA-256 differs from the manifest.');
      if (bytes.length > 20 * 1024 * 1024) throw new Error('Original exceeds the application 20 MB limit.');
      const decodeStarted = performance.now();
      const metadata = await sharp(bytes, { failOn: 'error', limitInputPixels: 40 * 1000 * 1000 }).metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error(`Unsupported image format: ${metadata.format}`);
      const swapAxes = [5, 6, 7, 8].includes(metadata.orientation);
      const originalWidth = swapAxes ? metadata.height : metadata.width;
      const originalHeight = swapAxes ? metadata.width : metadata.height;
      if (!originalWidth || !originalHeight || Math.min(originalWidth, originalHeight) < 100) throw new Error('Image dimensions are invalid or below the application minimum.');
      const scale = Math.min(1, 1600 / Math.max(originalWidth, originalHeight));
      const analysisWidth = Math.round(originalWidth * scale), analysisHeight = Math.round(originalHeight * scale);
      const decoded = await sharp(bytes, { failOn: 'error', limitInputPixels: 40 * 1000 * 1000 })
        .rotate().flatten({ background: '#ffffff' }).resize(analysisWidth, analysisHeight, { fit: 'fill', kernel: 'lanczos3' })
        .toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const decodedAt = performance.now();
      const actual = engine.analyze(cv, { data: decoded.data, width: decoded.info.width, height: decoded.info.height });
      const finished = performance.now();
      result.dimensions = { originalWidth, originalHeight, analysisWidth: decoded.info.width, analysisHeight: decoded.info.height };
      result.decoder = `sharp ${sharp.versions.sharp}; ${metadata.format}; EXIF orientation applied; white alpha background; Lanczos3 fit within 1600 px`;
      result.actualStatus = actual.status;
      result.actualCode = actual.code || null;
      result.actualDiameterMm = actual.status === 'ok' && Number.isFinite(actual.diameterMm) ? actual.diameterMm : null;
      result.uncertaintyMm = actual.status === 'ok' && Number.isFinite(actual.uncertaintyMm) ? actual.uncertaintyMm : null;
      result.actualMessage = actual.message || null;
      result.actualGuidance = actual.guidance || null;
      result.scaleEstablished = !!actual.marker;
      result.qualityChecks = actual.checks;
      result.readMs = +(readDone - started).toFixed(2);
      result.decodeAndResizeMs = +(decodedAt - decodeStarted).toFixed(2);
      result.engineProcessingMs = +(finished - decodedAt).toFixed(2);
      result.timeToResultMs = +(result.readMs + result.decodeAndResizeMs + result.engineProcessingMs).toFixed(2);
      result.engineReportedProcessingMs = actual.metrics?.processingMs ?? null;
      if (actual.status === 'ok' && groundTruth.valid) {
        result.absoluteErrorMm = Math.abs(actual.diameterMm - groundTruth.declared.diameterMm);
        result.accuracyEvaluated = true;
      }
      const tolerance = entry.toleranceMm ?? entry.expected?.toleranceMm ?? groundTruth.declared?.toleranceMm;
      result.expectedToleranceMm = finiteNonnegative(tolerance) ? tolerance : null;
      result.sourceFileUnchanged = sha256(fs.readFileSync(originalFile)) === result.originalSha256;
      result.passed = actual.status === expected.status && (!expected.code || actual.code === expected.code)
        && (result.absoluteErrorMm === null || result.expectedToleranceMm === null || result.absoluteErrorMm <= result.expectedToleranceMm)
        && (actual.status !== 'retake' || actual.diameterMm == null) && result.sourceFileUnchanged;
    } catch (error) { result.evaluationError = error.message; }
    results.push(result);
  }
  const report = {
    reportVersion: '1.1', evaluatedAt: new Date().toISOString(), runtime: process.version,
    manifestFile: relative(options.manifest), manifestSha256: sha256(manifestBytes),
    expectedOutcomesRecordedBeforeEvaluation: true,
    expectationsRecordedAt: manifest.expectationsRecordedAt || manifest.createdAt || manifest.preparedOn || null,
    purpose: manifest.purpose || null,
    applicationUrl: manifest.applicationUrl || null,
    applicationSourceCommit: manifest.applicationSourceCommit || null,
    method: 'Node real-pixel core evaluation with sharp decoder; browser end-to-end not repeated this turn',
    engine: `OpenCV.js 4.10.0 / RingMeasureEngine ${engine.version}`,
    decoder: `sharp ${sharp.versions.sharp}`,
    engineStartupMs,
    preprocessing: 'Untouched original JPEG/PNG/WebP bytes are decoded, EXIF-oriented, alpha-flattened to white and downsampled to at most 1600 px on the longest side. No marker or geometry is inserted. The unchanged application engine receives only RGBA pixels. Sharp resampling may differ from browser canvas resampling.',
    timingScope: 'Node file read, sharp decode/resize and engine-only processing are measured separately. timeToResultMs is their sum, excluding SHA-256 bookkeeping and cold OpenCV initialization; engineStartupMs is separate. These are not browser end-to-end timings.',
    costAssumptions: 'No paid recognition, reasoning, speech, retry or intermediary APIs are invoked. Paid API variable charges USD0 per image. Device compute/energy unpriced. Hosting/bandwidth separate; no free credits assumed.',
    physicalAccuracyClaim: 'Photographs without the supplied scale test safe refusal only. No physical diameter accuracy is inferred. Absolute error is calculated only for accepted measurements with manifest-declared independent ground truth, method and source.',
    total: results.length, passed: results.filter((r) => r.passed).length,
    acceptedMeasurements: results.filter((r) => r.actualStatus === 'ok').length,
    retakes: results.filter((r) => r.actualStatus === 'retake').length,
    independentlyMeasuredErrorsEvaluated: results.filter((r) => r.accuracyEvaluated).length,
    results,
  };
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + '\n');
  return report;
}

async function main(args) {
  const options = parseArgs(args);
  if (options.help) {
    console.log('Usage: node scripts/evaluate-real.cjs <manifest.json> [--output <results.json>] [--reports <filename-to-report-paths.json> | --engine]');
    console.log('Default: validate actual browser-exported reports. --engine: decode original pixels with sharp and run the unchanged core; browser end-to-end is not claimed. Expectations must be recorded before evaluation.');
    return;
  }
  const report = options.engine ? await evaluateEngine(options) : evaluate(options);
  console.table(report.results.map(({ file, expectedStatus, actualStatus, actualCode, actualDiameterMm, absoluteErrorMm, timeToResultMs, passed }) => ({ file, expectedStatus, actualStatus, actualCode, actualDiameterMm, absoluteErrorMm, timeToResultMs, passed })));
  console.log(`Saved ${options.output}`);
  process.exitCode = report.passed === report.total ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { evaluate, evaluateEngine, validateBrowserReport, groundTruthFor };
