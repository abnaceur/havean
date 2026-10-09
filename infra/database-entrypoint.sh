#!/bin/sh
set -eu
# PostgreSQL's major version alone cannot prove libc/physical-volume compatibility.
cluster_directory=${PGDATA:-/var/lib/postgresql/data}
if [ -s "$cluster_directory/PG_VERSION" ] && [ ! -f "$cluster_directory/.haven-native-alpine-cluster" ]; then
  echo 'DATABASE_LIBC_TRANSITION_REFUSED: preserve this physical volume; logically restore into a new maintained Alpine cluster and reconcile rows, identity and media.' >&2
  exit 1
fi
exec /usr/local/bin/docker-entrypoint.sh "$@"
