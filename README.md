# Forma — ring measurement from a photograph

A mobile-friendly, browser-local prototype for the Codebridge Product Builder assignment. Upload an existing JPG, PNG or WebP showing one flat circular ring beside the supplied printed **20 × 20 mm** marker. The app automatically recognises the marker and measures the inner opening. No camera access, diameter entry or manual calibration.

## Run

Requires Node.js 20 or newer. The browser application has no install step and uses the checked-in OpenCV.js runtime.

```sh
npm start
```

Open **http://127.0.0.1:4173**. Always serve over HTTP/HTTPS; do not open `index.html` as a file, because the worker needs a proper origin. Set `PORT` if 4173 is occupied.

For development checks, install the pinned development dependencies (Node 20.9 or newer is required for the photo decoder and transformed-marker regression):

```sh
npm ci
npm test
npm run evaluate
npm run build
```

`npm run fixtures` regenerates the original nine analytic fixtures and separate expected outcomes. Run `npm run fixtures:edges` afterwards to regenerate the five transformed edge cases. Do not change expected outcomes after observing actual outputs without recording why. `npm run evaluate` writes `docs/SYNTHETIC-RESULTS.json`. The static build goes in `dist/`; any static HTTP host can serve it.

## Use

1. Download `web/marker.svg` through **Get the marker**. Print at **100% / actual size**, not fit-to-page. Verify the outer black square is **20 mm on each side with a physical ruler**. The white quiet area and text are not part of the measured square.
2. Lay one plain circular ring flat on a light, matte surface. Keep the marker flat and separate, immediately beside it in the same plane. Use diffuse light, sharp focus, little lens distortion, and a near-overhead view.
3. Upload the original image. Keep the entire ring and marker visible. The supported original formats are JPEG, PNG and WebP, at most20 MB and40 megapixels. The browser downsamples to at most1600 pixels on the longest side.
4. Inspect the marked inner edge and scale reference. A quality failure produces retake instructions instead of a diameter. Select a new file to correct the input.
5. The displayed US size uses the linked Tiffany chart, nearest published diameter, exact ties upward. The chart ends at14.1 and22.2 mm; no sizes are extrapolated.

## Validation status

**Physical accuracy is not yet validated.** The included examples are explicitly labelled synthetic geometry, not photographs of independently measured objects. On these idealised inputs, small numerical error only verifies the geometry pipeline. It does not establish performance on reflective jewellery, shadows, printer error or real camera optics.

The displayed uncertainty is an engineering estimate, not a confidence interval or tested physical error bound. The prototype supports a well-defined dark band, or a continuous warm-coloured metal rim, on a light matte surface. The metal-rim path checks paired local colour transitions around the opening so that a bright patch inside a shadow does not automatically become the measured boundary. Broad circular bands and flat washers can be detected when their outer-to-inner diameter ratio is at most 3:1. Pale/silver metal, strong reflections, stones, transparent bands, patterned backgrounds, fingers, non-circular/raised rings and strong perspective may still be rejected or unreliable. Objects must really share a plane; a single image cannot prove that assumption.

The existing jewellery-photo results, failures and differences from the user's approximate references are recorded in [docs/JEWELLERY-VALIDATION.md](docs/JEWELLERY-VALIDATION.md). Those references are never passed to the detector. The compensated marker targets a physical 20 × 20 mm, but its actual printed dimensions remain unverified. [docs/PHYSICAL-VALIDATION.md](docs/PHYSICAL-VALIDATION.md) explains the limits of this evidence and the separate requirements for a future accuracy claim.

Private local photo sets can be evaluated without adding images to the repository:

```sh
node scripts/evaluate-local.cjs artifacts/my-set/manifest.json --output-dir artifacts/my-set/run-1
```

The script documents the manifest format in its header, records original hashes and overlays, and compares optional approximate references only after analysis. Keep its inputs and outputs in ignored `artifacts/`. These Sharp/core results are separate from browser canvas and end-to-end UI measurements.

## Architecture and privacy

- `web/app.js`: file validation, image decode, UI, annotated canvas, report export.
- `web/measurement-worker.js`: lazy OpenCV initialization and background processing.
- `web/engine.js`: automatic marker recognition, constrained planar homography, inner-contour fit and quality gates. It receives only pixels and dimensions, never filenames or expected answers.
- `web/sizing.js`: documented Tiffany table and explicit nearest-entry rule.
- `web/hero-ring.js` and `web/hero-ring.css`: decorative studio-lit 3D gold band on the landing page, including mobile, pause/play and reduced-motion support. Rendering runs locally without additional packages or asset downloads and suspends when the scene is not visible.
- `web/vendor/opencv.js`: checked-in OpenCV4.10.0, packaged by `@techstark/opencv-js@4.10.0-release.1`; Apache2.0 licence beside it.
- `scripts/`: static server/build, reproducible fixtures and evaluation.
- `tests/expected.json`: separate analytic ground truth, never requested by the app.

Photos are not transmitted to a server or saved by the app. The application has no separate account system, analytics, inference API, speech service, payment, database or camera permission. The owner-only Site hosting requires sign-in, serves application assets and has ordinary access logs. The sizing source link opens the external publisher's page only when selected.

## Timing and cost

The UI measures the actual operation from upload/decode through useful result; cold engine initialization may add latency. The Node evaluation report separately measures image decode and processing and excludes the runtime's cold download/startup. Timings depend on the device and image.

No per-image paid recognition, reasoning, speech, retry or intermediary services are called: **USD0 in paid API charges per image** under this architecture. This is not a claim of zero overall resource cost. Device energy is not priced. Hosting, bandwidth (including the roughly10 MB runtime) and development tooling costs are separate. No free API credits are assumed.

See [docs/ALGORITHM.md](docs/ALGORITHM.md), [docs/SOURCES.md](docs/SOURCES.md) and [docs/DELIVERY.md](docs/DELIVERY.md). The hosted preview is private by default; reviewer access must be arranged before submission.

## Real internet photograph checks

Four original JPEG files from Wikimedia Commons are retained in `tests/real-inputs/`, with source pages, author credits, licence links and expected outcomes in `tests/real-photo-manifest.json`. `tests/real-photo-downloads.json` records the original-file SHA256 values. Images are not composited with a marker or otherwise changed on disk.

The development-only decoder for this check is pinned to `sharp0.35.5` (Node20.9+ required for this optional test tooling); it is not shipped to the browser. To reproduce:

```sh
npm ci
node scripts/download-real-photos.mjs
npm run test:real
```

This runs the application measurement engine on actual decoded photograph pixels. The historical Commons report records that browser UI automation was unavailable during that 2026-10-31 follow-up; its timings are Node read/decode/engine timings, not browser end-to-end measurements. Browser QA was subsequently performed for the current jewellery set. Resampling by Sharp can differ from browser canvas. The Commons run checks safe refusal on unsupported images, not real-world diameter accuracy. See `docs/REAL-PHOTO-VALIDATION.md` and `docs/REAL-PHOTO-RESULTS.json`.
