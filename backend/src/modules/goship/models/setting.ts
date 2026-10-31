import { model } from "@medusajs/framework/utils"

/**
 * Cấu hình runtime của GoShip (bảng key/value nhỏ).
 *
 * Mục đích: cho phép **bật/tắt GoShip ngay trong Admin UI** sau khi deploy,
 * không phải sửa `.env` rồi restart. Biến `GOSHIP_ENABLED` chỉ còn là giá trị
 * **dự phòng** khi bảng chưa có dòng nào (hoặc DB lỗi).
 *
 * Hiện dùng một khoá duy nhất: `enabled` = `"true"` / `"false"`.
 * Giữ dạng key/value để sau này thêm cấu hình (mã điểm gửi, tier mặc định...)
 * mà không phải đổi schema.
 */
const GoshipSetting = model.define("goship_setting", {
  id: model.id().primaryKey(),
  key: model.text().unique(),
  value: model.text().nullable(),
})

export default GoshipSetting
