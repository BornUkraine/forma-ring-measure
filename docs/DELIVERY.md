# Delivery notes — Forma prototype

Date:2026-10-31 (Europe/Kyiv). New prototype built for the supplied assignment. The core flow is an existing-photo upload; there is no camera integration.

## What is delivered

- Mobile-friendly English interface, local JPEG/PNG/WebP upload, explicit print/capture instructions, downloadable20 mm encoded marker.
- Automatic marker identity/scale detection and inner-ring contour measurement; annotated image; US size conversion with a named primary source and a documented rounding policy.
- Actionable refusals for missing/ambiguous marker or ring, insufficient resolution, excessive perspective, a non-circular opening, blur/low contrast and unstable boundaries.
- On-device worker, measured operation latency, no per-image paid API, JSON result export and synthetic demo inputs processed by the same detector as new photos.
- Reproducible analytic test inputs, expected outcomes kept separate, automated checks and recorded actual outputs.

## Evidence and unfinished assignment items

See `SYNTHETIC-RESULTS.json` for actual expected/observed results, absolute diameter errors and timings. All included generated images are synthetic. Analytic ground truth was specified in the fixture generator before evaluation. They are not evidence of real-object measurement accuracy.

**Exploratory follow-up:** private real photographs of a broad washer and a thick ring were tested. A candidate-width filter was corrected without changing the quality checks. Two washer photographs were accepted in the ordinary browser flow, displaying10.0 mm and9.8 mm; the ring inputs were declined. Full observations and evidence limits are summarized in `VERIFICATION.md`. Original user photos and detailed reports remain private local evidence rather than public repository fixtures.

**Outstanding:** complete the protocol for at least two independently measured physical objects with a physically verified marker, record raw ground truth separately and retain the expected/actual outcomes and errors. Confirm the final print scale and obtain a second accepted physical-object case before treating the requested accuracy evidence as complete. Then revise supported conditions and any uncertainty claim from that evidence. There are currently no invented caliper readings or fabricated real photos.

The static demo/repository can be reviewed now. A complete hiring submission additionally needs reviewer access, real-object evidence and a recorded walkthrough. A ready-to-record script is supplied in `VIDEO-SCRIPT.md`. No submission form has been sent.

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
