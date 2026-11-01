# Measurement method and supported conditions

RingMeasure estimates the inner diameter of one plain circular ring from a sharp near-overhead photograph. The ring must lie flat on a light, matte, uncluttered background beside the supplied printed marker. The marker's outer black square must physically measure **20 × 20 mm**. Paper scaling, ring/marker height differences, lens distortion, reflections and noncircular openings can invalidate the estimate.

## Marker

The marker is a custom binary fiducial, not a generic square or a claim of ArUco compatibility. It has six cells per side: a solid black one-cell border and an asymmetric four-by-four payload. Black is `1`:

```text
111111
110001
111011
101001
110111
111111
```

`web/engine.js` exports this pattern; `node scripts/generate-marker.mjs` regenerates `web/marker.svg` from the same constant. The SVG declares physical dimensions in millimetres. Its encoded square occupies exactly 20 × 20 mm. Print at actual size / 100%, retain the white margin and verify both outside dimensions with a ruler. Printing a marker incorrectly introduces a proportional error that image analysis cannot discover.

## Processing pipeline

1. The interface decodes and, if necessary, downsamples the image to a maximum long side of 1600 pixels before sending RGBA pixels to a Web Worker. Expected dimensions and filenames never reach the measurement algorithm.
2. OpenCV converts to grayscale. Global Otsu and adaptive Gaussian thresholding produce candidate dark contours. Four-corner convex candidates are mapped to a unit square and sampled at nine locations per cell. All 36 cells must match the encoded pattern in one of four rotations, with at least 70/255 contrast. An arbitrary dark square is not accepted as a scale reference. In version 1.2, each side also needs an outward black-to-paper transition: four samples per side, at 2–5 pixels inside/outside, median side contrast at least 35/255 and weakest side at least 20/255. Among duplicate decoded candidates the strongest outer transition wins. Selecting the straightest square alone could select a smaller adaptive contour inside the black border and corrupt scale.
3. The marker must be unique and at least 80 pixels on its shortest edge. Its longest-to-shortest edge ratio must be no greater than 1.20, diagonal ratio no greater than 1.15, and corner-angle deviation no greater than 14 degrees. These are conservative prototype gates, not calibrated physical tilt measurements.
4. A planar homography maps the marker corners to a 20 mm square. It also maps ring contour points into that same plane. Modest perspective is therefore corrected, while strongly oblique images are rejected.
5. Closed holes inside dark foreground contours are tested as ring openings. Candidate contours must have at least 12 pixels, a surrounding band, a near-concentric outer contour and diameter in the supported 8–30 mm range. The outer-contour area divided by opening area is bounded by `LIMITS.maxOuterToInnerAreaRatio = 9`, equivalent to an outer/inner diameter ratio of 3 for concentric circles; this admits broad round bands and washers. This band-width filter does not relax the circularity, sharpness, resolution, perspective or cross-threshold agreement checks below. Candidates inside the marker are excluded. Ellipses are fitted in marker-plane coordinates. Distinct openings cause an ambiguity rejection.
6. The luminance candidate must appear in at least two of the three global thresholds (Otsu, Otsu−15 and Otsu+15). A supplementary warm-metal path is described below and requires agreement between at least two colour seeds. Both paths require an opening at least 70 pixels across, entirely visible, corrected minor/major axis ratio at least 0.93 and normalized RMS ellipse-fit residual at most 0.035. The quality thresholds were not relaxed to accept the jewellery photos.
7. Forty-eight radial edge profiles test local contrast and sharpness at the inner boundary. Median contrast must reach 32/255; the median maximum one-pixel intensity transition divided by the full eleven-pixel profile contrast must reach 0.18. Strong blur or weak contrast produces retake guidance. This is a heuristic quality gate.
8. Diameter estimates from the selected path must agree within 0.5 mm. Their median is reported. The luminance path subtracts one pixel in diameter for the contour's dark-pixel-centre convention; the gradient-localized metal path does not apply that adjustment. The inner ellipse is scaled to this reported diameter and projected back into input-image coordinates with the four scale corners for the visible overlay.

## Supplementary warm-metal boundary

