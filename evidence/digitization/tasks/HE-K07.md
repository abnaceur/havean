# HE-K07 — Reference workload and supported-input/device matrix

## Acceptance

Not accepted. Measured stage times/VRAM/bytes/fps recorded with dataset/hardware IDs. This exact combined acceptance is unverified; local fixture results remain separately labeled.

## Implementation

Local authored PDF/OCR, capture, privacy, publication and recovery paths have evidence. Local Chromium/SwiftShader reports and CPU camera solves are not the reference workload, GPU VRAM or a physical supported-device matrix.

## Tests

Source/retained evidence audit only: docs/digitization/COMPLETION-AUDIT.md, docs/digitization/BLOCKERS.md and prior task-specific measured scene/CPU/recovery evidence. No fresh hardware measurement or whole-case pass is claimed.

## Limitations

Local authored PDF/OCR, capture, privacy, publication and recovery paths have evidence. Local Chromium/SwiftShader reports and CPU camera solves are not the reference workload, GPU VRAM or a physical supported-device matrix.

## Next dependency

Complete HE-I04/HE-I06/HE-K05 and run the authorized representative workload on identified supported hardware.

## O

Actual repository implementation and previously retained local observations. No newly supplied hardware, independent customer/property dataset or human approval.

## R

Preserved exact specification, ordered prerequisites and O/R/P/V evidence requirements.

## P

11 October2026 evidence-file audit; unchanged acceptance status.

## V

Exact acceptance remains unfinished. Engine54/95 accepted,41 unfinished. No production/device/accuracy/parity claim.

## Actual CPU workload — 12 October 2026 (O/R/P/V)

Status is now in_progress. O: licensed TUM RGB-D freiburg1_xyz 16-frame input, exact existing source-runtime profile and actual local Docker Compose execution. R: identify dataset/runtime/hardware and measure rather than invent stage time, memory and output size. P: `docker compose -p haven-reconstruction-runtime-tests -f compose.reconstruction-runtime.yaml run --rm --no-deps colmap-runtime python -m property_processing.colmap_cli --input /input --output /results/fast-functional-cpu-reference-20261012 --max-seconds 240 --prepare-training` exits 0. It registers 16 cameras, 3232 points and prepares 16 views. `reference-cpu-functional-workload.json` retains the exact per-command/overall timings, bytes, input/runtime hashes and named CPU/kernel. Overall local elapsed is 35.840959658 seconds, excluding container startup/build/report write. Maximum completed-child RSS is 206184448 bytes; it is not aggregate or GPU memory. V: GPU training/VRAM, viewer FPS, real headset/device matrix, representative property workload and prerequisites remain unverified. No minimum-test completion or full engine acceptance is asserted.

## Current local continuation — 12 October 2026 (O/R/P/V)

O/P: Local CPU camera stages now traverse the durable API/queue/worker with immutable recipe/frame/source lineage, confinement, private calibrated export and review reports. The actual queued reference-derived clip registers16 views/3364 points; no metric scale, room coverage, physical property or GPU result is inferred. Recovery now describes47 tables in v6 while preserving historical versions; only the focused descriptor validation was rerun. Evidence: `camera-durable-functional-validation.log`.

R/V: exact original acceptance and prerequisites remain mandatory. Production model/native admission, representative country/property/calibration inputs, physical GPU/headset, independent human/parity and current release/recovery gates remain unaccepted. Status stays in_progress; no whole-engine completion.
