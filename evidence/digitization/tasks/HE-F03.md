## Acceptance
Add blur/duplicate filters and dataset report. Accepted after HE-F02.
Minimum: Reject blurred duplicates while retaining doorway sequence.

## Implementation
API measures actual bounded metadata-free native frame PNG pixels: grayscale Laplacian variance, brightness and64-bit difference hash. Versioned private-frame-quality-v1 thresholds are advisory and explicitly not country calibrated. Gross blur is excluded; nearby duplicates are excluded only within the same source-clip group and room annotation. Supplied transition frames, new rooms and separate source groups survive duplicate filtering. Blurred transitions and groups with no selected frames request recapture; geometricCoverage remains null. No doorway detection or camera calibration is invented.
Private dataset POST/latest GET persist an immutable report and measured frame details through session API only. Exact actor/membership/workspace version/input revision/private native frame versions/successful stage lineage and allowed run workflow are checked before cached replay, after bounded analysis, and by SQL190. Actual source bytes are freshly Clam-scanned/hash-checked before and after frame analysis; frame PNGs are current-scope/hash-checked before measured values are used. Manual room/transition annotations remain user_supplied_unverified. Two concurrent analyses, between-operation time checks,600 frame bound and1000 reports per actor/workspace cap apply. No public approval or training eligibility is created.
SQL190 is applied to both Compose databases;150 generated model schemas and377 canonical operations match. Frame render receipt now supports the new engine's600-frame bound while the document decoder keeps its50-page limit and all legacy upload caps remain unchanged.

## Tests
`docker compose exec -T api pnpm exec vitest run tests/unit/digitization-frame-quality.test.ts` passes three tests in frame-quality-real-pixel-units.log: real checkerboard/blurred PNG metrics reject blur and duplicates while retaining supplied doorway entry/exit and separate groups; blurred doorway flags recapture; noncanonical metadata/bad chronology fail;51-frame receipts pass and601 fail.
`./test-runner-protocol.sh frame-dataset` passes one actual API/database/S3/Clam/native-frame/pixel/report journey in frame-quality-capacity-final-workflow.log. It retains supplied transition pixels, excludes a duplicate, returns measured immutable/current report and cached/latest receipt, denies stale/foreign contexts and stale replay, prevents update/delete under actual RLS, and admits two real concurrent analyses while rejecting the third429. Earlier correct frame-report runs are retained; the first runner lane accidentally selected the existing F02 test and is not claimed as F03 evidence.
Full145 units/47files, nine types, lint/boundaries,377 canonical operations, compiled API157files without workspace source imports and150 model schemas pass. Logs: frame-quality-full-units.log, frame-quality-record-final-types.log, frame-quality-record-final-lint.log, frame-quality-contracts-check.log, frame-quality-compiled-api.log and frame-dataset-models.log. Initial findLast typecheck mismatch was fixed using existing target-compatible iteration; failures are retained. Existing90 CPU checks remain positive; no unchanged decoder retest claim is needed for the API-only selection addition.

## Limitations
Synthetic pixels/clip and manual transition markers only; no automatic room coverage, actual doorway detection, calibrated intrinsics, country holdouts, customer reconstruction quality or device/performance claim. Source-clip grouping is not a calibrated camera model. Advisory exclusions do not approve public scenes or replace privacy masks. Full capture quality feedback/UI and before-training privacy processing remain separately gated. Time is checked between bounded storage/scan operations, not claimed as a measured strict wall-clock SLA.

## Next dependency
HE-F06 local capture guidance/feedback, HE-F07 privacy exclusions/masks and HE-H01 reconstruction prerequisites; continue tour graph work independently.

## O
Actual pixels, encoded self-authored clip, database RLS/source versions/storage scans and synthetic actors. Supplied annotations are unverified.

## R
Preserved specification, Abu Dhabi priority, fixed-empty document fields and release gates. SQL190 is immutable after application.

## P
Real local implementation and retained tests described above; no secrets or source keys exported in report responses/events.

## V
No customer/human/parity approval, hardware benchmark, production or whole-engine completion.

## Photo/video workflow correction — 13 October 2026 (O/R/P/V)

See [capture reconstruction evidence](../photo-reconstruction.md) for real-photo admission, immutable source checks and the agent capture-to-scene workflow. No task acceptance is advanced by this follow-up.
