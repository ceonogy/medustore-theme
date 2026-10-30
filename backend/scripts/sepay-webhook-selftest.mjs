/**
 * Self-test Phase S1 — chạy bằng:
 *   cd /home/medusa/apps/backend && yarn medusa exec scripts/sepay-webhook-selftest.mjs
 *
 * Kiểm tra 3 thứ của provider SePay (không cần webhook thật):
 *  1. HMAC verify + dò payment session qua va_number → action `captured`
 *  2. Chống sai lệch: chữ ký hỏng / sai số tiền → `not_supported`
 *  3. Dedup của custom module `sepay`: insert trùng transaction id → duplicate
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const readEnv = () => {
  const envPath = path.resolve(process.cwd(), ".env")
  const out = {}
  if (!fs.existsSync(envPath)) return out
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const sign = (secret, timestamp, raw) =>
  `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`

export default async function ({ container }) {
  const fileEnv = readEnv()
  const secret = process.env.SEPAY_WEBHOOK_SECRET || fileEnv.SEPAY_WEBHOOK_SECRET
  const payment = container.resolve("payment")
  const sepay = container.resolve("sepay")
  const logger = container.resolve("logger")

  // Payment session vừa được tạo trong smoke test S1
  const sessionId = process.env.SE_PAY_TEST_SESSION
  const vaNumber = process.env.SE_PAY_TEST_VA
  const amount = Number(process.env.SE_PAY_TEST_AMOUNT)
  const code = process.env.SE_PAY_TEST_CODE
  if (!sessionId || !vaNumber || !amount || !code || !secret) {
    throw new Error("Thiếu SE_PAY_TEST_SESSION / VA / AMOUNT / CODE / SEPAY_WEBHOOK_SECRET")
  }

  const buildPayload = (overrides = {}) => ({
    id: overrides.id ?? 999001,
    gateway: "Vietcombank",
    transactionDate: "2026-10-29 22:30:00",
    accountNumber: "0000000001",
    subAccount: overrides.subAccount ?? vaNumber,
    code: overrides.code ?? code,
    content: `${code} chuyen tien`,
    transferType: overrides.transferType ?? "in",
    transferAmount: overrides.transferAmount ?? amount,
    accumulated: 0,
    referenceCode: "FT261029TEST",
  })

  const call = async (rawObj, { tamperSignature = false, timestamp } = {}) => {
    const raw = Buffer.from(JSON.stringify(rawObj), "utf8")
    const ts = timestamp ?? String(Math.floor(Date.now() / 1000))
    const headers = {
      "x-sepay-timestamp": ts,
      "x-sepay-signature": tamperSignature
        ? "sha256=" + "0".repeat(64)
        : sign(secret, ts, raw),
    }
    return await payment.getWebhookActionAndData({
      provider: "sepay",
      payload: { data: rawObj, rawData: raw, headers },
    })
  }

  const results = []
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail })
    logger[ok ? "info" : "error"](`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`)
  }

  // 1. hợp lệ → captured
  const good = await call(buildPayload())
  check(
    "hợp lệ → action=captured",
    good.action === "captured" && good.data?.session_id === sessionId && Number(good.data?.amount) === amount,
    JSON.stringify(good),
  )

  // 2. sai chữ ký → not_supported
  const badSig = await call(buildPayload({ id: 999002 }), { tamperSignature: true })
  check("chữ ký sai → not_supported", badSig.action === "not_supported", JSON.stringify(badSig))

  // 3. sai số tiền → not_supported
  const badAmount = await call(buildPayload({ id: 999003, transferAmount: amount - 1000 }))
  check("sai số tiền → not_supported", badAmount.action === "not_supported", JSON.stringify(badAmount))

  // 4. chữ ký cũ (10 phút trước) → not_supported (ngoài cửa sổ ±5 phút)
  const stale = await String(Math.floor((Date.now() - 10 * 60 * 1000) / 1000))
  const staleRes = await call(buildPayload({ id: 999004 }), { timestamp: stale })
  check("timestamp cũ 10 phút → not_supported", staleRes.action === "not_supported", JSON.stringify(staleRes))

  // 5. dedup của custom module
  const rec1 = await sepay.recordWebhookEvent({
    sepay_transaction_id: "selftest-999001",
    gateway: "Vietcombank",
    sub_account: vaNumber,
    code,
    transfer_type: "in",
    transfer_amount: amount,
    status: "processed",
    payload: { id: 999001 },
  })
  const rec2 = await sepay.recordWebhookEvent({
    sepay_transaction_id: "selftest-999001",
    payload: { id: 999001 },
  })
  check(
    "dedup: lần 1 insert, lần 2 duplicate",
    rec1.duplicate === false && rec2.duplicate === true,
    JSON.stringify({ first: rec1.duplicate, second: rec2.duplicate }),
  )

  // dọn dữ liệu self-test
  try {
    const selftestId = rec1.event && typeof rec1.event === "object" ? rec1.event.id : null
    if (selftestId) await sepay.deleteSePayWebhookEvents(selftestId)
  } catch (e) {
    logger.warn(`Không dọn được row self-test: ${e.message}`)
  }

  const failed = results.filter((r) => !r.ok)
  if (failed.length) {
    throw new Error(`${failed.length}/${results.length} checks FAIL: ${failed.map((f) => f.name).join("; ")}`)
  }
  logger.info(`Tất cả ${results.length} checks PASS`)
}
