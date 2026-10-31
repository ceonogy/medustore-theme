import { model } from "@medusajs/framework/utils"

/**
 * Nhật ký sự kiện webhook GoShip (một dòng / một lần đẩy trạng thái).
 *
 * Hai vai trò:
 *  1. **Dedup**: GoShip retry webhook nhiều lần (mỗi ~3 phút, tối đa ~3 lần).
 *     Bộ ba `(gcode, status, update_time)` là UNIQUE → lần trùng bị bỏ qua,
 *     route vẫn trả 200 để GoShip ngừng retry.
 *  2. **Timeline**: giữ mọi cập nhật để hiển thị hành trình ở trang tài khoản.
 *
 * `fulfillment_id` để truy vết nhanh về fulfillment Medusa tương ứng (nếu dò
 * được theo `gcode`).
 */
const GoshipShipmentEvent = model.define("goship_shipment_event", {
  id: model.id().primaryKey(),
  /** Mã vận đơn GoShip (`gcode`). */
  gcode: model.text(),
  /** Mã vận đơn của hãng vận chuyển (`code`). */
  carrier_code: model.text().nullable(),
  /** `order_id` là mã đối tác (ta gửi id order Medusa). */
  order_id: model.text().nullable(),
  fulfillment_id: model.text().nullable(),
  status: model.text(),
  status_text: model.text().nullable(),
  description: model.text().nullable(),
  tracking_url: model.text().nullable(),
  carrier_short_name: model.text().nullable(),
  is_return: model.boolean().default(false),
  is_lost: model.boolean().default(false),
  cod: model.number().nullable(),
  fee: model.number().nullable(),
  /** UNIX timestamp GMT+7 của sự kiện (GoShip `update_time`). */
  update_time: model.number().nullable(),
  /** Payload thô để đối soát/debug. */
  payload: model.json().nullable(),
})
  .indexes([
    { on: ["gcode", "status", "update_time"], unique: true },
    { on: ["gcode"] },
    { on: ["order_id"] },
  ])

export default GoshipShipmentEvent
