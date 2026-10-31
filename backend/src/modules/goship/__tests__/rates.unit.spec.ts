import { GOSHIP_TIERS } from "../config"
import {
  buildParcel,
  buildRateRequest,
  DEFAULT_PARCEL,
  expectedDays,
  readGeoCodes,
  resolveOriginAddress,
  selectRate,
  selectRateForService,
} from "../rates"
import type { GoshipRate } from "../client"

const rate = (over: Partial<GoshipRate>): GoshipRate => ({
  id: "r1",
  carrier_name: "Carrier",
  carrier_short_name: "c",
  service: "Tiêu chuẩn",
  expected: "Dự kiến giao 3 ngày",
  total_fee: 30000,
  ...over,
})

describe("goship readGeoCodes", () => {
  it("trả mã khi đủ 3 cấp", () => {
    expect(
      readGeoCodes({
        goship_city_code: "100000",
        goship_district_code: "100100",
        goship_ward_code: "63",
      }),
    ).toEqual({ city: "100000", district: "100100", ward: "63" })
  })

  it("trả null khi thiếu bất kỳ cấp nào", () => {
    expect(readGeoCodes({ goship_city_code: "100000" })).toBeNull()
    expect(readGeoCodes({})).toBeNull()
    expect(readGeoCodes(null)).toBeNull()
    expect(readGeoCodes("x")).toBeNull()
  })
})

describe("goship resolveOriginAddress", () => {
  it("ưu tiên data.address_from của option", () => {
    expect(
      resolveOriginAddress(
        { address_from: { city: 700000, district: 701900, ward: 9276 } },
        { goship_city_code: "1", goship_district_code: "2", goship_ward_code: "3" },
      ),
    ).toEqual({ city: "700000", district: "701900", ward: "9276" })
  })

  it("dự phòng metadata kho khi option thiếu address_from", () => {
    expect(
      resolveOriginAddress(undefined, {
        goship_city_code: "700000",
        goship_district_code: "701900",
        goship_ward_code: "9276",
      }),
    ).toEqual({ city: "700000", district: "701900", ward: "9276" })
  })
})

describe("goship buildParcel", () => {
  it("cộng cân nặng theo số lượng, lấy max kích thước", () => {
    const parcel = buildParcel(
      [
        { quantity: 2, variant: { weight: 300, length: 10, width: 5, height: 2 } },
        { quantity: 1, variant: { weight: 500, length: 20, width: 8, height: 3 } },
      ],
      DEFAULT_PARCEL,
    )
    expect(parcel.weight).toBe(1100)
    expect(parcel.length).toBe(20)
    expect(parcel.width).toBe(8)
    expect(parcel.height).toBe(7)
  })

  it("dùng mặc định khi item thiếu dữ liệu", () => {
    const parcel = buildParcel([{ quantity: 1 }], DEFAULT_PARCEL)
    expect(parcel.weight).toBe(500)
    expect(parcel.length).toBe(20)
    expect(parcel.width).toBe(15)
    expect(parcel.height).toBe(10)
  })

  it("quy đổi kg→g và m→cm (cả variant lẫn mặc định)", () => {
    const parcel = buildParcel(
      [
        { quantity: 2, variant: { weight: 1.5, length: 0.4, width: 0.2, height: 0.1 } },
        { quantity: 1, variant: { weight: null, length: null, width: null, height: null } },
      ],
      { weightGrams: 0.5, length: 0.3, width: 0.2, height: 0.05, weightUnit: "kg", dimensionUnit: "m" },
    )
    // 1.5kg*2 + 0.5kg (fallback) = 3.5kg → 3500g
    expect(parcel.weight).toBe(3500)
    // dims: max(0.4, 0.3) = 0.4m → 40cm (không nhân theo số lượng)
    expect(parcel.length).toBe(40)
    expect(parcel.width).toBe(20)
    // height cộng dồn: 0.1*2 + 0.05 = 0.25m → 25cm
    expect(parcel.height).toBe(25)
  })
})

describe("goship buildRateRequest", () => {
  it("gói đúng shape /rates", () => {
    const req = buildRateRequest(
      { city: "700000", district: "701900", ward: "9276" },
      { city: "100000", district: "100100", ward: "63" },
      { weight: 500, length: 20, width: 15, height: 10 },
    )
    expect(req.shipment.address_from.city).toBe("700000")
    expect(req.shipment.address_to.ward).toBe("63")
    expect(req.shipment.parcel.weight).toBe(500)
  })
})

describe("goship expectedDays", () => {
  it("parse số ngày", () => {
    expect(expectedDays("Dự kiến giao 3 ngày")).toBe(3)
    expect(expectedDays("Dự kiến giao 2-4 ngày")).toBe(4)
    expect(expectedDays("không rõ")).toBeNull()
    expect(expectedDays(undefined)).toBeNull()
  })
})

describe("goship selectRate", () => {
  const economy = GOSHIP_TIERS.find((t) => t.id === "economy")!
  const express = GOSHIP_TIERS.find((t) => t.id === "express")!

  it("economy = cước thấp nhất", () => {
    const rates = [rate({ id: "a", total_fee: 40000 }), rate({ id: "b", total_fee: 25000 })]
    expect(selectRate(rates, economy)?.id).toBe("b")
  })

  it("express = thời gian ngắn nhất, đồng hạng thì rẻ hơn", () => {
    const rates = [
      rate({ id: "slow", total_fee: 20000, expected: "Dự kiến giao 5 ngày" }),
      rate({ id: "fast-expensive", total_fee: 50000, expected: "Dự kiến giao 1 ngày" }),
      rate({ id: "fast-cheap", total_fee: 45000, expected: "Dự kiến giao 1 ngày" }),
    ]
    expect(selectRate(rates, express)?.id).toBe("fast-cheap")
  })

  it("bỏ qua rate không có total_fee hợp lệ", () => {
    const rates = [rate({ id: "bad", total_fee: Number.NaN }), rate({ id: "good", total_fee: 1000 })]
    expect(selectRateForService(rates, "economy")?.id).toBe("good")
  })

  it("trả null khi rỗng", () => {
    expect(selectRate([], economy)).toBeNull()
    expect(selectRate(undefined, economy)).toBeNull()
  })
})
