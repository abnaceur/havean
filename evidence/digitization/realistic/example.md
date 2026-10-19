# Realistic 360° and textured 3D example — 12 October 2026

O: The user asked to improve the earlier basic property example with realistic assets and actual application testing. Five original AI-generated panoramas and exact generation prompts are retained in `assets/digitization-realistic/`. `assets.json` records file dimensions, sizes and checksums. Each PNG is1774×887; the earlier procedural images remain available as historical test assets.

R: Update the existing local published example, keeping VR paused and GPU validation deferred. Public URL: http://localhost:8088/bj/buy/property-b3af3a62-48eb-44c6-9ac1-a87e33be1b17?media=plan . Select **3D model** for the textured cutaway or **Tour** for the five realistic room views. No public sign-in is required.

P: Authenticated Agent Demo uploads are scanned; a separate Moderator Demo role approves the synthetic media and listing-description revision. The floor-plan room mappings and hotspots point to the new panorama IDs. Only the previous demo's five obsolete public viewpoint rows are removed. The authored plan, six earlier gallery images, property and original source assets are retained. All five new private source copies complete CPU panorama optimization at revision12. There are no direct database writes to publication/approval state.

Runtime change: `tour-model-renderer.ts` decorates supplied room shells with approved public panorama URLs, using perspective-correct world-coordinate interpolation. Interior-face culling provides a cutaway; orbit, zoom and room links remain functional. The image-derived appearance is approximate, with an assumed eye level and no furniture depth reconstruction. GPU texture upload storage is bounded to approximately32MiB across displayed rooms. Failed texture loads keep plain surfaces and show a visible warning. Resources are cleaned up on unmount. No schema or authorization policy was broadened.

Minimum evidence:

- `functional-corrected.log`: **one focused desktop browser journey passed in1.6min**. Five loaded 3D room textures; keyboard orbit; model zoom; model-to-living-room entry; five panorama renders, keyboard rotation and scroll zoom; zero page errors. An intentionally blocked bathroom image yields4/5 textures, a visible unavailable-texture status and usable 3D geometry.
- `model.png`: actual public textured 3D model after orbit and zoom.
- `living-360.png`, `kitchen-360.png`, `bathroom-360.png`, `bedroom-one-360.png`, `bedroom-two-360.png`: actual in-app generated property views.
- `web-types.log` and `lint.log`: focused consumer types and lint passed.
- `persisted-state.log`: actual processing stage/media publication state.
- `functional.log`: retained initial setup refusal because the revision response omits its version. The setup now sends the initial revision version1; server version/workflow checks remain unchanged.

V: This tests the real upload, review, publication, browser rendering/navigation and CPU optimization flows with **generated** content. It does not establish a real property's appearance or dimensions. The 3D display consists of panorama-textured authored room shells; furnishings are projected pixels, not recovered meshes. Generated panoramas may have seam/projection artifacts and are not camera-calibrated evidence. No trained reconstruction, engine publication package, independent human approval, continuous walkable space or production readiness is claimed. This is a local update, not a remote deployment. Root120/120 and engine56/95 remain unchanged;37 non-VR tasks unfinished plus2 VR paused. Release gates continue to refuse unfinished work.
