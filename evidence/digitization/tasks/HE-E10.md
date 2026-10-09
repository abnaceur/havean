## Acceptance
Structural mesh/GLB with approved opening geometry and explicit floor/axis conversion. In progress: scale/editor/render prerequisites, artifact storage and review delivery remain unfinished.

## Implementation
`structural-glb.ts` generates deterministic embedded glTF 2.0 binary floor slabs, concave rooms/holes and wall solids with supplied confirmed door/window cuts. Canonical X/Y/Z converts to glTF X/Z/-Y explicitly. Scale anchors are mandatory; missing wall/floor height or confirmed opening vertical dimensions blocks generation rather than guessing. Slab thickness is expressly an illustrative visualization assumption; height provenance and pending review remain encoded. Unconfirmed openings and non-geometric stair connections are declared rather than invented. Triangle/partition/Float32 precision budgets bound export work outside transactions.

## Tests
Two actual export checks pass in `validation/structural-glb-loader.log`: the pinned Khronos validator reports zero errors/warnings; Three.js GLTFLoader actually loads the emitted GLB with the same room ID. Independent binary signed-volume checks confirm the concave/hole slab and door/window void volumes, elevation and axis orientation. Repeated exports are byte-identical. Missing scale/height/sill and out-of-wall vertical dimensions reject. The first fixture used an invalid decimal `.2`; corrected to canonical `0.2`, with failure retained. An intermediate Float32 tuple cast failed typechecking and was corrected; corrected types/lint are retained.

## Limitations
This is structural plan geometry, not photogrammetry/CAD or an approved public artifact. No editor/public viewer/device acceptance or stored reviewed GLB yet. Export requires metric anchors; legacy/unscaled playback remains in the existing adapter and is never retrospectively measured. Arbitrary architecture, stairs and missing vertical opening data are not synthesized.

## Next dependency
HE-E05/E07/E09 full authoring/render delivery, HE-E11 actual browser viewer and HE-J artifact publication.

## O
No measured customer property.

## R
Supplied geometry truth/scale/opening rules and official glTF/Three.js format documentation.

## P
Authored synthetic geometry, actual Khronos validation and actual Three.js loader inspection.

## V
No property measurement, device performance, visual approval or independent publication.
