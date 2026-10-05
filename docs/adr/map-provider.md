# D05 map rendering and provider setup

MapLibre GL JS is pinned to 6.12.0 (BSD-3-Clause), matching the dependency inventory. Map rendering and tile/geographic rights are separate concerns.

Development and CI default to a deterministic local style with no external requests. This displays synthetic inventory pins and clusters on a neutral background; it is labeled as a local synthetic map. Public coordinates come exclusively from the public listing view, rounded to three decimal places at community level. Bounds queries compare these same public values. Exact private unit coordinates stay in `unit_private_details` under its existing row policies and are never used to position public markers.

For a real basemap, set `MAP_STYLE_URL` to a public HTTPS MapLibre style URL without embedded credentials and `MAP_ATTRIBUTION` to the provider's required additional notice. Production boot requires a configured style. MapLibre's expanded attribution control preserves source attribution supplied by the style; the page also shows the configured notice and public precision statement. Provider keys that must remain secret need a server-side adapter; do not place them in a public style URL.

OpenFreeMap documents `https://tiles.openfreemap.org/styles/liberty` as a compatible example. Follow its current service/usage terms and retain OpenFreeMap, OpenMapTiles and OpenStreetMap attribution from the style. This example is not a claim that production provider contracting or capacity checks have been completed.

Map points are bounded to the first 500 located matches in canonical order. The UI explicitly labels truncation and unknown locations; the independent paginated list retains all eligible matches. Map bounds and list filters use the same strict contract. Antimeridian-crossing rectangles are rejected; the supported rectangle is west < east, south < north in WGS84.

Tile/style errors retain list access and report the map failure. Lack of WebGL also leaves the list and property picker available. Browser checks use controlled local style/tile failures, without depending on external tile uptime.

Reference sources (R): [MapLibre GeoJSON source API](https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/) and [OpenFreeMap quick start](https://openfreemap.org/quick_start/). Local screenshots/tests are implementation evidence (P), not original-site parity (O).

Next-specific worker setup follows the [official ESM installation guide](https://maplibre.org/maplibre-gl-js/docs/). The web dev/build commands copy the pinned worker, its shared module and BSD license to ignored public build assets, then set the same-origin worker URL explicitly. No CDN worker is used.
