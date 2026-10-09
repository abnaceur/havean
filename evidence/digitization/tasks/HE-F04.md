## Acceptance
Build room checklist and resumable capture session. Close/reopen app resumes room and uploaded clips.

## Implementation
API-owned, actor-private capture sessions persist bounded room names/completion checks, selected room and room-linked owned upload references. Optimistic session/input versions, current actor/agency/target, upload ownership and workflow guard every save. Existing API multipart storage supplies actual uploaded-part receipts when reopening. The server never accepts an arbitrary storage key or another actor's clip. Sessions do not approve or process quarantined clips. Current-input changes prevent editing; explicit immutable cancellation allows a fresh session. SQL183–184 applies to both Compose stacks without editing earlier applied migrations. The ops checklist uses the server-session BFF and canonical SDK. Existing uploads can be linked to the current room, saved, reloaded, completed only when the checklist and uploads are complete, or discarded. Recorder/file selection and media validation retain their separate tasks.

## Tests
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml --profile tests run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-plan.spec.ts --project=desktop --project=mobile --grep HE-F04` — room-capture-browser-configured-origin.log: two actual desktop/mobile journeys pass. Each creates a real scoped multipart upload, transfers an actual 8 MiB segment through the signed gateway, saves a named checked room and linked upload, closes its page and reopens a new page with its server session. Selected room/checks/link and the actual uploaded part recover. Premature completion rejects and explicit discard works. Synthetic bytes remain quarantined and are not asserted to be decodable video. Cleanup aborts the test upload.
`flock -n /tmp/haven-integration.lock docker compose --env-file .env.integration -p haven-integration -f compose.yaml -f compose.integration.yaml exec -T -e HAVEN_CONTAINER_TESTS=true -e HAVEN_ENV_FILE=.env.integration api pnpm exec vitest run tests/integration/digitization-capture.test.ts tests/integration/digitization-access.test.ts tests/integration/digitization-intakes.test.ts tests/integration/digitization-schema.test.ts` — room-capture-scope-final.log: 16 actual tests pass. Capture tests cover reopened-controller rooms/part receipts, stale saves, duplicate rooms, premature completion and cross-agency denial. A genuinely rescanned authored PNG changes current inputs; old editing rejects, cancellation cannot alter room content, immutable discard succeeds and a fresh current-input session starts.
`./test-runner-protocol.sh plan-editor` — room-capture-browser.log retains two passing reuse/checkpoint integrations and ten passing pre-existing editor browser journeys, plus the initial two capture-test setup failures. The test omitted Origin; correction preserves CSRF. room-capture-browser-origin-fixed.log retains the missing integration upload-origin failure. Integration now explicitly configures the same local origin as development; its API was recreated without resetting data.
Full 125 units/40 files, nine workspace types, lint/import boundaries and 369 canonical operations pass in room-capture-unit-final.log, room-capture-types-acceptance.log, room-capture-lint-final.log and room-capture-contracts-check.log. No clean combined twelve-browser-pass run is claimed: all twelve distinct journeys have positive retained evidence.

## Limitations
This task resumes server-persisted rooms and existing multipart upload references/parts. It does not recover an unuploaded device recording, enable a recorder, verify codecs, make clips eligible for processing or publish a scene. Those are separate ordered tasks. A discarded checklist retains upload status; storage expiry/cleanup remains HE-K02.

## Next dependency
HE-F01 media probe, HE-F03 recorder/upload flow, HE-F05 capture guidance and HE-K02 cleanup.

## O
User-authored synthetic room names, actual uploaded quarantined synthetic segments and a genuinely scanned authored PNG only.

## R
Supplied actor/resource/version/state rules and room/capture close-reopen acceptance.

## P
Actual API/PostgreSQL/S3 gateway part receipts, distinct browser close/reopen, input-change refusal and immutable cancellation.

## V
No valid video codec, camera/recording access, country benchmark, scene, human/parity approval, headset or production completion.
