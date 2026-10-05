# Approved property tours

Inventory owns panorama uploads, scanning, decoding and independent publication review. Public discovery only exposes scenes whose attachment and public asset are approved, have a completed scan and a decoded display variant. Panoramas also require validated 2:1 dimensions at least 1024 pixels wide. The listing's `tourAvailable` read port uses these same panorama predicates. The card badge describes this published capability; it does not assert current object-provider uptime.

Scene and hotspot metadata excludes storage keys, original-upload URLs, private attachments and targets that are not public scenes of the same property. The public viewer receives relative BFF media routes. That route rechecks public scope and returns no redirect or provider URL. It returns generic unavailable errors for denied assets. Floor-plan room mappings use the same approved-scene filtering.

The WebGL panorama and plan-derived model are separate dynamically imported modules. Rendering starts when the viewer opens. Scene instances reset by scene ID; failed loading cannot leave another selected scene stuck. Errors display a generic status and a real retry action. Failed asset bodies and provider details are not rendered. Missing WebGL has an image fallback; missing/denied image loading does not retry a broken image implicitly. Retry initializes a new rendering attempt and disposes prior GPU resources and observers.

Synthetic floor outlines produce an illustrative plan-derived model. No scanned geometry, current original-site measurements or exact visual parity is claimed. O/R/P/V provenance is maintained in the reference and task evidence ledgers.
