# Verification record

Latest verification: **2026-11-01, engine 1.2.0**, using Node 24.5.0 and the connected Chromium-based in-app browser. See [JEWELLERY-VALIDATION.md](JEWELLERY-VALIDATION.md) and [JEWELLERY-RESULTS.json](JEWELLERY-RESULTS.json) for all eight new photo outcomes: four measurements, one ambiguity refusal and three unresolved ring detections. All 40 tests and 14 analytic evaluations pass; the 17 available real regression statuses/codes are preserved. Browser uploads, report export, refusal recovery, 390 × 844 mobile and 1440 × 900 wide layouts were checked. The marker and metal-boundary changes are described in [ALGORITHM.md](ALGORITHM.md).

The sections below preserve the **historical 2026-10-31 record**. Their timings and measurements describe those earlier runs, not the current engine.

## Automated checks

`npm test`: **28 passed,0 failed**. These include14 original image cases,8 additional broad-annulus pixel cases, repeated anonymous pixel input, all21 table entries and20 midpoint boundaries, invalid/out-of-range conversions, and both ready/deferred worker initialization branches. The worker regression specifically exercises Emscripten's self-resolving module without allowing a recursive-assimilation hang.

`npm run evaluate`: **14/14 analytic/synthetic image cases match their predefined expectations**. Per-image expected/actual diameter, absolute error, refusal code and measured latency are recorded in `SYNTHETIC-RESULTS.json`. Successful image cases include known17/18/20 mm openings,90°/27° rotations and mild planar perspective. The largest observed error in this small synthetic set is approximately0.27 mm for the projective scene. None of these are physical measurements or a demonstrated real-camera error bound.

`npm run build`: successful static output, including the vendored runtime, marker, examples and documentation.

## Browser checks

- Cold example selection:17.0 mm, marker and inner-boundary annotations, provisional±0.5 mm estimate, US6.5,606 ms observed end-to-end operation on this device.
- Native file-chooser upload of a second image:20.0 mm, US10.5, matching overlays,70 ms warm operation.
- Replacement with a missing-marker input: actionable retake instruction; no diameter or ring size published.
- A deliberately corrupt `.png` selected through the native file chooser: clear decode error and working upload recovery.
- Tiffany source/table dialog: published entries visible, explicit nearest-entry/tie-up rule.
- Downloaded JSON report: successfully saved and inspected; contains measurements, dimensions, source, assumptions and observed timing, no image pixels.
- Narrow mobile viewport measured at390×844 CSS pixels: no horizontal overflow; stacked photo and result remain usable.
- Temporary viewport override reset after mobile checks. No camera API, capture attribute or camera permission flow exists.

Browser observed timings describe these exact local operations only. They do not establish a production latency target. The first operation includes local runtime initialization; this localhost test does not simulate mobile bandwidth downloading the roughly10 MB OpenCV asset.

## Landing animation update

Added a locally rendered WebGL wedding band with a bevelled profile, warm studio reflections, gentle rotation/tilt and a soft shadow. The mobile layout includes the scene at200 CSS pixels high. An SVG illustration remains available when WebGL is unavailable.

Observed in the browser: renderer enters `webgl`, motion starts as `playing`, Pause changes the state to `paused` and its accessible label to Play; Play resumes `playing`. Reduced-motion handling and visibility/intersection suspension are implemented in the isolated renderer. The ordinary synthetic example still produces17.0 mm through the original upload/worker flow after this decoration was added. `node --check web/hero-ring.js` passed. Desktop and narrow mobile compositions were visually checked.

## Exploratory physical-object follow-up

On2026-10-31, five privately supplied photographs of a thick ring and eight of a flat washer were evaluated without modifying their original JPEGs. Reports and overlays are retained locally in ignored `artifacts/`; the private photographs are not included in this repository. This was exploratory debugging, not a preregistered accuracy experiment.

The original detector refused all five ring inputs as noncircular. It also refused all eight washer inputs: six before a stable opening was found and two for blur. Investigation found an arbitrary outer-contour/opening area limit of4.5 excluded the real washer's ratios of approximately4.85–5.18. Version1.1.0 raises that bounded candidate limit to9 (outer/inner diameter ratio3:1). Circularity, concentricity, resolution, sharpness, ambiguity and threshold-agreement checks are unchanged. Eight independent analytic pixel regressions cover two broad circular openings and six unsupported cases; they do not use the user's images or reference diameter.

After the correction, the ordinary browser upload flow accepted two of eight washer photographs: photo6 displayed **10.0 mm ±0.5 mm** and photo7 **9.8 mm ±0.5 mm**, with marker and inner-boundary overlays inspected. The other six were refused for blur. Browser operation times were124–496 ms in this session, including a cold first run. A separate Sharp/core run accepted three inputs (photos2,6,7); photo2 is close to the sharpness cutoff and the browser's different resampling rejected it. These decoder-dependent results are retained separately rather than represented as identical evidence. The five earlier ring photographs remain rejected as noncircular.

An additional13 original ring photographs were then evaluated with unchanged version1.1.0 at source commit `48c2a2d9003a34d3375221bca513607e2dfb0256`. No photograph produced a diameter: ten failed circularity (corrected axis ratios0.800–0.905 against the0.93 minimum), photo7 had no stable opening, and photos11/13 had no recognized marker. This follow-up used the same core with the Sharp decoder; browser end-to-end was not repeated for this batch. The best fitted opening still followed the visible elliptical bright aperture. The evidence does not distinguish physical ovality from occlusion by a thick inner wall and does not justify lowering the circularity threshold. All original hashes remained unchanged. These13 files are also private local evidence, not repository fixtures.

The final18 original ring photographs (`20-39-51` batch) were evaluated with unchanged version1.1.0 at source commit `6547ca67a4988f6095772ac83dfa1b133a925ca9`, using the same core/Sharp path. All18 passed marker checks and returned `ring_not_found`; no diameter was published. A read-only candidate audit identified a segmentation limitation under inner-wall shadows: global thresholds did not consistently isolate the opening even when the marker was recognized. These results do not establish that all photographs were unsuitable. Original hashes remained unchanged; reports and overlays remain private in ignored local artifacts. No detector or quality threshold was adjusted for this batch.

The user reported an approximately10 mm washer opening with a ruler. The original18.5 mm print was discarded and the later photographs show the compensated replacement PDF. The replacement's actual physical width and height have not been confirmed; its identity does not establish its printed dimensions. Therefore the observed agreement is conditional on the required20 mm scale and does not establish physical accuracy, a calibrated error bound or the displayed uncertainty. The10 mm supplementary washer is outside the sourced14.1–22.2 mm size chart, so the interface correctly displays no ring size.

## Remaining evidence

At the earlier 18-photo cutoff, only the washer yielded diameter estimates. Work then continued on the eight jewellery photos supplied on 2026-11-01. The ordinary ring now produces four estimates around 17.0–17.3 mm; the ring with protrusions still produces no estimate. The approximate references and unverified replacement-print scale do not establish physical accuracy or validate the displayed uncertainty. `PHYSICAL-VALIDATION.md` distinguishes that pending accuracy claim from the real exploratory evidence already collected. No new photographs or repeated reference readings are requested for this delivery. A walkthrough recording and reviewer access still need to be arranged.

## Session time

Implementation and local verification ran approximately00:38–00:47 on2026-10-31 Europe/Kyiv, about9 minutes of tool-assisted wall time with parallel agents. Publication continues after this interval. This records observed session time rather than eight hours of human work; physical preparation and final recording have not been counted or completed.
