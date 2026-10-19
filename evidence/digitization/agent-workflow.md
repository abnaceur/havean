# Agent digitization workflow — 12 October 2026

O: User requested completion of agent actions. The retained local fixture was created using Agent Demo's browser session, real PDF upload, queue/CPU processing, source-linked review, listing/media controls and plan/tour editors. Moderator Demo performed automated test-role decisions; these are not independent human approvals. The fixture uses an existing project photo, a self-authored PDF, authored floor-plan pixels and a procedural full-sphere panorama.

R: API-owned authorization, resource scope, version/state guards, decimal strings, unknown-field abstention, private intake evidence, independent publication review, GPU validation deferred and VR paused. Existing specification and ordered task acceptance are preserved.

P: Fixed visible confirmed-fact prefill (including manual override and deselection), durable intake-to-listing handoff, invalid inventory URL, listing-to-digitization navigation, empty panorama refresh, workflow ordering and media-review error visibility/stale actions. Migration226 separates current tour and model publication snapshots and withdrawal scope while retaining all prior source/consent/reviewer/public-eligibility checks. Both viewers coexist on the same property.

- Published local fixture: http://localhost:8088/bj/buy/property-fc4b440c-0f4b-47b3-bb91-58bf4557555e
- Agent workspace: http://localhost:8089/ops/digitization?workspace=0b594196-51ce-4aac-83ff-87f539506f49
- Private original intake (Agent Demo only): http://localhost:8089/ops/digitization?workspace=a70a5950-b789-4b62-9d9c-42ce56482c8d
- `agent-actions-corrected-functional.log`: one passing real browser document-to-draft/photo/workspace journey, 34.6 seconds. Explicit selected bedrooms fill2; omitted bathrooms stay blank; manual overrides remain separate; exact price2500000.25 survives.
- `agent-visuals-label-corrected.log`: source uploads, both CPU jobs, four-wall/room tracing, estimated scale, supplied height, GLB rendering and private tour saving completed before a test queue-timing failure.
- `agent-visuals-publication-functional.log`: resumed same fixture; one passing browser journey, 1.1minutes, normal listing/media review, model/tour independent decisions, both listing revision approvals, anonymous model and panorama rendering. Checkpoints only resume completed work; they do not fabricate state or approvals.
- `agent-viewer-withdrawal-corrected-functional.log`: one passing scoped PostgreSQL functional check,74ms, withdraw each viewer through its actual database port while the other remains public; each withdrawal is rolled back so the example remains published.
- `agent-actions-contracts.log`, `agent-actions-ledger.log`, `agent-actions-lint.log`, `agent-media-types.log`, `agent-media-lint.log`: generated contracts, ledger checks and focused static validation. API and ops types also passed. No broad regression suite, GPU or VR testing was run.
- Screenshots: `agent-published-property.png`, `agent-published-tour.png`.

Reproduce the opt-in local journey (creates a new retained property; desktop only):

```sh
docker compose --profile tests run --rm --no-deps -e RUN_AGENT_WORKFLOW_EXAMPLE=true tests pnpm exec playwright test tests/e2e/digitization-agent-actions.spec.ts tests/e2e/digitization-agent-visuals.spec.ts --project=desktop
docker compose --profile tests run --rm --no-deps -e CHECK_AGENT_WORKFLOW_EXAMPLE=true tests pnpm exec vitest run tests/integration/digitization-viewer-coexistence.test.ts
```

V: This completes the checked agent path, not full engine acceptance. The3D output is structural geometry with supplied dimensions, not reconstructed furniture. The single-room trace is a functional authoring fixture, not a faithful reconstruction of the full authored source plan. Missing details still require explicit entry and canonical location selection; publishing requires independent reviewer action. Earlier failed harness runs are retained (media type selection, exact label lookup, review queue timing, test-only PostgreSQL module resolution). Root120/120 and engine56/95 accepted remain unchanged:37 non-VR tasks and2 paused VR tasks have outstanding exact acceptances/dependencies. No remote deployment, human/parity approval or complete-engine/release claim.
