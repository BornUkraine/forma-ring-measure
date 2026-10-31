# Walkthrough script — target2 minutes45 seconds

Record the actual running prototype. Do not present generated images as real photographs or claim calibrated physical accuracy.

**0:00–0:20 — Problem and input.** “Forma estimates the inside diameter of one ring from an uploaded photograph. The printed square is20 mm. The app asks for no diameter or manual scale entry and needs no camera permission.” Show the page and marker download.

**0:20–0:45 — Capture conditions.** Show the photo guide: print100%, verify the black square with a ruler, lay both objects on the same plane, use sharp diffuse lighting, photograph near overhead. Explain the supported plain-background case.

**0:45–1:20 — Complete flow.** Upload the existing washer photo `photo_6_2026-10-31_20-06-53.jpg` from files. It previously displayed10.0 mm in the browser; show the actual current result rather than promising that value. Show automatic scale recognition, inner boundary, diameter, provisional uncertainty and processing time. Explain that the user's ruler reference was approximately10 mm, the final printed marker scale was not independently confirmed, and the washer lies outside the sourced ring-size chart. If a successful example in the chart is useful, use the explicitly labelled17 mm synthetic example; never call it a real measurement.

**1:20–1:45 — Difficult input.** Show an existing ring photo that is declined, or the missing-marker example. Show that no diameter is offered and read the actual instruction. Explain that inner-wall shadows currently prevent reliable opening isolation on this thick object; a refusal does not prove the photograph itself is unsuitable.

**1:45–2:15 — Evidence and limits.** Show the recorded expected/actual synthetic results and their errors, clearly labelled synthetic. Summarize the existing physical-photo results: one washer produced browser measurements, the thick ring did not, and the final18 photos all returned `ring_not_found` in the unchanged core evaluation. Do not invent an error for a declined photo. Physical accuracy and the displayed uncertainty remain unvalidated. Physical testing has ended for this delivery.

**2:15–2:45 — Reproducibility and cost.** Show the repository instructions, `npm test`, algorithm and validation documents. Explain browser-local processing, no image upload to a service, no per-image paid API charge, and separate hosting/bandwidth cost. Identify the next improvement: real-object validation and stronger handling of reflective/low-contrast rings.

## Phone and hosting

The brief requires a phone-friendly browser demo and a walkthrough no longer than three minutes. It does not require Railway or recording on a particular device. A phone screen recording is a useful way to demonstrate the mobile upload flow; a desktop screen recording is also acceptable. No face-camera recording is needed.

Current hosted URL: https://forma-ring-lab-eugene-2026.realove-io.chatgpt.site

The Site currently permits only its owner account. On a phone, open this HTTPS URL and sign in with the same ChatGPT account. `127.0.0.1:4173` refers to the device opening it and is not the computer's address when used on a phone. Reviewer access must be arranged before submission; do not assume a public GitHub repository makes the hosted Site public. Any static HTTP host can serve the built `dist/` directory, so a Railway migration is optional.
