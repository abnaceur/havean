# Haven property digitization engine

User-supplied implementation contract, 6 October 2026. Target: abnaceur/havean,
inspected main commit `4c5b9f976f9df197ea65dafdbcd453bceda03f56`.
The root AGENTS.md and original SPECIFICATION.html remain authoritative for
platform architecture. This extension must not redirect into marketplace P01.
The atomic acceptance backlog below preserves the supplied task rows; the
following requirements are a repository-oriented transcription of the supplied
engine specification. Proposed paths describe new work, not existing capability.

## 0. Repository integration and material gaps

| Boundary | Existing implementation | Required reuse/extension |
| --- | --- | --- |
| Worker | apps/worker/src/main.ts, BullMQ 6.3.11/Valkey/outbox recovery | Separate digitization queue/processor; reminders/search retain capacity |
| Upload | apps/api/src/inventory/media.ts, intents/content, ClamAV/Sharp/video/private S3 | Reuse small uploads; capture multipart/streaming with asynchronous processing |
| Private evidence | Owner documents and moderator/owner grants | Explicit scoped preview/processing grant; agency membership never opens an owner's deed |
| Rich media | apps/api/src/inventory/rich-media.ts | Attach through inventory service with version and independent publication review |
| Legacy geometry | packages/contracts/src/property-media.ts | Preserve convex normalized polygons, required sceneId, supplied floor dimensions, default 2.7 m height; separate versioned canonical geometry |
| Editor | packages/ui/src/spatial-media-editor.tsx and media-studio.tsx | Extend numeric bounds with tracing, walls and openings |
| Viewers | apps/web/src/property-media.tsx, tour-plan.tsx, tour-model.tsx, spatial-model.ts | Preserve lazy loading/retry/fallback/room linking; add structural/splat adapters |
| Existing 3D | Handwritten WebGL plan extrusion | Illustrative; reconstruction, GLB and WebXR are new |
| Identity | Canonical units/listings/mandates/owner grants | Explicit targets and permission lineage; listing/unit/development floor type IDs differ |
| Publication | Listing/development/media independent review and pending revisions | Agent prepares draft; independent review still publishes |
| Contracts | Zod/generated operations/client/OpenAPI | Extend generators; regenerate, never hand-edit derived files |
| Testing | Vitest, isolated Compose, Playwright, test.sh/ci.sh | Current lanes and immutable visual baselines; no simultaneous isolated suites |
| Licensing | Dependency/image manifests and scripts/licenses.mjs | Cover Python/model/CUDA dependencies and added service images |

Do not create engine-api or engine-coordinator Node applications, another session
store, tenant system, outbox, queue store, standalone viewer or Temporal deployment.
`media_assets.status='approved'` means scan/decoder approval;
`listing_media.status='approved'` means independent publication review. Generated
outputs require both applicable validation and publication approval.

Current caps: video 40 MiB, panorama/document 20 MiB, ordinary image 10 MiB.
Legacy BFF/API upload bodies are buffered and some processing holds transactions;
2 GiB captures must use a new path with long processing outside transactions.
A 2:1 image passes shape checks, not panoramic provenance verification. Retain
legacy compatible assets; new tour inputs need source declaration and review.
Legacy geometry cannot express unscaled/concave/no-panorama plans or measured
openings. Defaults and historical supplied values remain
`legacy_supplied_unverified`; synthetic fixtures remain illustrative.
Ops ordinary fetch timeout is 30 seconds except media; dedicated streaming must
forward Last-Event-ID without globally removing timeouts or CSRF.
Root scripts/tasks.mjs retains exactly 120 original IDs. HE-* uses a separate
ledger; do not reuse D08/D09 or other marketplace IDs.

Start with authorized agent listing digitization or private intake. Owner intake
reuses the owner wizard and reviewer-only evidence policy. Beijing/CNY synthetic
inventory must not acquire fabricated UAE/Algerian locations, currencies or legal
authority. A deed can yield a private candidate draft without geography resolution;
publication requires reviewed market configuration and canonical community,
building and unit mappings. Development floor types have distinct identity/reuse
scope and authoring/publication rules. Type-template propagation is later work,
not permission to share private listing evidence across developments.

Repository references are pinned to the inspected commit. HE-A01 records checked
paths and head differences in docs/digitization/repository-audit.md.

## 1. Objective, truth and delivery

Turn documents, plans, photos, guided video and optional genuine 360 panoramas into
reviewed property drafts, editable geometry, 2D/3D plans and interactive tours.
Processing is asynchronous, interruption-safe, and publishes only approved versions.
Codex executes development; it is not a runtime dependency. No unrestricted shell
agent, autonomous coding agent, proprietary reconstruction API or paid AI provider
is required. Optional extraction models are replaceable adapters. Development
simulators require an explicit flag, cannot produce production-ready artifacts,
and cannot pass real reconstruction acceptance.

A title deed supplies documented facts, not an interior plan unless one is actually
included. Unknown bedrooms, dimensions, walls, windows, coordinates and ownership
remain unknown. Overlapping varied views may reconstruct; independent marketing
photos may only make a gallery. RGB reconstruction has arbitrary scale until
metric anchors; no metre display from an unscaled reconstruction. Splats are visual
scenes, not automatically watertight/collision/CAD/complete/measured models.
Structural dollhouses and photorealistic scenes are separate assets. A genuine
panorama tour is independently valid; never fabricate panoramas from unrelated
photos. Compare areas only with compatible units, scope and basis. Automatic plan
parsing makes drafts requiring correction/review until benchmarked. Browser cameras
must not pretend to expose native depth/LiDAR/device poses.

| Release | Required capability | Gate |
| --- | --- | --- |
| R1 | Secure upload, OCR, country schemas, source review, gallery, durable jobs | Scan yields reviewable draft without invented fields |
| R2 | Manual/assisted tracing, SVG/PNG, structural GLB, real panorama | Edited geometry consistent in 2D/3D |
| R3 | Guided video, quality checks, COLMAP, gsplat, scene viewer | Real suitable dataset reconstructs; unsuitable data requests recapture |
| R4 | Plan navigation, device-tested WebXR, tiers, operational controls | Approved package securely served on supported devices |
| R5 optional | Native depth, trained plan model, improved masks, assistant | Separate data/accuracy/license/performance gates |

All R1–R4 are in scope. R1 is not full completion. Experimental automatic RGB to
measured floor plans and perfect photorealistic dollhouses are outside baseline.

## 2. Architecture and workflow

