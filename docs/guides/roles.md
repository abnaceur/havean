# Role guide

Local examples use synthetic Beijing inventory. Open `/bj` on the consumer origin and `/ops` on the professional origin. Sign in through the real identity service. Development credentials and staff authenticator setup are in the protected generated personas file; production admits staff only after actual MFA. Role names alone never confer organization/property access.

| Role | Entry and verified workflow | Access boundary |
| --- | --- | --- |
| Visitor / buyer | Filter listings, view photos/video/360°/plans, submit consented inquiry; sign in to save favorites/searches, message professionals and request viewings | Published eligible inventory and the buyer's own account, receipts and conversations |
| Owner | Submit an owner request, edit private listing draft, declare media rights, upload evidence, submit for independent review, track revisions | Own resources and explicitly granted documents; submitted/public changes follow workflow/version checks |
| Agent | Professional inventory, assigned leads, contact timeline, viewing confirmation/rescheduling, authorized conversation | Current organization membership and assignment; reassignment/revocation removes stale access |
| Agency manager | Team membership and listing/lead assignments | Current organization authority; no access to unrelated agencies |
| Developer | Edit development/building/unit facts, upload plans/videos, submit publication and handle buyer inquiries | Own current development grant, unit versions and independent media/publication review |
| Vendor | Own service profile/categories/areas, portfolio rights and received nonbinding quote requests | Approved public projection and the exact authorized quote recipient |
| Moderator | Publication/revision queue, scoped temporary evidence, versioned approve/reject decisions | Current review authority; decisions revoke temporary evidence access |
| Property manager / finance | Establish portfolio grants and tenant invitation; lease draft/activation, recurring charges, verified payment recording, allocation/reversal, deposits, statement export, maintenance resolution | Current property/organization/lease grants and workflow; payment records are not online collection |
| Tenant | Accept the exact verified-recipient invitation; read own lease/balance/statement and submit maintenance | Exact linked tenant account; private staff/owner notes and unrelated leases are excluded |
| Support | Scoped complaint/account/privacy work with recorded resolution and audit | Current case authority; public feedback omits private messages/contact details |
| Administrator / editor | Explicit audited account/role/content/market configuration actions | Dedicated administrative paths and independent workflow; a forged role label does not bypass scope |

## Property media

Open property detail and select Photos, Videos, 360° or Floor plans when approved media exist. The immersive viewer supports mapped room navigation, plan overlays, multiple floors and plan-derived model mode. Uploaded plans/panoramas require explicit rights and review; private evidence is not a public gallery asset. Seeded photos, plans and panoramas illustrate synthetic properties. A plan-derived model is illustrative geometry, not a property scan or survey.

## Financial work

Enter decimal strings in the displayed lease currency. Activation confirms current unit, grant and tenant versions. Recurring charge jobs retain unique period/kind keys; duplicate execution cannot double-post. Verify the recorded external payment evidence before posting; allocate only matching-current scoped lease/currency balances. Posted records are retained; reversal creates linked compensating records, and allocation undo restores balances under locks. Deposits remain a separate liability ledger. Statements reconcile opening, period movements and closing and exclude private source/contact notes. The platform does not collect online rent, sign leases electronically, or provide bank reconciliation.

## Failed or stale actions

Read the visible error and reload the resource after a version conflict. A saved receipt can recover a lost response without duplicating the mutation. Do not change actor IDs, versions or workflow flags to force an action. Expired/revoked grants and withdrawn inventory intentionally deny further actions. Search can fall back to authoritative SQL; a missing external provider remains visibly unavailable.
