# Walkthrough script — target2 minutes45 seconds

Record the actual running prototype. Do not present generated images as real photographs or claim calibrated physical accuracy.

**0:00–0:20 — Problem and input.** “Forma estimates the inside diameter of one ring from an uploaded photograph. The printed square is20 mm. The app asks for no diameter or manual scale entry and needs no camera permission.” Show the page and marker download.

**0:20–0:45 — Capture conditions.** Show the photo guide: print100%, verify the black square with a ruler, lay both objects on the same plane, use sharp diffuse lighting, photograph near overhead. Explain the supported plain-background case.

**0:45–1:20 — Complete flow.** Upload a new photo from files. While independently measured physical photographs are pending, use the labelled17 mm synthetic example and explicitly call it synthetic. Show automatic scale recognition, inner boundary, diameter, provisional uncertainty, sourced US size and actual processing time. Open the sizing rule. Demonstrate replacing the image with the20 mm example; the detector processes fresh pixels.

**1:20–1:45 — Difficult input.** Load the missing-marker example. Show that no diameter is offered and read the specific retake instruction. If physical evidence is ready, show a real unsupported image instead. Mention additional tests for blur, perspective and multiple rings.

**1:45–2:15 — Evidence and limits.** Show expected/actual test results and absolute error. State clearly which inputs are synthetic and which independently measured photos have actually been tested. Explain that the uncertainty is an engineering estimate until real capture tests support it.

**2:15–2:45 — Reproducibility and cost.** Show the repository instructions, `npm test`, algorithm and validation documents. Explain browser-local processing, no image upload to a service, no per-image paid API charge, and separate hosting/bandwidth cost. Identify the next improvement: real-object validation and stronger handling of reflective/low-contrast rings.