Extend existing apps/api (NestJS/Fastify /api/v1), apps/worker, apps/ops, apps/web
and @haven/ui. PostgreSQL/PostGIS and @haven/database own relational state,
transaction-local actor/org scope, RLS, revisions and stage ledger. Existing
BullMQ/Valkey transport uses a dedicated engine queue and shared transactional
outbox. Coordinator code lives in apps/worker/src/digitization; business transitions
stay in API-owned inventory services or guarded internal commands.

New services/property-processing contains isolated Python CPU/GPU runners with an
authenticated internal execution API and subprocess supervision. Tools: PaddleOCR
(pinned Arabic/French/English models), country parsers and optional structured
models; deterministic geometry/SVG; FFmpeg/ffprobe; COLMAP/pycolmap;
versioned gsplat training; Open3D only where needed; Three.js/glTF structural
rendering; replaceable Three.js-compatible splat adapter beginning with a
GaussianSplats3D compatibility spike; equirectangular panorama and WebXR.
Existing SeaweedFS private S3, ClamAV, Keycloak, DB, Valkey and gateway remain.
Use existing telemetry and Docker/Compose, with optional GPU profile.

Pin Python dependencies separately; retain pnpm/runtime versions unless a tested
compatibility change is necessary. GPU work runs outside API/Node event loop.
No SQL transaction spans OCR, decode, reconstruction or object transfer. Short
transactions validate, snapshot, dispatch and commit. Each execution has bounded
isolated scratch. Frontends cannot import database/API internals.

Finalize and scan uploads first. Snapshot immutable input revision and branch:
1. classify documents, inspect text/rasterize, OCR, extract evidence candidates;
2. select plan pages, orientation/scale review, trace/edit/validate/render;
3. probe/normalize/quality-check media, group rooms/select frames;
4. validate panorama projection, optimize and build graph;
5. solve cameras, quality-gate, train splats, export/viewer-gate;
6. assemble valid artifacts/blockers/limitations, human approval, immutable package.
Branches may skip, block, fail or complete independently. Reconstruction failure
cannot delete valid document/plan/panorama output. Publish policy distinguishes
optional assets and required facts.

## 3. Workspace and review

Add Create digital property to existing Haven navigation. Select assigned listing
or private intake in a currently authorized agency context, attest upload authority,
upload labeled documents/media (documents optional), review fields beside exact
page/crop, draw/trace/upload a plan or continue without it, add room labels and
overlapping video/genuine panoramas, leave/resume durable stages, then review
separate gallery/2D/3D/panorama/scene tabs. Agent verifies selected output and
submits existing independent listing/media review; authors cannot self-approve.
Intake must not manufacture missing canonical unit fields. A deed without a plan
must not imply a generated plan. English UI first; Arabic OCR uses RTL and retains
original labels. Locale-independent values and dictionaries, no UI text in workers.

Review displays Document value, Normalized value, Source, Extraction score and
Review status. Scores are uncalibrated diagnostics, not truth probabilities.
Private identity/registry fields are restricted. Accept, correct, reject, unknown,
conflict and replacement actions retain history. Identity, applicable area and
location require explicit confirmation before fact publication. Acceptance does
not authenticate deeds or certify ownership.

Show stage descriptions, not fabricated percentages. Quantitative progress needs
a worker-supplied denominator. Timeline, cancellation, branch retry and recapture
must survive resume. Explain unreadable unit numbers, missing hallway transitions
and absent plan scale in actionable terms. Managers see authorized properties and
quotas, not deeds without explicit grants. Operators receive redacted diagnostics,
supported retries/cancellation/revocation/profiles. Full document access requires
explicit authorization; logs are not an evidence browser. Audit all actions.

## 4. Canonical contracts and relational state

Facts support country/region/emirate/wilaya/city/district/address/type/tenure,
plot/building/unit/floor IDs, land/unit/built-up areas, rooms/parking/terraces,
boundaries and dates when present. Owner/registry facts are separate private data.
Room/parking facts may come from manual input/plans. Every candidate stores field,
rawText, normalizedValue, origin, extractionScore/scoreMethod, evidence,
review status/actor/time, extractorVersion and inputRevision. Example source value
`184,20 m²` represents amount `184.20`, unit `m2`, basis `document_unit_area`;
persist decimal quantities as decimal strings rather than illustrative JS floats.
Evidence includes assetId/page/bbox/coordinateSpace/quotedText. Bbox is normalized
[xMin,yMin,xMax,yMax], upright-page-normalized-top-left. Preserve original-to-display
transforms. Corrections reference original candidates without erasing evidence.
null means unknown; zero is real. Dates include calendar/precision; IDs stay strings.

GeometryRevision stores schema version, organization/property scope, immutable
revision, sources/transforms, coordinates/unit/scale status/anchors, floors,
room polygons/holes, walls/openings/stairs/terraces and review state. Canonical
coordinates are right-handed X/Y horizontal, Z up, local origin independent of
GPS. Explicit tested conversion to Three.js; no mixed coordinate inference.
Unscaled pixels cannot expose metric measurements or measured GLB; illustrative
renders label unscaled. Walls have IDs/endpoints or supported polylines, thickness,
floor/height/source/confirmation. Openings belong to a wall with offset, width,
type and known sill/height; no unsupported cutouts. Rooms have closed polygon,
optional holes, floor/type/name/source/area method. Floors carry elevations,
ordering and explicitly illustrative default heights. Scale anchors record two
points, metric distance, source/reviewer; a nonparallel second checks distortion.
Conflicts require correction, never silent stretch. Scene transform is versioned
4x4 with scale/alignment evidence, determinant/units validation. Reject intersections,
duplicate IDs, disconnected/opening floor mismatch, nonpositive widths and
out-of-wall offsets/incompatible anchors. Geometry area does not become official
built-up area automatically.

Assets store uploader/scope/kind/private key/checksum/size/MIME, upload/malware
state, sensitivity, rights, metadata, retention, lineage/revision. Artifacts store
run/stage/input fingerprint, immutable key/checksum/format/schema/profile,
software/model/container versions, quality, privacy/review state and creation.
Scene manifests specify viewer/format/compatibility, bounds/units/scale/transform,
tiers/thumbnails, node graph/navigation anchors, limitations and approved revision.
Splat adapters specify PLY attributes, SH degree, scale/rotation/opacity encoding
and coordinate conversion; PLY is not one universal format.

