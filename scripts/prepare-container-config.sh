#!/bin/sh
set -eu
# Service configurations contain secrets. Grant only the containers' group read
# access; keep their host owner and all other generated credentials unchanged.
docker run --rm -v "$PWD:/workspace" -w /workspace node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 node --input-type=module -e '
import fs from "node:fs";
for (const name of ["haven-realm.json", "s3.json"]) {
 const file=process.argv[1]+"/"+name;
 const stat=fs.statSync(file);
 fs.chownSync(file,stat.uid,1000);
 fs.chmodSync(file,0o640);
}' "${1:-infra/generated}"
