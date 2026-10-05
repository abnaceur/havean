# Rental discovery and billing periods

R02 adds rental mode and available-by dates to the shared strict filter contract. These criteria require transaction=rent; malformed calendar dates are rejected. Existing budget, furnishing, district, transit and amenity filters retain their canonical mappings and URL semantics.

Rental queries always select one billing period. An explicit period is preserved; otherwise the API reads the market's configured period. Missing/invalid defaults return a retryable error asking for an explicit period. Amounts are not converted between daily/monthly/yearly offers. Response metadata identifies the period and whether it came from the request or market. Filter Apply persists the chosen period; configured price presets appear only for that period.

Public projection schema 3 adds rentalMode, availableOrder and availableKnown. SQL dates and index date order use the same available-by boundary. Unknown availability is excluded from this filter. Mode originates from rental_terms; no private fields enter the search projection. Both local indexes were rebuilt and verified before testing. Existing index generations degrade explicitly to current SQL until rebuilt.

O: existing rental navigation. R: specification explicit billing, rental criteria and canonical search requirements. P: synthetic entire/shared inventory, English filters/cards and local browser captures. V: original-site exact rental parity and actual inventory move-in dates. Local screenshots are feature evidence, not newly approved parity baselines.