Inventory owns: property_digitizations, property_input_revisions,
digitization_asset_bindings, document_pages, fact_candidates, append-only
fact_decisions, geometry_revisions, capture_sessions, processing_runs,
processing_stages, stage_attempts, artifacts, tour_revisions, approval_records,
published_packages. Reuse platform outbox/outbox_effects and audit_events without
private document text. Tables carry organization_id/creator/explicit target and
unit/listing lineage with RLS, matching org/target constraints and one active
engine record per authorized property scope. Existing actor/organization/resource
grants implement illustrative tenantId; no replacement tenant model. Owners may
have no membership; same unit can have multiple mandates. Membership does not open
private evidence or another agency's runs. Check current assignment, mandate,
membership, owner and time-bound evidence grants; test two agencies on one unit.

## 5. Documents

Initially accept PDF/JPEG/PNG; existing owner private PDFs retain their policy,
with explicit scanned-image evidence binding rather than relaxed public photo
rules. Reuse quarantined rows/ClamAV. Multipage rasterization/OCR are new isolated
work. Detect bytes/MIME, page/expanded budgets, reject encrypted PDFs clearly,
inspect native text before OCR. Small caps remain 20 MiB documents and 10 MiB
ordinary images, with 50-page/30-megapixel raster budget. Larger document limits
need new upload path and measured review. No archives/office files.
Private originals derive upright pages/crops. Preserve Arabic/French/English raw
text, normalize separators/Arabic-Indic digits/units without translating evidence.

Registry keys country/document family: UAE deed, Algerian booklet/deed and generic.
Enable country parsers only after representative authorized labeled benchmarks;
unknown variants use generic/manual review. Layout/OCR, classification, anchored
parser, optional VLM, schema and evidence validation yield candidates. No external
LLM subscription required; report disabled enrichment and continue. Text/model
output is untrusted. Models get no credentials/shell/publish/arbitrary network;
reject executable/unsupported/untraceable claims. Conflicts yield parallel
candidates/blockers; lower-quality runs cannot overwrite confirmed values.
Ambiguous area basis stays explicit; no legal clearance/ownership authentication.

Enabled families require at least 10 independent labeled examples including
native/scanned/rotated/blurred/multipage/mixed-language cases. Record field exact
match, numeric/unit accuracy, evidence validity and abstention; target 95% supported
critical-field normalized accuracy on this smoke set, not general accuracy proof.
Human confirmation remains required; expand holdout before public claims.

## 6. Plans

Manual drawing/source tracing first, then editable line/contour/label proposals.
A trained parser is optional with separate dataset/license gate. Select source,
deskew/extent/transform, propose lines/rooms, request scale, correct, validate and
render revision. Editor: pan/zoom/overlay opacity/snapping, wall draw/move/delete,
doors/windows, labels/types, simple split/merge, anchors, floors, undo/redo,
autosave/conflicts. Orthogonal/angled straight walls first; unsupported curves
remain trace or flagged approximation. Split/merge updates polygons/associations;
room adjacency needs geometry/user verification. Stairs explicitly name floors;
no automatic alignment without evidence.

Keep FloorLayout/MappedRoom unchanged and approved fixtures readable. Optional
version/scale/revision envelope coexists with independent v2 geometry; v2 rooms
have optional panorama links. One-way legacy conversion uses supplied dimensions,
explicit Y-up to Z-up and `legacy_supplied_unverified` heights/dimensions. No
migration confirms defaults or guesses doors/camera movement. Concave polygons
use validated triangulation, never legacy triangle fans. Measured render needs
anchors/review. Old public serializer keeps approved-scene predicates; new plan
serializer independently serves reviewed plans without panoramas.

Outputs: provenance JSON, deterministic SVG/PNG (metric labels only when scaled),
structural GLB floors/walls/approved openings, cutaway dollhouse and common room
IDs. Escape labels/SVG/HTML and license fonts. No generative raster model draws an
allegedly accurate floor plan; staged/furnished images are separate illustrative
assets, never measurements or replacements for originals.

## 7. Media and guided capture

Probe JPEG/PNG, tested MP4/MOV codecs and genuine equirectangular panoramas.
Capture multipart product defaults: 2 GiB/clip, 10 minutes/clip, 20 GiB/property,
configurable after load/storage/cost measurement. Never raise legacy buffered
caps. Direct resumable multipart grants are bounded. Supported browser MIME
recording uses segments, no audio by default; native upload fallback.

Checklist guides lighting, slow motion, overlapping viewpoints, continuous door
transitions, static/textured surfaces, no zoom/lens changes and glass/mirror/blank
wall risks. Support floors/sessions. Local blur/brightness/recording feedback and
checklists; processing redundancy/registration/components. No invented live
geometric coverage. Save ordering/timestamps/orientation/lens/room annotations.
Location metadata requires consent; public EXIF removed. Nonreconstructable photos
remain gallery-eligible. Initial benchmark profile samples 1–3 fps targeting
150–600 useful frames for a small property, not universal acceptance thresholds.
Filter gross blur/duplicates while preserving diversity/doorways and camera groups;
version thresholds. Exclude sensitive inputs, mask faces/plates/documents/objects
before training public scenes and review exports. Thumbnail blur does not purge
splats. Privacy failure blocks public scenes, not authorized private drafts.

## 8. Reconstruction

Pinned COLMAP sequential matching for continuous video, tested cross-clip/loop
links, bounded broader matching fallback. Export calibrated cameras/poses/points
and frame count, registration ratio, components, reprojection distributions,
tracks/bounds/limitations/scale. Advisory defaults: ≥70% selected frame registration,
median reprojection <2 px, required room connectivity. Calibrate on benchmarks;
these do not certify completeness or metric accuracy. Disconnected rooms may be
separate explicit scenes; no guessed transforms. Recapture transitions or approved
alignment. Metric scene requires approved anchors/depth/validated scale.

Implement a real versioned gsplat wrapper or approved official training example,
with registered calibrated views/points as inputs. Pin torch/CUDA/gsplat. Profile
sets resolution/splat cap/iterations/time/densification/checkpoint/export.
Hold out separated views, not near-duplicate neighbors; metrics plus human render
review, metrics alone do not prove geometry. Durable checkpoints outside process
memory. OOM allows one reduced-memory profile; repeated input failure requests
recapture, no unlimited retries. Cancellation terminates subprocess and fences
stale publication. Export private full scene/viewer tiers/bounds/thumbnails/
checkpoints/compatible manifests. Actually load selected viewer. Reject NaN,
infinity/extreme scale/empty/broken bounds/attribute mismatch. Mesh optional with
own QA, not a guaranteed splat/collision conversion; structural GLB differs from
photogrammetric mesh. Navigation uses approved anchors/structure; limit unverified
free movement.

