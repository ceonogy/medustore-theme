import { model } from "@medusajs/framework/utils"

/**
 * Một row = một lần SePay gửi webhook (delivery / replay / resend thủ công).
 *
 * `sepay_transaction_id` UNIQUE là khóa chống trùng race-safe theo đúng
 * khuyến nghị của SePay (dedup trên transaction id): hai delivery đồng thời
 * của cùng giao dịch → chỉ một insert thành công, delivery kia trả
 * `{"success": true}` ngay mà không xử lý lại.
 *
 * Lưu dạng text (không ép number) để không lo tràn id khi tài khoản SePay
 * lớn lên — so sánh vẫn là so sánh chuỗi nguyên bản.
 *
 * `status`:
 *  - "processed"      — khớp payment session, đã đẩy capture
 *  - "amount_mismatch" — khớp session nhưng số tiền không khớp → không capture
 *  - "unmatched"      — không tìm thấy payment tương ứng (tiền lạ / session
 *                       đã bị xóa) — vẫn trả 200 cho SePay, giữ row để đối soát
 *  - "invalid"        — payload thiếu trường bắt buộc
 *
 * `payload` là JSON gốc để đối soát / debug.
 */
const SePayWebhookEvent = model.define("sepay_webhook_event", {
  id: model.id().primaryKey(),
  sepay_transaction_id: model.text().unique(),
  gateway: model.text().nullable(),
  account_number: model.text().nullable(),
  sub_account: model.text().nullable(),
  code: model.text().nullable(),
  transfer_type: model.text().nullable(),
  transfer_amount: model.bigNumber().nullable(),
  content: model.text().nullable(),
  status: model.text().default("processed"),
  session_id: model.text().nullable(),
  order_id: model.text().nullable(),
  payload: model.json(),
})

export default SePayWebhookEvent
