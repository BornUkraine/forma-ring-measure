/* RingMeasure measurement engine. OpenCV.js is the only runtime dependency. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RingMeasureEngine = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const MARKER_SIDE_MM = 20;
  const MARKER_PATTERN = Object.freeze([
    [1, 1, 1, 1, 1, 1],
    [1, 1, 0, 0, 0, 1],
    [1, 1, 1, 0, 1, 1],
    [1, 0, 1, 0, 0, 1],
    [1, 1, 0, 1, 1, 1],
    [1, 1, 1, 1, 1, 1],
  ].map(Object.freeze));
  const LIMITS = Object.freeze({
    minMarkerSidePx: 80,
    minRingDiameterPx: 70,
    maxMarkerEdgeRatio: 1.20,
    maxMarkerDiagonalRatio: 1.15,
    maxMarkerAngleDeviation: 14,
    minDiameterMm: 8,
    maxDiameterMm: 30,
    minCircleAxisRatio: 0.93,
    maxFitResidual: 0.035,
    minEdgeContrast: 32,
    minSharpnessRatio: 0.18,
  });

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const median = (a) => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2;
  };
  function orderQuad(points) {
    const c = { x: mean(points.map((p) => p.x)), y: mean(points.map((p) => p.y)) };
    const q = [...points].sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x));
    const start = q.reduce((best, p, i) => p.x + p.y < q[best].x + q[best].y ? i : best, 0);
    return q.slice(start).concat(q.slice(0, start));
  }
  function rotatePattern(p) { return p.map((row, y) => row.map((_, x) => p[p.length - 1 - x][y])); }
  const patterns = [MARKER_PATTERN];
  for (let i = 1; i < 4; i++) patterns.push(rotatePattern(patterns[i - 1]));

  function sampleGray(gray, x, y) {
    x = Math.max(0, Math.min(gray.cols - 1.001, x));
    y = Math.max(0, Math.min(gray.rows - 1.001, y));
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const d = gray.data, w = gray.cols;
    return d[iy * w + ix] * (1 - fx) * (1 - fy) + d[iy * w + ix + 1] * fx * (1 - fy)
      + d[(iy + 1) * w + ix] * (1 - fx) * fy + d[(iy + 1) * w + ix + 1] * fx * fy;
  }
  function transformPoint(h, p) {
    const d = h[6] * p.x + h[7] * p.y + h[8];
    return { x: (h[0] * p.x + h[1] * p.y + h[2]) / d, y: (h[3] * p.x + h[4] * p.y + h[5]) / d };
  }
  function insideQuad(p, quad) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = quad[i], b = quad[(i + 1) % 4];
      const v = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      if (!sign && v) sign = Math.sign(v);
      if (v && Math.sign(v) !== sign) return false;
    }
    return true;
  }
  function makeHomography(cv, points, destination) {
    const a = cv.matFromArray(4, 1, cv.CV_32FC2, points.flatMap((p) => [p.x, p.y]));
    const b = cv.matFromArray(4, 1, cv.CV_32FC2, destination.flatMap((p) => [p.x, p.y]));
    try {
      const m = cv.getPerspectiveTransform(a, b);
      const h = Array.from(m.data64F);
      m.delete();
      return h;
    } finally { a.delete(); b.delete(); }
  }
  function quadGeometry(q) {
    const edges = q.map((p, i) => distance(p, q[(i + 1) % 4]));
    const diagonals = [distance(q[0], q[2]), distance(q[1], q[3])];
    const angles = q.map((p, i) => {
      const a = q[(i + 3) % 4], b = q[(i + 1) % 4];
      const cosine = ((a.x - p.x) * (b.x - p.x) + (a.y - p.y) * (b.y - p.y)) / (distance(a, p) * distance(b, p));
      return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
    });
    return { edges, meanSide: mean(edges), minSide: Math.min(...edges), edgeRatio: Math.max(...edges) / Math.min(...edges), diagonalRatio: Math.max(...diagonals) / Math.min(...diagonals), angleDeviation: Math.max(...angles.map((a) => Math.abs(90 - a))) };
  }
  function validateMarker(cv, gray, corners) {
    const h = makeHomography(cv, [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }], corners);
    const values = MARKER_PATTERN.map((row, y) => row.map((_, x) => {
      const samples = [];
      for (const dy of [-0.17, 0, 0.17]) for (const dx of [-0.17, 0, 0.17]) {
        const p = transformPoint(h, { x: x + 0.5 + dx, y: y + 0.5 + dy });
        samples.push(sampleGray(gray, p.x, p.y));
      }
      return mean(samples);
    }));
    const flat = values.flat(), low = Math.min(...flat), high = Math.max(...flat);
    if (high - low < 70) return null;
    const split = (high + low) / 2;
    const bits = values.map((row) => row.map((v) => v < split ? 1 : 0));
    const errors = patterns.map((pattern) => pattern.flatMap((row, y) => row.map((v, x) => v === bits[y][x] ? 0 : 1)).reduce((a, b) => a + b, 0));
    const minErrors = Math.min(...errors);
    if (minErrors > 0) return null;
    return { contrast: high - low, patternErrors: minErrors, rotation: errors.indexOf(minErrors) * 90 };
  }
  function findMarkers(cv, gray, masks) {
    const found = [];
    for (const mask of masks) {
      const contours = new cv.MatVector(), hierarchy = new cv.Mat();
      cv.findContours(mask, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      try {
        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i), approx = new cv.Mat();
          try {
            const area = Math.abs(cv.contourArea(contour));
            if (area < 500 || area > gray.rows * gray.cols * 0.45) continue;
            cv.approxPolyDP(contour, approx, cv.arcLength(contour, true) * 0.025, true);
            if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;
            let q = orderQuad(Array.from({ length: 4 }, (_, j) => ({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] })));
            let geometry = quadGeometry(q);
            if (geometry.minSide < 25 || geometry.edgeRatio > 2.5 || geometry.angleDeviation > 40) continue;
            const validation = validateMarker(cv, gray, q);
            if (!validation) continue;
            // Binary contours follow centres of dark edge pixels. Expand half a pixel on every edge.
            const center = { x: mean(q.map((p) => p.x)), y: mean(q.map((p) => p.y)) };
            const factor = (geometry.meanSide + 1) / geometry.meanSide;
            q = q.map((p) => ({ x: center.x + (p.x - center.x) * factor, y: center.y + (p.y - center.y) * factor }));
            geometry = quadGeometry(q);
            const previous = found.find((m) => distance(m.center, center) < geometry.meanSide * 0.2);
            const marker = { corners: q, center, geometry, ...validation };
            if (!previous) found.push(marker);
            else if (geometry.angleDeviation < previous.geometry.angleDeviation) Object.assign(previous, marker);
          } finally { contour.delete(); approx.delete(); }
        }
      } finally { contours.delete(); hierarchy.delete(); }
    }
    return found;
  }
  function ellipsePoints(e, count = 96) {
    const a = e.size.width / 2, b = e.size.height / 2, angle = e.angle * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return Array.from({ length: count }, (_, i) => {
      const t = i * Math.PI * 2 / count, x = a * Math.cos(t), y = b * Math.sin(t);
      return { x: e.center.x + x * cos - y * sin, y: e.center.y + x * sin + y * cos };
    });
  }
  function fitResidual(points, e) {
    const a = e.size.width / 2, b = e.size.height / 2, theta = -e.angle * Math.PI / 180;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    return Math.sqrt(mean(points.map((p) => {
      const dx = p.x - e.center.x, dy = p.y - e.center.y;
      const n = Math.hypot((dx * cos - dy * sin) / a, (dx * sin + dy * cos) / b) - 1;
      return n * n;
    })));
  }
  function ringEdges(gray, imageEllipse) {
    const ratios = [], contrasts = [];
    const points = ellipsePoints(imageEllipse, 48);
    for (const p of points) {
      const dx = p.x - imageEllipse.center.x, dy = p.y - imageEllipse.center.y, len = Math.hypot(dx, dy);
      const samples = [];
      for (let t = -5; t <= 5; t++) samples.push(sampleGray(gray, p.x + dx / len * t, p.y + dy / len * t));
      const contrast = Math.max(...samples) - Math.min(...samples);
      contrasts.push(contrast);
      if (contrast > 12) ratios.push(Math.max(...samples.slice(1).map((v, i) => Math.abs(v - samples[i]))) / contrast);
    }
    return { contrast: median(contrasts), sharpness: median(ratios) };
  }
  function findRings(cv, gray, masks, marker, h) {
    const rings = [];
    for (let maskIndex = 0; maskIndex < masks.length; maskIndex++) {
      const mask = masks[maskIndex];
      const contours = new cv.MatVector(), hierarchy = new cv.Mat();
      cv.findContours(mask, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_NONE);
      try {
        const info = hierarchy.data32S;
        for (let i = 0; i < contours.size(); i++) {
          const parentIndex = info[i * 4 + 3];
          if (parentIndex < 0 || info[parentIndex * 4 + 3] >= 0) continue;
          const contour = contours.get(i), parent = contours.get(parentIndex);
          let transformed;
          try {
            if (contour.rows < 12 || parent.rows < 12) continue;
            const area = Math.abs(cv.contourArea(contour)), parentArea = Math.abs(cv.contourArea(parent));
            if (area < 200 || parentArea / area < 1.035 || parentArea / area > 4.5) continue;
            const imageEllipse = cv.fitEllipse(contour), imageCenter = imageEllipse.center;
            if (insideQuad(imageCenter, marker.corners)) continue;
            const rect = cv.boundingRect(parent);
            const clipped = rect.x < 3 || rect.y < 3 || rect.x + rect.width > gray.cols - 3 || rect.y + rect.height > gray.rows - 3;
            const points = Array.from({ length: contour.rows }, (_, j) => transformPoint(h, { x: contour.data32S[j * 2], y: contour.data32S[j * 2 + 1] }));
            transformed = cv.matFromArray(points.length, 1, cv.CV_32FC2, points.flatMap((p) => [p.x, p.y]));
            const ellipse = cv.fitEllipse(transformed);
            const axes = [ellipse.size.width, ellipse.size.height];
            const diameter = mean(axes);
            if (!Number.isFinite(diameter) || diameter < LIMITS.minDiameterMm || diameter > LIMITS.maxDiameterMm) continue;
            const residual = fitResidual(points, ellipse);
            const ellipseArea = Math.PI * axes[0] * axes[1] / 4;
            const areaRatio = Math.abs(cv.contourArea(transformed)) / ellipseArea;
            // Reject arbitrary openings and broken contours before quality checks.
            if (residual > 0.065 || areaRatio < 0.88 || areaRatio > 1.10) continue;
            const parentEllipse = cv.fitEllipse(parent);
            if (distance(parentEllipse.center, imageCenter) > Math.max(imageEllipse.size.width, imageEllipse.size.height) * 0.12) continue;
            const candidate = { diameter, axes, ellipse, imageEllipse, center: imageCenter, residual, clipped, maskIndex, points: points.length, axisRatio: Math.min(...axes) / Math.max(...axes), imageDiameterPx: Math.min(imageEllipse.size.width, imageEllipse.size.height), edge: ringEdges(gray, imageEllipse) };
            const cluster = rings.find((r) => distance(r.center, imageCenter) < Math.max(12, candidate.imageDiameterPx * 0.2));
            if (!cluster) rings.push({ ...candidate, observations: [candidate] });
            else cluster.observations.push(candidate);
          } finally { contour.delete(); parent.delete(); if (transformed) transformed.delete(); }
        }
      } finally { contours.delete(); hierarchy.delete(); }
    }
    return rings;
  }

  function analyze(cv, imageData) {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const checks = [];
    const metrics = { engine: 'OpenCV.js / RingMeasure 1.0', width: imageData && imageData.width, height: imageData && imageData.height, paidApiCalls: 0, paidApiCostUsd: 0 };
    const complete = (result) => ({ ...result, checks, metrics: { ...metrics, processingMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start) } });
    const reject = (code, message, guidance, extra = {}) => complete({ status: 'retake', code, message, guidance, ...extra });
    const check = (label, pass, detail) => checks.push({ label, pass, detail });
    if (!imageData || !imageData.data || imageData.width < 100 || imageData.height < 100) return reject('invalid_image', 'This image is too small to measure.', 'Use an original, well-lit photo with the entire ring and marker visible.');
    const mats = [];
    const keep = (m) => { mats.push(m); return m; };
    try {
      const src = keep(cv.matFromImageData(imageData)), gray = keep(new cv.Mat());
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      const otsuMask = keep(new cv.Mat()), adaptiveMask = keep(new cv.Mat());
      const otsu = cv.threshold(gray, otsuMask, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
      cv.adaptiveThreshold(gray, adaptiveMask, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 41, 7);
      const markers = findMarkers(cv, gray, [otsuMask, adaptiveMask]);
      metrics.otsuThreshold = Math.round(otsu);
      check('Calibration marker', markers.length === 1, markers.length === 1 ? 'Recognised the encoded 20 mm marker.' : `${markers.length} valid markers found.`);
      if (markers.length !== 1) return reject(markers.length ? 'multiple_markers' : 'missing_marker', markers.length ? 'More than one calibration marker was found.' : 'The 20 mm calibration marker was not found.', 'Use the downloaded marker, printed at 100%. Keep one complete marker beside the ring, with no folds, glare or obstruction.');
      const m = markers[0], g = m.geometry;
      const marker = { corners: m.corners, center: m.center, sideMm: 20, pixelsPerMm: g.meanSide / 20, edgeRatio: g.edgeRatio, diagonalRatio: g.diagonalRatio, angleDeviation: g.angleDeviation, contrast: m.contrast, rotation: m.rotation };
      check('Marker resolution', g.minSide >= LIMITS.minMarkerSidePx, `Shortest marker edge: ${Math.round(g.minSide)} px; at least ${LIMITS.minMarkerSidePx} px required.`);
      if (g.minSide < LIMITS.minMarkerSidePx) return reject('low_resolution', 'The marker is too small in this photo.', 'Move closer. Keep the marker and ring sharp, completely in frame, and use the original image rather than a screenshot.', { marker });
      const perspectiveOk = g.edgeRatio <= LIMITS.maxMarkerEdgeRatio && g.diagonalRatio <= LIMITS.maxMarkerDiagonalRatio && g.angleDeviation <= LIMITS.maxMarkerAngleDeviation;
      check('Near-overhead view', perspectiveOk, `Marker edge ratio ${g.edgeRatio.toFixed(2)}; maximum ${LIMITS.maxMarkerEdgeRatio.toFixed(2)}.`);
      if (!perspectiveOk) return reject('perspective', 'The camera angle is too oblique for a reliable measurement.', 'Take the photo almost directly above the flat ring and marker. Keep both on the same flat surface.', { marker });
      const world = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
      const h = makeHomography(cv, m.corners, world), inverse = makeHomography(cv, world, m.corners);
      const lowMask = keep(new cv.Mat()), highMask = keep(new cv.Mat());
      cv.threshold(gray, lowMask, Math.max(15, otsu - 15), 255, cv.THRESH_BINARY_INV);
      cv.threshold(gray, highMask, Math.min(230, otsu + 15), 255, cv.THRESH_BINARY_INV);
      const clusters = findRings(cv, gray, [otsuMask, lowMask, highMask, adaptiveMask], m, h);
      // A ring must agree across at least two global thresholds. Adaptive-only holes are unsafe.
      const stable = clusters.filter((c) => c.observations.filter((o) => o.maskIndex < 3).length >= 2);
      check('One visible ring', stable.length === 1, `${stable.length} unambiguous ring openings found.`);
      if (stable.length !== 1) return reject(stable.length ? 'multiple_rings' : 'ring_not_found', stable.length ? 'More than one ring opening was detected.' : 'A complete ring opening could not be measured.', 'Photograph one plain circular ring lying flat on a light, matte background. Show the complete inner edge and keep the marker separate from the ring.', { marker });
      const c = stable[0];
      const observations = c.observations.filter((o) => o.maskIndex < 3).sort((a, b) => a.residual - b.residual);
      const best = observations[0];
      const ring = { center: best.center, points: ellipsePoints(best.ellipse).map((p) => transformPoint(inverse, p)), diameterPixels: mean([best.imageEllipse.size.width, best.imageEllipse.size.height]), axisRatio: best.axisRatio, fitResidual: best.residual };
      check('Complete inner boundary', !best.clipped, best.clipped ? 'The ring reaches the edge of the image.' : 'The inner opening and surrounding band are fully visible.');
      if (best.clipped) return reject('clipped_ring', 'Part of the ring is outside the photo.', 'Retake the photo with the complete ring and some clear background around it.', { marker, ring });
      check('Ring resolution', best.imageDiameterPx >= LIMITS.minRingDiameterPx, `Opening: ${Math.round(best.imageDiameterPx)} px; at least ${LIMITS.minRingDiameterPx} px required.`);
      if (best.imageDiameterPx < LIMITS.minRingDiameterPx) return reject('low_resolution', 'The ring is too small to measure reliably.', 'Move closer and upload the original photo. Keep the complete ring and marker in frame.', { marker, ring });
      const circular = best.axisRatio >= LIMITS.minCircleAxisRatio && best.residual <= LIMITS.maxFitResidual;
      check('Circular opening', circular, `Corrected axis ratio ${best.axisRatio.toFixed(3)}; fit residual ${(best.residual * 100).toFixed(1)}%.`);
      if (!circular) return reject('non_circular', 'The opening does not look circular in the marker plane.', 'Lay the ring and marker flat on the same surface and photograph almost directly above. Oval, raised and distorted rings are not supported.', { marker, ring });
      const edge = best.edge;
      const sharp = edge.contrast >= LIMITS.minEdgeContrast && edge.sharpness >= LIMITS.minSharpnessRatio;
      check('Sharp inner edge', sharp, `Edge contrast ${edge.contrast.toFixed(0)}/255; sharpness ratio ${edge.sharpness.toFixed(2)}.`);
      if (!sharp) return reject('blur', 'The inner edge is blurred or has too little contrast.', 'Use bright, diffuse light and a plain matte background. Focus on the ring, hold still and avoid glare or strong shadows.', { marker, ring });
      const diameters = observations.map((o) => o.diameter);
      const spread = Math.max(...diameters) - Math.min(...diameters);
      check('Threshold agreement', spread <= 0.5, `Diameter variation across thresholds: ${spread.toFixed(2)} mm.`);
      if (spread > 0.5) return reject('unstable_boundary', 'The inner boundary changes too much between checks.', 'Retake with sharper focus and even lighting. Avoid deep shadows, reflections and patterned backgrounds.', { marker, ring });
      // Hole contours follow the surrounding dark pixel centres. Subtract one pixel diameter
      // to put the estimate midway across that black/white transition.
      const diameterMm = median(diameters) - 1 / marker.pixelsPerMm;
      const geometricUncertainty = 2 / marker.pixelsPerMm + diameterMm * 0.01 + spread / 2 + best.residual * diameterMm;
      const uncertaintyMm = Math.ceil(Math.max(0.3, geometricUncertainty) * 10) / 10;
      return complete({ status: 'ok', diameterMm, uncertaintyMm, uncertaintyNote: 'Engineering estimate, not a validated confidence interval. Assumes a correctly printed 20 mm marker, both objects flat, and low lens distortion.', marker, ring, supportedConditions: 'One plain circular ring on a light matte surface; the supplied 20 mm marker in the same plane; sharp, near-overhead photo.', diagnostics: { thresholdSpreadMm: spread, edgeContrast: edge.contrast, edgeSharpnessRatio: edge.sharpness, correctedAxesMm: best.axes, contourResidual: best.residual } });
    } finally { for (let i = mats.length - 1; i >= 0; i--) mats[i].delete(); }
  }

  return Object.freeze({ analyze, MARKER_SIDE_MM, MARKER_PATTERN, LIMITS, version: '1.0.0' });
});
