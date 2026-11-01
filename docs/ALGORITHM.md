# Measurement method and supported conditions

RingMeasure 1.3 estimates the inner diameter of one circular opening from a sharp near-overhead photograph. A visible narrow rim may have small exterior details; this is not general support for raised settings or thick rings. The ring must lie flat on a light, matte, uncluttered background beside the supplied printed marker. The marker's outer black square must physically measure **20 × 20 mm**. Paper scaling, ring/marker height differences, lens distortion, reflections and noncircular openings can invalidate the estimate.

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
6. The luminance candidate must appear in at least two of the three global thresholds (Otsu, Otsu−15 and Otsu+15). The continuous warm-metal path requires agreement between at least two colour seeds. A separate partially supported rim path, described below, requires independently consistent proposals and explicitly limits its inferred gaps. Every path requires an opening at least 70 pixels across, within the image, corrected minor/major axis ratio at least 0.93 and normalized RMS ellipse-fit residual at most 0.035. These final circularity, resolution and fit-quality thresholds were not relaxed to accept the jewellery photos.
7. Forty-eight radial edge profiles test local contrast and sharpness at the inner boundary. Median contrast must reach 32/255; the median maximum one-pixel intensity transition divided by the full eleven-pixel profile contrast must reach 0.18. Strong blur or weak contrast produces retake guidance. This is a heuristic quality gate.
8. Diameter estimates from the selected path must agree within 0.5 mm; the partially supported path additionally requires a tighter 0.35 mm agreement during candidate selection. Every accepted metal seed participates in this check and the reported median, including all six proposal thresholds below. The luminance path subtracts one pixel in diameter for the contour's dark-pixel-centre convention; the gradient-localized metal paths do not apply that adjustment. The inner ellipse is scaled to this reported diameter and projected back into input-image coordinates with the four scale corners for the visible overlay.

## Supplementary warm-metal boundary

The signal is absolute warm chroma `max(0, R − B)`, not normalized saturation: a very dark shadow may be saturated with little actual colour signal. Thresholds 35, 40 and 45, each with a 3 × 3 closing, propose closed rim openings using the same topology/concentricity filters. These thresholds only seed the search; their binary boundaries are not directly accepted as physical metal.

For each seed, 96 radial profiles search within 3–8 pixels of the initial ellipse for the strongest positive local chroma gradient. Each direction must have a rise into metal (gradient at least 2 intensity units/pixel and peak at least 12 above the interior) and a subsequent fall out of metal (peak at least 12 above the outer sample, within a bounded 12–40 pixel band). At least 85% of directions and 60% in each of eight sectors must support the paired transitions. A short clean arc cannot substitute for evidence around the entire rim. A free ellipse is fitted in the image and marker plane, with no forced circle, diameter prior or reference measurement. Final diameter must still lie in 8–30 mm. Grayscale edge contrast/sharpness, circularity, clipping and cross-seed agreement checks remain mandatory.

Confirmed metal candidates replace nearby luminance openings, which may be smaller patches of lit paper bounded by shadows, subject to the competing-boundary veto below. The algorithm also counts substantial warm-coloured components stable at lower thresholds 12 and 18 (5 × 5 closing, area at least 50 square marker-mm, bounding sides 8–60 mm, aspect at least 0.65, fill at least 0.35). Those shadow-expanded outlines never determine a diameter: they supply an ambiguity veto and, for exactly one object, the bounded search region for the additional path below. Two objects cause refusal even if only one has a readable hole. One such object with an unconfirmed metal rim cannot fall back to a single luminance candidate, because that could be a circular shadow. This may conservatively refuse other coloured objects; it is not general semantic jewellery recognition.

This continuous-rim path remains intentionally limited. It is supplemented in version 1.3 by bounded partial-rim inference; neither path establishes general support for pale/silver metal, broad coloured walls, interrupted settings or all reflections. Current per-photo results and remaining refusals are in [JEWELLERY-VALIDATION.md](JEWELLERY-VALIDATION.md).

## Partially supported metal rim

This fallback runs only when the continuous warm-rim path has no stable candidate and exactly one substantial warm object is present. Within that object's region, a morphological top-hat removes broad colour shading to propose narrower ridges. It uses two elliptical kernel sizes, 15 and 25 pixels, each tested at every integer threshold from 3 through 8 with a 5 × 5 closing. Proposal contours need at least 70 points, at least 70% angular-bin coverage and an initial ellipse residual no greater than 0.08. The proposals and component outline are not measurements. Dense proposal sampling handles differences between browser and Sharp interpolation without relaxing evidence or quality thresholds.

Each seed produces 144 radial profiles. The search extends inward by 8–30 pixels, outward by at least 3 pixels, and checks a bounded 18–45 pixel surrounding band. A proposed sample needs either the stronger paired-colour evidence from the continuous path or local grayscale contrast of at least 32/255 with sharpness ratio at least 0.18. A weaker paired-colour test also requires gradient at least 0.75 intensity units/pixel, entry rise at least 6 and an outward fall of at least 6. At least 55% of all directions must satisfy that colour-pair test before fitting.

