# Property-specific furnished model — 13 October 2026 (O/R/P/V)

O: The user rejected the generic structural model and requested the property's contents in 3D. The previous five-room model had floors and walls but no furniture geometry. Its illustrative AI images did not correspond to exact modeled objects.

R: Keep the existing API/session/storage/review architecture. Author a furnished synthetic property, generate its room views from the same model, and allow agents to save property-specific object placements. Preserve supplied/unverified provenance, immutable geometry revisions, actor/resource/source/version/workflow checks and independent publication. GPU reconstruction validation stays deferred; VR stays paused.

P: Added bounded optional furniture records to canonical geometry and a versioned furnishings mutation. The API assigns manual provenance and validates the selected metric draft, room, object footprint corners and ceiling height. It creates a private immutable child without approving or publishing it. The operations editor supports adding, updating and removing objects with room, position, dimensions, rotation, elevation, colour and source note. Public derivatives strip private object IDs, labels and source details. Older models without furnishings retain their existing export bytes.

P: The GLB generator produces actual meshes for 20 object kinds. The retained example has 46 furniture/fixture objects, five rooms, eight wall runs and ten openings. The generated interior photo and five spherical room images use the same furnished scene. Six source-processing jobs succeeded. Normal Agent Demo and Moderator Demo APIs published the model and matching tour; the final tour records the authored cameras and doorway bearings and selects the 2048-pixel tiers. The public viewer adds a wider model dialog, shadows and reversible wall clipping, with supplied-object limitations visible.

P: Minimum functional evidence:

- `unit.log`: four focused tests pass for supplied immutable object geometry, real mesh output, public metadata stripping, invalid/stale/duplicate placement rejection and existing structural projection behavior.
- `assets-final.log`: authored GLB and five panorama renders pass in 8.1 seconds. `glb-validation.json` records zero GLB errors or warnings (one unused existing draft-wall material informational notice).
- `model-match.json`: SHA-256 comparison confirms that the reviewed public GLB and the GLB used to render all five panoramas are byte-identical.
- `publication.log`: actual source uploads, processing, geometry/object persistence, separate demo-role review and both publications pass. `publication-final.log` passes the final camera-aligned tour revision and all five room loads, model and floor-plan navigation in 1.3 minutes.
- `editor-corrected.log`: actual agent UI loads the 46 saved objects, edits a sofa, rejects an excessive height, rejects a stale write and reloads the unchanged saved size; passes in 44.7 seconds.
- `navigation.log`: public hotspot, gallery/plan/tour/model navigation, nonblank rendered pixels, zoom and reset pass in 31.4 seconds without page or duplicate-key errors.
- `api-types.log`, `ops-types.log`, `web-final-types.log`, `final-lint.log`: focused static checks pass. Contract generation/check and ledger validation retain the existing acceptance counts.

P: `model.png`, `tour.png`, `plan.png` and the original generated `assets/digitization-furnished/interior.png` / `living-panorama.png` were inspected. Initial asset harness failures (controller decorator imports, root package resolution and inline shader escaping) are retained in `assets.log`, `assets-render.log` and `assets-browser.log`; corrected before publication. The first editor attempt revealed the selector's missing explicit accessible label; `editor.log` also contains overlapping Playwright report-directory errors. The corrected check uses a separate report directory and passes. No broad suite, GPU training or headset test was run.

V: The synthetic example's 3D objects and rendered room views now agree. The model remains stylized authored geometry, not a photorealistic capture reconstruction or an exhaustive representation of an actual property. Real properties require agents to supply accurate objects/placements or a separately validated reconstruction. Automated separate-role reviews are not human or parity approval. Engine acceptance remains 56/95; root task acceptance 120/120, with 37 non-VR engine tasks unfinished and two VR tasks paused. No remote deployment or full release completion is claimed.

Reproduce in Docker Compose, using the retained agent/coherent checkpoints:

```sh
docker compose exec -T api node scripts/demo/generate-furnishings.mjs
docker compose --profile tests run --rm --no-deps -e RENDER_FURNISHED_DEMO=true tests pnpm exec playwright test tests/e2e/digitization-furnished-assets.spec.ts --project=desktop
docker compose --profile tests run --rm --no-deps -e UPDATE_FURNISHED_DEMO=true tests pnpm exec playwright test tests/e2e/digitization-coherent-demo.spec.ts --project=desktop
docker compose --profile tests run --rm --no-deps -e CHECK_FURNISHED_DEMO=true tests pnpm exec playwright test tests/e2e/digitization-furnishings-editor.spec.ts --project=desktop --output=test-results/furnished-editor
```

The ignored `infra/generated/digitization-furnished-demo.json` checkpoints mutations for retries. The current property is http://localhost:8088/bj/buy/property-fc4b440c-0f4b-47b3-bb91-58bf4557555e . Direct viewers use `?media=3d` and `?media=360`.
