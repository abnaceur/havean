# Development integrations

SeaweedFS 4.46 is the S3 development object store (Apache-2.0). MinIO's upstream community repository is archived, and its Docker Hub images were unavailable at implementation, so the S3 adapter uses a maintained alternative. See https://github.com/seaweedfs/seaweedfs and https://github.com/minio/minio.

Mailpit receives local email; this is local delivery evidence, not production delivery. Keycloak runs development mode and isolated persistent PostgreSQL. Public external maps link to OpenStreetMap community coordinates. Embedded MapLibre search now uses coarse public positions and a deterministic local development style; see map-provider.md for configurable real tiles, attribution and provider usage. Production tile/geocoder configuration remains a launch requirement.

Images are decoded by Sharp with a 40-million-pixel cap, rotated and re-encoded without EXIF. Private PDFs reject active content, encryption and embedded files; uploads use the pinned ClamAV service through its INSTREAM protocol before image/video decoding or document approval. Private downloads remain authenticated and audited through the API; object keys are never exposed publicly. Signed upload tickets are scoped to actor, asset and ten-minute expiry. Private download tickets expire after sixty seconds and require an authorized session. Scanned media remains private until its owning property media publication is approved. Videos are decoded and transcoded using pinned FFmpeg; only sanitized variants are exposed by the authorized API.

Sources: https://docs.bullmq.io/guide/connections, https://www.keycloak.org/server/containers, https://unsplash.com/license.

CI action pins: [checkout v5.0.0](https://github.com/actions/checkout/commit/08c6903cd8c0fde910a37f88322edcfb5dd907a8) (Node 24; runner 2.327.1 or newer) and [upload-artifact v4.6.2](https://github.com/actions/upload-artifact/commit/ea165f8d65b6e75b540449e92b4886f43607fa02). No remote CI run has been claimed without a configured repository.
