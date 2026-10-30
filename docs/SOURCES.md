# Sources and conversion policy

Verified on **2026-10-31** through TinyFish search followed by page extraction. These references explain the conversion data and computer-vision methods; they do not establish this prototype's measurement accuracy.

## Ring-size table

- Primary source: [Tiffany & Co. Rings Size Guide](https://www.tiffany.com/client-services/size-guide.html).
- Cross-check: [Tiffany & Co. printable Ring Size Guide](https://media.tiffany.com/is/content/Tiffany/Tiffany_Ring_Size_Guide).
- `web/sizing.js` records the live chart's 21 US half-size entries from US 3 to US 13, using the **Interior diameter (mm)** column exactly as published. The supported conversion interval is **14.1–22.2 mm**, inclusive. The chart contains rounded diameter values, so this table conversion is not a continuous sizing formula.
- Application rule: choose the tabulated diameter nearest to the unrounded measured diameter. At an exact midpoint choose the larger US size. Reject out-of-range or non-finite inputs rather than clamping or extrapolating. `deltaMm` is the absolute difference between the measured diameter and the selected table diameter.
- This nearest-table policy is an explicit application choice. Tiffany's accompanying fitting guidance suggests the larger size between sizes; this app does not present its own rounding policy as Tiffany's universal fitting recommendation.

The displayed measurement uncertainty must be considered separately from conversion rounding. A measured diameter near a size boundary can be compatible with more than one size. Looking up a size does not validate the underlying photograph measurement.

## Computer-vision references

- [OpenCV 4.10.0 — Contour Features (JavaScript)](https://docs.opencv.org/4.10.0/dc/dcf/tutorial_js_contour_features.html): contour area, perimeter, polygon approximation, rotated rectangles, and `cv.fitEllipse` for fitting an ellipse to a point set.
- [OpenCV 4.10.0 — Contour Features (Python)](https://docs.opencv.org/4.10.0/dd/d49/tutorial_py_contour_features.html): corresponding contour geometry concepts.
- [OpenCV 4.10.0 — Basic concepts of homography](https://docs.opencv.org/4.10.0/d9/dab/tutorial_homography.html): planar mapping and perspective correction. The shared-plane assumption does not justify correction for arbitrary three-dimensional ring surfaces.

Implementation-specific thresholds, supported capture conditions, and any reported uncertainty require separate tests. No external sizing or OpenCV source is evidence of independent physical ground-truth measurements for this project.
