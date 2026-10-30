#!/usr/bin/env bash
#
# deploy.sh — triển khai module backend (Medusa v2) từ repo này lên máy chủ.
#
# Nguồn sự thật cho code backend nằm ở `backend/` (bản sao các file cần deploy
# của `/home/medusa/apps/backend`). Script này:
#
#   1. rsync `backend/` → `<MEDUSA_ROOT>/apps/backend` (chỉ đồng bộ code/config;
#      KHÔNG đụng tới `.env`, `node_modules`, `.medusa`, `static/`, uploads…).
#   2. `yarn build` ở `<MEDUSA_ROOT>` (turbo build backend + admin bundle).
#   3. `pm2 restart <PM2_APP>` và chờ `/health` trả 200.
#
# Cách dùng:
#   ./deploy.sh                 # sync + build + restart
#   ./deploy.sh --dry-run       # chỉ in ra thay đổi rsync sẽ thực hiện
#   ./deploy.sh --no-build      # sync + restart (không build)
#   ./deploy.sh --no-restart    # sync + build (không restart)
#
# Biến môi trường (đều có mặc định hợp lý):
#   MEDUSA_ROOT        thư mục gốc monorepo Medusa      (mặc định: /home/medusa)
#   MEDUSA_BACKEND_DIR thư mục apps/backend đích        (mặc định: $MEDUSA_ROOT/apps/backend)
#   PM2_APP            tên tiến trình pm2 backend       (mặc định: medusa)
#   HEALTH_URL         URL health-check                 (mặc định: http://127.0.0.1:9000/health)
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$ROOT_DIR/backend"
MEDUSA_ROOT="${MEDUSA_ROOT:-/home/medusa}"
DEST_DIR="${MEDUSA_BACKEND_DIR:-$MEDUSA_ROOT/apps/backend}"
PM2_APP="${PM2_APP:-medusa}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:9000/health}"

DRY_RUN=0
DO_BUILD=1
DO_RESTART=1

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-build) DO_BUILD=0 ;;
    --no-restart) DO_RESTART=0 ;;
    -h | --help)
      sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Tham số không hợp lệ: $arg (dùng --help)" >&2
      exit 2
      ;;
  esac
done

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2
  exit 1
}

command -v rsync >/dev/null 2>&1 || die "Thiếu rsync."
[ -d "$SRC_DIR" ] || die "Không thấy thư mục nguồn: $SRC_DIR"
[ -d "$DEST_DIR" ] || die "Không thấy thư mục đích: $DEST_DIR (kiểm tra MEDUSA_ROOT)."

# Các đường dẫn KHÔNG bao giờ bị ghi đè/xoá (secrets + runtime data + deps).
RSYNC_EXCLUDES=(
  --exclude '.env'
  --exclude '.env.*'
  --exclude 'node_modules'
  --exclude '.medusa'
  --exclude '.turbo'
  --exclude '.yarn'
  --exclude 'dist'
  --exclude 'build'
  --exclude '.cache'
  --exclude 'static'
  --exclude 'uploads'
  --exclude 'tsconfig.tsbuildinfo'
)

log "Nguồn : $SRC_DIR"
log "Đích  : $DEST_DIR"
log "App   : $PM2_APP   (build=$DO_BUILD, restart=$DO_RESTART, dry-run=$DRY_RUN)"

RSYNC_FLAGS=(-a --delete --human-readable --itemize-changes "${RSYNC_EXCLUDES[@]}")
if [ "$DRY_RUN" -eq 1 ]; then
  RSYNC_FLAGS+=(--dry-run)
fi

log "Đồng bộ mã nguồn backend…"
rsync "${RSYNC_FLAGS[@]}" "$SRC_DIR"/ "$DEST_DIR"/

if [ "$DRY_RUN" -eq 1 ]; then
  log "Dry-run xong — chưa thay đổi gì."
  exit 0
fi

if [ "$DO_BUILD" -eq 1 ]; then
  log "Build Medusa (turbo) — có thể mất ~1–2 phút…"
  (cd "$MEDUSA_ROOT" && yarn build)
else
  warn "Bỏ qua build."
fi

if [ "$DO_RESTART" -eq 1 ]; then
  log "Restart pm2 '$PM2_APP'…"
  pm2 restart "$PM2_APP" >/dev/null

  log "Chờ backend khởi động (tối đa ~3 phút)…"
  healthy=0
  for i in $(seq 1 36); do
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 3 "$HEALTH_URL" || true)"
    if [ "$code" = "200" ]; then
      healthy=1
      log "Backend sẵn sàng sau ${i}0s (GET $HEALTH_URL → 200)."
      break
    fi
    sleep 10
  done
  if [ "$healthy" -eq 0 ]; then
    die "Backend không phản hồi 200 sau ~3 phút — kiểm tra: pm2 logs $PM2_APP"
  fi
else
  warn "Bỏ qua restart."
fi

log "Hoàn tất triển khai backend."
