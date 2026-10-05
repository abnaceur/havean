# Commercial discovery

The public SQL view owns eligibility and whitelists commercial property type, gross/usable area, declared pricing area, transaction price basis, fit-out, parking and permitted uses. Private organization, address and ownership records stay outside public projections. DTO/search schema 4 preserves null commercial facts for residential and incomplete historical records.

Commercial criteria require segment=commercial. Residential room/layout/finishing/ownership filters are rejected, not silently applied. Budget/price sorting requires a sale or rent transaction and total or per-area basis. Rental comparisons require an explicit day/month/year period; commercial discovery does not apply the residential market-period default. Per-area price comparisons require gross/usable pricing area. Area bounds/sorting use the explicitly chosen commercial measure. SQL numeric price comparisons and exact minor-unit indexing retain decimal-string prices; no rent-period conversions or inferred total amounts occur.

The indexed result is always verified against current SQL eligibility, versions, ordering and total. Schema changes require rebuild; a stale/unsafe index falls back to SQL. Public cards label each record's period/basis and both recorded areas. Unknown historical area definitions remain unknown and cannot participate in area-basis comparisons. Canonical unit area is not substituted for missing commercial measurement.

Commercial filter state lives in the URL and saved criteria. Save normalization preserves unrestricted commercial periods; it does not invent a monthly period. Desktop/mobile workflows check explicit basis validation, refresh persistence, furnished office use, actual monthly/yearly separation, accessibility and overflow.

O: existing commercial entry. R: supplied commercial discovery contract. P: English business filters and synthetic office records. V: exact original commercial layout, real measurements/permitted uses, new human baseline approval and production search performance. Detail/inquiry context remains C03.