## 9. Viewer, VR and budgets

Separate photo/plan/3D/panorama/reconstruction tabs; only approved available public
tabs. Label incomplete scene room coverage; universal gallery fallback. Tour nodes
have room/artifact/yaw/pitch/hotspots and optional approved plan coordinates;
reject missing nodes/images. Desktop mouse/touch/keyboard required; optional
permission-gated gyroscope. Structural orbit/floor/cutaway/room highlight; splat
bounded navigation/anchors/reset/tiers/progress/fallback. Floor map needs verified
transform/anchors. Release GPU resources on navigation.

WebXR runtime capability under HTTPS, user-gesture entry, exit/reset, approved
teleport anchors. No working VR badge before device test. One documented real
headset/browser with stereo/per-eye projection/controllers/navigation/session
lifecycle and performance is required. If splats fail, offer tested structural or
panorama VR; explicitly mark splat VR unsupported. Mocks cannot replace device gate.

Provisional measured-reference targets: plan/desktop ≥30 fps, headset supported
refresh (minimum 72 fps for a 72 Hz device). Tier sizing initially <25 MiB mobile,
<100 MiB desktop where acceptable; measured bytes/splat count. Bigger assets need
proven streaming or room packages, not claimed monolithic streaming. At 20 Mbps,
25 MiB is roughly ten seconds; show thumbnail/shell and realistic download progress,
not two-second full load. Low-memory tier fallback.

## 10. Durable execution

Run states: draft/queued/running/awaiting_input/awaiting_review/ready/partially_ready/
failed/cancel_requested/cancelled. Publication is a distinct package operation.
Stage states: pending/queued/leased/running/succeeded/failed_retryable/
failed_terminal/awaiting_input/skipped/cancelled. Check prior state, revision,
fencing token for every transition. Superseded runs stay private and cannot
overwrite/publish newer drafts.

In one actor transaction, recheck target/evidence authority, snapshot revision,
create run/dependencies and inventory event. Register engine consumer so generic
processor cannot swallow its events. Relay stable queue ID; duplicate delivery
acquires DB lease. Submit typed unique execution ID to authenticated runner, which
durably records and returns promptly. Node monitors with live heartbeat. Runner
progress/callbacks are scoped/authenticated/idempotent; polling repairs loss.
Completion rechecks lease/cancel/revision/checksums, commits output/next events.
Reconcile missing queue/expired leases/disconnections/stale stages; query execution
ID before restarting GPU. Fingerprint hashes/assets/geometry/profile/model/config.
Reuse only compatible authorized/private-reviewed scope; no global tenant reuse.

Transient retries default three, exponential+jitter with caps. Invalid input
terminal/awaiting input. One COLMAP fallback and one lower-memory training profile;
budget failure explains blocker. Cancel via DB flag/fence/process-group termination,
remove temporary uncommitted output, preserve prior approved packages. Late success
cannot override cancelled stages. New revisions invalidate affected dependencies
only. Dead-letter diagnostics, tenant fairness, one heavy job/GPU initially,
quotas/bounds. Queue loss recovers from PostgreSQL without losing successful outputs.

## 11. API and runners

Reuse Identity.actor, transaction, idempotent, data, fail and generated /api/v1
envelope. All browser calls use BFF sessions; client org IDs confer no authority.
Listing base `/api/v1/ops/listings/{listingId}/digitization`; explicit development
rules, owner-specific evidence port. Private intakes POST/GET
`/api/v1/ops/digitization-intakes[/id]` and POST `/id/attach-to-listing` preserve
creator/current org/grants/reviewed target link. Attach rechecks draftCreate,
draftUnit and existing-unit rights. No fabricated unit/geography/address/rooms.

| Method/suffix | Contract |
| --- | --- |
| GET / | Draft, revision, runs, capabilities, blockers |
| POST /capture-uploads; POST /capture-uploads/{id}/complete | Constrained multipart, authoritative object/checksum/binding; async scan/decode |
| POST /asset-bindings; DELETE /asset-bindings/{id} | Owned scoped scanned assets, revision/invalidation/retention, no arbitrary keys |
| POST /runs; GET /runs/{id}; POST /runs/{id}/cancel or /retry | Snapshot, durable states, bounded scoped actions |
| GET /events | Authenticated resumable stream |
| GET /facts; POST /fact-decisions; POST /apply-draft | Scoped candidates/versioned decisions, inventory service and pending revisions |
| GET /geometry; POST /geometry/revisions | Validate expected parent |
| POST /capture-sessions; PATCH /capture-sessions/{id} | Resumable ordered clips/checklist |
| POST /tour-revisions | Same-property panorama/hotspot checks |
| POST /review-submissions or /review-decisions | Immutable selection, independent current authority/version/dependencies |
| GET /artifacts/{id}/preview | Scoped private BFF preview, no provider key |

Public `/api/v1/listings/{id}/digitization-manifest` and
`/digitization-artifacts/{artifactId}/content` recheck publication/artifact approval,
scope/dependencies/revocation on every request, use relative BFF URLs. Existing
`tourAvailable` keeps panorama predicates; independent `scene3dAvailable` denotes
approved reconstruction. Binary GLB/splat has new validated storage/format records,
not legacy floor_plan PLY or raster proof. Generated images/real panorama/video
attach through inventory listing_media; geometry/GLB/splats use reviewed engine
relations.

SSE BFF forwards Last-Event-ID, no buffering, headers/client-abort, periodic session/
membership/evidence checks, expiry/revocation termination, bounded reconnectable
policy. Ordinary timeouts/CSRF unchanged. Capture must avoid req.arrayBuffer/large
API buffers; real SeaweedFS multipart/abort/checksum verified before enabling.
Idempotency-Key required for runs/complete/review/attach with existing canonical
actor/method/URL/org/body hash; changed body 409, optimistic conflict 409,
async 202, invalid fields 422, oversize 413, quota 429/retry info. Error envelope:
code/message/requestId/fieldErrors?/recoverable/action?; no stack/path/doc text/
secret. Events carry authorized scope/property/run, monotonic sequence/kind/state/
time; replay then live.

Internal runner POST /executions, GET /executions/{id}, POST /executions/{id}/cancel
uses execution/stage/restricted-artifact/profile/budget/deadline. Allowlisted typed
commands only, job-scoped expiring credentials, authenticated callbacks, private
endpoint, no user shell/network snippets.

