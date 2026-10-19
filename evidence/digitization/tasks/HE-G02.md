## Acceptance
Store tour graph and room/node links. Accepted after HE-G01 and HE-A03.
Minimum: Dangling hotspot node rejected by API.

## Implementation
Existing inventory-owned tour_revisions now stores bounded immutable private graphs through session API POST/latest GET. Canonical graph requires unique nodes/tiers, existing entry, same-graph nonself hotspot targets, explicit nullable capture declaration/heading and optional room links to the latest current v2 geometry. Reciprocal navigation remains valid. Source scopes require current private panorama candidate tiers from one exact capture per node; splitting one capture into multiple alleged viewpoints is rejected. Every node keeps reviewRequired/genuinePanoramaConfirmed=false through the private record: dimensions/declarations never certify capture truth.
Actual current source bytes are Clam-scanned/checksum verified outside SQL; actor/persisted membership/workspace version/input revision/expected graph revision/current tier and geometry lineage are checked again before immutable append. Workspace version advances atomically. Cached replay rechecks source/target authority first. Existing approved legacy tour predicates/media serialization are preserved; no publication or source URL is emitted.100 nodes/20 hotspots per node/three tiers per capture and200MiB aggregate source-validation cap apply.

## Tests
`./test-runner-protocol.sh tour-graph` passes one actual API/database/S3/Clam/confined-panorama journey in tour-graph-final-private-workflow.log. Dangling hotspot raises canonical validation and creates zero revisions. A valid private graph persists, replay/latest agree, stale mutation and missing geometry are denied, splitting the same native capture into two fake viewpoints is rejected, foreign cached scope fails and source runs remain awaiting review.
`docker compose exec -T api pnpm exec vitest run tests/unit/digitization-tour-graph.test.ts` passes two checks in tour-graph-schema-units.log: reciprocal navigation retains empty provenance/heading/geometry, and dangling/self/duplicate nodes/tiers/unbound rooms fail.
Full147 units/48files, all nine types, lint/boundaries,379 canonical operations and compiled API159files without workspace source imports pass in tour-graph-full-units.log, tour-graph-final-all-types.log, tour-graph-final-lint.log, tour-graph-contracts-check.log and tour-graph-compiled-api.log. Initial implicit-any geometry typecheck failure was corrected with canonical v2 geometry parsing. SQL stays190/150 models; no new migration.

## Limitations
Actual source is a synthetic ordinary2:1 PNG, intentionally never certified genuine. The graph journey tests no real customer/country/capture provenance, human review, physical panorama/device measurement or positive measured room geometry. Missing geometry links are rejected; actual mapped-node navigation remains HE-G04. Capture review/viewer UI and independent approved publication remain HE-G03/HE-G05. No production or full-engine completion.

## Next dependency
HE-G03 existing panorama viewer/capture review, then HE-G04 map positions and HE-G05 node-level review/exclusion.

## O
Self-authored pixels, actual private source scan/decoder/tier bytes and synthetic actor/graph metadata only.

## R
Preserved supplied specification, legacy tour predicates, Abu Dhabi priority and fixed-empty document rule.

## P
Real private API/storage/SQL graph implementation, typed contracts and retained local tests described above.

## V
No guessed spatial transform, source certification, human/parity approval, headset/GPU benchmark, production or whole-engine claim.
