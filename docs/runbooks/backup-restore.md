# Backup and isolated recovery

Q09 tooling separates encrypted local drills from verified off-host transfer. A local Docker volume is not off-host storage. A dump alone does not establish a fifteen-minute RPO. Record actual recovered commits, elapsed time, media/identity reconciliation and application tests before claiming recovery readiness.

## Protected keys and targets

Keep the RSA recovery private key offline/protected. Capture needs only its public key and a separate Ed25519 signing private key. Recovery requires the RSA private key and the previously trusted signing public key; the backup cannot supply its own trusted signing key. Use RSA >=3072 bits and mode 0600 for private keys. Key rotation requires retaining keys needed by older recovery snapshots.

```sh
umask 077
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out /protected/recovery.key
openssl pkey -in /protected/recovery.key -pubout -out /protected/recovery.pub
openssl genpkey -algorithm ED25519 -out /protected/backup-signing.key
openssl pkey -in /protected/backup-signing.key -pubout -out /protected/backup-signing.pub
```

Run `scripts/recovery/snapshot.mjs` with RECOVERY_PROJECT for the owned staging Compose project, unused RECOVERY_ENCRYPTED_OUTPUT, RECOVERY_PUBLIC_KEY, RECOVERY_SIGNING_PRIVATE_KEY, RECOVERY_IDENTITY_IMPORT_FILE and RECOVERY_OFF_HOST_TARGET (`user@host:/protected/unique-snapshot-directory`). Source Docker volumes are retained. The capture quiesces owned API/worker/identity/storage services, takes a native base backup including the identity database, waits for the required archived WAL segment, and captures object bytes plus realm configuration. It restarts only services that it stopped.

Each file uses a fresh AES-256-GCM nonce. The random data key is wrapped with RSA-OAEP-SHA256. The encrypted checksum/required-file manifest is authenticated by an Ed25519 signature. The signing key, recovery private key and temporary plaintext are excluded from the encrypted snapshot. Temporary plaintext is removed after capture. Signature verification occurs before decryption; missing/modified files and unsafe paths refuse recovery.

Off-host transfer uses noninteractive SSH with strict host-key verification and rsync protected arguments. It rejects local addresses and the same kernel boot identity, then verifies every remote ciphertext checksum. Select a physically separate failure domain with capacity, retention, permissions and monitoring; automated network checks do not prove infrastructure independence. `HAVEN_RECOVERY_LOCAL_DRILL=true` explicitly disables off-host claims and reports a local drill.

## Restore drill

Run `scripts/recovery/restore.mjs` with RECOVERY_ENCRYPTED_INPUT, RECOVERY_PRIVATE_KEY, RECOVERY_SIGNING_PUBLIC_KEY and unused RECOVERY_REPORT_FILE. It verifies the signed manifest and every required WAL/media file, rejects unsafe archive entries/links, and creates new labelled volumes and a private network. It boots the captured immutable PostgreSQL image, recovers to the recorded source LSN, requires promotion/target completion and reconciles schema/listing/charge counts. Failures produce an explicit failed report; they never produce successful application/recovery claims. Original volumes/databases are preserved; failed recovery resources are retained for diagnosis.

The returned report identifies the isolated database, WAL and object volumes. Deploy the same compatible immutable application/identity images against these volumes and a new private cache/search, retain protected session/provider configuration, rebuild the native public-only index and compare actual identity subjects/credentials, media bytes and decimal financial records. Execute HTTPS inquiry/sign-in/private-media/financial smoke through the restored gateway. Record measured RPO/RTO and target boundaries. An external provider's acceptance ledger requires its own recovery agreement; the local SMTP adapter is only staging evidence.

Keep encrypted snapshots and trusted manifests under versioned retention. Check WAL archiver failures, off-host receipts, capacity and key availability. Verify a missing segment and modified archive both fail, and schedule quarterly restore drills. A successful local rehearsal does not approve a production off-host target or promise an RPO for an unverified deployment.

For the local isolated application drill, render the intended deployment with `docker compose ... config --format json` into a **0600 file outside Git**. It contains resolved secrets. Set RECOVERY_DEPLOYMENT_CONFIG to that file, RECOVERY_DATABASE_REPORT to the successful report, RECOVERY_APPLICATION_CONFIG to an unused protected output path and RECOVERY_APPLICATION_PROJECT to a distinct `haven-*` project; run `node scripts/recovery/application.mjs`. Start `docker compose -f /protected/recovered-application.json up -d`. Only its proxy receives a gateway network. The recovered database retains its internal network and new labelled volumes. Its default gateway is 127.0.0.2:8443, leaving original staging on 127.0.0.1 intact. Resolve the same TLS/identity hostnames to the restored gateway in the drill client. Use the operator command from the deployment runbook to rebuild search.

The opt-in `tests/e2e/recovery-https.spec.ts` requires HAVEN_RECOVERY_DRILL=true plus a pre-backup RECOVERY_TEST_ASSET UUID and RECOVERY_TEST_ASSET_SHA256. Supply them from the recorded native private-upload evidence. It logs in through restored staff OTP, checks exact pre-backup document bytes and foreign-user denial. Retain actual financial and identity digests before application boot, since new sessions and inquiries legitimately change these records. Keep a separate application recovery report; a database-only report explicitly says applicationVerified=false. Snapshot age measures the age of the recovered capture, not proven continuous production data loss.

An internal recovery network prevents signature downloads. Use a maintained, independently verified signature volume or provide an approved outbound scanner update path before claiming ongoing scanning readiness. The local drill verifies restored bytes and existing native scan decisions; it does not prove continued external signature updates.
