# HE-A06 — Replaceable adapter boundary and explicit development diagnostic

## Acceptance
Typed processing adapter protocol separates scoped execution/artifact references from implementations. Explicit development simulator cannot run in test/staging/production, cannot produce artifacts and cannot qualify for content validation. Default uninstalled adapter reports unavailable rather than success.

## Implementation
services/property-processing/property_processing/adapters.py; tests/test_adapters.py. Constructor and configuration reject implicit/invalid simulator flags and unknown adapters. No arbitrary shell command or provider path is accepted as an execution stage/source reference.

## Tests
docker compose -f services/property-processing/compose.tests.yaml build --builder default cpu
Passed offline CPU/test image rebuild.

docker compose -f services/property-processing/compose.tests.yaml run --rm cpu
Passed 20 pytest checks on 6 October 2026, including six adapter tests (three parameterized deployment denials, explicit development gating, unavailable real adapter and unsupported commands/paths) and the existing 14 real source-processing checks.

docker compose -f services/property-processing/compose.tests.yaml run --rm -e PROCESSING_DEPLOYMENT=production -e PROCESSING_ADAPTER=simulator -e PROCESSING_ENABLE_SIMULATOR=true cpu python -m property_processing.preflight
Actual image entrypoint initialization rejected production simulation (expected exit 1). Default CPU pytest rerun passed 20/20.

## Limitations
Protocol is an integration boundary, not an authenticated durable execution server. Real OCR/reconstruction adapters remain unavailable pending their dependencies and acceptance. No development diagnostic can count as real processing, reconstruction, a production-ready artifact or publication approval.

## Next dependency
HE-C03 authenticated durable runner registry, after HE-C01 and scoped input/lease records.

## O
No original reference capture.

## R
Supplied replaceable-adapter and production-simulator requirements.

## P
Actual bounded nonroot Docker execution; deterministic synthetic protocol fixtures.

## V
Real OCR/GPU reconstruction, runner identity, publication and device acceptance remain unverified.
