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
| `medusa-config.ts`           | Cấu hình Medusa: DB, CORS, module SePay + Brevo + GoShip, image provider, fulfillment provider |
| `src/modules/goship/`        | Tích hợp vận chuyển GoShip: client REST, cache địa giới `goship_location` (tỉnh/quận/phường), fulfillment provider `fp_goship_goship`, tính cước `/rates` (`config.ts`, `rates.ts`), tạo/hủy vận đơn (`client.ts`, `shipments.ts`), webhook HMAC (`webhook.ts`), công tắc + cấu hình "Thông tin hàng gửi" (`settings.ts`, model `goship_setting`, `goship_shipment_event`) |
| `src/api/store/goship/`      | `GET /store/goship/locations` (+ `/districts`, `/wards`) — danh mục địa giới cho dropdown checkout; `GET /store/goship/config` — đơn vị đo (g/kg, cm/m) cho storefront |
| `src/api/store/shipping-options/` | Ghi đè route lõi để trả shipping option kèm **cước đã tính** (`listShippingOptionsForCartWithPricingWorkflow`) |
| `src/api/store/account/orders/` | API đơn hàng của khách — thêm `payment_status` + `fulfillment_status` (tính từ payment_collections/fulfillments) và khối `shipping` (mã vận đơn, hãng, hành trình, `label_url`) |
| `src/api/admin/goship/`      | `GET/POST /admin/goship/config` — bật/tắt GoShip, đăng ký/hủy webhook + `webhook.registered`, và đọc/lưu **"Thông tin hàng gửi"** (`parcel`, `parcel_options`) |
| `src/admin/routes/goship/`   | Trang admin "GoShip" (`/app/goship`): công tắc bật/tắt, trạng thái provider/tier, chỉ báo webhook, và form **"Thông tin hàng gửi"** |
| `src/admin/widgets/goship-goods-type.tsx` | Widget ở trang chi tiết sản phẩm (`product.details.side.after`): dropdown **multi-select** chọn **"Loại hàng"** (tối đa 2 theo GoShip), chip có nút × để bỏ nhanh, mục "Xoá tất cả"; ghi vào `product.metadata.goship_goods_type` dạng mảng |
| `src/api/webhooks/goship/`   | Route webhook `POST /webhooks/goship` (verify HMAC-SHA256, dedup, cập nhật trạng thái vận đơn) |
| `src/workflows/hooks/`       | Hook `setShippingOptionsContext` — bơm cờ `goship_enabled` để ẩn/hiện option GoShip theo công tắc (DB → dự phòng `GOSHIP_ENABLED`) |
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
| `src/scripts/`               | Seed dữ liệu demo + `goship-sync.ts` (đồng bộ provider/option GoShip) |

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

