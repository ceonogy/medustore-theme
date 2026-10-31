import crypto from "crypto"
import {
  computeGoshipSignature,
  GOSHIP_STATUS_MAP,
  mapGoshipStatus,
  toFlag,
  verifyGoshipRequest,
} from "../webhook"

const SECRET = "test-client-secret"

const sign = (body: string, secret = SECRET) =>
  crypto.createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("base64")

describe("goship webhook HMAC", () => {
  it("tính chữ ký base64(HMAC-SHA256(rawBody))", () => {
    const body = '{"gcode":"GS1","status":905}'
    expect(computeGoshipSignature(body, SECRET)).toBe(sign(body))
  })

  it("chấp nhận chữ ký đúng (Buffer và string body tương đương)", () => {
    const body = '{"gcode":"GS1","status":905}'
    const header = sign(body)
    expect(verifyGoshipRequest(body, header, SECRET)).toBe(true)
    expect(verifyGoshipRequest(Buffer.from(body), header, SECRET)).toBe(true)
  })

  it("từ chối chữ ký sai / thiếu secret / thiếu header", () => {
    const body = '{"gcode":"GS1","status":905}'
    expect(verifyGoshipRequest(body, "deadbeef", SECRET)).toBe(false)
    expect(verifyGoshipRequest(body, sign(body, "other-secret"), SECRET)).toBe(false)
    expect(verifyGoshipRequest(body, sign(body), undefined)).toBe(false)
    expect(verifyGoshipRequest(body, undefined, SECRET)).toBe(false)
  })

  it("từ chối khi body bị sửa sau khi ký", () => {
    const header = sign('{"status":900}')
    expect(verifyGoshipRequest('{"status":905}', header, SECRET)).toBe(false)
  })
})

describe("goship webhook toFlag", () => {
  it("nhận 0/1, chuỗi, boolean, null", () => {
    expect(toFlag(1)).toBe(true)
    expect(toFlag("1")).toBe(true)
    expect(toFlag(true)).toBe(true)
    expect(toFlag(0)).toBe(false)
    expect(toFlag("0")).toBe(false)
    expect(toFlag(null)).toBe(false)
    expect(toFlag(undefined)).toBe(false)
  })
})

describe("goship status mapping", () => {
  it("ánh xạ giao thành công (905) → delivered", () => {
    const m = mapGoshipStatus(905)
    expect(m.phase).toBe("delivered")
    expect(m.delivered).toBe(true)
    expect(m.shipped).toBe(false)
  })

  it("ánh xạ đã lấy hàng (903) → shipped", () => {
    const m = mapGoshipStatus("903")
    expect(m.phase).toBe("shipped")
    expect(m.shipped).toBe(true)
  })

  it("ánh xạ hủy (914) → canceled", () => {
    expect(mapGoshipStatus(914).canceled).toBe(true)
    expect(mapGoshipStatus(914).phase).toBe("canceled")
  })

  it("mã lạ → unknown, không đặt mốc nào", () => {
    const m = mapGoshipStatus(9999)
    expect(m.phase).toBe("unknown")
    expect(m.shipped || m.delivered || m.canceled).toBe(false)
  })

  it("mọi mã 900..1000 trong bảng đều có phase hợp lệ", () => {
    for (const [key, value] of Object.entries(GOSHIP_STATUS_MAP)) {
      expect(String(value.status)).toBe(key)
      expect([
        "created",
        "shipped",
        "delivered",
        "returning",
        "canceled",
        "failed",
        "unknown",
      ]).toContain(value.phase)
    }
  })
})
