#!/bin/bash
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=migrate_pass="$POSTGRES_PASSWORD" --set=app_pass="$APP_DB_PASSWORD" --set=identity_pass="$IDENTITY_DB_PASSWORD" <<'SQL'
CREATE ROLE haven_migrate LOGIN PASSWORD :'migrate_pass';
CREATE ROLE haven_app LOGIN PASSWORD :'app_pass';
CREATE ROLE haven_read LOGIN;
CREATE ROLE haven_identity LOGIN PASSWORD :'identity_pass';
ALTER DATABASE haven OWNER TO haven_migrate;
GRANT CREATE ON SCHEMA public TO haven_migrate;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE DATABASE haven_identity OWNER haven_identity;
SQL
