# Jewellery photographs — 2026-11-01

Engine **1.3.0**, engine-file SHA256 `b92bdde3e20cc936ffb52e8cf930320061273076c8b24903db491365c04feae6`. This is an exploratory development set, not a held-out accuracy study. All eight supplied original JPEGs were processed in the browser and with the same production engine through Sharp. No photograph was omitted after a failure. Engine 1.1.0 refused all eight; 1.2.0 measured photos 1–4; this version also produces estimates on photos 6 and 8.

## Changes verified

- The continuous warm-metal path distinguishes the rise into metal and fall out of it from displaced illumination boundaries inside the opening. It continues to measure the ordinary wavy ring on photos 1–4.
- A supplementary path proposes narrow colour ridges after removing broad colour shading. It fits a free ellipse only to locally supported samples, requires at least 75% support, limits the largest unsupported arc to 35 degrees, checks sector-omission sensitivity and requires agreement between two proposal scales. Small gaps are inferred; the algorithm does not claim to observe a complete rim on photos 6 and 8.
- Proposal thresholds cover every integer from 3 through 8. This resolved a browser/Sharp interpolation difference on photo 6 without lowering the blur, perspective, marker, circularity or support gates. All accepted metal proposals participate in the final diameter-agreement check and median.
- Separate sharp inner boundaries veto a stronger decorative outer ridge, including weakly coloured and neutral metal walls. Independent synthetic cases define an 18 mm opening inside a 24 mm ridge, and an oval opening inside a round ridge. These cases cannot publish the decorative ridge as the opening.
- Unconfirmed warm objects cannot fall back to a smaller circular shadow. Multiple substantial objects still cause refusal. The earlier correction that selects the outside black-to-paper marker edge remains in place.
- For partial-rim results the interface shows supported samples in green, a thin dashed fitted ellipse and an explanation of the inferred gaps. A continuous-looking outline alone is not presented as proof of the boundary.

The complete method and numerical gates are documented in [ALGORITHM.md](ALGORITHM.md).

## All eight outcomes

The browser column comes from normal native file-chooser uploads and the application's downloaded JSON reports on the frozen engine above. The Sharp column uses a separate decoder. Values are rounded to three decimal places only for this table; the UI displays one decimal place. References were used only for these comparisons after analysis.