## 12. Security, publication and lifecycle

Uploaded names/bytes/OCR/models are hostile input. Isolate parsing, no shell
interpolation/path traversal/arbitrary fetch/active SVG/external references;
enforce decompress/raster budgets and scan before model access. Originals/private
facts/points/checkpoints remain private; approved derivatives separate policy/keys.
Public manifests are field allowlists of approved IDs, never full internal objects.
Mask identity/contact/registry in previews/plans. Infrastructure transport/storage
encryption/secret rotation, downloads/corrections/retries/reviews/publication audit,
service-checked scope before object grants.

Configurable retention: incomplete uploads 24 h, terminal scratch 24 h, inactive
unpublished inputs 90 d per agency policy, approved active assets/account policy.
No invented jurisdiction compliance. Deletion revokes/cancels/purges and records
completion; separately document backups/purge windows. No training beyond requested
property reconstruction without separate consent.

Independent admin/moderator reviews immutable snapshot; reject authors including
admin authors. Recheck assignment/grants/dependencies before approval. Edits retain
current public package and require fresh changed-dependency approval. Temporary
keys/checksums and transactional manifest prevent half-write exposure. Preserve
listing_revisions and listing_media.pending_metadata, serializers/search through
owning ports. Existing search workerActor admin is not OCR authority; narrow run/
asset capability and separate runner identity with guarded commits, grant expiry/
reassignment tests. Revoke references and invalidate storage/CDN or short-lived
access with documented residual cache lifetime.

## 13. Infrastructure and operations

Existing Compose plus CPU runner, optional explicit GPU profile; ./dev.sh bootstrap
keeps existing credentials. No new DB/queue/store host ports. Real OCR/manual plans
without CUDA; actual splats unavailable without supported hardware. Initial GPU
sizing hypothesis: CUDA NVIDIA ~24 GiB, ≥8 cores, 32–64 GiB RAM, fast SSD; benchmark
VRAM/time/cost before tiers, not purchase recommendation. Larger buildings may
partition. Durable completed artifacts/checkpoints only; bounded cleaned scratch.
Unprivileged, resource/time/disk limits, explicit GPU, no Docker socket, pinned
image digests/model checksums, production runtime downloads disabled, CPU/GPU locks.

Liveness/readiness/lag/duration/errors/registration/GPU memory/bytes/tenant usage/
estimated cost, ID-only logs, crash/stall/storage/backlog alerts. Provisional
ordinary API p95 <500 ms at documented 50 clients excluding uploads/models; jobs
visible immediately, start <60 s only with capacity. ETAs use measured histories.
Daily backups/restore/recovery targets RPO 24 h/RTO 4 h are provisional until drill.
Reconstruction can rerun preserved inputs; approval/billing/audit need DB recovery.

## 14. Testing contract

Vitest/Playwright existing lanes plus pytest. DB/queue/storage use single-run
haven-integration; GPU separately isolated. Preserve visual hashes; new captures
are P until human review V. Fast types/lint/schemas/geometry/state; CPU real DB/
storage/queue/OCR/frames/application; browser review/editor/tour/auth/publication;
GPU actual COLMAP/training/export/viewer on tagged hardware when changing profiles
and before R3/R4; real device headset gate. Sanitized/synthetic deed fixtures,
licensed media/plans, labeled truth, no customer deeds in Git. Test overlapping IDs,
conflicts/duplicates/crashes/cancelled GPU/unknown scale/area conflicts/stale packages.
Each atomic task minimum meaningful test must pass, not mock existence assertions.

## 15. Atomic implementation backlog

States: todo/in_progress/blocked/done. Separate docs/digitization/TASKS.json and
generated TASKS.md; evidence/digitization/tasks/HE-*.md includes implementation,
exact command/result, limitations, next dependency and mandatory O/R/P/V provenance.
Validate unique IDs/existing acyclic prerequisites/nonempty contracts and done
evidence. Root task:validate checks both ledgers; release refuses unfinished
required backlogs. Root marketplace tasks/status/history remain intact.

### A. Repository and foundations

| ID | Task / acceptance | Minimum test | Dependencies |
| --- | --- | --- | --- |
| HE-A01 | Recheck inspected commit and mandatory root docs; record actual integration paths and head differences | Confirm legacy rich-media and outbox regression commands from the checkout | HE-R01 |
| HE-A02 | Add inventory-owned engine ADR and extend exact dependency/image/model licensing manifests | Frozen dependency resolution, extended license gate and CPU image build | HE-A01 |
| HE-A03 | Add versioned fact, geometry, job and manifest schemas | Reject invalid coordinates, unsupported units and missing evidence | HE-A02 |
| HE-A04 | Add SQL migrations after current maximum, RLS and inventoried engine table ownership | Fresh and existing-schema upgrade succeed; current-grant and cross-org relations denied | HE-A03, HE-R02 |
| HE-A05 | Add CPU/GPU profiles to current Compose/setup and runner network policies | ./dev.sh starts existing services plus CPU runner with no new infrastructure host ports | HE-A02, HE-A04 |
| HE-A06 | Add adapter interfaces and explicit development-only simulator | Production config rejects simulator adapter | HE-A03 |

### B. Agent identity and uploads

| ID | Task / acceptance | Minimum test | Dependencies |
| --- | --- | --- | --- |
| HE-B01 | Reuse Identity.actor, current assignment, mandate/owner/evidence grants and private intake authorization | Same unit across two agency mandates does not share deed/run access | HE-A04, HE-R02 |
| HE-B02 | Add capture-specific multipart path; reuse small signed upload intents | Resume capture upload through actual SeaweedFS path without legacy BFF buffering | HE-B01, HE-A05, HE-R03 |
| HE-B03 | Finalize with byte/MIME/object checks and quarantine | Forged MIME/oversized object cannot become processing eligible | HE-B02 |
| HE-B04 | Scan and raster-budget isolation | Test fixture rejected by scan policy; raster over-budget terminates safely | HE-B03 |
| HE-B05 | Store immutable asset lineage and input revision | Removing an asset creates new revision without altering old run inputs | HE-B04 |
| HE-B06 | Add source preview access and public derivative stripping | Unauthorized preview fails and public photo omits GPS EXIF | HE-B05 |

### C. Workflow and durable processing

