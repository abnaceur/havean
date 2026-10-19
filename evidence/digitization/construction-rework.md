# 3D construction studio — 13 October 2026

O: User requested reworking the full 3D plan construction. The existing furnished example has five rooms and 46 supplied mesh objects. The separately captured GPU example is a partial reference desk-area scan. Neither is a surveyed customer property. VR remains paused.

R: `docs/digitization/specification.md`, canonical geometry/scale/source schemas, immutable geometry workflow and existing actor/source access ports. Architectural geometry and image-based capture remain separate outputs. No specification was altered.

P: Added a dedicated construction studio with model, metric walls/openings/rooms, furniture, capture and review steps. Scaled geometry can now be corrected through a versioned API mutation, preserving source lineage and scale anchors in a new private revision. API readiness checks identify missing scale, rooms, walls, heights, invalid opening intersections and above-ceiling objects. Untraced room edges become review findings, not invented walls. Room edits validate retained furniture. Lowering a ceiling also checks existing objects and openings.

P: Full walls are visible by default; cutaway retains wall bases. Top view, floor/room framing, reset and 2D comparison help inspection. The capture panel now loads the actual training report and held-out images belonging to the selected exported tier, with checksummed private downloads and live authority rechecks. Coverage and physical scale remain unknown. No training rerun, publication or automatic furniture inference occurred.

## Minimum validation

- `docker compose exec -T -w /workspace api pnpm exec vitest run tests/unit/digitization-construction.test.ts`: two functional cases pass. Actual GLB changes after immutable opening correction; stale edits, invalid fit, stranded furniture and objects above lowered ceilings are rejected. A transom above a door is allowed; intersecting openings are blocked. Log: `construction-functional-unit.log`.
- `docker compose run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-construction-studio.spec.ts --project=desktop`: one actual agent journey passes (29.0s), loading all 46 objects, changing cutaway pixels, top view, saving a metric correction, rejecting stale writes and reloading the model. The original wall thickness is restored through a second normal private revision. Log: `construction-studio-functional.log`; visually inspected screenshot: `construction-studio-model.png`.
- `docker compose run --rm --no-deps tests pnpm exec playwright test tests/e2e/digitization-scene-direct-link.spec.ts --project=desktop`: saved scene opens automatically, both real held-out PNGs load and display their 18.17/20.98 dB metrics. Wrong workspace and anonymous access are refused. Log: `construction-scene-evidence.log`.
- Focused API/ops types, changed-file lint and canonical contract generation/check are retained in `construction-api-types.log`, `construction-ops-types.log`, `construction-lint.log`, `construction-contracts.log`, `construction-contracts-check.log`. Generated API has 445 operations.

## Open locally as Agent Demo

- Construction studio: http://localhost:8089/ops/digitization?workspace=0b594196-51ce-4aac-83ff-87f539506f49&view=construction
- Actual GPU capture: http://localhost:8089/ops/digitization?workspace=9acf2520-a922-4b23-830e-0a55aa0b97a6&view=scene
- Existing published authored example: http://localhost:8088/bj/buy/property-fc4b440c-0f4b-47b3-bb91-58bf4557555e?media=3d

V: Local functional implementation and observed rendered fixture, not complete automatic reconstruction of an arbitrary property, physical accuracy, independent visual/parity approval or production release. Source tracing remains the initial path for adding new structure; metric editing corrects existing structure. Furniture is supplied explicitly; gsplat captures visible appearance without semantic editable objects. Stair shape is flagged as unknown rather than synthesized. Root acceptance remains120/120; engine56/95, with37 unfinished non-VR tasks and2pausedVR. No task newly marked done.
