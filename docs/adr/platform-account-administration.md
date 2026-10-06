# S04 — platform account and staff administration

Administration owns current platform account actions and platform staff grants.
Identity continues owning credentials/contact synchronization and server sessions.
Existing credential and listing-review controllers retain their narrow review and
private-document grants; administration provides native links to those workflows.
Organization finance membership is not implied by a platform admin/staff role.

Each private read/action verifies actual active platform administrator membership
and locks its current profile/membership. Token role names do not substitute for
that authority. Filtered account pages have at most 20 records and retain native
URL search/state/page/selection. Details include target profile and separate staff
permission versions; creation requires zero, updates require current permission
version plus current active profile version. Global staff keys are unique per
user/role. Only moderator/support/editor/admin are admitted here. Scope cannot
move into an organization grant, and current permission state must actually change.
An administrator cannot change its own account state or staff authority. The acting
active administrator therefore remains available after another account is changed.

Suspension/reactivation checks the locked target's current version and state and
requires an explicit private reason. Profile updates retain all other facts. SQL
checks actual authority, version, state and reason again; a forged admin role cannot
change platform state or add a global admin membership. Original staff targets/roles
cannot move, and permissions revoke rather than delete. Native failed inputs and
receipt identity survive acknowledgement loss; the same key returns the committed
change without another version/history row.

SQL atomically appends immutable actor/time/reason and exact before/after snapshots,
revokes all target application sessions and writes redacted audit/outbox metadata.
Existing sessions become unavailable on the next action; identity callback continues
to deny suspended profiles. Reactivation does not restore revoked sessions or
silently change staff permissions. Revocation is rechecked by downstream controllers
through actual membership admission. Staff sign-in still requires provider MFA;
application grants do not configure provider enrollment. UI explains this requirement.

Private account/permission history is readable only by current actual admins. Audit
search returns metadata; reasons/history do not enter public projections, finance,
search or aggregate event payloads. Legacy state has explicit unknown original
administration attribution rather than invented initial actor/time.

O/R: public account/agent and reference capability names only. P: private platform
staff/account administration. V: original private admin parity and production launch
are unverified; approved local consumer baselines remain preserved.