| ID | Task / acceptance | Minimum test | Dependencies |
| --- | --- | --- | --- |
| HE-C01 | Implement run/stage dependency graph and legal transitions | Invalid transition and unsatisfied dependency cannot start | HE-A04, HE-B05 |
| HE-C02 | Extend existing event/outbox ownership and engine consumer dispatch; retain platform effects | Crash before engine enqueue recovers; search/reminder handling still passes | HE-C01, HE-R06 |
| HE-C03 | Build authenticated runner protocol and typed stage registry | Unknown stage/profile rejected; duplicate execution ID reuses execution | HE-A06, HE-C01 |
| HE-C04 | Implement leases, fencing and callback idempotency | Late completion with expired token cannot overwrite new attempt | HE-C02, HE-C03 |
| HE-C05 | Add reconciliation and runner reattachment | Kill coordinator during a real CPU task; restore without duplicate result | HE-C04 |
| HE-C06 | Add bounded retry/error classification | Invalid input does not loop; transient outage obeys retry cap | HE-C05 |
| HE-C07 | Add process cancellation | Cancel active child process and reject late success callback | HE-C04 |
| HE-C08 | Add budget/quota and GPU resource leases | Two heavy jobs cannot acquire same exclusive GPU lease | HE-C04 |
| HE-C09 | Persist progress and implement dedicated BFF stream/revocation checks | Cursor reconnect recovers events; revoked membership ends live stream | HE-C01, HE-B01, HE-R04 |
| HE-C10 | Add revision-aware reuse/invalidation | Media change leaves OCR artifact reusable but invalidates scene approval | HE-C05, HE-B05 |

### D. Documents and structured property facts

| ID | Task / acceptance | Minimum test | Dependencies |
| --- | --- | --- | --- |
| HE-D01 | Implement native PDF text/raster fallback and orientation | Rotated scanned page's evidence box aligns with displayed crop | HE-B04, HE-C03 |
| HE-D02 | Add real PaddleOCR worker with locale profiles | Authorized Arabic/French/English fixtures produce nonempty source-linked tokens | HE-D01 |
| HE-D03 | Implement normalization for decimals, units, IDs and calendars | 184,20 m² normalizes correctly; leading-zero ID stays string | HE-A03, HE-D02 |
| HE-D04 | Implement generic anchored extraction with abstention | Missing bedroom count remains unknown, never zero or guessed | HE-D03 |
| HE-D05 | Add UAE family profile and benchmark report | Holdout fixture extraction/evidence meets profile gate or profile remains disabled | HE-D04 |
| HE-D06 | Add Algerian family profile and benchmark report | Mixed Arabic/French fixture preserves area scope and source pages | HE-D04 |
| HE-D07 | Add optional structured model provider behind disabled-by-default config | No provider credentials still permits OCR/manual review; unsupported claim rejected | HE-D04 |
| HE-D08 | Preserve conflicts and decision history | Contradictory documents create two candidates and review blocker | HE-D05, HE-D06 |
| HE-D09 | Build source-linked fact review UI | Accept/correct field and confirm correct crop appears in Playwright | HE-D08, HE-B06 |
| HE-D10 | Add explicit fact-to-draft mapping, private intake, canonical geography resolution and pending-revision apply | Missing unit facts block creation; confirmed facts cannot overwrite newer published version | HE-D09, HE-C10, HE-R07 |

### E. Floor geometry and rendering

| ID | Task / acceptance | Minimum test | Dependencies |
| --- | --- | --- | --- |
| HE-E01 | Select/deskew plan page and preserve overlay transform | Source pixel and editor geometry mapping survive rotation | HE-D01 |
| HE-E02 | Add v2 geometry with optional panorama links; preserve legacy schema and triangulate concave rooms | Legacy fixture remains unchanged; v2 no-panorama and concave/hole geometry validates | HE-A03, HE-R05 |
| HE-E03 | Build plan canvas with source overlay and walls | Draw/move wall then reload retains geometry | HE-E01, HE-E02 |
| HE-E04 | Add openings and room labels | Door bounds validated and label escaped in SVG output | HE-E03 |
| HE-E05 | Add scale anchors and metric-state gate | Unscaled plan hides metre area; known dimension yields expected scale | HE-E03 |
| HE-E06 | Add split/merge and multi-floor editing | Split preserves valid polygons; stair connects selected floor IDs | HE-E04 |
| HE-E07 | Add undo/redo, autosave and revision conflicts | Concurrent save returns conflict and preserves both reviewers' work references | HE-E06, HE-A04 |
| HE-E08 | Add assisted line/label proposals | Source plan yields editable proposals with no automatic approval | HE-E01, HE-D02, HE-E03 |
| HE-E09 | Render deterministic SVG/PNG | Approved reference geometry matches expected topology/dimensions | HE-E05, HE-E07 |
| HE-E10 | Build structural mesh/GLB with openings and floor conversion | Load GLB and inspect correct wall/door/floor geometry and axis orientation | HE-E09 |
| HE-E11 | Add 3D plan/dollhouse viewer | Select floor/room and verify matching 2D/3D room ID | HE-E10 |

### F. Media and guided capture

| ID | Task / acceptance | Minimum test | Dependencies |
| --- | --- | --- | --- |
| HE-F01 | Probe media codec/orientation and normalize thumbnails | Rotated supported clip renders upright; unsupported codec returns clear error | HE-B04, HE-C03 |
| HE-F02 | Extract frames and retain camera/lens metadata | Frame timestamps and orientation match known fixture | HE-F01 |
| HE-F03 | Add blur/duplicate filters and dataset report | Reject blurred duplicates while retaining doorway sequence | HE-F02 |
| HE-F04 | Build room checklist and resumable capture session | Close/reopen app resumes room and uploaded clips | HE-B05 |
| HE-F05 | Add supported browser recording/clip upload and fallback | Supported browser records/uploads; unsupported MIME offers native upload | HE-F04, HE-F01 |
| HE-F06 | Add capture guidance and local quality feedback | Blur guidance shown from real frame input without fabricated coverage percentage | HE-F05, HE-F03 |
| HE-F07 | Add privacy exclusions/masks before reconstruction | Sensitive fixture region excluded/masked in actual training images | HE-F03, HE-B06 |
| HE-F08 | Build independent gallery from approved photos | Failed reconstruction does not hide approved gallery | HE-F01 |

### G. Panoramas and reliable virtual tours

