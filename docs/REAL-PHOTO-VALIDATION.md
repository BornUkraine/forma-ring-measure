# Real internet photograph validation — 2026-10-31

**Result:4/4 unsupported real photographs were refused with `retake / missing_marker`. No diameters were emitted. Physical diameter accuracy remains unverified.**

The same unchanged `web/engine.js` used by the published application processed actual decoded pixels from four downloaded JPEG originals. These are photographs, not generated circles. No calibration marker was pasted in, no answer was supplied to the detector, and the downloaded original bytes were retained unchanged.

## Actual method and limits

Connected browser automation failed with `browser.user is unavailable`; acquiring the existing tab and a fresh same-browser tab did not restore control. Consequently this follow-up uses **Node pixel decoding plus the unchanged measurement core**, not a new browser end-to-end test. The previous browser validation remains recorded separately in `VERIFICATION.md`.

The development-only `sharp0.35.5` decoder applies EXIF orientation, flattens transparency to white and fits the image within1600 pixels on the longest side. This matches the application's geometric input limits, but Sharp's Lanczos resampling can differ from browser canvas. Timings below are Node read/decode/core times, not production/browser performance.

Expected status and reason codes were written in `tests/real-photo-manifest.json` before running the detector. The source application commit is `3b5dee78f876d0b80d4a18436d83c5751518c78d`; no engine, worker or interface files were changed for these tests. The decoder is not shipped to the site.

| Original photograph | Capture conditions seen in original | Expected | Actual | Diameter / absolute error |
| --- | --- | --- | --- | --- |
| [White gold wedding ring](https://commons.wikimedia.org/wiki/File:Weddingring.JPG) | Worn on a finger; opening occluded; no supplied marker | Refuse missing marker | `retake / missing_marker` | Not produced / not measurable |
| [Traditional gold wedding ring](https://commons.wikimedia.org/wiki/File:Traditional_Wedding_Ring.jpg) | Worn on a finger; no supplied marker | Refuse missing marker | `retake / missing_marker` | Not produced / not measurable |
| [Two gold wedding rings](https://commons.wikimedia.org/wiki/File:Wedding_rings.jpg) | Two overlapping rings, oblique view; no supplied marker | Refuse missing marker | `retake / missing_marker` | Not produced / not measurable |
| [Medieval gold ring, top view](https://commons.wikimedia.org/wiki/File:Gold_medieval_ring,_top_view_(FindID_132061).jpg) | Visible opening and conventional centimetre ruler; non-circular band; no supplied encoded marker | Refuse missing marker | `retake / missing_marker` | Not produced / not measurable |

The marker check runs before inner-boundary detection. These results verify refusal at that gate; they do **not** validate ring segmentation on these real photos or establish that the later blur/perspective checks diagnosed them.

`REAL-PHOTO-RESULTS.json` contains full actual results, timings, image dimensions, source/licensing metadata, original-file hashes and expected-vs-actual checks. Four original SHA256 values were verified unchanged before and after processing and match the download receipts in `tests/real-photo-downloads.json`. The final run took about197–583 ms per file in Node, excluding separately recorded cold OpenCV startup and download time. No paid processing API was called.

## Why there is no diameter error value

None of these photographs contains the application's encoded20 mm marker. A conventional ruler, a finger or a generic square is not accepted by this implementation as that marker. The museum catalogue publishes **external diameter17.3 mm**, not the requested internal diameter, so it must not be treated as an internal ground-truth value. A photograph with an absent or unsupported reference cannot establish the app's millimetre accuracy.

A bounded search of original tutorials and repositories did not locate a qualifying real ring image with both this marker and an independently documented internal diameter. The supplied marker is custom to this project. Positive physical validation still requires new photos of at least two independently measured objects beside the verified printed marker, following `PHYSICAL-VALIDATION.md`.

## Attribution and original-file retention

- **White gold ring:** CLW, public-domain dedication. The current Commons version records a contrast edit by Hohum. [Source and licence](https://commons.wikimedia.org/wiki/File:Weddingring.JPG#Licensing).
- **Traditional gold ring:** A Minty Penguin, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). [Source](https://commons.wikimedia.org/wiki/File:Traditional_Wedding_Ring.jpg).
- **Two gold rings:** Jeff Belmonte, [CC BY2.0](https://creativecommons.org/licenses/by/2.0/); current Commons version records denoising by Hohum. [Source](https://commons.wikimedia.org/wiki/File:Wedding_rings.jpg).
- **Medieval ring:** photograph by Colchester Museums, Caroline McDonald; required attribution **The Portable Antiquities Scheme / The Trustees of the British Museum**, [CC BY-SA4.0](https://creativecommons.org/licenses/by-sa/4.0/). [Source](https://commons.wikimedia.org/wiki/File:Gold_medieval_ring,_top_view_(FindID_132061).jpg).

“Unchanged” refers to exact file bytes retained since our download; it does not undo publisher-side edits recorded on Commons. Each retained photograph keeps its original licence. The images were used for analysis, without generating new retouched or composited versions.

## Reproduce

With Node20.9 or newer:

```sh
npm ci
node scripts/download-real-photos.mjs
npm run test:real
```

The command writes `artifacts/real-photo-results.json`. The committed snapshot for this run is `docs/REAL-PHOTO-RESULTS.json`. `npm test` still passes all20 existing regressions after adding this optional verification tooling.
