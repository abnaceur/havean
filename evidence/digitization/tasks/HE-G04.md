## Acceptance
Add plan-map node positioning where geometry exists.
Accepted after HE-G03 and HE-E09. Minimum: Clicking confirmed plan node opens corresponding panorama.

## Implementation
Optional backwards-compatible planPosition requires explicit finite coordinates, linked room/current geometry, correct floor and author confirmation. API rejects outside-room/hole/boundary/wrong-floor positions; source/current/version/immutable graph guards remain. UI leaves missing positions empty, clears confirmation after edits, records current geometry coordinates without guessing metric scale or room centroids. A current private plan map displays traced room/holes and clickable keyboard buttons only for saved confirmed positions; selecting exact node switches to its private panorama. Unscaled drawings stay pixel units; source/geometry independent review remains pending. Stale geometry IDs suppress the map.

## Tests
`./test-runner-protocol.sh tour-map` passes two actual desktop/mobile native-source/API/storage/geometry/tour/navigation journeys in tour-map-current-geometry-corrected-browser.log. Each fixture processes one plan and two independent panorama candidate sources, saves exact current private geometry/tour, opens corresponding panorama by map click/keyboard and rejects outside-room API mutation without a new tour revision. Changing geometry creates an actual immutable child, refresh suppresses stale map and clears confirmations; save then requires renewed supplied confirmation. Missing positions remain empty. Initial label query timeout corrected to role/combobox, and later exact-text alert lookup corrected to alert/hasText; failures retained. Navigation-only corrected run passed two checks before strengthening stale-geometry assertions, no clean earlier combined claim.
`docker compose exec -T api pnpm exec vitest run tests/unit/digitization-tour-position.test.ts tests/unit/digitization-tour-graph.test.ts` passes three checks in tour-map-position-units.log: room/floor interior, outer/hole boundary/exterior exclusion and legacy graph compatibility.
`docker compose exec -T api pnpm typecheck` passes all nine workspace packages in tour-map-all-types.log; final changed ops types pass in tour-map-final-ops-types.log.
`docker compose exec -T api pnpm test:unit` passes148checks/49files in tour-map-full-units.log.
`docker compose exec -T api pnpm lint` passes lint/import boundaries in tour-map-final-lint.log.
`docker compose exec -T api pnpm contracts:check` matches380 canonical operations/OpenAPI/native schemas in tour-map-contracts-check.log.
`docker compose exec -T api pnpm --filter @haven/api build` compiles160files without workspace source imports in tour-map-compiled-api.log.

## Limitations
Synthetic flat pixel plan/candidates and self-authored unscaled room boundaries/positions are CI evidence, not real geometry, customer capture, independent human review or genuine panorama certification. No guessed metres/height/pose. no device/GPU/headset, human/parity, production or whole-engine claim.

## Next dependency
HE-G05 tour/node exclusion and reviewed publishing integration.

## O
Self-authored pixels, synthetic room/position metadata and CI actors.

## R
Preserved specification, existing source/geometry/tour guards, Abu Dhabi and unknown-field rule.

## P
Actual native-source/private API/storage/geometry/tour fixtures and local implementation checks.

## V
no customer/country/human/parity/hardware or whole-engine claim.
