# Development discovery and price basis

N03 uses an explicit typed SQL search contract for public developments. City currency and district ownership are checked; request values are parameterized. Filters include public sales status, recorded starting-price budget in a chosen basis, a published type's bedrooms and overlapping decimal area range, and literal project/community text. Type criteria must match the same published type. Stable order includes the project UUID. Pagination is labelled bounded-offset and capped at 10,000 offset.

Budget comparisons and price sorting require per_area or starting_total; currency must match the city. Per-area and starting-total offers are never mixed in a numerical comparison. A budget compares price_min (the recorded starting price), not an invented total or unknown maximum. Unknown prices are excluded from priced budgets and remain visible in ordinary discovery with Price not provided. Cards preserve cents and distinguish Per m², Starting total, recorded range and sold-out marketing status. A per-area amount always states that a total is not provided. No multiplication by a type/unit area occurs.

Versioned, scoped, idempotent developer pricing writes exact decimal strings to NUMERIC, keep unavailable amounts null and require a positive starting price before any maximum. Sold-out project prices require reopening sales first. The authoring form shows currency and explicit price basis; mutations append audit/outbox. This does not post a financial charge or invoice.

Public filter Apply/Reset and URL/refresh persistence use the same canonical schema. Legacy home recommendation cards use the same amount/basis rendering. No new visual baselines are promoted without human approval.

O: existing development discovery category. R: supplied explicit price basis, no inferred total and development filter requirements. P: English filters/pricing authoring and synthetic development amounts. V: original development pixel parity and actual project prices/inventory. Project/type lead interaction and full inventory workspace follow N04/N05.