| ID | Task / acceptance | Minimum test | Dependencies |
| --- | --- | --- | --- |
| HE-G01 | Validate genuine panorama inputs and create tiers | Arbitrary 2:1 normal photo is flagged for review rather than auto-certified panorama | HE-F01 |
| HE-G02 | Store tour graph and room/node links | Dangling hotspot node rejected by API | HE-G01, HE-A03 |
| HE-G03 | Extend existing panorama viewer/hotspots and capture review; preserve approved-tour predicates | Existing two-node tour plus new reviewed capture passes keyboard/touch/fallback tests | HE-G02 |
| HE-G04 | Add plan-map node positioning where geometry exists | Clicking confirmed plan node opens corresponding panorama | HE-G03, HE-E09 |
| HE-G05 | Add tour review and node-level exclusion | Excluded panorama does not appear in approved tour manifest | HE-G03 |

### H. Real camera and scene reconstruction

| ID | Task / acceptance | Minimum test | Dependencies |
| --- | --- | --- | --- |
| HE-H01 | Build pinned COLMAP CPU/GPU image and smoke CLI wrapper | Real small overlapping dataset yields registered cameras/points | HE-A02, HE-C03, HE-F03 |
| HE-H02 | Add camera grouping and primary matching profile | Known lens-switch fixture remains separate calibration group | HE-H01 |
| HE-H03 | Export quality/connectivity report | Disconnected room dataset is reported as disconnected | HE-H02 |
| HE-H04 | Add one bounded matching fallback and recapture output | Unsuitable photos exhaust allowed profile and produce actionable missing-connection message | HE-H03, HE-C06 |
| HE-H05 | Add metric scale and scene/plan registration records | Unanchored scene cannot publish metric measurements | HE-H03, HE-E05 |
| HE-H06 | Build pinned gsplat training wrapper and checkpointing | Real GPU dataset produces loadable checkpoint and nonempty scene | HE-H03, HE-C08 |
| HE-H07 | Add resume, time cap and reduced-memory fallback | Interrupt/resume real training; fallback stops at configured budget | HE-H06, HE-C07 |
| HE-H08 | Add held-out render report and scene sanity validation | NaN/empty export rejected; real scene renders held-out views | HE-H06 |
| HE-H09 | Export compatible splat tiers/manifests | Export loads in selected viewer with correct orientation and opacity | HE-H08 |
| HE-H10 | Enforce scene privacy review and incomplete-room labels | Unreviewed scene never appears publicly; partial scene identifies covered rooms | HE-H09, HE-F07 |

### I. Viewer, navigation and immersive experience

| ID | Task / acceptance | Minimum test | Dependencies |
| --- | --- | --- | --- |
| HE-I01 | Extend existing PropertyMedia lazy tabs; add independent scene3dAvailable capability | Legacy tour badge unchanged; absent/broken new scene retains gallery | HE-E11, HE-F08, HE-G05, HE-H09 |
| HE-I02 | Integrate splat adapter, bounds/reset and resource cleanup | Actual exported fixture opens, resets, then releases resources on exit | HE-H09 |
| HE-I03 | Add approved camera anchors and optional floor-map links | Wrong/unverified transform cannot enable plan navigation | HE-I02, HE-H05, HE-E09 |
| HE-I04 | Add tier selection and measured performance report | Document fps, memory and load bytes on named mobile/desktop devices | HE-I02 |
| HE-I05 | Implement WebXR capability/gesture/session lifecycle | Real supported headset enters/exits genuine panorama or structural VR | HE-G03, HE-E11 |
| HE-I06 | Verify splat WebXR stereo and teleport if supported | Real headset verifies per-eye rendering and measured refresh target; otherwise mark unsupported | HE-I02, HE-I05 |
| HE-I07 | Accessibility and supported-browser check | Keyboard plan/tour navigation, focus return and readable error states | HE-I01, HE-I05 |

### J. Approval and Haven publication

| ID | Task / acceptance | Minimum test | Dependencies |
| --- | --- | --- | --- |
| HE-J01 | Build quality summary with compatible-area comparisons | Deed built-up area and room net area are not auto-declared equivalent | HE-D10, HE-E09, HE-H03 |
| HE-J02 | Extend independent moderator/admin review and immutable output dependencies | Author/admin cannot self-approve; changed geometry invalidates affected review | HE-J01, HE-C10 |
| HE-J03 | Assemble public allowlisted manifest and atomic package | Owner/registry/source documents absent from serialized public response | HE-J02, HE-I01 |
| HE-J04 | Integrate changeListingState, pending listing/media revisions and reviewed projections | Author cannot publish; stale package denied and prior approved public version retained | HE-J03, HE-B01, HE-R07 |
| HE-J05 | Revoke and version public packages | Revocation stops new access; new edit leaves current approved package unchanged | HE-J04 |

### K. Operations, tests and delivery

| ID | Task / acceptance | Minimum test | Dependencies |
| --- | --- | --- | --- |
| HE-K01 | Add metrics/redacted logs and operations dashboard | Worker failure visible without private OCR text | HE-C09, HE-H03 |
| HE-K02 | Add quota/resource controls and cleanup policies | Over-budget job blocked; expired multipart and scratch objects reclaimed | HE-C08, HE-B02 |
| HE-K03 | Add tenant/account deletion and cancellation propagation | Delete fixture tenant removes originals/derivatives and stops active job | HE-K02, HE-J05 |
| HE-K04 | Add required CI lanes and fixture licensing manifest | Clean CPU suite passes; GPU lane runs a real reconstruction fixture | HE-A02, HE-H09, HE-J04 |
| HE-K05 | Run upload, two-tenant, worker-crash and stale-approval acceptance | Fault injection produces no unauthorized exposure or duplicate public package | HE-K04 |
| HE-K06 | Write production configs, backup and rollback runbooks | Restore staging DB/assets and recover interrupted processing run | HE-K05 |
| HE-K07 | Run reference workload and publish supported-input/device matrix | Measured stage times/VRAM/bytes/fps recorded with dataset/hardware IDs | HE-I04, HE-I06, HE-K05 |
| HE-K08 | Demonstrate full R1–R4 engine and known limitations | Clean setup processes a deed, edited plan, real panorama and suitable reconstruction through approval | HE-K06, HE-K07 |

### R. Repository-specific prerequisites

