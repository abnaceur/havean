# Database-aware application rollback

Rollback changes an application image; it does not reverse SQL or restore deleted data. Keep the populated database, posted-money records, object versions, current provider receipts and identity subjects. Stop/reconcile writers before an upgrade, take a verified protected recovery capture, record immutable images and native financial hashes, apply only reviewed forward migrations, and run actual HTTPS/financial checks.

## Compatibility review

Each packaged image includes `infra/production/schema-compatibility.json`. Its required migrations are exact; unreviewed additional migrations refuse preflight. `infra/production/rollback-6347b5c.json` is a narrow tested API compatibility manifest: previous primary source 6347b5c at SQL 159 with immutable rehearsal image, allowing only the explicitly reviewed SQL 160–167 filenames and hashes listed in that manifest. It records migration SHA256 and the additive/index/view review. Its digest is a locally built image identifier; publish/sign the same image to the authorized registry and record its immutable repository digest before using it on another host. This file is not approval to roll back other app components or future schemas.

The original four permitted migrations add indexed lookups and invalidation/deadline stamps and replace the rental availability projection with an equivalent set-based view. Its columns and native active-lease predicates are preserved. The reviewed SQL 164–165 extensions harden runtime decoder permissions, and SQL 166 retains the same public revision/deadline query with cached plans. No digitization migration or arbitrary later filename is permitted by this platform rollback manifest. No posted charge/payment/deposit rule is removed. For every later migration, review the actual old code, contracts, triggers/views and write compatibility; supply a new manifest only after a populated rehearsal. Never permit arbitrary future filenames merely to make preflight green.

## Guarded operator

Render the intended current deployment with `docker compose ... config --format json` into a 0600 file **outside Git**; it contains resolved secrets. It must identify an owned `haven-*` project with exactly one running labelled database and the privileged maintenance service. Set:

```sh
ROLLBACK_DEPLOYMENT_CONFIG=/protected/current-rendered.json \
ROLLBACK_COMPATIBILITY_FILE=/reviewed/previous-image-schema.json \
ROLLBACK_REPORT_FILE=/protected/unused-rollback-report.json \
node scripts/rollback-image.mjs
```

The tool invokes the native migration image's schema preflight using the reviewed read-only manifest. Missing required or unknown migrations produce an actionable refusal and do not change application containers. After a compatible result, only the API image is switched with `--no-deps`. Its native readiness must pass; only then is the protected desired deployment updated. No database reset/down migration runs. Temporary resolved configuration is removed. Retain the report and run the required HTTPS and posted-money smoke; a healthy process alone does not establish business compatibility.

If readiness fails, the report says `rollback-unhealthy` and the original desired deployment remains intact. Reapply its current immutable API image after assessing why the previous image failed. Do not downgrade the schema. If data/schema cannot support an acceptable image, use the isolated signed recovery procedure and reconcile post-capture money, media and external provider receipts before deciding which environment to serve.

## Native rehearsal evidence

Q10 uses a new synthetic database, applies original migrations through 159, seeds 11 personas and runs four golden financial tests. The previous API serves actual HTTPS inquiry/MFA/scanned-PDF/foreign-denial journeys at desktop/mobile. All four forward migrations then apply to that populated database; the current API becomes ready; the guarded previous API rollback passes the same four real journeys. Full native hashes of 10,028 charges and six payments remain unchanged, with no reset. A real additional isolated migration/table is unreviewed by the compatibility manifest: preflight refuses its filename, provides recovery/compatible-image guidance and leaves the API container identity unchanged. That database is retained for diagnosis. This tests refusal of unknown schema compatibility, not a claim that every additive table would crash the previous binary.

Run the reusable HTTPS test with HAVEN_HTTPS_STAGING=true and HAVEN_VERIFICATION_TASK=Q10. Use production app environment and real strict OTP; fixture owner access belongs only in the protected test process. See `evidence/tasks/Q10.md` for actual measured reports and retained attempts.

SQL167 review changes only public rental-set materialization, preserving every public column and security-invoker scope. The populated native previous API passes readiness/public search after the upgrade; full-row SHA256 hashes for charges, payments, deposits and allocations match. Unreviewed SQL167 initially refuses preflight. Its reviewed allowance does not permit any digitization or future migration. The broader HTTPS/operator rehearsal remains the retained SQL166 proof.