| Photo | Object / approximate independent reference | Browser result (mm) | Sharp/core (mm) | Browser difference from reference (mm) | Browser time to result (ms) | Engine only (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Ordinary wavy gold ring / approximately 16 | 17.045 | 17.047 | +1.045 | 2178 | 2046 |
| 2 | Same ordinary ring / approximately 16 | 17.303 | 17.308 | +1.303 | 2427 | 2273 |
| 3 | Same ordinary ring / approximately 16 | 17.000 | 16.994 | +1.000 | 2955 | 2792 |
| 4 | Same ordinary ring / approximately 16 | 17.136 | 17.008 | +1.136 | 2048 | 1925 |
| 5 | Two rings | Refused: `multiple_rings` | Same refusal | N/A | 2883 | 2733 |
| 6 | Ring with protrusions / approximately 17 | 17.648 | 17.675 | +0.648 | 5432 | 4387 |
| 7 | Same ring with protrusions / approximately 17 | Refused: `ring_not_found` | Same refusal | N/A | 4322 | 4176 |
| 8 | Same ring with protrusions / approximately 17 | 17.780 | 17.793 | +0.780 | 3303 | 3190 |

**6/8 produce estimates; 2/8 refuse.** Among the seven single-ring photos, 6/7 produce estimates. Photo 5 is a correct ambiguity refusal, not a measurement success. Photo 7 remains an unresolved measurement case; this version does not establish sufficient rim evidence to publish a diameter.

Visual review of the overlays found that photos 1–4 follow the visible inner metal rim rather than the displaced boundary between lit and shadowed paper. The mildly wavy rim is approximated by an ellipse. On photos 6 and 8 the fit follows the narrow inner lip across the supported regions rather than the larger outline containing the protrusions. Weak or reflective portions are bridged by the fit, so the complete hidden boundary is not independently verified. Marker outlines follow the outside black square. Photo 5 visibly contains two objects; photo 7 retains only the marker overlay and refusal.

The browser's partial-rim diagnostics expose the distinction between observations and inference:

| Photo | Supported samples | Largest contiguous inferred arc | Sector-omission diameter spread | Proposal diameter spread |
| --- | ---: | ---: | ---: | ---: |
| 6 | 82.64% | 25° | 0.049 mm | 0.028 mm |
| 8 | 76.39% | 22.5° | 0.049 mm | 0.174 mm |

Both cases passed the two-kernel and center-agreement checks. These are internal sensitivity checks, not independent evidence of physical accuracy. Photo 8 is relatively close to the minimum 75% support requirement. The full fitted ellipse includes inferred segments; green dots indicate the supported samples.

## Interpretation and limits

The user supplied approximate inner diameters of **16 mm** and **17 mm** independently. They were stored separately and compared only after `analyze(cv, pixels)` returned. Neither filenames nor reference values enter contour search. The instrument resolution and uncertainty are unspecified; the reported differences are comparisons, not calibrated accuracy errors.

The new print is the compensated replacement. **21.62 mm is the pre-print file dimension; the intended physical square is 20 × 20 mm.** Its actual printed width and height remain unconfirmed. The old 18.5 mm print was discarded and is not the scale for this set. The engine assumes the specified physical 20 mm marker; it does not calibrate from text on the sheet.

The browser's ordinary-ring estimates are about **1.0–1.3 mm larger** than the approximate 16 mm reference. The protruding-ring estimates are about **0.65–0.78 mm larger** than the approximate 17 mm reference. Displayed provisional uncertainty is **±0.6–0.7 mm** for the ordinary ring and **±0.6 mm** for the two accepted protruding-ring photos. Those allowances do not cover the respective differences if the approximate references were exact. They must not be treated as validated error bounds.

Print error, height/plane mismatch, contour localization, inferred gaps, optics and reference uncertainty cannot be separated by this small set. No physical accuracy or reliable ring-size recommendation is established. The additional path is limited to a visible narrow rim with sufficiently supported geometry; it is not general support for thick walls, stones, raised settings, pale/silver metal or every shadow and reflection.

Sharp and browser interpolation differ; their values are retained separately. Photo 4 differs by about 0.13 mm. The final browser run took approximately **2.0–5.4 seconds** per operation on this computer. Photo 6 was the first operation after reload. Timing includes decode, worker readiness and measurement, excluding file selection; cached assets and concurrent local work can affect it. This is not a phone/network latency guarantee. No paid recognition API is called.

## Regressions and interface

- **61/61 automated tests pass** on the frozen production engine, including the upload workflow and existing measurement quality gates.
- All **17 available real regression statuses and codes are preserved relative to engine 1.2.0**: eight washer photos (three accepts, five `blur` refusals), five thick-ring photos (`non_circular`) and four original internet photographs without the marker (`missing_marker`).
- The three accepted washer estimates are **10.057, 9.829 and 9.853 mm** with Sharp. Their unrounded values are numerically identical to the 1.2.0 baseline. The requested washer photo 6 is the 9.829 mm case; its approximate independent reference is 10 mm.
- Independent synthetic coverage includes 13 mm and 23 mm narrow-rim positives with asymmetric protrusions and broad shadows, oval holes, shadow-only scenes, short arcs, smaller circular shadows, clipping, multiple objects and competing decorative ridges. The tests use analytic geometry, not private photo references.
- The existing 14 analytic fixture evaluations still match their expected outcomes; their maximum accepted error is about 0.27 mm. Synthetic fixture accuracy does not establish real-photo accuracy.
- All eight final browser uploads produced downloadable reports. Partial-rim results and the ambiguity refusal were inspected at 390 × 844 CSS pixels without horizontal overflow. This is desktop-browser viewport testing, not a physical-phone performance test. Full automated test, build and interface checks are recorded in [VERIFICATION.md](VERIFICATION.md).

## Evidence and delivery

Public numerical data are in [JEWELLERY-RESULTS.json](JEWELLERY-RESULTS.json). Private originals remain at their existing local locations. Hash records, full browser reports, supported image coordinates, screenshots and overlays remain in ignored `artifacts/`. The current frozen-engine evidence is in `artifacts/protruding-final-20261101/core-v2/`, `browser-v2/` and `regressions-v2/`. Earlier runs in that folder and `artifacts/mother-rings-v2-20261101/` preserve the investigation, including the initial browser refusal on photo 6. The public numerical summary omits private image paths, filenames and contour coordinates.

Five original thick-ring files were available. Later 13- and 18-photo original batches were absent at their recorded paths and are not claimed as rerun. The existing set demonstrates the implemented flow and its limitations without requesting new photographs or repeated measurements.

The remaining submission steps are a recording using [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md) and arranging reviewer access. The existing Site remains owner-only. Photo 7 and independently validated physical accuracy remain unfinished; success on two images of the protruding ring is not complete support for that ring under all conditions.
