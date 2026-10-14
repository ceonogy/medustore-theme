#!/usr/bin/env bash
# Uptime watchdog — installed as host cron (every 5 minutes):
#
#   */5 * * * * /home/storefront/scripts/watchdog.sh >> /home/backups/medusa/watchdog.log 2>&1
#
# Probes the storefront and the Medusa API over HTTP. Three consecutive
# failures (~15 minutes down) trigger a pm2 restart of the affected
# app; further restart attempts are spread by a one-hour cooldown so a
# hard-broken host cannot enter a restart storm. Also verifies that the
# nightly backup is fresh and the restore drill did not fail.
#
# Healthy runs are SILENT — the log only ever contains problems.
# Alerts go to stdout (captured by cron into watchdog.log) and, if
# WATCHDOG_ALERT_URL is set, to that webhook (Slack / Discord / ntfy…):
#   curl POST {"text": "<host>: <message>"}
#
# Env overrides (used by the drill in the commit message / testing):
#   WATCHDOG_STOREFRONT_URL  probe target (default http://127.0.0.1:3001/)
#   WATCHDOG_MEDUSA_URL      probe target (default http://127.0.0.1:9000/health)
#   WATCHDOG_BACKUP_DIR      dump directory (default /home/backups/medusa)
#   WATCHDOG_STATE_DIR       failure counters (default $BACKUP_DIR/watchdog)
#   WATCHDOG_SKIP_RESTART    any value = probe and alert, never restart
#   WATCHDOG_ALERT_URL       webhook for alerts
set -uo pipefail # deliberately no -e: a failed probe must not abort the run

# Cron's default PATH is just /usr/bin:/bin, but pm2 lives in
# /usr/local/bin — without this, the self-healing restart silently
# fails in the only environment that matters (drilled: it did).
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/sbin:/bin"

STOREFRONT_URL="${WATCHDOG_STOREFRONT_URL:-http://127.0.0.1:3001/}"
MEDUSA_URL="${WATCHDOG_MEDUSA_URL:-http://127.0.0.1:9000/health}"
BACKUP_DIR="${WATCHDOG_BACKUP_DIR:-/home/backups/medusa}"
STATE_DIR="${WATCHDOG_STATE_DIR:-$BACKUP_DIR/watchdog}"
MAX_FAILS=3 # 3 x 5 min = 15 minutes of downtime before acting
ALERT_EVERY=12 # re-alert / re-attempt every 12 probes (~1 h) while still down
COOLDOWN_SECONDS=3600 # at most one restart attempt per hour per app

mkdir -p "$STATE_DIR"
STAMP=$(date +%s)

notify() {
  echo "watchdog: $*"
  if [ -n "${WATCHDOG_ALERT_URL:-}" ]; then
    curl -fsS -m 10 -X POST -H "Content-Type: application/json" \
      -d "{\"text\":\"$(hostname): $*\"}" "$WATCHDOG_ALERT_URL" >/dev/null 2>&1 || true
  fi
}

probe() {
  local name="$1" url="$2" app="$3"
  local fails_file="$STATE_DIR/$name.fails" last_file="$STATE_DIR/$name.last_restart"
  local fails=0 last=0
  [ -f "$fails_file" ] && fails=$(cat "$fails_file")
  [ -f "$last_file" ] && last=$(cat "$last_file")

  if curl -fsS -m 10 -o /dev/null "$url" 2>/dev/null; then
    if [ "$fails" -gt 0 ]; then
      echo "watchdog: $name recovered after $fails failed probe(s)"
      rm -f "$fails_file"
    fi
    return 0
  fi

  fails=$((fails + 1))
  echo "$fails" > "$fails_file"
  [ "$fails" -lt "$MAX_FAILS" ] && return 0 # still inside the grace period

  # Alert (and maybe restart) on the first breach, then every hour.
  [ "$fails" -eq "$MAX_FAILS" ] || [ $(((fails - MAX_FAILS) % ALERT_EVERY)) -eq 0 ] || return 0

  if [ -n "${WATCHDOG_SKIP_RESTART:-}" ]; then
    notify "$name: DOWN for $((fails * 5)) min (restart skipped, WATCHDOG_SKIP_RESTART set)"
    return 0
  fi
  if [ $((STAMP - last)) -lt "$COOLDOWN_SECONDS" ]; then
    notify "$name: DOWN for $((fails * 5)) min — restart suppressed by cooldown ($(((STAMP - last) / 60)) min since last attempt)"
    return 0
  fi

  echo "$STAMP" > "$last_file"
  echo 0 > "$fails_file" # fresh grace period for the restarted app
  notify "$name: DOWN for $((fails * 5)) min — restarting via pm2"
  pm2 restart "$app" >/dev/null 2>&1 || notify "$name: pm2 restart $app FAILED — needs a human"
}

probe storefront "$STOREFRONT_URL" storefront
probe medusa "$MEDUSA_URL" medusa

# The newest dump must be younger than 26 h (02:45 nightly + slack).
newest=$(ls -1t "$BACKUP_DIR"/medusa-*.dump 2>/dev/null | head -1)
if [ -z "$newest" ]; then
  notify "backup: no dump found in $BACKUP_DIR — nightly backup is not running"
else
  age=$((STAMP - $(stat -c %Y "$newest")))
  [ "$age" -gt 93600 ] &&
    notify "backup: newest dump is $((age / 3600)) h old (expected < 26 h) — nightly backup may be failing"
fi

# The restore drill's latest logged verdict must not be a failure.
if [ -f "$BACKUP_DIR/verify.log" ] && tail -5 "$BACKUP_DIR/verify.log" | grep -q "verify: FAIL"; then
  notify "backup: latest restore drill FAILED — see $BACKUP_DIR/verify.log"
fi