The signal is absolute warm chroma `max(0, R − B)`, not normalized saturation: a very dark shadow may be saturated with little actual colour signal. Thresholds 35, 40 and 45, each with a 3 × 3 closing, propose closed rim openings using the same topology/concentricity filters. These thresholds only seed the search; their binary boundaries are not directly accepted as physical metal.

For each seed, 96 radial profiles search within 3–8 pixels of the initial ellipse for the strongest positive local chroma gradient. Each direction must have a rise into metal (gradient at least 2 intensity units/pixel and peak at least 12 above the interior) and a subsequent fall out of metal (peak at least 12 above the outer sample, within a bounded 12–40 pixel band). At least 85% of directions and 60% in each of eight sectors must support the paired transitions. A short clean arc cannot substitute for evidence around the entire rim. A free ellipse is fitted in the image and marker plane, with no forced circle, diameter prior or reference measurement. Final diameter must still lie in 8–30 mm. Grayscale edge contrast/sharpness, circularity, clipping and cross-seed agreement checks remain mandatory.

Confirmed metal candidates replace nearby luminance openings, which may be smaller patches of lit paper bounded by shadows. The algorithm also counts substantial warm-coloured components stable at lower thresholds 12 and 18 (5 × 5 closing, area at least 50 square marker-mm, bounding sides 8–60 mm, aspect at least 0.65, fill at least 0.35). This is a conservative ambiguity veto only: those shadow-expanded outlines never determine a diameter. Two objects cause refusal even if only one has a readable hole. One such object with an unconfirmed metal rim cannot fall back to a single luminance candidate, because that could be a circular shadow. This may conservatively refuse other coloured objects; it is not general semantic jewellery recognition.

The additional path is intentionally limited to a narrow, continuous warm-coloured rim. It does not solve pale/silver metal, interrupted settings, broad coloured walls or all reflections. In the current real-photo set it measures the ordinary ring but refuses all three views of the protruding ring. See [JEWELLERY-VALIDATION.md](JEWELLERY-VALIDATION.md).

OpenCV memory objects are deleted after each operation. The bundled OpenCV.js runtime executes locally. No image or image-derived measurement is submitted to an external model or paid processing API.

## Uncertainty

The displayed uncertainty is an **engineering estimate**, not a validated confidence interval or a claim of accuracy on physical rings. It adds:

- two pixels converted to millimetres for localization and scale quantization;
- 1% of diameter as an assumed print/geometry allowance;
- half the cross-threshold spread;
- the normalized fit residual multiplied by diameter.

The result is rounded upward to 0.1 mm, with a minimum estimate of ±0.3 mm. These allowances cannot bound an incorrectly printed marker or objects in different planes. In the current jewellery set, the difference from the approximate user reference exceeds the displayed ±0.6–0.7 mm estimate. The reference and print scale are not precise enough to attribute that difference, but the estimate must not be represented as a validated bound. Synthetic fixtures exercise geometry and rejection logic; they do not prove physical-world accuracy.

## Rejections and limits

The engine returns no diameter when scale is absent/ambiguous, resolution is insufficient, perspective is excessive, a closed opening cannot be isolated, multiple openings exist, the contour is clipped or noncircular, the edge is blurry/low contrast, or thresholds disagree. The reason and retake advice are returned as structured data.

The prototype does not establish a supported operating envelope for gemstone settings, nearly transparent or highly reflective rings, patterned/dark backgrounds, shadows mistaken for metal, extreme wide-angle distortion, very small images or objects outside 8–30 mm. Printed ring cutouts and generated circles must be labelled as such. Real-ring and independently measured physical-object validation remains a separate requirement.

## Engine API

`RingMeasureEngine.analyze(cv, { data, width, height })` accepts decoded RGBA pixels and a ready OpenCV.js module. It returns `status: 'ok'` with `diameterMm`, `uncertaintyMm`, marker and ring overlay geometry, quality checks, diagnostics and measured engine processing time. Rejections return `status: 'retake'`, a machine-readable code, message and guidance. `metrics.processingMs` measures the engine only; the interface separately measures image-to-useful-result latency including decode and runtime readiness.

The classic worker accepts `{ type: 'analyze', imageData, requestId }` and emits `ready`, `progress`, `result` or `error` messages. Emscripten's self-resolving thenable is wrapped in an ordinary object during initialization to avoid Promise-assimilation loops.
