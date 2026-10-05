# English baseline review

The specification requires human approval of the first local English baselines. Reference parity remains a separate review: local screenshots do not prove measurements from m.ke.com.

`pnpm exec tsx scripts/capture-local-baselines.ts` is an explicit authoring command run on a fresh isolated Docker fixture stack. It creates 390, 375 and 1440 pixel candidates and a local HTML gallery. It refuses existing candidates and noncanonical community counts. CI never calls this command. Renderer, viewport, screenshot SHA256 and the 0.005 pixel ratio policy are recorded. Only the dated community statistics timestamp is masked.

Review `evidence/visual/candidates/index.html`. Record the user's approval or requested changes in the evidence ledger before setting `approved`, `approvedBy` and `approvedAt` in the manifest. An absent approval or changed screenshot hash fails `node scripts/visual-policy.mjs`. No comparison refreshes its own baseline. A rejected candidate can be archived explicitly and regenerated for another review.

Four CSS pixels are allowed for measured geometry anchors. The negative fixture moves a real card twelve pixels; the geometry gate must reject it. Accessibility checks similarly introduce unlabeled and hidden focusable controls and require their detection.
