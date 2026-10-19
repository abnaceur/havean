# Property step validation

O: The user requests form validation at each add-property step. Inspection found that basics could advance without validation and required media was only reported on review.

R: Current canonical inventory rules remain authoritative. Basics require a valid title and existing unit or complete new-unit fields. Details require a description, positive decimal asking price, valid optional fields and applicable commercial facts. Photos and a floor plan are required before review; video, panorama and GLB remain optional. Incomplete private drafts must still save.

P: API step advancement, media preparation and final submission enforce the relevant canonical validation within the existing actor/scope/version/workflow checks. Dotted field errors preserve exact field associations. Basics/details use separate forms with keyboard submission; the upload step retains its own form. The UI advances only after API acceptance, retains input and errors during autosave, and provides inline errors, linked summaries and first-invalid-field focus. Invalid fields scroll above the fixed footer. Back and Save & exit retain partial-draft behavior. Empty numeric input no longer becomes zero; unfinished commercial areas produce validation errors rather than Decimal exceptions. Money remains a decimal string. No endpoint or database migration was added. Digitalization stays disabled.

V: Complete on 18 October 2026. Recorded checks:

- `unit.log`: 12 passing cases covering basics versus details, missing title/unit, empty numeric fields, malformed/nonpositive prices, dates/currency, unfinished commercial fields and usable/gross-area constraints.
- `browser-initial.log`: 7/8 passed, including both complete submission journeys and both commercial-edit regressions. The remaining mobile test searched for the hidden “Step 3” text; its selector now uses the visible “Photos & media” label. Visual inspection also identified focus obscured by the sticky footer; explicit scrolling and a bounding-box assertion were added before the final wizard run.
- `browser-final.log`: all six final wizard tests pass on desktop/mobile, including the corrected mobile commercial journey and invalid-field visibility above the footer. Together with the two commercial-edit regressions, all eight required browser scenarios are verified.
- `types.log`, `lint.log`, `contracts.log`, `boundaries.log`: API/UI/web/ops types, focused lint, 453-operation generated contracts and application import boundaries passed. Final UI focus verification is recorded separately.
- `types-focus.log` and `lint-focus.log`: UI/web/ops types and focused lint pass after the scrolling adjustment. `diff-check.log` records the successful whitespace check.
- Desktop/mobile screenshots cover basics, missing media and commercial-area errors. Browser journeys cover accessible error association/focus, keyboard continuation, direct API bypass rejection, stale versions, actor isolation, failed-save recovery, incomplete draft save/resume, required-media gating and successful submission without optional media. Representative axe scans require no serious/critical violations; review checks include 320px overflow.
- The initial unit harness imported Zod from the workspace root, which has no root Zod dependency; the harness now asserts the thrown error shape without that import. The final unit run passes all 12 cases.
- `ledger-final.log`: synchronized task validation. `release-final.log`: release remains blocked by the existing UI-reference/physical-device, off-host recovery, remote-CI and unfinished engine gates; this completed request adds no new release exception.

No external-reference parity, physical-device verification or production-release approval is claimed. Existing release gates remain enforced. Browser fixtures use the existing local Compose environment and synthetic property/media data.