| ID | Task / acceptance | Minimum test | Dependencies |
| --- | --- | --- | --- |
| HE-R01 | Add separate engine ledger/schema/validator and wire root task/release scripts while preserving 120 original IDs | Root validator still accepts unchanged marketplace ledger; engine missing evidence/unfinished release fails | None |
| HE-R02 | Extract/reuse inventory access service and document private evidence processing grant and narrow worker identity | Expired owner/reviewer grant or reassigned agent denied; legacy media authorization tests pass | HE-R01 |
| HE-R03 | Spike SeaweedFS multipart, externally reachable upload origin/streaming BFF, abort/checksum and limits | Real interrupted multipart round trip, object mismatch and abandoned-upload cleanup | HE-R02 |
| HE-R04 | Design dedicated authenticated BFF SSE route and reconnect/revocation policy | Last-Event-ID forwarded and expired session terminates stream; ordinary CSRF/timeout unchanged | HE-R02 |
| HE-R05 | Add legacy FloorLayout adapter and unverified-scale/height labels without changing approved fixtures | Existing plan/panorama model plays unchanged; synthetic/default dimensions never become confirmed measurements | HE-R01 |
| HE-R06 | Define outbox event dispatch routing and engine consumer effect ownership | New engine event is not swallowed by generic processor; duplicate delivery yields one execution | HE-R01 |
| HE-R07 | Extend reviewed inventory application port for extracted unit/location/facts and artifact publishing | Published unit fact change requires review and current authority; two mandates do not inherit private evidence | HE-R02 |

## 16. Execution contract

Read AGENTS.md, SPECIFICATION.html, CODEX_START.md, TASKS.json, PROGRESS.md and
this document at session start. Recheck branch against inspected main. Additive
inventory digitization controllers/services in apps/api/src/inventory/digitization,
shared apps/api/src/inventory/property-access.ts, apps/worker/src/digitization,
Python services/property-processing, contracts digitization.ts/digitization-geometry.ts
and export/generators, shared UI digitization, ops digitization.tsx/inventory/workspace,
dedicated BFF routes, existing web viewers, additive migrations after actual max
(expected 106 at snapshot; do not assume), inventory-owned modules manifest/ADR/
licenses and optional compose.digitization.yaml. No frontend/worker API-internal
imports; guarded API transition ports. Long work never confers publish privileges.

Commands (confirm checkout behaviour first):
```sh
./dev.sh
docker compose exec api pnpm task:validate
docker compose exec api pnpm lint
docker compose exec api pnpm typecheck
docker compose exec api pnpm contracts:check
docker compose exec api pnpm license:check
docker compose exec api pnpm build
./test.sh pnpm exec vitest run tests/integration/approved-tours.test.ts tests/integration/outbox.test.ts
./test.sh pnpm exec playwright test tests/e2e/rich-media.spec.ts tests/e2e/spatial-tour.spec.ts --project=desktop --project=mobile
./ci.sh
```

Read test.sh first: it resets isolated haven-integration only, never run concurrent
suites there. Target task checks first, broad cross-module gates and full CI before
handoff. Name actual CPU/GPU fixtures/hardware/timings; pnpm mocks do not prove GPU.
Preserve 120 platform task IDs/status/evidence/approved hashes. Append separate
engine PROGRESS summary and CODEX_START resume pointer retaining history. New
screenshots P until established human approval, never automatic baseline refresh.

For each task inspect, implement complete slice, minimum test, exact evidence,
then next ready dependency. Current reusable media is not missing by assumption.
Maintain decisions/input-device matrix/benchmarks/licenses/runbook. Pin binaries/
models/checksums/containers and extend validators/generators before derived checks.
No scaffolding/simulator/past copied logs/route existence counts as completion.
When external dependency unavailable, record concrete blocker and continue
independent tasks. Missing GPU does not stop OCR/editor/tour/durable tests. Missing
country examples disables country profiles without invented fields. Missing market
mapping blocks inventory apply, not private extraction. R1–R4 still required.
Production follows current authorization and unfinished platform operational gates;
staging success does not convert development Compose into production.

First slice: HE-R01 → HE-A01 → HE-A02 → HE-A03 → HE-R02 → HE-A04 → HE-A05 →
HE-A06 → HE-B01. Use existing small private document upload initially; adapt
HE-B03–B05 to small upload while multipart HE-B02 remains its independent contract,
then HE-C01, HE-R06, HE-C02–C04, HE-D01–D04 and provisional generic HE-D09 review.
Final HE-D09 needs HE-D08/country fixture contracts. HE-R07/HE-D10 apply via inventory.
HE-R03/B02, HE-R04/C09, HE-R05/E02 proceed sequentially when prerequisites allow.
First milestone is real private OCR/source crops/authorized decisions through
actual identity/DB/storage, preserving gallery/tour; it is not full completion.

## 17. Definition of done

Authorized resumable uploads, actual abstaining/conflict-preserving source OCR,
correctable scaled plan with deterministic 2D/3D, genuine room tour, actual COLMAP/
gsplat suitable-data scene with honest scale/coverage, useful bounded recapture
without losing independent assets, measured supported-device tiers and real headset
VR, recovery/fencing/cancel/budgets, independent immutable sanitized publication,
current grants/races/deletion/two-mandate isolation, demonstrated additive startup/
CI/migrations/restore. Existing backlogs stay separately gated. No runtime Codex,
paid provider or simulated reconstruction necessary for baseline supported features.

## 18. Upstream references and integration cautions

The supplied research reviewed these sources on 6 October 2026. Budgets/gates are
Haven proposals, not upstream guarantees. Verify exact versions/licenses in HE-A02.

| Reference | Role | URL |
| --- | --- | --- |
| PaddleOCR | Multilingual OCR with exact tested models | https://github.com/PaddlePaddle/PaddleOCR |
| COLMAP | Camera reconstruction and separate dependency licenses | https://github.com/colmap/colmap |
| COLMAP output | Camera/point interoperability | https://colmap.github.io/format.html |
| gsplat | Apache-2.0 repo CUDA foundation needing wrapper | https://github.com/nerfstudio-project/gsplat |
| GaussianSplats3D | Candidate viewer, device compatibility unverified | https://github.com/mkkellogg/GaussianSplats3D |
| Open3D | Optional point-cloud operations | https://github.com/isl-org/Open3D |
| Three.js XR | Session/render integration | https://threejs.org/docs/pages/WebXRManager.html |
| BullMQ | Stall/heartbeat/re-delivery | https://docs.bullmq.io/guide/jobs/stalled |
| CubiCasa5K | Research lead, not approved dependency | https://arxiv.org/abs/1904.01920 |

OpenSplat/research 3DGS/floor-plan datasets/downloaded weights are not implicitly
permissive. OpenSplat and CubiCasa code licenses were not verified in the supplied
research, excluded until code/dependencies/weights/datasets checked. FFmpeg build
features/OCR weights/transitive CUDA need exact records. No proprietary Matterport
or other vendor algorithms/assets are required.
