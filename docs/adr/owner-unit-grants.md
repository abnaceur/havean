# Owner unit grants and private drafts

Inventory owns explicit owner-to-unit grants. Existing server-recorded listing-owner relationships are imported as recorded_listing, with no claim of independently verified title. New ownership review creates reviewed_submission grants only after the authorized moderator validates the submission and evidence. The grant identity/source/reviewer is immutable. Revocation/expiry/version changes deny new drafts and edits immediately. Client owner/unit identifiers do not establish a grant. Owner sessions cannot create grants directly.

Owned-unit draft creation requires the current actor's active grant and its explicit version. The API locks that grant, validates market currency and scoped canonical unit, and creates a private draft with idempotency/audit. Draft edits use the listing root version and recheck current grant. SQL repeats owner authorization for owner listing mutations. New unverified properties still enter the private ownership submission workflow; no client-created unit becomes owned through this form.

Owner contacts use a separate private table. The default audience is authorized reviewers only; an owner can choose the assigned property team. Organization and agent assignment checks apply to that audience. Contact changes share the listing root version/transaction and cannot be supplied by an agent acting for the owner. Public view/search/detail never joins this table. Grant metadata does not reveal private address/evidence or another owner's grant.

Docker bootstrap materializes missing grants from its recorded server relationships without replacing revoked/edited grants. This is a legacy-data provenance label, not invented document approval. Ownership-review creation records the actual reviewer. Stepwise autosave and unverified-submission contact progression remain O02; document access/review/lifecycle evidence remains O03–O05.

O: owner property entry. R: O01 actor/unit grant and private-draft contract. P: local private draft/contact controls, synthetic server-recorded owners. V: actual legal ownership, original private owner UI and new visual approval.
