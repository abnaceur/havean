# Q01 — public indexing and routing

The API owns public eligibility. Its bounded sitemap source uses current public
listing/provider views and active city, district, community and directory scopes.
Public category pages and current eligible detail slugs are included; account,
tenant, ops, API, filters, draft and withdrawn offers are excluded. Reserved root
identifiers cannot be created as city slugs. Existing archived geography no longer
appears in discovery or detail reads. Withdrawn details return 404, without a
redirect to an unrelated property. Valid UUID and wrong-category aliases redirect
308 to the current public slug/category. Mortgage aliases use one canonical path.

English metadata and rendering share one request-cached API source. All user agents
receive blocking metadata so unavailable details return the correct HTTP status
before streaming. The root loading boundary is removed because it flushed a 200
before redirect/404 decisions; existing consumer request skeletons remain available. Account/tenant metadata and response headers forbid indexing;
ops forbids all indexing. Robots files communicate those exclusions. Search, map,
submission and filtered result URLs are noindexed. API failures display a retryable
state and noindex; sitemap failures return 503 with Retry-After rather than a false
empty successful sitemap. Private authentication remains independent of robots.

Sitemaps use 10000-entry chunks and an index when needed, XML escaping, known source
update timestamps only, and current eligibility on each request. No timestamps are
invented for sources without a reliable update column. Public structured data uses
WebPage and BreadcrumbList with escaped JSON; no fabricated offers, ratings,
availability guarantees or exact private addresses are emitted. No search-engine
rich-result or original-site parity approval is claimed.

Implementation follows official Next.js documentation:
[metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata),
[robots](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots),
[sitemaps](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap),
[JSON-LD](https://nextjs.org/docs/app/guides/json-ld), and
[permanent redirects](https://nextjs.org/docs/app/api-reference/functions/permanentRedirect).

O: public category/detail routes. R: public property discovery terminology.
P: API-derived eligibility, English metadata, privacy exclusions and canonical routing.
V: original-site SEO internals, exact geometry, deployed production search indexing.
