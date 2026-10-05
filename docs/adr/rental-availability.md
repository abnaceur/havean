# Rental availability authority

R04 establishes rental_unit_is_free as the canonical overlap check. A whole property conflicts with active leases or leased offers on itself or any child room. A child room conflicts with its own property and itself; independently leased sibling rooms do not occupy it. Published offers can describe alternative whole/room options until occupancy is recorded. A leased offer continues to hold occupancy until its authorized archive transition; ending a managed lease also removes that lease's hold, while any remaining leased offer still holds occupancy.

Every API rental state transition and contact destination obtains the same transaction advisory lock on the property's root before the listing row lock. Publication checks the canonical authority under that lock; actor, listing version and workflow checks remain mandatory. Contact insertion also rechecks through a database guard, so direct consumer inserts cannot bypass current eligibility. Root/room identity changes between the hint and locked row are rejected.

Public listing SQL excludes occupied rentals. Search hydration, detail, public assigned agents, favorites and alert source reads share this projection. A stale indexed offer therefore cannot expose an occupied property. Lease active/ended and listing leased/archived changes append availability-change outbox events for all overlapping offers; the worker re-reads current source state and removes/restores documents. No property addresses or tenant identities enter these events.

The API exports lockRentalAvailability/requireRentalAvailability for the P04 managed activation transaction. R04 tests publication versus occupancy lock contention; complete managed lease creation/activation/termination races remain P04's explicit contract. No additional lease workflow is claimed complete here.

O: existing unavailable-property behavior. R: specification's single authority, stale-contact rejection and P04 integration prerequisite. P: root/room overlap policy and synthetic database fixtures. V: original internal availability behavior and full managed lease activation race evidence (P04).
