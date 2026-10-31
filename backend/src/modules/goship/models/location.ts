import { model } from "@medusajs/framework/utils"

/**
 * Cache danh mục địa giới của GoShip (tỉnh/quận/phường).
 *
 * GoShip bắt buộc dùng **mã số** (`city`/`district`/`ward`) khi tính phí và
 * tạo vận đơn — không nhận tên tự do. Danh mục này ít đổi (63 tỉnh), nhưng
 * mỗi lần checkout lại cần → cache vào DB để không gọi GoShip liên tục
 * (rate limit) và để form checkout vẫn chạy khi GoShip tạm lỗi.
 *
 * `level` + `code` là UNIQUE (mã phường là số nhỏ, có thể trùng dải với mã
 * tỉnh/quận nếu so như chuỗi → phải khoá theo cặp level+code).
 *
 *  - province: `code` = city id (vd "700000"), `parent_code` = null
 *  - district: `code` = district id (vd "700100"), `parent_code` = city id
 *  - ward:     `code` = ward id (vd "8955"),     `parent_code` = district id
 *
 * `support_carriers` giữ nguyên mảng hãng GoShip trả về cho từng đơn vị
 * (dùng để lọc hãng khả dụng ở Phase C).
 *
 * `sort_order` giữ đúng thứ tự GoShip trả về (Hà Nội, HCM, Đà Nẵng... lên
 * đầu) thay vì sắp theo tên — collation tiếng Việt của Postgres không đáng tin.
 */
const GoshipLocation = model
  .define("goship_location", {
    id: model.id().primaryKey(),
    level: model.text(),
    code: model.text(),
    name: model.text(),
    parent_code: model.text().nullable(),
    support_carriers: model.json().nullable(),
    sort_order: model.number().default(0),
  })
  .indexes([
    { on: ["level", "code"], unique: true },
    { on: ["level", "parent_code"] },
  ])

export default GoshipLocation
