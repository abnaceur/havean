# Complete local apartment example — 13 October 2026 (O/R/P/V)

O: The user reported that the 360° and 3D plan did not resemble a realistic property. The previously shared agent-workflow property contained a one-room structural fixture, a different public plan, a simple panorama and an unrelated exterior photo. The new original plan assets and explicit provenance are in `assets/digitization-coherent/`.

R: Replace the one-room fixture on the same public URL with a complete two-bedroom architectural layout and five furnished generated room views. Preserve normal actor, source, version, workflow and review checks; retain the user's deferred GPU validation and paused VR instructions. No claim of surveyed geometry, physical capture, furniture reconstruction or human approval.

P: Six actual CPU jobs completed (one plan and five panorama sources). The source-linked plan has five rooms, eight wall runs and ten openings. The public structural GLB contains 13 meshes. Separate Agent Demo and Moderator Demo sessions exercised normal review/proposal/publication APIs. Both public viewer packages coexist. Approved plan/photo media replace the old examples, and the listing title and description explicitly identify the synthetic demo and its limitations.

P: The resumed publication/browser journey passed in 51.0 seconds (`functional-dimensions.log`): five actual panorama loads, navigation to the loaded 3D model and back to the floor plan, and no page exceptions. The focused navigation check passed in 17.5 seconds (`navigation.log`): actual bathroom hotspot navigation, visible nonblank 3D pixels, zoom changes, reset, gallery/plan/tour/model navigation, one dialog at a time, and no duplicate-key warnings or document overflow. `model.png`, `tour.png` and `plan.png` capture the current result; the model and tour images were visually inspected. Focused ESLint passed (`lint.log`). Initial fixture-only failures are retained in `functional.log` (page selection response shape) and `functional-resume.log` (unbounded floating-point formatting of authored opening lengths); both were corrected before publication. No broad test suite was run.

V: The 2D plan and architectural 3D geometry now share the complete layout. Generated panorama furnishings and architecture remain illustrative and are not geometrically calibrated to that layout. The 3D model has walls, floors and openings, but no furniture meshes or photorealistic materials. This improves the example without completing realistic furnished reconstruction, full engine acceptance, GPU validation, VR or release approval. Task counts remain root 120/120 and engine 56/95 (37 non-VR unfinished plus two VR paused).

Public links:

- [360° tour](http://localhost:8088/bj/buy/property-fc4b440c-0f4b-47b3-bb91-58bf4557555e?media=360)
- [Architectural 3D plan](http://localhost:8088/bj/buy/property-fc4b440c-0f4b-47b3-bb91-58bf4557555e?media=3d)

Reproduce the opt-in retained-example update using Docker Compose:

```sh
docker compose exec -T api node scripts/demo/generate-coherent-plan.mjs
docker compose --profile tests run --rm --no-deps -e UPDATE_COHERENT_DEMO=true tests pnpm exec playwright test tests/e2e/digitization-coherent-demo.spec.ts --project=desktop
docker compose --profile tests run --rm --no-deps -e CHECK_AGENT_WORKFLOW_EXAMPLE=true tests pnpm exec playwright test tests/e2e/digitization-viewer-navigation.spec.ts --project=desktop
```

The existing agent-workflow checkpoint must already exist. The upgrade checkpoint resumes completed mutations and processing jobs. Normal test runs skip these retained-example journeys.
