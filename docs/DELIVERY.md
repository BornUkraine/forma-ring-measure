# Delivery notes — Forma prototype

Updated: 2026-11-01 (Europe/Kyiv). Existing Forma / RingMeasure prototype continued for the supplied assignment. The core flow is an existing-photo upload; there is no camera integration.

The [mobile upload follow-up](MOBILE-UPLOAD-FIX.md) records fixes prompted by the supplied phone recording: direct repeat selection, preserved results on picker cancellation, bounded decoding, clearer refusals and readable mobile results. Engine **1.3.0** additionally measures the protruding ring in photos 6 and 8: the browser displays **17.6 and 17.8 mm**. Photo 7 remains unsupported; photo 5 correctly refuses two objects. All **61 automated tests** pass. The UI distinguishes supported edge points from the fitted outline across small gaps. Physical accuracy remains unvalidated; see [JEWELLERY-VALIDATION.md](JEWELLERY-VALIDATION.md).

## What is delivered

- Mobile-friendly English interface, local JPEG/PNG/WebP upload, explicit print/capture instructions, downloadable20 mm encoded marker.
- Automatic marker identity/scale detection and inner-ring contour measurement; annotated image; US size conversion with a named primary source and a documented rounding policy.
- Actionable refusals for missing/ambiguous marker or ring, insufficient resolution, excessive perspective, a non-circular opening, blur/low contrast and unstable boundaries.
- On-device worker, measured operation latency, no per-image paid API, JSON result export and synthetic demo inputs processed by the same detector as new photos.
- Reproducible analytic test inputs, expected outcomes kept separate, automated checks and recorded actual outputs.

## Evidence and unfinished assignment items

See `SYNTHETIC-RESULTS.json` for actual expected/observed results, absolute diameter errors and timings. All included generated images are synthetic. Analytic ground truth was specified in the fixture generator before evaluation. They are not evidence of real-object measurement accuracy.

**Exploratory real-photo evidence:** the existing private photographs of a broad washer and a thick ring are retained for regression checks. Work continued on 2026-11-01 with eight already supplied photographs of two jewellery rings, including one photograph containing both rings. The latest per-photo outcomes, contour observations, timings and comparisons are recorded in [JEWELLERY-VALIDATION.md](JEWELLERY-VALIDATION.md); earlier runs remain documented in [VERIFICATION.md](VERIFICATION.md). A rejection is recorded as a rejection, not a zero-error measurement or proof that the physical ring is oval.

The user independently reported approximate inner diameters of **16 mm** for the ordinary wavy ring and **17 mm** for the ring with protrusions. These values are comparison metadata and never contour-search inputs. They are approximate references, not calibrated ground truth. Original photos, local manifests, detailed reports and image overlays remain private in ignored `artifacts/` or their existing local locations. They are not public repository fixtures. The public `scripts/evaluate-local.cjs` can reproduce a local manifest run without embedding private paths or photographs.

**Physical accuracy remains unvalidated.** The current photographs use the compensated replacement marker. Its **21.62 mm** file dimension was intended to become **20 × 20 mm** after printer shrinkage; the actual width and height of the new print are unconfirmed. The old **18.5 mm** print was discarded and must not be used as the scale for these photos. Numerical agreement with an approximate ring reference cannot validate an unknown print scale or the displayed provisional uncertainty. [PHYSICAL-VALIDATION.md](PHYSICAL-VALIDATION.md) separates the existing exploratory evidence from what would be needed for a future accuracy claim. This delivery uses the existing images and measurements; it does not require the user to repeat them.

The static demo and repository can be reviewed with these limitations. Before submission, a walkthrough recording and reviewer access still need to be arranged. The existing Site is **owner-only**, with no external visitors configured at the latest access check; its audience has been preserved. A public GitHub repository does not grant access to the hosted Site. The Russian script in [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md) targets 2 minutes 45 seconds. The available brief does not explicitly require voice narration, English narration, a face camera or Railway. No submission form has been sent.

## Reuse and original work

Reused: OpenCV4.10.0 through the pinned TechStark package, unmodified10,378,215-byte runtime; SHA256 `19b46167b59efbef9cc3836264b0b657110833e4b1df84282004b8b3141c048d`; Apache2.0 licence bundled. `pngjs7.0.0` is a development-only PNG encoder/decoder used for analytic tests. Tiffany's published chart is the ring-size data source; source attribution is visible in the app.

Original: encoded marker design and generator, automatic marker matching, conservative quality rules, measurement integration and uncertainty estimate, worker/UI integration, interface and guidance, reproducible scene generators, tests, evaluation and documentation. No existing finished ring-measurement product was submitted as new work.

## AI tools and output checking

Development used Codex desktop and parallel Codex agents for the measurement engine, frontend and source verification. The agent configuration identifies the GPT-6 model family; the exact deployed model identifier is not exposed in this session and must be copied from the user's model selection before final submission. Do not replace this statement with a guessed identifier.

TinyFish Search and Fetch checked Tiffany's official sizing guide and OpenCV primary documentation. Node24.5.0 was used for local tests. OpenCV is conventional computer vision and does not call a model at inference time. No generative image tool was used for test evidence.

Example verification: expected17/18/20 mm analytic openings were defined in a separate generator, then the same detector used by the application processed the resulting pixels without receiving the expected diameter. Unsupported inputs were tested for refusal. An integration review also caught and corrected Emscripten's self-resolving thenable initialization, which otherwise could hang the worker.

## Cost assumptions

Per operation: no paid recognition/reasoning/speech/retry/intermediary API calls, so USD0 paid API variable charges. User device computation/energy is not priced. Hosting and delivery bandwidth are separate, account/plan-dependent expenses; free credits are not counted as zero-cost inference. No untested throughput or latency target is promised.

## Work log

Implementation began around00:38 on2026-10-31 Europe/Kyiv. The final verification entry records the observed completion time and elapsed session work, not a claim of eight hours spent. The assignment's target is at most eight focused hours; any remaining work is identified above.