# GoShip (vận chuyển)
GOSHIP_BASE_URL=https://sandbox.goship.io/api/v2
GOSHIP_TOKEN=...               # token API v2 (sandbox khi dev, prod khi go-live)
GOSHIP_CLIENT_ID=...
GOSHIP_CLIENT_SECRET=...       # dùng cho chữ ký webhook HMAC-SHA256
GOSHIP_DEFAULT_SERVICE=economy
GOSHIP_FALLBACK_FEE=30000      # phí dự phòng (VND) khi chưa gọi được bảng giá
GOSHIP_ENABLED=false           # CHỈ là dự phòng khi DB chưa có cấu hình; nguồn chính là Admin → GoShip
# Điểm gửi (mã GoShip) — mặc định Kho HCM; liên hệ in trên vận đơn.
GOSHIP_ORIGIN_CITY=700000
GOSHIP_ORIGIN_DISTRICT=701900
GOSHIP_ORIGIN_WARD=9276
GOSHIP_ORIGIN_NAME=Kho HCM
GOSHIP_ORIGIN_PHONE=0900000000
GOSHIP_ORIGIN_ADDRESS=1 Tân Tạo A
GOSHIP_PAYER=1                 # 1 = shop trả phí ship, 0 = người nhận trả
GOSHIP_COD_DEFAULT=0           # tiền thu hộ mặc định khi tạo vận đơn (0 = không COD)
GOSHIP_DEFAULT_WEIGHT_GRAMS=500  # kiện mặc định khi variant thiếu dữ liệu
GOSHIP_DEFAULT_LENGTH_CM=20
GOSHIP_DEFAULT_WIDTH_CM=15
GOSHIP_DEFAULT_HEIGHT_CM=10
GOSHIP_PART_DELIVERY=false     # dự phòng "Giao 1 phần" khi DB chưa có cấu hình
```

> Các khoá `GOSHIP_PAYER`, `GOSHIP_COD_DEFAULT`, `GOSHIP_DEFAULT_*`,
> `GOSHIP_WEIGHT_UNIT`, `GOSHIP_DIMENSION_UNIT`, `GOSHIP_PART_DELIVERY` chỉ là
> **giá trị nền**; phần "Thông tin hàng gửi" lưu trong DB (Admin → GoShip) sẽ ghi
> đè khi có cấu hình.

## Vận chuyển: giá cố định (mặc định) & GoShip (tùy chọn)

Hai lớp phương thức giao hàng ở checkout:

- **Giá ship cố định (mặc định)** — 2 shipping option `flat` native của provider
  `manual_manual` ("Giao hàng tiêu chuẩn" / "Giao hàng nhanh"). Đây là mặc định;
  không cấu hình giá trong GoShip.
- **GoShip (tùy chọn)** — provider `goship_goship` CHỈ **tính cước** qua
  `POST /rates`, hiện 2 option `calculated` ("Tiết kiệm (GoShip)" rẻ nhất /
  "Nhanh (GoShip)" nhanh nhất).

Bật/tắt GoShip **ngay trong Admin** (khuyến nghị): vào **Cài đặt → GoShip**
(`/app/goship`) gạt công tắc. Nguồn cờ là bảng `goship_setting` trong DB nên có
hiệu lực ở request checkout kế tiếp, **không cần sửa `.env` hay restart**.

- BẬT: hiện cả 2 option GoShip, cước tính thật theo địa chỉ + cân nặng.
- TẮT: ẩn hết option GoShip, chỉ còn 2 option `flat` (giá cố định).

`GOSHIP_ENABLED` trong `.env` chỉ là **giá trị dự phòng** khi DB chưa có cấu hình
(ví dụ mới deploy). Một khi đã gạt công tắc trong Admin, DB là nguồn chính.

Cơ chế ẩn/hiện: mỗi option GoShip có rule `goship_enabled eq "true"`; hook trong
`src/workflows/hooks/goship.ts` đọc công tắc (DB → dự phòng ENV) và bơm cờ vào
context lọc option của Medusa (`isContextValid`). Khi tắt, cờ = `false` → rule
fail → option bị loại (fail-closed: lỗi đọc cờ cũng coi như TẮT).

Đồng bộ provider/option (chạy 1 lần, idempotent):

```bash
cd /home/medusa/apps/backend
npx medusa exec ./src/scripts/goship-sync.ts
```

Script sẽ: gắn `goship_goship` vào kho dùng ở checkout, ghi mã địa giới + liên hệ
điểm gửi vào metadata kho, tạo/cập nhật 2 option `calculated` kèm rule. Script tự
khôi phục đúng trạng thái công tắc trước khi chạy.

## "Thông tin hàng gửi" (tuỳ chọn kiện hàng)

API `POST /shipments` của GoShip chỉ nhận `parcel.{cod,amount,weight,width,height,length,metadata}`
và `shipment.payer`, nên các mục dạng text của form GoShip được **gộp vào
`parcel.metadata`**. Cấu hình chia 2 tầng:

**1) Chính sách chung — Admin → GoShip → "Thông tin hàng gửi"** (lưu trong
`goship_setting`, áp dụng cho mọi vận đơn; nền là ENV rồi DB ghi đè):

| Mục | Khoá DB | Ánh xạ GoShip |
| --- | --- | --- |
| Người trả phí | `parcel_payer` | `shipment.payer` (0 khách / 1 shop) |
| Ghi chú giao hàng | `parcel_delivery_note` | `parcel.metadata` (preset "Cho thử hàng"…) |
| Loại hàng mặc định (tối đa 2) | `parcel_goods_types` | `parcel.metadata` — dùng khi sản phẩm không khai |
| Khai giá | `parcel_declare_value` | `parcel.amount` (`off` = 0, `order_total` = tổng đơn) |
| Đơn vị đo | `parcel_weight_unit` (`g`/`kg`), `parcel_dimension_unit` (`cm`/`m`) | quyết định cách quy đổi sang gram/cm |
| Cân nặng/kích thước mặc định | `parcel_weight_grams`, `parcel_length_cm`, `parcel_width_cm`, `parcel_height_cm` | `parcel.weight/width/height/length` (theo đơn vị đo đã chọn) |
| Thu hộ mặc định | `parcel_cod_default` | `parcel.cod` |
| Giao 1 phần | `parcel_is_part_delivery` | `parcel.metadata` (chỉ GHN/GHTK) |

**2) Thuộc tính sản phẩm** (ưu tiên hơn mặc định):

- **Loại hàng**: `variant.metadata.goship_goods_type` → fallback
  `product.metadata.goship_goods_type` → default global. Khai ở cấp sản phẩm bằng
  widget **"Loại hàng (GoShip)"** ở trang chi tiết sản phẩm (Admin); cấp variant
  sửa trong khu **Metadata** của variant. Giá trị là một nhãn trong danh mục 11
  loại (ví dụ `"Quần áo"`, `"Đồ điện tử"`). **Giá trị không có trong danh mục sẽ
  bị bỏ** (kèm cảnh báo `[goship] bỏ "loại hàng"…` trong log) — tránh gửi nhãn
  sai chính tả lên GoShip.
- **Cân nặng/kích thước**: dùng trường sẵn có của variant (`weight`, `length`,
  `width`, `height`); thiếu → mặc định global.

### Đơn vị đo (g/kg, cm/m)

Medusa **không có** cấu hình đơn vị cho `product/variant.weight|length|width|height`
— chúng là số `float` trần (`unit_of_measure` chỉ có ở inventory item và là đơn vị
**đếm tồn kho**, không liên quan). Vì vậy shop khai đơn vị trong **Admin → GoShip →
"Đơn vị đo"** (`parcel_weight_unit`, `parcel_dimension_unit`), mặc định `g`/`cm`.

GoShip chỉ nhận **gram + cm**, nên `buildParcel()` nhân hệ số (kg→g ×1000, m→cm
×100) cho **cả giá trị variant lẫn giá trị mặc định** ở cả hai đường: tính cước
(`calculatePrice`/`quote`) và tạo vận đơn (`createFulfillment`). Storefront đọc
`GET /store/goship/config` để hiển thị đúng nhãn (`1.5 kg`, `0.5 × 0.3 × 0.2 m`).

Khi tạo vận đơn, provider đọc bảng `goship_setting` qua knex (không resolve được
service module), làm giàu item từ `product_variant`/`product`, rồi ghép
`parcel.metadata = "Loại hàng: X, Y · [Giao 1 phần] · [ghi chú giao hàng] · [ghi chú chung]`.

