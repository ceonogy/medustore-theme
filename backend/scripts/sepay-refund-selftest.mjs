/**
 * Self-test hoàn tiền Hybrid của provider SePay — chạy bằng:
 *
 *   cd /home/medusa/apps/backend && yarn medusa exec scripts/sepay-refund-selftest.mjs
 *
 * Mặc định refund payment của order #9 (đã capture 520000₫). Có thể override:
 *   RP_PAYMENT_ID=pay_... RP_AMOUNT=100000 yarn medusa exec scripts/sepay-refund-selftest.mjs
 *
 * Kỳ vọng với tài khoản Vietcombank hộ kinh doanh (API hoàn tiền SePay chỉ hỗ
 * trợ VietinBank doanh nghiệp):
 *   - provider gọi API refund → nhận 422 unsupported_bank
 *   - tự động chuyển sang ghi nhận thủ công
 *   - payment.data.sepay_refund_mode === "manual"
 */
export default async function ({ container }) {
  const logger = container.resolve("logger")
  const payment = container.resolve("payment")

  /** Payment SePay đã thu tiền và **chưa** có lần hoàn nào (để test sạch). */
  const pickRefundablePaymentId = async () => {
    const list = await payment.listPayments(
      { provider_id: "pp_sepay", captured_at: { $ne: null } },
      { relations: ["refunds"], take: 200 },
    )
    const eligible = list.find(
      (p) => (p.refunds ?? []).length === 0 && p.data?.sepay_order_xid,
    )
    return eligible?.id
  }

  const paymentId = process.env.RP_PAYMENT_ID || (await pickRefundablePaymentId())
  const amount = Number(process.env.RP_AMOUNT || 520000)

  const results = []
  const check = (name, ok, detail) => {
    results.push({ name, ok })
    logger[ok ? "info" : "error"](
      `${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`,
    )
  }

  if (!paymentId) {
    logger.warn(
      "Không tìm thấy payment SePay nào đã thu tiền & chưa hoàn — bỏ qua self-test.",
    )
    return
  }

  const before = await payment.retrievePayment(paymentId, {
    relations: ["refunds"],
  })
  logger.info(
    `Trước: payment=${before.id} provider=${before.provider_id} ` +
      `amount=${before.amount} captured=${before.captured_at} ` +
      `refunds=${(before.refunds ?? []).length} ` +
      `mode=${before.data?.sepay_refund_mode ?? "(chưa)"}`,
  )

  check(
    "payment tồn tại và đúng nhà cung cấp SePay",
    before.provider_id === "pp_sepay",
    `${before.provider_id}`,
  )
  check("payment đã thu tiền (captured_at)", Boolean(before.captured_at))
  check("payment có order VA (sepay_order_xid)", Boolean(before.data?.sepay_order_xid))

  const refunded = await payment.refundPayment({
    payment_id: paymentId,
    amount,
    note: "sepay-refund-selftest",
  })

  logger.info(
    `Sau:  mode=${refunded.data?.sepay_refund_mode} ` +
      `refund_id=${refunded.data?.sepay_refund_id ?? "(không có — đúng khi API bị chặn)"} ` +
      `note=${refunded.data?.sepay_refund_note ?? "(không)"} ` +
      `refunds=${(refunded.refunds ?? []).length}`,
  )

  check(
    "đã ghi nhận hoàn tiền thủ công (sepay_refund_mode=manual)",
    refunded.data?.sepay_refund_mode === "manual",
    `${refunded.data?.sepay_refund_mode}`,
  )
  check(
    "có ghi chú hoàn tiền thủ công",
    typeof refunded.data?.sepay_refund_note === "string" &&
      refunded.data.sepay_refund_note.length > 0,
  )
  check(
    "Medusa tạo bản ghi refund trên payment",
    (refunded.refunds ?? []).length >= 1,
    `refunds=${(refunded.refunds ?? []).length}`,
  )

  const failed = results.filter((r) => !r.ok)
  logger.info(`\nKết quả: PASS=${results.length - failed.length} FAIL=${failed.length}`)
  if (failed.length) {
    throw new Error(`Refund self-test FAIL: ${failed.map((f) => f.name).join(", ")}`)
  }
}