Only locally supported samples enter a **free ellipse fit**. Two rounds of residual filtering retain samples within 0.035 normalized residual. At least **75% of the 144 directions** must remain supported, and the **largest contiguous unsupported arc must not exceed 35 degrees**. At least 50% of all directions must both survive filtering and satisfy the weaker paired-colour test. These requirements prevent a short attractive arc or unrelated colour evidence elsewhere from establishing an opening.

Eight additional fits each omit one angular sector; their diameter spread must be no greater than **0.2 mm**. Accepted proposals must come from **both kernel sizes**, agree in diameter within **0.35 mm**, and have maximum center separation no greater than **2% of the smallest fitted image diameter**. The original final grayscale sharpness/contrast, circularity, clipping, scale, perspective and ambiguity checks still apply.

This is **bounded inference across gaps**, not a claim that the complete contour was observed. `diagnostics.observedFraction`, `maxUnsupportedArcDegrees`, `supportedPairFraction`, `jackknifeSpreadMm`, `seedSpreadMm`, `seedKernelCount` and `seedCenterSpreadPx` expose its evidence limits. For this path the interface draws the fitted ellipse as a thin dashed outline and overlays supported samples as green dots. The full ellipse includes inferred segments; supported sample coordinates remain available in the local result. The interface reports observed support separately from the check that the ring stays in frame. A visually plausible completed ellipse is not independent proof of the hidden boundary or physical accuracy.

## Competing inner boundaries

A narrow decorative ridge can be sharper and warmer than the actual opening. Before a warm-rim measurement is published, the engine looks for a separate reliable boundary inside it. This includes both weakly coloured inner walls (chroma thresholds 12 and 18) and neutral inner walls (local grayscale thresholds in increments of 8). An inner edge must repeat across thresholds, have a stable fit, a sharp directional step, and be more than 0.5 mm smaller than the proposed ridge. The grayscale check additionally requires the competing contour to remain wholly inside the proposed rim, rather than meeting or crossing it like many displaced illumination boundaries.

These checks are **refusal cues only**. Their lower 12/255 contrast threshold does not lower the 32/255 contrast required for a measured diameter. A competing coloured or neutral inner boundary returns `ambiguous_boundary`; the detector does not substitute that boundary or the decorative outer ridge as an answer. Independent tests include a separately defined 18 mm analytic aperture inside a stronger 24 mm ridge, with both coloured and neutral inner walls, weak contrast, and an oval hole. This protection remains a conservative image heuristic, not semantic recognition of arbitrary jewellery.

OpenCV memory objects are deleted after each operation. The bundled OpenCV.js runtime executes locally. No image or image-derived measurement is submitted to an external model or paid processing API.

## Uncertainty

The displayed uncertainty is an **engineering estimate**, not a validated confidence interval or a claim of accuracy on physical rings. It adds:

- two pixels converted to millimetres for localization and scale quantization;
- 1% of diameter as an assumed print/geometry allowance;
- half the cross-threshold spread;
- the normalized fit residual multiplied by diameter.

The result is rounded upward to 0.1 mm, with a minimum estimate of ±0.3 mm. These allowances cannot bound an incorrectly printed marker, objects in different planes, or error in the inferred portions of a partial rim. The jackknife and seed-agreement checks test sensitivity within this estimator; they are not independent physical uncertainty measurements. Some current jewellery estimates differ from the approximate user reference by more than their displayed uncertainty. The reference and print scale are not precise enough to attribute that difference, but the estimate must not be represented as a validated bound. Synthetic fixtures exercise geometry and rejection logic; they do not prove physical-world accuracy.

## Rejections and limits

The engine returns no diameter when scale is absent/ambiguous, resolution is insufficient, perspective is excessive, sufficient rim evidence cannot be established, multiple openings or conflicting inner boundaries exist, the contour is clipped or noncircular, the edge is blurry/low contrast, or estimates disagree. The reason and retake advice are returned as structured data.

The prototype does not establish a supported operating envelope for gemstone settings, nearly transparent or highly reflective rings, patterned/dark backgrounds, shadows mistaken for metal, extreme wide-angle distortion, very small images or objects outside 8–30 mm. Printed ring cutouts and generated circles must be labelled as such. Real-ring and independently measured physical-object validation remains a separate requirement.

## Engine API

`RingMeasureEngine.analyze(cv, { data, width, height })` accepts decoded RGBA pixels and a ready OpenCV.js module. It returns `status: 'ok'` with `diameterMm`, `uncertaintyMm`, marker and ring overlay geometry, quality checks, diagnostics and measured engine processing time. Rejections return `status: 'retake'`, a machine-readable code, message and guidance. `metrics.processingMs` measures the engine only; the interface separately measures image-to-useful-result latency including decode and runtime readiness.

The classic worker accepts `{ type: 'analyze', imageData, requestId }` and emits `ready`, `progress`, `result` or `error` messages. Emscripten's self-resolving thenable is wrapped in an ordinary object during initialization to avoid Promise-assimilation loops.
