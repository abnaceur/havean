# Complete architectural demo (O/R/P/V)

O: The retained agent-workflow example originally showed a single rectangular room while its public floor plan depicted a different apartment. `scripts/demo/generate-coherent-plan.mjs` authors the replacement SVG, PNG and layout JSON. The five reused AI-generated panoramas and their prompts are recorded in `assets/digitization-realistic/`; the cover image is the existing generated `assets/digitization-demo/interior-concept.png`.

R: This fictional two-bedroom layout has five rooms, eight wall runs, five door openings and five window openings. The authored envelope is 10.00 × 9.55 m, with a supplied 2.80 m ceiling. These are schematic inputs, not measured dimensions or official room areas. The 2D plan and structural 3D geometry use the same layout. The generated room imagery is illustrative and is not calibrated to those boundaries, furniture positions or camera headings.

P: `tests/e2e/digitization-coherent-demo.spec.ts` uploads and processes private sources, saves source-linked geometry and supplied dimensions, creates a linked five-node tour, and publishes both viewers through normal versioned APIs and separate demo-role review. It replaces the earlier public plan and unrelated cover photo only after their replacements pass the demo review workflow. The ignored checkpoint is `infra/generated/digitization-coherent-demo.json`.

V: This is an architectural visualization, not a furnished photorealistic 3D reconstruction. Its 13 meshes are five floor slabs and eight wall meshes with opening cutouts. Furniture remains part of the illustrative panorama images only. The fixture exercises the existing `genuine_360_capture` declaration with synthetic spherical test inputs; it does not establish actual camera capture or independent human approval. GPU validation remains deferred and VR paused. No engine task is accepted on the strength of this example.

Local example: http://localhost:8088/bj/buy/property-fc4b440c-0f4b-47b3-bb91-58bf4557555e . Validation and screenshots: `evidence/digitization/coherent/`.
