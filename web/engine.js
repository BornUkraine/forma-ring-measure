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
    // A broad round band/washer may have an outer diameter up to 3× its opening.
    maxOuterToInnerAreaRatio: 9,
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
  function markerOuterEdge(gray, corners, geometry) {
    const center = { x: mean(corners.map((p) => p.x)), y: mean(corners.map((p) => p.y)) };
    const step = Math.max(2, Math.min(5, geometry.meanSide * 0.012));
    const sides = corners.map((a, i) => {
      const b = corners[(i + 1) % 4], length = distance(a, b);
      let nx = (b.y - a.y) / length, ny = -(b.x - a.x) / length;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if ((mid.x - center.x) * nx + (mid.y - center.y) * ny < 0) { nx = -nx; ny = -ny; }
      return median([0.2, 0.4, 0.6, 0.8].map((fraction) => {
        const x = a.x + (b.x - a.x) * fraction, y = a.y + (b.y - a.y) * fraction;
        return sampleGray(gray, x + nx * step, y + ny * step) - sampleGray(gray, x - nx * step, y - ny * step);
      }));
    });
    return { contrast: median(sides), weakestSide: Math.min(...sides) };
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
            // An adaptive threshold can draw a smaller square INSIDE a thick
            // black border while still decoding the payload. The calibration
            // corners must lie on the outer black-to-paper transition.
            const outerEdge = markerOuterEdge(gray, q, geometry);
            if (outerEdge.contrast < 35 || outerEdge.weakestSide < 20) continue;
            const previous = found.find((m) => distance(m.center, center) < geometry.meanSide * 0.2);
            const marker = { corners: q, center, geometry, outerEdge, ...validation };
            if (!previous) found.push(marker);
            else if (outerEdge.contrast > previous.outerEdge.contrast) Object.assign(previous, marker);
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
            if (area < 200 || parentArea / area < 1.035 || parentArea / area > LIMITS.maxOuterToInnerAreaRatio) continue;
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

  // Absolute warm chroma, rather than saturation: a dark shadow can have high
  // saturation while containing very little colour signal. This supplementary
  // path is deliberately limited to a visible, narrow warm-metal rim.
  function refineMetalRim(cv, gray, chroma, seed, h) {
    const points = [], supported = [], gradients = [];
    const radius = seed.imageDiameterPx / 2;
    const search = Math.max(3, Math.min(8, Math.round(radius * 0.07)));
    const bandWidth = Math.max(12, Math.min(40, Math.round(radius * 0.35)));
    for (const p of ellipsePoints(seed.imageEllipse, 96)) {
      const dx = p.x - seed.center.x, dy = p.y - seed.center.y, length = Math.hypot(dx, dy);
      const ux = dx / length, uy = dy / length;
      const at = (t) => sampleGray(chroma, p.x + ux * t, p.y + uy * t);
      let offset = 0, gradient = -Infinity;
      for (let t = -search; t <= search; t++) {
        const g = (at(t + 2) - at(t - 2)) / 4;
        if (g > gradient) { gradient = g; offset = t; }
      }
      // A metal band must rise in chroma at the inner edge, then fall again on
      // its outer side. A single shadow transition is insufficient evidence.
      const inside = mean([-6, -5, -4].map((t) => at(offset + t)));
      let peak = -Infinity, outside = Infinity;
      for (let t = 2; t <= Math.min(19, bandWidth - 4); t++) peak = Math.max(peak, at(offset + t));
      for (let t = 14; t <= bandWidth; t++) outside = Math.min(outside, at(offset + t));
      supported.push(gradient >= 2 && peak - inside >= 12 && peak - outside >= 12);
      gradients.push(gradient);
      points.push({ x: p.x + ux * offset, y: p.y + uy * offset });
    }
    const coverage = mean(supported.map(Number));
    const sectors = Array.from({ length: 8 }, (_, i) => mean(supported.slice(i * 12, i * 12 + 12).map(Number)));
    if (coverage < 0.85 || Math.min(...sectors) < 0.6) return null;
    const planePoints = points.map((p) => transformPoint(h, p));
    const imageMat = cv.matFromArray(points.length, 1, cv.CV_32FC2, points.flatMap((p) => [p.x, p.y]));
    const planeMat = cv.matFromArray(points.length, 1, cv.CV_32FC2, planePoints.flatMap((p) => [p.x, p.y]));
    try {
      // Fit a free ellipse, never force a circle through an oval/raised ring.
      const imageEllipse = cv.fitEllipse(imageMat), ellipse = cv.fitEllipse(planeMat);
      const axes = [ellipse.size.width, ellipse.size.height];
      if (!Number.isFinite(mean(axes)) || mean(axes) < LIMITS.minDiameterMm || mean(axes) > LIMITS.maxDiameterMm) return null;
      return { ...seed, source: 'chromatic-rim', ellipse, imageEllipse, axes,
        center: imageEllipse.center, diameter: mean(axes),
        axisRatio: Math.min(...axes) / Math.max(...axes),
        imageDiameterPx: Math.min(imageEllipse.size.width, imageEllipse.size.height),
        residual: fitResidual(planePoints, ellipse), edge: ringEdges(gray, imageEllipse),
        rimCoverage: coverage, minSectorCoverage: Math.min(...sectors), chromaGradient: median(gradients) };
    } finally { imageMat.delete(); planeMat.delete(); }
  }

  function findMetalRims(cv, src, gray, marker, h) {
    const chroma = new cv.Mat(gray.rows, gray.cols, cv.CV_8UC1), masks = [];
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    try {
      for (let i = 0; i < chroma.data.length; i++) chroma.data[i] = Math.max(0, src.data[i * 4] - src.data[i * 4 + 2]);
      for (const threshold of [35, 40, 45]) {
        const mask = new cv.Mat(); masks.push(mask);
        cv.threshold(chroma, mask, threshold, 255, cv.THRESH_BINARY);
        cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
      }
      const clusters = findRings(cv, gray, masks, marker, h);
      for (const cluster of clusters) cluster.observations = cluster.observations.map((seed) => refineMetalRim(cv, gray, chroma, seed, h)).filter(Boolean);
      const stable = clusters.filter((c) => c.observations.length >= 2);
      // Low-chroma connected components are ONLY an ambiguity veto. In
      // particular their shadow-expanded outlines never supply a diameter.
      const objects = [];
      const vetoKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
      try {
        for (const threshold of [12, 18]) {
          const mask = new cv.Mat(), contours = new cv.MatVector(), hierarchy = new cv.Mat();
          try {
            cv.threshold(chroma, mask, threshold, 255, cv.THRESH_BINARY);
            cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, vetoKernel);
            cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
            for (let i = 0; i < contours.size(); i++) {
              const contour = contours.get(i);
              try {
                const area = Math.abs(cv.contourArea(contour)), rect = cv.boundingRect(contour);
                const scale = marker.geometry.meanSide / MARKER_SIDE_MM;
                const minSide = Math.min(rect.width, rect.height), maxSide = Math.max(rect.width, rect.height);
                if (area < 50 * scale * scale || minSide < 8 * scale || maxSide > 60 * scale || minSide / maxSide < 0.65 || area / (rect.width * rect.height) < 0.35) continue;
                const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                if (insideQuad(center, marker.corners)) continue;
                const previous = objects.find((o) => distance(o.center, center) < maxSide * 0.25);
                if (previous) previous.thresholds.add(threshold);
                else objects.push({ center, rect, thresholds: new Set([threshold]) });
              } finally { contour.delete(); }
            }
          } finally { mask.delete(); contours.delete(); hierarchy.delete(); }
        }
      } finally { vetoKernel.delete(); }
      const confirmed = objects.filter((o) => o.thresholds.size === 2);
      if (!stable.length && confirmed.length === 1) stable.push(...findShadowedMetalRims(cv, gray, chroma, marker, h, confirmed[0].rect));
      return { stable, objectCount: confirmed.length, innerMaterialConflict: hasInnerMaterialConflict(cv, gray, chroma, marker, h, stable) };
    } finally { chroma.delete(); kernel.delete(); for (const mask of masks) mask.delete(); }
  }

  function shadowEllipseFit(cv, points) {
    const mat = cv.matFromArray(points.length, 1, cv.CV_32FC2, points.flatMap(p => [p.x, p.y]));
    try { return cv.fitEllipse(mat); } finally { mat.delete(); }
  }
  function shadowPointResidual(p, e) {
    const theta = -e.angle * Math.PI / 180, dx = p.x - e.center.x, dy = p.y - e.center.y;
    return Math.hypot((dx * Math.cos(theta) - dy * Math.sin(theta)) / (e.size.width / 2),
      (dx * Math.sin(theta) + dy * Math.cos(theta)) / (e.size.height / 2)) - 1;
  }
  function shadowMaximumGap(support) {
    let run = 0, largest = 0;
    for (let i = 0; i < support.length * 2; i++) {
      run = support[i % support.length] ? 0 : run + 1;
      largest = Math.max(largest, run);
    }
    return Math.min(largest, support.length) * 360 / support.length;
  }
  function shadowSeedRefinement(cv, gray, chroma, seed, h) {
    const points = [], verified = [], pairs = [], strongColours = [], localGrays = [];
    const sourcePoints = ellipsePoints(seed.imageEllipse, 144);
    const radius = Math.min(seed.imageEllipse.size.width, seed.imageEllipse.size.height) / 2;
    const inward = Math.min(30, Math.max(8, Math.round(radius * .22)));
    const outward = Math.max(3, Math.round(radius * .035));
    const band = Math.min(45, Math.max(18, Math.round(radius * .35)));
    for (const p of sourcePoints) {
      const dx = p.x - seed.center.x, dy = p.y - seed.center.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      const colour = t => sampleGray(chroma, p.x + ux * t, p.y + uy * t);
      let best = { score: -Infinity, offset: 0, gain: 0, entry: 0, exit: 0 };
      for (let t = -inward; t <= outward; t++) {
        const gain = (colour(t + 2) - colour(t - 2)) / 4;
        const inside = mean([-6, -5, -4].map(d => colour(t + d)));
        let peak = -Infinity, exterior = Infinity;
        for (let d = 2; d <= Math.min(19, band - 4); d++) peak = Math.max(peak, colour(t + d));
        for (let d = 14; d <= band; d++) exterior = Math.min(exterior, colour(t + d));
        const entry = peak - inside, exit = peak - exterior;
        // Local paired-colour signal proposes an inner edge. This proposal is
        // not yet an observation; unsupported points never enter the fit.
        const score = gain;
        if (score > best.score) best = { score, offset: t, gain, entry, exit };
      }
      const q = { x: p.x + ux * best.offset, y: p.y + uy * best.offset };
      const profile = Array.from({ length: 11 }, (_, i) => sampleGray(gray, q.x + ux * (i - 5), q.y + uy * (i - 5)));
      const contrast = Math.max(...profile) - Math.min(...profile);
      const sharpness = Math.max(...profile.slice(1).map((v, i) => Math.abs(v - profile[i]))) / Math.max(1, contrast);
      const oldColour = best.gain >= 2 && best.entry >= 12 && best.exit >= 12;
      const localGray = contrast >= LIMITS.minEdgeContrast && sharpness >= LIMITS.minSharpnessRatio;
      pairs.push(best.gain >= .75 && best.entry >= 6 && best.exit >= 6);
      strongColours.push(oldColour); localGrays.push(localGray);
      verified.push(oldColour || localGray);
      points.push(q);
    }
    let support = [...verified];
    if (mean(support.map(Number)) < .75 || mean(pairs.map(Number)) < .55) return null;
    let imageEllipse = shadowEllipseFit(cv, points.filter((_, i) => support[i]));
    for (let iteration = 0; iteration < 2; iteration++) {
      support = verified.map((valid, i) => valid && Math.abs(shadowPointResidual(points[i], imageEllipse)) <= .035);
      if (mean(support.map(Number)) < .75 || shadowMaximumGap(support) > 35) return null;
      imageEllipse = shadowEllipseFit(cv, points.filter((_, i) => support[i]));
    }
    const observed = points.filter((_, i) => support[i]), plane = observed.map(p => transformPoint(h, p));
    const supportedPairFraction = mean(support.map((valid, i) => Number(valid && pairs[i])));
    if (supportedPairFraction < .5) return null;
    const ellipse = shadowEllipseFit(cv, plane), axes = [ellipse.size.width, ellipse.size.height], diameter = mean(axes);
    if (!Number.isFinite(diameter) || diameter < LIMITS.minDiameterMm || diameter > LIMITS.maxDiameterMm) return null;
    const jackknife = [];
    for (let sector = 0; sector < 8; sector++) {
      const sample = points.filter((_, i) => support[i] && Math.floor(i / 18) !== sector).map(p => transformPoint(h, p));
      if (sample.length < 60) return null;
      const fit = shadowEllipseFit(cv, sample);
      jackknife.push(mean([fit.size.width, fit.size.height]));
    }
    const jackknifeSpreadMm = Math.max(...jackknife) - Math.min(...jackknife);
    if (jackknifeSpreadMm > .2) return null;
    const residual = fitResidual(plane, ellipse);
    const result = { ...seed, source: 'partially-supported-metal-rim', imageEllipse, ellipse,
      center: imageEllipse.center, axes, diameter, residual,
      axisRatio: Math.min(...axes) / Math.max(...axes),
      imageDiameterPx: Math.min(imageEllipse.size.width, imageEllipse.size.height),
      edge: ringEdges(gray, imageEllipse), observedFraction: mean(support.map(Number)),
      pairedColourFraction: mean(pairs.map(Number)), strongColourFraction: mean(strongColours.map(Number)),
      supportedPairFraction,
      localGrayFraction: mean(localGrays.map(Number)), maxUnsupportedArcDegrees: shadowMaximumGap(support),
      jackknifeSpreadMm, supportedImagePoints: observed };
    return result;
  }

  // Spatial top-hat proposals remove broad colour shading while preserving a
  // narrow metal ridge. A coarse warm component supplies only an ROI, not scale
  // or ring geometry. Every measurement is fitted to supported image samples.
  function findShadowedMetalRims(cv, gray, chroma, marker, h, objectRect) {
    const pad = 30, x = Math.max(0, objectRect.x - pad), y = Math.max(0, objectRect.y - pad);
    const width = Math.min(chroma.cols - x, objectRect.width + pad * 2), height = Math.min(chroma.rows - y, objectRect.height + pad * 2);
    const roi = chroma.roi(new cv.Rect(x, y, width, height));
    const closeKernel = cv.Mat.ones(5, 5, cv.CV_8U), candidates = [];
    const clipped = objectRect.x < 3 || objectRect.y < 3 || objectRect.x + objectRect.width > gray.cols - 3 || objectRect.y + objectRect.height > gray.rows - 3;
    try {
      for (const kernelSize of [15, 25]) {
        const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(kernelSize, kernelSize)), highPass = new cv.Mat();
        try {
          cv.morphologyEx(roi, highPass, cv.MORPH_TOPHAT, kernel);
          for (const [maskIndex, threshold] of [3, 4, 5, 6, 7, 8].entries()) {
            const mask = new cv.Mat(), contours = new cv.MatVector(), hierarchy = new cv.Mat();
            try {
              cv.threshold(highPass, mask, threshold, 255, cv.THRESH_BINARY);
              cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, closeKernel);
              cv.findContours(mask, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_NONE);
              for (let index = 0; index < contours.size(); index++) {
                const contour = contours.get(index);
                try {
                  if (contour.rows < 70) continue;
                  const local = cv.fitEllipse(contour);
                  const imageEllipse = { ...local, center: { x: local.center.x + x, y: local.center.y + y } };
                  const pixelDiameter = Math.min(imageEllipse.size.width, imageEllipse.size.height);
                  if (pixelDiameter < LIMITS.minRingDiameterPx || Math.max(imageEllipse.size.width, imageEllipse.size.height) > Math.max(objectRect.width, objectRect.height) * 1.1) continue;
                  const points = Array.from({ length: contour.rows }, (_, i) => ({ x: contour.data32S[i * 2] + x, y: contour.data32S[i * 2 + 1] + y }));
                  if (fitResidual(points, imageEllipse) > .08 || insideQuad(imageEllipse.center, marker.corners)) continue;
                  const bins = new Set(points.map(p => Math.floor((Math.atan2(p.y - imageEllipse.center.y, p.x - imageEllipse.center.x) + Math.PI) * 36 / (Math.PI * 2)) % 36));
                  if (bins.size / 36 < .7) continue;
                  const plane = points.map(p => transformPoint(h, p)), ellipse = shadowEllipseFit(cv, plane);
                  const diameter = mean([ellipse.size.width, ellipse.size.height]);
                  if (diameter < LIMITS.minDiameterMm || diameter > LIMITS.maxDiameterMm) continue;
                  const seed = { imageEllipse, center: imageEllipse.center, clipped, maskIndex, seedKernel: kernelSize, seedKey: `${kernelSize}/${threshold}`, points: points.length };
                  const refined = shadowSeedRefinement(cv, gray, chroma, seed, h);
                  if (refined) candidates.push(refined);
                } finally { contour.delete(); }
              }
            } finally { mask.delete(); contours.delete(); hierarchy.delete(); }
          }
        } finally { kernel.delete(); highPass.delete(); }
      }
    } finally { roi.delete(); closeKernel.delete(); }
    if (new Set(candidates.map(c => c.seedKernel)).size < 2) return [];
    const spread = Math.max(...candidates.map(c => c.diameter)) - Math.min(...candidates.map(c => c.diameter));
    if (spread > .35) return [];
    let centerSpreadPx = 0;
    for (const a of candidates) for (const b of candidates) centerSpreadPx = Math.max(centerSpreadPx, distance(a.center, b.center));
    if (centerSpreadPx > Math.min(...candidates.map(c => c.imageDiameterPx)) * .02) return [];
    for (const c of candidates) { c.seedSpreadMm = spread; c.seedCenterSpreadPx = centerSpreadPx; c.seedKernelCount = new Set(candidates.map(c => c.seedKernel)).size; }
    return [{ ...candidates[0], observations: candidates }];
  }

  // A saturated decorative ridge may surround a neutral metal wall. Colour
  // alone cannot distinguish that ridge from the opening. Search only for a
  // competing sharp, fully enclosed inner boundary; never measure from it.
  function hasInnerLuminanceConflict(cv, gray, marker, h, warmClusters) {
    for (const cluster of warmClusters) {
      const outer = cluster.observations[0], halfSide = Math.ceil(Math.max(outer.imageEllipse.size.width, outer.imageEllipse.size.height) * .7);
      const x = Math.max(0, Math.floor(outer.center.x - halfSide)), y = Math.max(0, Math.floor(outer.center.y - halfSide));
      const width = Math.min(gray.cols - x, halfSide * 2), height = Math.min(gray.rows - y, halfSide * 2);
      const region = gray.roi(new cv.Rect(x, y, width, height)), roi = region.clone();
      region.delete();
      const localMarker = { ...marker, corners: marker.corners.map(p => ({ x: p.x - x, y: p.y - y })) };
      const localH = [h[0], h[1], h[0] * x + h[1] * y + h[2],
        h[3], h[4], h[3] * x + h[4] * y + h[5], h[6], h[7], h[6] * x + h[7] * y + h[8]];
      const masks = [];
      try {
        // Eight-level increments resolve even a weak 15-level neutral wall.
        // The much lower contrast threshold below is only a rejection cue;
        // it never relaxes the contrast required for a reported measurement.
        for (let level = 8; level < 256; level += 8) {
          const mask = new cv.Mat(); masks.push(mask);
          cv.threshold(roi, mask, level, 255, cv.THRESH_BINARY_INV);
        }
        const innerClusters = findRings(cv, roi, masks, localMarker, localH);
        for (const inner of innerClusters) {
          const reliable = inner.observations.filter(c => {
            const center = { x: c.center.x + x, y: c.center.y + y };
            if (c.clipped || c.diameter >= outer.diameter - .5 || c.residual > LIMITS.maxFitResidual
              || c.edge.contrast < 12 || c.edge.sharpness < LIMITS.minSharpnessRatio
              || distance(center, outer.center) > outer.imageDiameterPx * .15) return false;
            const samples = ellipsePoints(c.imageEllipse, 96);
            // A displaced illumination boundary often meets or crosses the
            // actual rim. This veto needs a separate boundary wholly inside it.
            if (samples.some(p => shadowPointResidual({ x: p.x + x, y: p.y + y }, outer.imageEllipse) > -.03)) return false;
            const inwardStep = samples.map(p => {
              const dx = p.x - c.center.x, dy = p.y - c.center.y, len = Math.hypot(dx, dy);
              return sampleGray(roi, p.x - dx / len * 2, p.y - dy / len * 2)
                - sampleGray(roi, p.x + dx / len * 2, p.y + dy / len * 2);
            });
            return mean(inwardStep.map(v => Number(v >= 8))) >= .85;
          });
          for (const candidate of reliable) {
            const sameEdge = reliable.filter(c => Math.abs(c.diameter - candidate.diameter) <= .25
              && distance(c.center, candidate.center) <= candidate.imageDiameterPx * .02);
            if (new Set(sameEdge.map(c => c.maskIndex)).size >= 2) return true;
          }
        }
      } finally { roi.delete(); for (const mask of masks) mask.delete(); }
    }
    return false;
  }

  function hasInnerMaterialConflict(cv, gray, chroma, marker, h, warmClusters) {
    if (!warmClusters.length) return false;
    if (hasInnerLuminanceConflict(cv, gray, marker, h, warmClusters)) return true;
    const masks = [];
    try {
      for (const threshold of [12, 18]) {
        const mask = new cv.Mat(); masks.push(mask);
        cv.threshold(chroma, mask, threshold, 255, cv.THRESH_BINARY);
      }
      const low = findRings(cv, chroma, masks, marker, h);
      for (const inner of low) {
        if (new Set(inner.observations.map(c => c.maskIndex)).size < 2) continue;
        const reliable = inner.observations.filter(c => {
          if (c.residual > LIMITS.maxFitResidual || c.edge.contrast < 12 || c.edge.sharpness < LIMITS.minSharpnessRatio) return false;
          const outward = ellipsePoints(c.imageEllipse, 48).map(p => {
            const dx = p.x - c.center.x, dy = p.y - c.center.y, len = Math.hypot(dx, dy);
            return sampleGray(chroma, p.x + dx / len * 2, p.y + dy / len * 2)
              - sampleGray(chroma, p.x - dx / len * 2, p.y - dy / len * 2);
          });
          return mean(outward.map(v => Number(v >= 8))) >= .85;
        });
        if (new Set(reliable.map(c => c.maskIndex)).size < 2) continue;
        const diameters = reliable.map(c => c.diameter);
        if (Math.max(...diameters) - Math.min(...diameters) > .5) continue;
        for (const cluster of warmClusters) {
          const outer = cluster.observations[0];
          if (median(diameters) < outer.diameter - .5 && distance(reliable[0].center, outer.center) < outer.imageDiameterPx * .15) return true;
        }
      }
      return false;
    } finally { for (const mask of masks) mask.delete(); }
  }

  function analyze(cv, imageData) {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const checks = [];
    const metrics = { engine: 'OpenCV.js / RingMeasure 1.3', width: imageData && imageData.width, height: imageData && imageData.height, paidApiCalls: 0, paidApiCostUsd: 0 };
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
      const metal = findMetalRims(cv, src, gray, m, h);
      for (const candidate of metal.stable) {
        const first = candidate.observations[0];
        const existing = stable.findIndex((c) => distance(c.center, first.center) < first.imageDiameterPx * 0.3);
        if (existing >= 0) stable[existing] = candidate;
        else stable.push(candidate);
      }
      if (metal.objectCount > 1) {
        check('One visible ring', false, `${metal.objectCount} substantial coloured objects found; unreadable openings cannot be ignored.`);
        return reject('multiple_rings', 'More than one possible ring is visible.', 'Use a photo containing one ring. An additional coloured object cannot be safely ignored even when its opening is unreadable.', { marker });
      }
      if (metal.innerMaterialConflict) {
        check('Unambiguous inner metal edge', false, 'A separate sharp material boundary is visible inside the proposed rim.');
        return reject('ambiguous_boundary', 'More than one possible inner boundary is visible.', 'The decorative outer rim cannot substitute for the actual opening. Use an image where the complete inner metal edge is clearly distinguishable.', { marker });
      }
      if (metal.objectCount && !metal.stable.length && stable.length === 1) {
        check('Metal boundary evidence', false, 'A coloured object is visible, but its complete inner metal edge is not supported.');
        return reject('uncertain_metal_boundary', 'The inner metal edge cannot be separated reliably from the shadow.', 'Use an image with a clear, continuous inner rim and diffuse light. A bright patch inside the opening is not a substitute for its metal boundary.', { marker });
      }
      check('One visible ring', stable.length === 1, `${stable.length} unambiguous ring openings found.`);
      if (stable.length !== 1) return reject(stable.length ? 'multiple_rings' : 'ring_not_found', stable.length ? 'More than one ring opening was detected.' : 'A complete ring opening could not be measured.', 'Photograph one plain circular ring lying flat on a light, matte background. Show the complete inner edge and keep the marker separate from the ring.', { marker });
      const c = stable[0];
      const observations = c.observations.filter((o) => o.source || o.maskIndex < 3).sort((a, b) => a.residual - b.residual);
      const best = observations[0];
      if (best.source === 'partially-supported-metal-rim') {
        check('Observed rim support', true, `${Math.round(best.observedFraction * 100)}% supported samples; largest inferred arc ${best.maxUnsupportedArcDegrees.toFixed(1)} degrees. Independent fits agree within ${best.seedSpreadMm.toFixed(2)} mm.`);
      }
      const ring = { center: best.center, points: ellipsePoints(best.ellipse).map((p) => transformPoint(inverse, p)), diameterPixels: mean([best.imageEllipse.size.width, best.imageEllipse.size.height]), axisRatio: best.axisRatio, fitResidual: best.residual };
      check('Ring fully in frame', !best.clipped, best.clipped ? 'The ring reaches the edge of the image.' : 'The opening and surrounding band are within the image. Small unsupported arcs, if present, are reported separately.');
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
      const diameterMm = median(diameters) - (best.source ? 0 : 1 / marker.pixelsPerMm);
      // The reported ellipse must depict the same median diameter as the number.
      const overlayScale = diameterMm / best.diameter;
      const displayedEllipse = { ...best.ellipse, size: { width: best.ellipse.size.width * overlayScale, height: best.ellipse.size.height * overlayScale } };
      ring.points = ellipsePoints(displayedEllipse).map((p) => transformPoint(inverse, p));
      ring.diameterPixels *= overlayScale;
      const geometricUncertainty = 2 / marker.pixelsPerMm + diameterMm * 0.01 + spread / 2 + best.residual * diameterMm;
      const uncertaintyMm = Math.ceil(Math.max(0.3, geometricUncertainty) * 10) / 10;
      return complete({ status: 'ok', diameterMm, uncertaintyMm, uncertaintyNote: 'Engineering estimate, not a validated confidence interval. Assumes a correctly printed 20 mm marker, both objects flat, and low lens distortion.', marker, ring, supportedConditions: 'One circular opening with a visible narrow rim; small exterior details may be supported; light matte surface; the supplied 20 mm marker in the same plane; sharp, near-overhead photo.', diagnostics: { ...(best.source === 'partially-supported-metal-rim' ? { observedFraction: best.observedFraction, pairedColourFraction: best.pairedColourFraction, supportedPairFraction: best.supportedPairFraction, strongColourFraction: best.strongColourFraction, localGrayFraction: best.localGrayFraction, maxUnsupportedArcDegrees: best.maxUnsupportedArcDegrees, jackknifeSpreadMm: best.jackknifeSpreadMm, seedSpreadMm: best.seedSpreadMm, seedKernelCount: best.seedKernelCount, seedCenterSpreadPx: best.seedCenterSpreadPx, supportedImagePoints: best.supportedImagePoints } : {}), boundaryMethod: best.source || 'luminance-contour', thresholdSpreadMm: spread, edgeContrast: edge.contrast, edgeSharpnessRatio: edge.sharpness, correctedAxesMm: best.axes.map((v) => v * overlayScale), contourResidual: best.residual, ...(best.source === 'chromatic-rim' ? { rimCoverage: best.rimCoverage, minSectorCoverage: best.minSectorCoverage, chromaGradient: best.chromaGradient } : {}) } });
    } finally { for (let i = mats.length - 1; i >= 0; i--) mats[i].delete(); }
  }

  return Object.freeze({ analyze, MARKER_SIDE_MM, MARKER_PATTERN, LIMITS, version: '1.3.0' });
});
