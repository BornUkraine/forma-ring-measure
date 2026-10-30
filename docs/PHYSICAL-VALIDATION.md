# Physical validation — protocol and pending results

**Status: pending. No physical measurement accuracy has been established.** The generated scenes in `web/samples/` are labelled synthetic fixtures. They exercise software behaviour but do not satisfy the assignment's requirement for independently measured physical objects.

## Prepare the evidence

1. Select at least two different physical objects with circular inner boundaries. Include real ring photographs; identify any circular cut-outs or other holes as supplementary examples. Give each object a stable ID, A or B.
2. Independently measure each object's internal diameter before running the app. Prefer the internal jaws of a caliper, check its zero, and record the instrument, resolution, method, and any stated instrument uncertainty. A ruler is acceptable only with its coarser reading uncertainty explicitly recorded; do not report caliper-like precision from a ruler.
3. Measure across the inner opening, avoiding bevels, at two perpendicular directions with three repeat readings in each direction. Keep the raw readings and describe how the reference diameter and reference uncertainty were derived. Noticeable differences between directions indicate an oval opening: use another object for the circular normal cases, or label this as a difficult case. Repetition alone does not prove instrument accuracy.
4. Keep an evidence photograph showing the instrument reading and the object ID. Store these control measurements separately from the app inputs. Never type the known diameter into the app or use the app's own output as ground truth.
5. Print the application's marker at **100% / actual size**, with page fitting disabled. Measure both outer sides of the black square and record the readings: the intended side length is **20 mm**. Reprint if the measured size is inconsistent with 20 mm at the instrument's stated resolution. A distorted print must not be treated as a correct scale.
6. Place one ring and the verified marker flat on the same plane, separated and fully visible. Use the documented supported conditions: near-overhead view, plain contrasting surface, diffuse light, sharp focus, and no digital alteration of the geometry. Take photographs using the phone's normal camera app, then upload the saved files; the web app needs no camera permission.

Use photographs you own and can share. Preserve the original app-input files, control-measurement evidence, and a separate ground-truth record in the submission test set. Label supplementary and synthetic material explicitly.

## Record expectations before evaluation

Save or commit the ground-truth record and expected-outcome table **before** uploading the inputs. Choose and record any target error criterion beforehand; it is a test criterion, not an already established accuracy claim. Do not revise expectations after seeing the output without retaining the original expectation and explaining the change.

Include these cases:

- **Normal A:** a supported photo of independently measured object A; expect a measurement and the correct detected inner boundary and marker.
- **Normal B:** a supported photo of a different independently measured object B; expect a measurement and correct boundaries.
- **Ambiguity:** both objects visible in the same photo; expect a request to keep only one ring, without choosing a diameter arbitrarily.
- **Correction:** a newly taken photo after following that instruction, showing A alone with the marker; expect measurement. This records a complete correction flow.
- **Decline:** a photo with the marker absent, or a deliberately blurred / excessively tilted photo; choose the condition and expected response in advance. Expect no diameter and actionable retake guidance.

The two normal inputs plus an unsupported input are the minimum physical dataset; the ambiguity and correction pair additionally covers the assignment's correction/ambiguity requirement. Run each original file through the actual upload flow, using the same app version, and retain failures.

## Ground-truth record — fill before the app run

| Field | Object A | Object B |
| --- | --- | --- |
| Object description; real ring or labelled supplementary hole | | |
| Instrument / resolution / stated uncertainty | | |
| Direction 1: three raw readings (mm) | | |
| Direction 2: three raw readings (mm) | | |
| Reference internal diameter (mm) | | |
| Reference uncertainty and derivation | | |
| Raw measurement evidence filename | | |
| Normal input filename | | |

| Shared setup field | Recorded value |
| --- | --- |
| Marker file / print settings | |
| Measured marker width and height (mm) | |
| Marker measurement instrument / resolution | |
| Expected outcomes frozen at; commit or dated record | |
| Preselected target error criterion and reason | |
| App version / commit | |
| Browser / device | |

## Results — intentionally blank until collected

| Case / filename | Expected outcome recorded before run | Actual outcome | Reference diameter (mm) | Estimated diameter (mm) | Absolute error (mm) | Displayed uncertainty | Time to useful result (ms) | Processing time (ms) | Variable cost and assumptions | Notes / evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Normal A / | Measure; inner edge and marker correct | | | | | | | | | |
| Normal B / | Measure; inner edge and marker correct | | | | | | | | | |
| Ambiguity / | Request one ring; no diameter | | | | | | | | | |
| Corrected A / | Measure after correction | | | | | | | | | |
| Unsupported / | Decline; chosen reason: | | | | | | | | | |

For each accepted photograph compute **absolute error = |estimated diameter − independent reference diameter|** using the unrounded estimate when available. For an intentionally declined photo report error as “N/A — no estimate” and record whether the refusal matched the expectation. An unexpected rejection of a normal photo is a failure, not a zero-error measurement. Check and record the boundary overlay as well as the number: an apparently good number from the wrong boundary is not a successful detection.

Measure time to useful result from selecting the file until a measurement or actionable retake instruction appears; record the app's processing time separately. Record local API cost as no paid per-image API calls only if that is the actual path; report any other variable costs and hosting separately. Note whether an initial library load is included, and whether timing is a first or repeat run.

## Interpretation and submission

Report every tested input, observed error, false acceptance, refusal, and correction result. Discuss image conditions, print-scale uncertainty, reference-instrument uncertainty, and the small sample size. Compare errors with the uncertainty shown by the app, without treating a handful of observations as a validated statistical confidence interval. If the app understates uncertainty or accepts an unsupported photo, record that limitation and adjust the implementation or narrow the supported conditions before rerunning new, separately recorded tests.

Until this record is filled with real evidence, the delivery notes must say **physical validation pending**. Synthetic regression tolerances and source-table rounding do not establish real-photo accuracy.
