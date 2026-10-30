import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /store/sepay/order/:id
 *
 * Trả thông tin **thanh toán chuyển khoản SePay** của một đơn hàng để storefront
 * hiển thị QR/VA + poll trạng thái. Chỉ trả dữ liệu an toàn (không lộ token,
 * không lộ webhook secret).
 *
 * Bảo mật: giống `/store/orders/:id` của Medusa — order id (UUID/ULID) chính là
 * "chìa khoá"; route không yêu cầu đăng nhập (đơn khách vãng lai vẫn xem được).
 * Xem https://docs.medusajs.com/resources/commerce-modules/order/secure-order-retrieval
 * nếu muốn siết thêm.
 *
 * Dữ liệu trả về:
 *   - thông tin VA/QR/ngân hàng lấy từ `payment_session.data` (do provider ghi
 *     ở `authorizePayment`);
 *   - `captured` lấy từ `payment.captured_at` (provider ghi ở `capturePayment`
 *     khi webhook SePay xác nhận) hoặc payment collection `completed`.
 */
const SEPAY_PROVIDER_ID = "pp_sepay"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const orderId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.completed_at",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.amount",
      "payment_collections.payment_sessions.provider_id",
      "payment_collections.payment_sessions.status",
      "payment_collections.payment_sessions.data",
    ],
    filters: { id: orderId },
  })

  const order = data?.[0]
  if (!order) {
    return res.status(404).json({ message: "Không tìm thấy đơn hàng." })
  }

  for (const collection of order.payment_collections ?? []) {
    if (!collection) continue

    const session = (collection.payment_sessions ?? []).find(
      (s) => s?.provider_id === SEPAY_PROVIDER_ID,
    )
    if (!session) continue

    const d = (session.data ?? {}) as Record<string, unknown>
    const payment = (collection.payments ?? []).find(
      (p) => p?.provider_id === SEPAY_PROVIDER_ID,
    )
    const capturedAt = payment?.captured_at ?? null

    return res.json({
      payment: {
        provider_id: SEPAY_PROVIDER_ID,
        display_id: order.display_id ?? null,
        order_code: d.sepay_order_code ?? null,
        va_number: d.sepay_va_number ?? null,
        qr_code_url: d.sepay_qr_code_url ?? null,
        bank_name: d.sepay_bank_name ?? null,
        account_number: d.sepay_account_number ?? null,
        account_holder_name: d.sepay_va_holder_name ?? null,
        amount: d.amount ?? null,
        expires_at: d.sepay_expired_at ?? null,
        captured: Boolean(capturedAt) || collection.status === "completed",
        captured_at: capturedAt,
        collection_status: collection.status ?? null,
      },
    })
  }

  return res.json({ payment: null })
}
