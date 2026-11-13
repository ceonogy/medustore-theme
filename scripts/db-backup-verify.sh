#!/usr/bin/env bash
# Restore drill: prove the newest dump actually comes back.
#
#   ./scripts/db-backup-verify.sh
#
# Restores the newest dump into a throwaway database, then compares the
# restored row counts table-by-table against the sidecar the backup
# wrote. A backup that has never been restored is a hope, not a backup.
# The probe database is dropped on any exit (trap), so a failed run
# leaves nothing behind.
set -euo pipefail

# Cron's default PATH is just /usr/bin:/bin — pin a known-good one.
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/sbin:/bin"

BACKEND_ENV="/home/medusa/apps/backend/.env"
BACKUP_DIR="/home/backups/medusa"
PROBE_DB="medusa_restore_probe"

[ -f "$BACKEND_ENV" ] || {
  echo "verify: missing $BACKEND_ENV" >&2
  exit 1
}
DB_URL=$(grep -m1 '^DATABASE_URL=' "$BACKEND_ENV" | cut -d= -f2-)
[ -n "$DB_URL" ] || {
  echo "verify: no DATABASE_URL in $BACKEND_ENV" >&2
  exit 1
}

LATEST=$(ls -1t "$BACKUP_DIR"/medusa-*.dump 2>/dev/null | head -1)
[ -n "$LATEST" ] || {
  echo "verify: no dump in $BACKUP_DIR" >&2
  exit 1
}
SIDECAR="${LATEST%.dump}.counts"
[ -f "$SIDECAR" ] || {
  echo "verify: missing sidecar $SIDECAR" >&2
  exit 1
}

# Same server/credentials, probe database name swapped in.
PROBE_URL=$(sed -E 's|(://[^/?]+/)[^/?]+|\1'"$PROBE_DB"'|' <<< "$DB_URL")

psql "$DB_URL" -q -c "DROP DATABASE IF EXISTS $PROBE_DB" > /dev/null
trap 'psql "$DB_URL" -q -c "DROP DATABASE IF EXISTS '"$PROBE_DB"'" > /dev/null 2>&1 || true' EXIT
psql "$DB_URL" -q -c "CREATE DATABASE $PROBE_DB" > /dev/null

pg_restore --no-owner --no-privileges -d "$PROBE_URL" "$LATEST"

mismatch=0
tables=0
while IFS='=' read -r table expected; do
  [ -n "$table" ] || continue
  tables=$((tables + 1))
  actual=$(psql "$PROBE_URL" -tAc "SELECT count(*) FROM \"$table\"")
  if [ "$actual" != "$expected" ]; then
    echo "verify: MISMATCH $table sidecar=$expected restored=$actual"
    mismatch=1
  fi
done < "$SIDECAR"

if [ "$mismatch" -ne 0 ]; then
  echo "verify: FAIL dump=$(basename "$LATEST") tables=$tables"
  exit 1
fi
echo "verify: ok dump=$(basename "$LATEST") tables=$tables all row counts match"
