# Backend (Medusa v2) — module cần deploy

Thư mục này chứa **bản sao các file cần deploy** của Medusa backend
(`/home/medusa/apps/backend`) được đặt chung trong repo storefront để mã nguồn
cửa hàng và backend nằm cạnh nhau, dễ review/version.

> Đây **không phải** một project Medusa chạy độc lập: nó là nguồn để
> `deploy.sh` đồng bộ sang monorepo Medusa trên máy chủ rồi build + restart.
> `node_modules/`, `.env`, `.medusa/`, `static/` (ảnh upload lúc chạy) **không**
> được commit.

## Nội dung

| Đường dẫn                    | Mô tả                                                                 |
| ---------------------------- | --------------------------------------------------------------------- |
| `medusa-config.ts`           | Cấu hình Medusa: DB, CORS, module SePay + Brevo, image provider         |
| `src/modules/sepay/`         | Nhà cung cấp thanh toán SePay (`pp_sepay`) + client API v2 + webhook HMAC + model `sepay_webhook_event` (dedup) |
| `src/modules/brevo/`         | Notification provider Brevo (email giao dịch, template tiếng Việt)      |
| `src/api/webhooks/sepay/`    | Route webhook `POST /webhooks/sepay` (verify chữ ký, dedup)             |
| `src/api/store/sepay/`       | `GET /store/sepay/order/:id` (VA/QR + poll) và `POST …/refresh` (tạo lại VA khi hết hạn) |
| `src/api/admin/sepay/`       | `GET /admin/sepay/config` (+ `/secret` reveal) cho trang admin S4       |
| `src/admin/routes/sepay/`    | Trang admin "SePay" (hiển thị webhook URL/secret, trạng thái vùng)      |
| `src/subscribers/`           | Email: `order-placed` (xác nhận đơn + QR/VA), `payment-captured` (đã nhận tiền), mã xác thực, đặt lại mật khẩu |
| `src/workflows/sepay/`       | Workflow tạo lại VA (`regenerate-sepay-va`)                             |
| `src/search/`, `src/api/store/promotions/`, … | Tìm kiếm/facet, khuyến mãi, API tài khoản (không thuộc SePay nhưng deploy kèm) |
| `scripts/`                   | Self-test: email render, refund Hybrid, webhook                  |
| `migration-scripts/`, `src/scripts/` | Seed dữ liệu demo                                            |

## Triển khai

Từ **thư mục gốc repo storefront**:

```bash
./deploy.sh               # rsync backend/ → /home/medusa/apps/backend, build, pm2 restart medusa
./deploy.sh --dry-run     # xem trước các thay đổi rsync
./deploy.sh --no-build    # sync + restart (khi chỉ đổi .env hoặc thứ không cần build)
./deploy.sh --no-restart  # sync + build (không restart)
```

Quy trình script thực hiện:

1. `rsync -a --delete` `backend/` → `$MEDUSA_ROOT/apps/backend`
   (mặc định `/home/medusa/apps/backend`).
2. `cd $MEDUSA_ROOT && yarn build` (turbo build backend + admin bundle, ~1–2 phút).
3. `pm2 restart medusa`, sau đó chờ `GET /health` trả `200` (tối đa ~3 phút).

**Không bao giờ** bị ghi đè/xoá bởi rsync: `.env`, `.env.*`, `node_modules`,
`.medusa`, `.turbo`, `dist`, `build`, `.cache`, `static`, `uploads`,
`tsconfig.tsbuildinfo`. Nhờ vậy file `.env` bí mật và ảnh upload trên máy chủ
được giữ nguyên.

Biến môi trường (mặc định hợp lý, chỉ cần đổi khi host khác):

```bash
MEDUSA_ROOT=/home/medusa           # gốc monorepo Medusa
MEDUSA_BACKEND_DIR=…/apps/backend  # thư mục đích
PM2_APP=medusa                     # tên tiến trình pm2
HEALTH_URL=http://127.0.0.1:9000/health
```

## Biến môi trường backend

Sao chép `.env.template` rồi điền; **không commit `.env`**. Các khoá bắt buộc
cho tính năng SePay/Brevo:

```env
DATABASE_URL=postgres://…/medusa_store
REDIS_URL=redis://localhost:6379
JWT_SECRET=…
COOKIE_SECRET=…
STORE_CORS=https://demostore.ceonogy.com,http://127.0.0.1:3001
ADMIN_CORS=https://adminstore.ceonogy.com,http://127.0.0.1:9000
AUTH_CORS=https://adminstore.ceonogy.com,http://127.0.0.1:9000
MEDUSA_BACKEND_URL=https://adminstore.ceonogy.com

# SePay
SEPAY_API_TOKEN=…            # token API v2
SEPAY_BASE_URL=https://userapi-sandbox.sepay.vn/v2
SEPAY_BANK_ACCOUNT_ID=…
SEPAY_TID=…
SEPAY_MODE=va_order         # tạo VA theo đơn
SEPAY_WEBHOOK_SECRET=…      # khoá HMAC-SHA256 xác thực webhook

# Brevo
BREVO_API_KEY=…
BREVO_FROM=no-reply@…
BREVO_FROM_NAME=Demostore
BREVO_STORE_URL=https://demostore.ceonogy.com
```

## Self-test

Chạy trong `apps/backend` trên máy chủ (sau khi đã build/DB sẵn sàng):

```bash
cd /home/medusa/apps/backend
yarn medusa exec scripts/sepay-email-selftest.ts       # render email (11 check)
yarn medusa exec scripts/sepay-refund-selftest.mjs     # hoàn tiền Hybrid (6 check)
yarn medusa exec scripts/sepay-webhook-selftest.mjs    # xác thực webhook HMAC
```

Bộ test đầu-cuối (webhook thật, refresh VA, E2E storefront) nằm ngoài repo tại
`/tmp/opencode/*.sh` và ma trận QA `/tmp/opencode/test-cases.sh`.
