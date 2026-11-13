import { renderTemplate } from "../src/modules/brevo/service"

/**
 * Self-test render email (không gửi thật): kiểm tra email xác nhận đơn có
 * nhúng QR/VA SePay, và email "đã nhận thanh toán".
 *
 * Chạy: `yarn medusa exec scripts/sepay-email-selftest.ts`
 */
let pass = 0
let fail = 0
const check = (name: string, cond: boolean, extra = "") => {
  if (cond) {
    pass++
    console.log(`PASS  ${name}`)
  } else {
    fail++
    console.log(`FAIL  ${name} ${extra}`)
  }
}

const order = {
  id: "order_test123",
  display_id: 42,
  currency_code: "vnd",
  total: 520000,
  subtotal: 490000,
  shipping_total: 30000,
  items: [
    { product_title: "Áo thun", variant_title: "M", quantity: 1, total: 490000 },
  ],
  shipping_address: { first_name: "An", last_name: "Duy" },
  customer: { first_name: "An" },
  payment_collections: [
    {
      status: "authorized",
      payment_sessions: [
        {
          provider_id: "pp_sepay",
          amount: 520000,
          data: {
            amount: 520000,
            sepay_va_number: "SBSEPAYTESTVA123",
            sepay_bank_name: "Vietcombank",
            sepay_va_holder_name: "HO KINH DOANH TEST DF16",
            sepay_qr_code_url: "https://vietqr.app/img?acc=SBSEPAYTESTVA123",
            sepay_order_code: "DHABCD1234",
            sepay_account_number: "0000000001",
          },
        },
      ],
    },
  ],
}

export default async function run() {
  const placed = renderTemplate("order-placed", {
    order,
    store_url: "https://demostore.ceonogy.com",
  })
  check("order-placed renders", !!placed)
  check(
    "order-placed: VA number",
    !!placed?.html.includes("SBSEPAYTESTVA123"),
  )
  check("order-placed: QR url", !!placed?.html.includes("vietqr.app"))
  check(
    "order-placed: transfer reference (order_code)",
    !!placed?.html.includes("DHABCD1234"),
  )
  check("order-placed: amount formatted (520.000)", !!placed?.html.includes("520.000"))
  check("order-placed: bank name", !!placed?.html.includes("Vietcombank"))
  check(
    "order-placed: order link",
    !!placed?.html.includes("/order/confirmed?order=order_test123"),
  )

  const received = renderTemplate("payment-received", {
    order,
    payment: { amount: 520000, captured_at: "2026-10-30T05:00:00.000Z" },
    store_url: "https://demostore.ceonogy.com",
  })
  check("payment-received renders", !!received)
  check(
    "payment-received: subject",
    !!received?.subject.toLowerCase().includes("đã nhận thanh toán"),
  )
  check("payment-received: amount", !!received?.html.includes("520.000"))
  check(
    "payment-received: order link",
    !!received?.html.includes("/order/confirmed?order=order_test123"),
  )

  console.log(`\nKết quả email selftest: PASS=${pass} FAIL=${fail}`)
  if (fail > 0) process.exitCode = 1
}
