## Acceptance
Add openings and room labels. Door bounds are validated and room labels escaped in SVG output.

## Implementation
The private editor draws closed source-linked room boundaries and manually named labels, adds doors/windows to selected walls, preserves unknown sill/opening heights and defaults to unconfirmed opening positions. Shared contract and API validation require a positive opening width inside the current wall and valid closed room topology. Explicit source-position confirmation remains separate from geometry review; trace saves remain review-pending/unscaled. Deleting a wall deletes its draft opening references. Room names render as text and the private SVG renderer escapes XML, with no executable markup. A session-bound current-source preview uses sandbox/no-store headers and a binary SVG response, retaining JSON response validation elsewhere.

## Tests
`./test-runner-protocol.sh plan-editor` — four actual desktop/mobile browser journeys pass (`evidence/digitization/openings-browser-binary-fixed.log`). Sources are genuinely scanned, rasterized in the isolated runner and privately committed. UI and direct authenticated API reject an out-of-wall opening without changing the saved version. Saved/reloaded source room labels and doors preserve unknown heights; SVG door spans have independently expected pixel endpoints and script-shaped labels remain escaped text. Mouse and touch interactions are real browser events.
`docker compose exec -T api pnpm exec vitest run tests/unit/digitization-plan-render.test.ts tests/unit/digitization-plan-page.test.ts tests/unit/digitization-contracts.test.ts` — 17 passed (`openings-render-contract-unit.log`), including confirmed/unconfirmed openings, topology, escaped text, unscaled/estimated net-area rules and actual bounded PNG pixels.
Nine workspace types, full lint/boundaries and 358 canonical operations pass. Initial SVG-as-JSON hook failure is retained in openings-browser.log; returning binary SVG fixed it without weakening JSON validation.

## Limitations
No automatic room/door detection, official areas, scale/height approval, metric editing, multi-floor/split/autosave, 3D, country benchmark, headset or publication approval. New route parity and inventory navigation/application remain separate unfinished work.

## Next dependency
HE-E05 scale anchors and HE-E06 split/merge/multi-floor editing, then conflict/autosave/render/3D tasks.

## O
Self-authored source pixels and labeled synthetic test geometry only. No customer records or human parity measurement.

## R
Supplied private/source-linked geometry, bounded validation, exact actor/version/state and unknown dimensions requirements.

## P
Actual scoped immutable API drafts, source overlays, browser input and binary SVG preview; no simulated processing results.

## V
Physical/customer benchmark accuracy, parity, real device/GPU/scene/headset and independent publication remain unverified.
