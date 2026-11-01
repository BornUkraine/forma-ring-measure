# Jewellery photographs — 2026-11-01

Engine **1.2.0**, engine-file SHA256 `eaf6e53ace7c4fe47d2a1107240ea72a33946e4d842edbe2d365a2c0c5d039f9`. This is an exploratory development set, not a held-out accuracy study. All eight supplied original JPEGs were processed; no photograph was selected away after a failure. The earlier engine 1.1.0 refused all eight.

## Changes verified

- A supplementary warm-metal path identifies a closed rim at multiple colour thresholds, then checks the local rise into metal and fall out of it at 96 positions. It fits a free ellipse rather than forcing the opening to be circular. The previous circularity, blur, resolution, perspective and threshold-agreement limits remain in place.
- Unconfirmed coloured rims cannot fall back to measuring a smaller circular shadow. An independent synthetic regression reproduces that false acceptance and verifies refusal.
- An additional substantial coloured object vetoes measurement even if its opening cannot be read. Photo 5 now reports ambiguity.
- Calibration candidates must lie at the outside black-to-paper transition. Previously, the straighter nested adaptive contour could win over the actual outer marker edge. Visual review found this on photo 2. A separate synthetic 23 mm case reproduces the bug: the old selection measured 26.365 mm; the corrected selection measures 22.966 mm.
- The rendered ellipse is scaled to the same diameter that is reported. The result card explicitly states the physical 20 mm marker assumption.

## All eight outcomes

The browser column comes from normal native file-chooser uploads and the application's downloaded JSON reports. The Sharp column runs the same production engine with a separate decoder. Numbers below are unrounded estimates rounded only for this table; the UI displays one decimal place.

| Photo | Object / approximate independent reference | Browser result (mm) | Sharp/core (mm) | Browser difference from reference (mm) | Browser time to result (ms) | Engine only (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Ordinary wavy gold ring / approximately 16 | 17.045 | 17.047 | +1.045 | 2895 | 2377 |
| 2 | Same ordinary ring / approximately 16 | 17.303 | 17.308 | +1.303 | 1758 | 1650 |
| 3 | Same ordinary ring / approximately 16 | 17.000 | 16.994 | +1.000 | 1912 | 1755 |
| 4 | Same ordinary ring / approximately 16 | 17.136 | 17.008 | +1.136 | 1671 | 1582 |
| 5 | Two rings | Refused: `multiple_rings` | Same refusal | N/A | 1738 | 1633 |
| 6 | Ring with protrusions / approximately 17 | Refused: `ring_not_found` | Same refusal | N/A | 1598 | 1470 |
| 7 | Same ring with protrusions / approximately 17 | Refused: `ring_not_found` | Same refusal | N/A | 1739 | 1631 |
| 8 | Same ring with protrusions / approximately 17 | Refused: `ring_not_found` | Same refusal | N/A | 1606 | 1492 |

**4/8 produce estimates; 4/8 refuse.** Among the seven single-ring photos, 4/7 produce estimates. The desired success on the second jewellery object is not achieved. Its approximately 17 mm reference cannot be compared with a nonexistent estimate. The ambiguity case is a correct refusal, not a measurement success.

All eight final overlays were inspected. On 1–4 the ellipse follows the visible inner metal rim rather than the displaced boundary between lit and shadowed paper. The true contour is mildly wavy, so the displayed ellipse is an approximation. Marker outlines follow the outside black square, including the corrected photo 2. Photo 5 visibly contains two objects. Photos 6–8 retain a marker overlay but no claimed ring contour or diameter. Experiments with short edge arcs or morphological closing did not establish a stable complete metal boundary on those inputs; a low ellipse-fit residual on a short arc was insufficient evidence and was not accepted.

## Interpretation and limits

The user supplied approximate inner diameters of **16 mm** and **17 mm** independently. They were stored separately and compared only after `analyze(cv, pixels)` returned. Neither filenames nor references enter contour search. These are approximate references, with unspecified instrument resolution and uncertainty; the differences above are comparisons, not calibrated accuracy errors.

The new print is the compensated replacement. **21.62 mm is the pre-print file dimension; the intended physical square is 20 × 20 mm.** Its actual printed width and height remain unconfirmed. The old 18.5 mm print was discarded and is not the scale for this set. The algorithm always assumes the specified physical 20 mm marker and does not read or calibrate from the text on the sheet.

The accepted ordinary-ring results are about **1.0–1.3 mm larger** than the approximate 16 mm reference. Their displayed provisional uncertainty is only **±0.6–0.7 mm**, which does not cover that difference if 16 mm were exact. This demonstrates why the uncertainty cannot be treated as a validated error bound. Print error, height/plane mismatch, contour localization, optics and reference uncertainty cannot be separated by this small set. No physical accuracy or reliable ring-size recommendation is established. The new warm-metal path is not general support for pale/silver rings, thick walls, stones, irregular settings or all lighting conditions.

Sharp and browser interpolation differ. Photo 4 differs by about 0.13 mm between those paths; the results are retained separately. Browser timing includes decode, worker readiness and measurement, excluding file selection. Photo 1 is the first operation after page reload; assets may already be cached. Later operations take approximately 1.6–1.9 seconds on this computer. These are observations, not a phone/network latency guarantee. No paid recognition API is called.

## Regressions and interface

- **40/40 automated tests pass**, including independent warm-metal/shadow scenes, the circular-shadow false-acceptance regression, marker-boundary selection, and the previous quality gates.
- **14/14 analytic fixture evaluations match expectations.** The largest accepted error in that small synthetic set remains approximately 0.27 mm. This is not real-photo accuracy.
- All **17 available real regression statuses and codes are preserved**: eight washer photos (three Sharp accepts, five blur refusals), five thick-ring photos (`non_circular`), and four original internet photographs without the marker (`missing_marker`). Selecting the actual marker edge changes the accepted washer estimates to 10.057, 9.829 and 9.853 mm; this is recorded, not represented as numerical identity with 1.1.0.
- The actual browser upload of the required washer photo 6 displays **9.8 mm** (unrounded 9.765 mm), compared with the user's approximate 10 mm. The size remains outside the published chart. A blurred washer returns `blur`; an original thick-ring photo returns `non_circular`, both without a diameter.
- Upload, replacement after a refusal and JSON export work. Result and refusal layouts were inspected at **390 × 844 CSS pixels**, and the wide result at **1440 × 900**, with no horizontal overflow. This is desktop-browser viewport testing, not a physical-phone performance test. Temporary viewport overrides were reset. No application console errors were observed; unrelated browser-extension warnings were excluded.
- `npm run build` produces the static application. The runtime remains in a browser worker and processes pixels locally.

## Evidence and delivery

Public numerical data: [JEWELLERY-RESULTS.json](JEWELLERY-RESULTS.json). Private originals remain in their existing local Downloads/attachment locations. Hash records, original browser reports, screenshots and overlays stay in ignored `artifacts/mother-rings-v2-20261101/`. Its `baseline/`, `after/` (intermediate pre-marker fix) and `final/` folders preserve the investigation rather than overwriting it. The final engine hash is recorded in the local and public reports. The five original thick-ring files were available; later 13- and 18-photo original batches were absent at their recorded paths and were not claimed as rerun.

The existing set is sufficient to demonstrate the implemented flow and its limitations without requesting new photos or repeated measurements. The remaining submission steps are a recording using [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md) and arranging reviewer access. The existing Site remains owner-only. Full support for the protruding ring and validated physical accuracy remain unfinished engineering/evidence work and must not be claimed as delivered.
