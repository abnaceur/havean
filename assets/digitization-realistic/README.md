# Realistic generated apartment (O/R/P/V)

O: Five original room panoramas generated with the **built-in imagegen tool**, using the complete room-specific prompts saved in [prompts.json](prompts.json). Generated on 12 October 2026 in response to the user's request for realistic property assets and an actual 360°/3D application test. Each final PNG is1774×887 pixels (2:1). They are AI-generated fictional interiors, not photographs of an actual property. No external property media were copied.

R: One coordinated apartment style across living/dining, kitchen, bathroom and two bedrooms: warm oak, neutral walls, sage accents and natural daylight. The existing authored plan supplies room boundaries, approximate camera positions and an unverified2.8m ceiling. Generated furnishings and architecture are illustrative; the images do not establish surveyed geometry or cross-room physical consistency.

P: The PNGs are uploaded through authenticated media intents and the real scanner. Separate demo-role reviews replace the five older public viewpoints, update plan links and approve the listing-description revision. Private copies also pass five actual CPU panorama-optimization jobs at input revision12. Local checkpoint: ignored `infra/generated/digitization-realistic-demo.json`.

The interactive 3D viewer now projects each approved panorama onto its supplied floor/wall shell, supports orbit/zoom and room entry, and removes front-facing outer walls for a cutaway view. Perspective-correct texture interpolation keeps surfaces continuous across triangles. The renderer limits total texture allocation to approximately32MiB; failed images retain plain geometry and show a visible status. It cleans up images, buffers, shaders, textures and observers when closed. Furniture is visible in the projected image; it is not separate reconstructed furniture geometry. Approximation is disclosed in the listing, media captions and viewer information.

Run the single retained-example journey in Docker Compose:

```sh
docker compose --profile tests run --rm --no-deps -e UPDATE_REALISTIC_DEMO=true tests pnpm exec playwright test tests/e2e/digitization-realistic-demo.spec.ts --project=desktop
```

It requires the base example checkpoint created by the earlier complete-demo journey. It reuses existing records and successful jobs on reruns. Normal test suites skip it. The older fixture's setup/acceptance snapshot is superseded for this retained listing; use this realistic journey to validate its current state.

V: `evidence/digitization/realistic/functional-corrected.log` passes one browser journey covering five textures, model orbit/zoom, model-to-room navigation, all five panorama loads/rotation/zoom, and a blocked-image fallback. No page errors were observed. Screenshots and detailed evidence are in `evidence/digitization/realistic/`. Synthetic appearance and approximate shells do not validate photogrammetric reconstruction, metric accuracy, continuous walking, GPU training, human review or VR. GPU validation remains deferred and headset VR stays paused.
