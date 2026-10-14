#!/usr/bin/env bash
# Nightly Medusa PostgreSQL dump.
#
#   ./scripts/db-backup.sh
#
# Dumps land in $BACKUP_DIR as medusa-<timestamp>.dump (mode 600 — orders
# and customer records live in there), each with a <timestamp>.counts
# sidecar naming every public table and its row count. The newest $KEEP
# dumps are kept; everything older is pruned. A copy of the backend .env
# travels with them so a dump can be brought back onto a fresh host with
# its JWT/cookie secrets intact.
#
# Product images are external URLs (S3/CDN), so the database plus .env
# is the whole durable state. Installed cron (host-level, not in git):
#   45 2 * * *  scripts/db-backup.sh  >> .../backup.log 2>&1
#   0  3 * * *  scripts/db-backup-verify.sh >> .../verify.log 2>&1
set -euo pipefail

# Cron's default PATH is just /usr/bin:/bin — pin a known-good one.
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/sbin:/bin"

BACKEND_ENV="/home/medusa/apps/backend/.env"
BACKUP_DIR="/home/backups/medusa"
KEEP=14

[ -f "$BACKEND_ENV" ] || {
  echo "backup: missing $BACKEND_ENV" >&2
  exit 1
}
DB_URL=$(grep -m1 '^DATABASE_URL=' "$BACKEND_ENV" | cut -d= -f2-)
[ -n "$DB_URL" ] || {
  echo "backup: no DATABASE_URL in $BACKEND_ENV" >&2
  exit 1
}

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$BACKUP_DIR/medusa-$STAMP.dump"
SIDECAR="$BACKUP_DIR/medusa-$STAMP.counts"

# Row counts first: the sidecar describes the same near-instant snapshot
# the dump takes (both run at 02:45 with no traffic, no writes).
: > "$SIDECAR"
for table in $(psql "$DB_URL" -tAc \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"); do
  count=$(psql "$DB_URL" -tAc "SELECT count(*) FROM \"$table\"")
  echo "$table=$count" >> "$SIDECAR"
done
chmod 600 "$SIDECAR"

# Custom format: compressed, and pg_restore can restore selectively.
pg_dump -Fc --no-owner --no-privileges -f "$FILE" "$DB_URL"
chmod 600 "$FILE"

# A dump that cannot be listed cannot be restored — fail the run loudly.
pg_restore --list "$FILE" > /dev/null

cp "$BACKEND_ENV" "$BACKUP_DIR/backend.env"
chmod 600 "$BACKUP_DIR/backend.env"

# Retention: newest KEEP dumps (and their sidecars) win.
ls -1t "$BACKUP_DIR"/medusa-*.dump 2>/dev/null |
  tail -n +$((KEEP + 1)) |
  while read -r old; do
    rm -f "$old" "${old%.dump}.counts"
  done

BYTES=$(stat -c %s "$FILE")
echo "backup: ok file=$(basename "$FILE") bytes=$BYTES keep=$KEEP"
