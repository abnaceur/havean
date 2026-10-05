# Public rental detail

R03 adds a whitelisted rentalTerms object to the existing published detail response. Resolve current public listing eligibility and city first, then read terms in that transaction. Non-rental offers and missing records return null. No owner/team identifiers, parent unit IDs or private addresses are serialized. Existing gallery, media, map, agent eligibility and contact flows remain shared.

The interface displays exact decimal strings for rent and deposit, explicit billing period, recorded minimum months, literal utility conditions and move-in date. Child rooms show their actual label, area and room attributes. Null is distinct from an explicit zero deposit. Empty fields are Not provided; missing records have a visible unavailable-terms message. Utilities are not interpreted as free/included unless the author supplied that condition. No extra charges are fabricated.

Withdrawn/leased/expired offers cannot resolve public detail or the published booking destination. R04 adds unified root/room occupancy authority; P04 will cover managed activation races. Missing terms alone do not mean the unit is occupied.

O: established public detail/gallery navigation. R: rental specification and explicit fees/periods. P: synthetic fee/room conditions, English detail panel and screenshots. V: exact original rental-detail parity, production inventory and actual tenancy charges.
