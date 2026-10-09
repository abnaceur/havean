## Acceptance
Add undo/redo, autosave and revision conflicts. Concurrent save returns conflict and preserves both reviewers' work references.

## Implementation
The editor keeps bounded in-memory undo/redo for completed trace edits, debounces private autosave and checkpoints again before canonical save. PostgreSQL stores immutable actor-owned source-linked checkpoints, independently of canonical geometry revisions. Every checkpoint validates current agency/target, exact input/source processing authority, workflow and workspace version; identity/size/count limits are enforced. Conflict recovery returns the actor's preserved checkpoint and the current canonical revision. Restoring a checkpoint is an explicit review action against the current parent; it does not silently merge or publish either drawing. Source grants are rechecked on replay/read. No private geometry is written to browser storage.

## Tests
`./test-runner-protocol.sh plan-editor` — ten desktop/mobile editor journeys plus one actual distinct-reviewer database concurrency test pass in `evidence/digitization/trace-checkpoint-target-fixed.log`. Two separately identified currently authorized actors receive explicit exact-revision grants from the real listing owner, checkpoint distinct wall coordinates and race canonical saves. Exactly one saves and the other receives 409; both actors can retrieve their own original checkpoint and the same winning revision, and one cannot read the other's checkpoint. Stale autosave rejects without losing its earlier checkpoint. Actual mouse/touch undo/redo removes/restores a wall; autosave survives reload, explicit recovery and immutable canonical save. Existing source, wall, room, opening, scale, replay and floor tests still pass.
Full 123 units/39 files, nine workspace types, full lint/import boundaries and 362 canonical operations pass in trace-checkpoint-unit-final.log, trace-checkpoint-types-final.log, trace-checkpoint-lint-final.log and trace-checkpoint-contracts-check.log. SQL174 applies on development/integration. Initial fixture failures correctly rejected a non-owner evidence grant and an intake-labeled listing run; logs are retained, and the fixture was corrected to use owner grants and the actual target.

## Limitations
Autosave covers completed validated geometry, not unfinished room vertex sequences or cross-device undo history. Undo history is bounded to 50 local snapshots; immutable autosave capacity/bytes are bounded. Complex merge, metric editing, collaborative automatic merge, independent geometry approval and physical property accuracy remain separate work.

## Next dependency
HE-E09 deterministic render integration and reference approval, then structural GLB/dollhouse. Remaining orchestration/processing tasks continue independently.

## O
Self-authored image pixels and separately identified synthetic authorized reviewer fixtures only.

## R
Supplied immutable revisions, current authority/version/state, valid topology and preservation of concurrent work requirements.

## P
Actual PostgreSQL concurrency/RLS, owner grants, isolated source processing and desktop/mobile browser input/recovery.

## V
No human geometry/parity approval, authorized Abu Dhabi benchmark measurement, GPU reconstruction or headset acceptance.