## Vận đơn & theo dõi trạng thái

- Khi admin **tạo fulfillment** cho đơn có shipping method GoShip, provider gọi
  `POST /shipments` tạo vận đơn thật (cần SĐT người nhận; thiếu → lỗi rõ ràng),
  lưu `goship_id` (gcode) vào `fulfillment.data`, gán mã vận đơn vào label.
- GoShip gọi **webhook** `POST /webhooks/goship` (header
  `x-goship-hmac-sha256 = base64(HMAC-SHA256(rawBody, GOSHIP_CLIENT_SECRET))`).
  Route dedup theo `(gcode, status, update_time)`, cập nhật `shipped_at` /
  `delivered_at` / `canceled_at` → `order.fulfillment_status` đổi theo.
- Admin có thể **hủy fulfillment** → provider gọi `DELETE /shipments/{gcode}`.
- Storefront hiển thị khối "Vận chuyển" (hãng, mã vận đơn, hành trình) ở trang
  chi tiết đơn trong tài khoản khách.

## Nâng cấp core Medusa (an toàn)

Phần tuỳ biến của shop nằm trọn trong `apps/backend/src` (module `goship`,
`sepay`, API routes, admin widgets/routes, workflows hooks, `medusa-config.ts`).
Script **không** sửa gì trong `node_modules` — nên nâng cấp core (đổi version
`@medusajs/*` + `yarn install`) chỉ thay `node_modules`, **không đụng code mình**,
và `deploy.sh` luôn lấy `backend/` trong repo làm nguồn sự thật.

Nguyên tắc nâng cấp an toàn:

1. **Pin & khoá version**: giữ version cụ thể trong `package.json` + commit
   `yarn.lock`; nâng có chủ đích, tránh `latest`.
2. **Backup DB trước** (migration chỉ đổi schema, nhưng vẫn nên có đường lùi):
   ```bash
   PGPASSWORD='...' pg_dump -h localhost -U medusa_user -d medusa_store \
     -Fc -f ~/backup-medusa-$(date +%F-%H%M).dump
   ```
3. **Đổi version → cài → build xác nhận**:
   ```bash
   cd /home/medusa && yarn install && yarn build
   ```
4. **Chạy test trước khi restart thật**:
   ```bash
   cd /home/medusa/apps/backend && yarn test:unit   # unit backend
   cd /home/storefront && yarn test                 # unit storefront
   bash /tmp/opencode/test-cases.sh                 # ma trận QA end-to-end
   ```
5. **Deploy + theo dõi**: `./deploy.sh` (từ repo) rồi `pm2 logs medusa`.
6. Migrations của core/module chỉ **thêm/sửa bảng, cột** — không xoá product,
   variant hay order. Rollback: cài lại version cũ trong `package.json` rồi
   `yarn install && yarn build`, hoặc restore từ file `pg_dump` ở bước 2.

Code backend chỉ import **package công khai** của Medusa (`@medusajs/framework`,
`@medusajs/medusa`, `@medusajs/admin-sdk`, `@medusajs/ui`, `@medusajs/icons`,
`@medusajs/core-flows`) — **không** import đường dẫn internal (`/dist/...`), nên
ít rủi ro vỡ khi lên version. Rủi ro còn lại: breaking change API/type, hoặc
component/zone của admin UI đổi — nên kiểm tra lại widget `goship` và trang
`/app/goship` sau mỗi lần nâng.

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
