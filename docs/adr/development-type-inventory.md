# Floor-plan types and offered inventory

N02 extends floor-plan types with exact decimal min/max areas, explicit bathroom count/unknown, own version, publication state/time and inventory mode. Existing synthetic aggregate counts remain legacy_count; no unit identities or physical facts are invented from them. Cold seeding writes equal min/max areas from the supplied fixture area and uses the fixture inventory timestamp.

New types use individual-unit inventory. Each offered unit points to its own canonical property unit in an active building of the project. Room counts must match its type and area must lie within the type's range. Bathrooms must be recorded before creating the canonical unit. Parent/type identity is immutable and later type changes cannot invalidate existing units. Available counts are derived from available unit states; SQL rejects negative/manual count overrides. The older count editor applies only to legacy inventory.

API writes lock and check the scoped project version, child/type version and workflow, use idempotency and audit/outbox, and stamp inventory changes. Unit workflow is available→reserved/sold/withdrawn, reserved→available/sold/withdrawn, sold→withdrawn, withdrawn→available. These are developer offer states and do not post money, reserve a tenancy or pretend to book a viewing.

Drawing links require same-project approved floor-plan media, an approved public scanned asset and current media version. Existing upload scanning/decoding and independent moderation remain mandatory; an unapproved owned upload cannot be linked. No drawing is supplied when none was approved. Public detail returns published types only; RLS keeps draft types private. Original legacy drawings continue through the existing media workspace.

O: existing public new-development category. R: supplied room/range/media/inventory requirements. P: internal inventory model and illustrative synthetic plans/units. V: original developer interface, actual floor-plan measurements/rights and real offered inventory. N03/N04 complete public filters/type interaction; N05 completes the developer workspace contract.
