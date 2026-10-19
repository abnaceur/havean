# Synthetic property example (O/R/P/V)

O: Original assets generated for the user's requested local property example on 12 October 2026. No real property, people, ownership document or measured dimensions are represented.

R: Six gallery images, five linked spherical viewpoints, an authored floor plan, its interactive extruded 3D room model, and a private PDF test document. These exercise the existing listing-media viewer and the private digitization source-processing workflow. They do not demonstrate GPU reconstruction or headset VR.

P: `interior-concept.png` is an AI-generated design illustration, created with the imagegen skill. It is not an exact rendering of the plan. `*-photo.png` and `*-panorama.png` are perspective and 2:1 equirectangular views rendered from original procedural room geometry using Three.js. Each panorama contains the complete sphere. `floor-plan.svg` is the original authored diagram; its PNG is the upload derivative. `rooms.json` holds authored room bounds. The plan omits wall thickness; its 80.00 m² envelope and 2.80 m ceiling are fictional, unverified inputs. The public 3D viewer extrudes supplied room outlines and lets visitors jump to fixed panorama viewpoints. It is not a photogrammetric model or continuous walkthrough.

`property-test-document.pdf` is a valid text PDF identifying itself as synthetic; it is deliberately not a deed, license, authorization or title document. Demo-role reviews exercise the API's approval workflow and are explicitly recorded as automated fixture reviews, not independent human approval.

Regenerate deterministic assets in the running development stack:

```sh
docker compose --profile tests run --rm --no-deps tests node scripts/demo/generate-property-assets.mjs
```

Create/resume the retained local example and execute its one focused browser journey:

```sh
docker compose --profile tests run --rm --no-deps -e CREATE_DIGITIZATION_DEMO=true tests pnpm exec playwright test tests/e2e/digitization-complete-demo.spec.ts --project=desktop
```

The opt-in journey accepts only localhost origins. It uses actual Agent Demo, Moderator Demo and (when repairing the prior assignment) Admin Demo sessions, scanned uploads, scoped versioned mutations and ordinary publication routes. No publication/approval flags are written directly. It retains its checkpoint in ignored `infra/generated/digitization-complete-demo.json`; reruns reuse the existing listing, uploads and jobs. Removing that checkpoint creates another example; normal suites skip this opt-in journey.

V: See `evidence/digitization/complete-demo.md` for the retained property link, check results and limitations. VR stays paused and GPU validation deferred. This fixture does not complete any outstanding engine acceptance or production-release gate.
