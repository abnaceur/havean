# Published synthetic property example — 12 October 2026

O: User requested a full example property with images, a 360 view, a plan and a 3D plan, including generated documents and fixes needed to make it work. All assets are original synthetic content. Source files and their provenance are in `assets/digitization-demo/`; SHA-256 receipts are in `complete-demo-assets.json`. No measurements or real-property/human review approval were invented.

R: Retained development property `5f1498f4-9226-4b9a-b8bb-ac7f424bb562`:

- Public, no sign-in: http://localhost:8088/bj/buy/property-b3af3a62-48eb-44c6-9ac1-a87e33be1b17
- Open the plan: http://localhost:8088/bj/buy/property-b3af3a62-48eb-44c6-9ac1-a87e33be1b17?media=plan
- Agent Demo workspace: http://localhost:8089/ops/digitization?workspace=2a252512-58a4-41ca-9073-868e054cac29

Six gallery images comprise an explicitly labeled AI concept and five authored room renders. Five 2048×1024 equirectangular panoramas have room hotspots and mapped floor-plan viewpoints. The plan-derived 3D model extrudes five supplied room polygons with a fictional 2.80 m height. The supplied rectangular envelope is 10×8 m; this is authored test data, not measured area. The PDF identifies itself as a synthetic test document, not ownership evidence. Source document, plan and five panorama copies remain private in the listing-linked engine workspace.

P: The opt-in `tests/e2e/digitization-complete-demo.spec.ts` creates/resumes the fixture through authenticated BFF/API sessions. Uploads are actually scanned; media are submitted by Agent Demo and reviewed by a distinct Moderator Demo account. Listing publication follows submitted → under_review → published with synthetic-review reasons recorded. The prior faulty assignment was repaired via the existing Admin Demo assignment API. No database approval/publication bypass was used. The checkpoint is ignored and contains no credentials.

Two runtime fixes were required:

1. Draft creation now prefers an existing eligible agent profile over an unverified lower-ID profile belonging to the same author. The final publication gate remains enforced. `complete-demo-agent-selection-corrected.log` verifies the API service selects the eligible profile; its transaction is rolled back.
2. The public media gallery deduplicates image URLs shared by listing photos and approved rich media. The demo shows six photos, not twelve duplicate entries.

Minimum validation:

- `complete-demo-functional-views.log`: one focused desktop browser journey passes in 51.1 s. Anonymous property access, exactly six photos, loaded gallery image, floor-plan image, rendered 3D model with keyboard orbit, 360 renderer readiness and switching to Bedroom one all pass. The listing is deliberately retained.
- The same journey waits for all seven real source jobs to succeed: document OCR, plan rasterization and five panorama optimizations. Processing is sequential to respect agency quota. Results remain awaiting private review; this is not an engine public-package or geometry-reconstruction approval.
- `complete-demo-persisted-state.log`: seven successful processing stages and twelve approved media items on the published listing.
- `complete-demo-lint.log`: focused lint passes for the two runtime edits and demo generator/journey. `complete-demo-web-types.log`: consumer types pass.
- Screenshots: `complete-demo-property.png`, `complete-demo-360.png`, `complete-demo-3d.png`.

Earlier functional logs retain the ineligible-agent failure, a corrected setup route, a missing explicit source-authority field and agency-quota refusal. The final journey fixes its setup and waits for capacity rather than weakening the gates. The first rollback check's module-resolution failure is retained separately from its corrected passing evidence.

V: This is a local, clearly fictional example using the existing approved listing-media tour/model viewer. It does not claim that a new reviewed digitization publication package, photogrammetric reconstruction, continuously walkable world, verified dimensions, GPU training or independent human approval exists. Room movement jumps between fixed panorama viewpoints. The plan-derived model omits openings/furniture/wall thickness. VR remains paused, GPU validation deferred. No remote deployment or production readiness is claimed. Root120/120 and engine56/95 task acceptance counts are unchanged;37 non-VR tasks remain unfinished plus2 paused VR tasks. Release must still refuse unfinished work.
