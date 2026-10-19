#!/bin/sh
set -eu
exec 9>/tmp/haven-processing-recovery-tests.lock
flock -n 9 || { echo 'The independent processing recovery suite is already running' >&2; exit 1; }
# Unique test Compose resources; preserves development/integration stacks.
exec node scripts/recovery/test-processing.mjs "$@"
