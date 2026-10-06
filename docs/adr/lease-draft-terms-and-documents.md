# Lease draft terms and private documents

P03 replaces the original incomplete creation route with a native versioned draft
contract. Unit/owner authorization remains in inventory; management records the
lease, current unit/grant/tenant versions, creator, monthly rent, due day and original
term snapshots. Native writes require an actual current property manager, valid
management source and a tenant linked to this exact property. Currency is taken
from the canonical unit's market. Rent is a string backed by NUMERIC, with guarded
integer-cent validation; dates are real calendar dates and ordered. No float money
is posted. Root identity and activated terms are immutable, with versioned edits
and durable matching receipts before acknowledgement.

Documents use the existing private PDF upload/scan path. The inventory read/lock
port verifies approval, scan status, private visibility, PDF purpose, owner and
asset version. New bindings require owned files. An authorized second manager can
retain an existing binding and change its label; this does not authorize reusing a
colleague's file on a different lease. Removal ends the team binding while original
revision snapshots remain. The asset admission port locks metadata without granting
UPDATE permission to other team members. Document download requires a current team
lease/property grant and rechecks the approved bound asset version. Downloads are
attachments with no-store; tenant access to these private team files is denied.

Monthly due days 1–28 are explicit native terms. Historical leases keep known
monthly rent semantics and unknown original due day/creator/source metadata.
Existing tenant links backed by an actual stored lease remain usable; no original
acceptance history is fabricated. New tenant linkage uses P02 verified acceptance.
Lease creation does not activate occupation or transfer funds. Activation, renewal,
ending, charge proration and financial workflows remain P04–P15 contracts.

SQL 113 is preserved; 114 retains existing team bindings and 115 adds narrow asset
admission locks. OpenAPI identifies private PDF output as binary and requires a
session; the typed transport also supports binary responses. Fresh-seed/production
and original-site parity claims are not inferred from these tests.
