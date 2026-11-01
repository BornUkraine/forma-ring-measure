# Physical validation — existing evidence and accuracy limits

Updated: 2026-11-01 (Europe/Kyiv).

**Real photographs have been tested; physical measurement accuracy has not been established.** These are different statements. Exploratory measurements and refusals are useful evidence about the application, but the current print-scale and reference-measurement information cannot support a calibrated error bound. The generated scenes in `web/samples/` remain explicitly synthetic software regressions.

## Evidence already supplied

The current work uses the existing photographs and already reported measurements. It does not ask the user for more photographs, repeated readings or another print.

| Object / case | Existing inputs | Independent comparison information |
| --- | --- | --- |
| Ordinary gold ring with wavy band | Photos 1–4 of the `2026-11-01_11-04-10` batch | User reported approximately 1.6 cm = **16 mm** internal diameter |
| Ring with protrusions | Photos 6–8 of the same batch | User reported approximately 1.7 cm = **17 mm** internal diameter |
| Ambiguous scene | Photo 5, both rings visible | Expected refusal; no single reference diameter applies |
| Supplementary flat washer | Existing `2026-10-31_20-06-53` batch | User reported approximately 1 cm = **10 mm** opening |
| Thick ring and unsupported images | Existing private attachment photos, public no-marker photos and labelled synthetic fixtures | Refusal regressions; no accepted diameter is required |

The reported ring diameters are independent of the algorithm, but their instrument, resolution, repeated readings and uncertainty were not supplied. They are approximate references, not precision ground truth. The detector receives only pixels and image dimensions. Filenames, object identity, expected outcomes and reference diameters must never be passed to contour detection or used to tune a result to a known answer.

Actual outcomes, visual contour observations and comparisons for the current jewellery run are in [JEWELLERY-VALIDATION.md](JEWELLERY-VALIDATION.md). Earlier observations are in [VERIFICATION.md](VERIFICATION.md). The reports retain all tested inputs, including refusals and discrepancies.

## Marker identity and scale

The photographs show the **new compensated print**. The **21.62 mm** dimension printed in its explanatory text describes the file size before printer shrinkage. The intended physical black square is **20 × 20 mm**. Its actual printed width and height have not been independently confirmed.

The old print with an **18.5 mm** black square was discarded. It is historical information about the reason for compensation, not the scale of the current photographs. Neither 18.5 mm nor 21.62 mm should replace the engine's specified 20 mm marker assumption for the current run.

Marker recognition verifies the encoded pattern and image geometry; it cannot establish the physical dimensions of a sheet from the image alone. A scale error affects every reported diameter proportionally. For a uniformly scaled marker with actual side length `L`, a reported diameter based on 20 mm would scale by `L / 20`. The current value of `L` is unknown, so no numerical correction is justified. Unequal print scaling in the two directions would require more than that single factor.

## How the existing evidence is evaluated

1. Preserve original input files and their SHA256 hashes. Keep private photographs, manifests and derived images out of the public repository and deployment archive.
2. Record the engine version, source hash and source commit state. Keep the earlier run intact when producing a new report.
3. Run each original through the production engine. The local evaluator follows the app's EXIF orientation, white background and maximum 1600-pixel dimension, using Sharp for decoding. Its Lanczos3 interpolation can differ from browser canvas; report local-core and actual-browser results separately.
4. Inspect the marker and inner-edge overlays visually. A number close to the approximate reference is not a successful detection if the contour follows a shadow or a reflection instead of the metal's inner edge.
5. After analysis, record the difference from the approximate reference for an accepted result. Label it **difference from an approximate reference**, not validated measurement error. For a refusal, use **N/A — no diameter**. An unexpected rejection of a normal input remains a failed measurement attempt.
6. Retain marker, perspective, blur, clipping, boundary stability and ambiguity checks. Photo 5 must not publish a diameter chosen arbitrarily from two rings. Test the known washer and thick-ring cases as regressions.
7. Record the observed time to a useful result in the browser. Record local decode and engine time separately; identify cold initialization, resampling differences and any skipped checks. No paid per-image inference API is used by this implementation; device compute and hosting/bandwidth are separate costs.

The public local runner is `scripts/evaluate-local.cjs`. Its manifest and output directory belong in ignored `artifacts/`. It stores source/input hashes, results, overlays and timings; optional approximate references are compared only after `engine.analyze` returns. A new output directory preserves earlier evidence.

## What remains unvalidated

The current data do not establish:

- The actual dimensions or dimensional uniformity of the replacement marker.
- Precise internal diameters or uncertainty of the two jewellery references.
- The displayed uncertainty as a statistical confidence interval or physical error bound.
- Accuracy across different cameras, lighting, reflective materials, raised/thick rings or camera distortion.
- That the ring's measurable edge and the marker lie in the same physical plane merely because both appear in one image.

A future accuracy study would need independently documented marker dimensions and object references, a predeclared acceptance criterion, and evaluation on photographs held separate from algorithm development. Those are conditions for a stronger future claim, not a request to repeat the present user's inputs. The current delivery reports the available exploratory evidence and these limits honestly.
