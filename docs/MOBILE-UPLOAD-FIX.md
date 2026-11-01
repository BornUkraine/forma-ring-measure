# Mobile upload and results follow-up — 2026-11-01

This is the historical upload/UI verification with engine 1.2.0. Subsequent engine 1.3.0 results, including successful browser uploads of protruding-ring photos 6 and 8, are recorded in [JEWELLERY-VALIDATION.md](JEWELLERY-VALIDATION.md). The earlier outcomes and timings below are retained as evidence of that earlier version.

The supplied phone recording showed selected photos reaching the decoder and the detector. Several selected photos showed rings in a hand without the calibration marker; those refusals are appropriate. A marked photo was also refused because its inner edge could not be measured. The interface made the distinction difficult to understand: tiny text, a large decorative hero, a photo before the refusal, inconsistent replacement buttons and abrupt scroll changes.

## Changes

- Upload is visible on the first mobile screen, with a readable explanation of the ring-and-marker requirement. The decorative ring remains on desktop.
- Both replacement buttons open the picker directly. Dismissing the picker preserves the current result. Returning from processing, errors and results places the relevant section in view.
- The selected filename, thumbnail and elapsed time make processing visible. Decoding has a 30-second timeout; cancelling releases a late bitmap without measuring it.
- File signatures identify JPEG, PNG and WebP, including JPEGs returned by providers with generic MIME types. Other bytes are refused even if renamed `.jpg`. Size and dimension limits remain.
- Stale sample downloads cannot replace a newer selected photo; the last selected example wins.
- Mobile results show the measurement or specific refusal before the photo. Quality checks are expandable. An optional ring-detail view enlarges the existing overlay without changing measured pixels or diameter.

## Verification

`npm test`: **51/51 pass**, including 11 app lifecycle tests and the existing 40 engine/worker/sizing tests. `npm run build`: pass. The app tests exercise the production handlers with a controlled DOM, decoder, worker and clock; they are not a physical Android/iOS test.

Actual file-chooser uploads in the connected desktop Chromium browser, at **390 × 844 CSS pixels**:

| Input | Observed result | Time to result |
| --- | --- | --- |
| Ordinary ring, November photo 1 | 17.0 mm | 1.8 s |
| November photo 5, two rings | Refusal: more than one ring | 2.8 s |
| November photo 6, protruding ring | Refusal: inner edge not clear | 1.9 s |
| Synthetic missing-marker fixture | Refusal: marker not found | 94 ms |
| Existing October washer photo 6 | 9.8 mm, outside the sizing chart | 2.7 s |

Repeated upload, both replacement buttons, ring enlargement and JSON report download worked. At **360 × 800**, upload was inside the first viewport (button bottom about 494 CSS px), instructional text was 16 px and the upload target was 48 px high. No horizontal overflow was observed at 360, 390 or 1440 CSS pixels. Desktop retains the photo beside the summary. Screenshots, browser observations and the supplied video frames remain in ignored local artifacts.

Native mobile gallery cancellation is covered at the event level, not through a real phone: the browser connector cannot dismiss its file chooser. A fresh run on the user's physical phone has not been observed after this change. Browser timings above are desktop measurements, not smartphone performance claims.

## Measurement limits remain

`web/engine.js` is unchanged: SHA-256 `eaf6e53ace7c4fe47d2a1107240ea72a33946e4d842edbe2d365a2c0c5d039f9`. This UI change does not make unsupported jewellery measurable or validate physical accuracy. The earlier [eight-photo report](JEWELLERY-VALIDATION.md), unconfirmed print scale and approximate-reference discrepancies still apply. A photo without a readable scale cannot establish a diameter in millimetres.

Personal photos and the video are not public fixtures and are excluded from the repository and deployment archive. Site access remains owner-only.
