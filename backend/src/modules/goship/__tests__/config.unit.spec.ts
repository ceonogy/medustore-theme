import {
  DEFAULT_PARCEL_SETTINGS,
  GOSHIP_PARCEL_KEYS,
  goshipDeliveryNoteLabel,
  goshipParcelBaseFromEnv,
  parseDimensionUnit,
  parseGoshipParcelSettings,
  parsePayer,
  parseWeightUnit,
  sanitizeGoodsTypes,
} from "../config"

describe("goship config: loại hàng", () => {
  it("chỉ nhận tên trong danh mục, khử trùng, tối đa 2", () => {
    expect(sanitizeGoodsTypes(["Quần áo", "Giày dép", "Trang sức"])).toEqual([
      "Quần áo",
      "Giày dép",
    ])
    expect(sanitizeGoodsTypes("Quần áo, Không tồn tại, Quần áo")).toEqual([
      "Quần áo",
    ])
    expect(sanitizeGoodsTypes(undefined)).toEqual([])
  })
})

describe("goship config: ghi chú giao hàng", () => {
  it("map id → nhãn tiếng Việt", () => {
    expect(goshipDeliveryNoteLabel("no_view")).toBe("Không cho xem hàng")
    expect(goshipDeliveryNoteLabel("allow_trial")).toBe("Cho thử hàng")
    expect(goshipDeliveryNoteLabel("không-có")).toBeNull()
  })
})

describe("goship config: payer", () => {
  it("0/1 hợp lệ, còn lại dùng fallback", () => {
    expect(parsePayer("0", 1)).toBe(0)
    expect(parsePayer(1, 0)).toBe(1)
    expect(parsePayer("x", 1)).toBe(1)
  })
})

describe("goship config: đơn vị đo", () => {
  it("chuẩn hoá weight/dimension unit, giá trị lạ → fallback", () => {
    expect(parseWeightUnit("kg")).toBe("kg")
    expect(parseWeightUnit("KG")).toBe("kg")
    expect(parseWeightUnit("g")).toBe("g")
    expect(parseWeightUnit("tấn", "kg")).toBe("kg")
    expect(parseDimensionUnit("m")).toBe("m")
    expect(parseDimensionUnit("cm")).toBe("cm")
    expect(parseDimensionUnit("inch", "m")).toBe("m")
  })
})

describe("goship config: base từ ENV", () => {
  it("đọc payer/cân nặng/cod, giữ mặc định khi thiếu", () => {
    const base = goshipParcelBaseFromEnv({
      GOSHIP_PAYER: "0",
      GOSHIP_DEFAULT_WEIGHT_GRAMS: "750",
      GOSHIP_COD_DEFAULT: "50000",
    } as NodeJS.ProcessEnv)
    expect(base.payer).toBe(0)
    expect(base.weightGrams).toBe(750)
    expect(base.cod).toBe(50000)
    expect(base.length).toBe(DEFAULT_PARCEL_SETTINGS.length)

    const empty = goshipParcelBaseFromEnv({} as NodeJS.ProcessEnv)
    expect(empty.payer).toBe(1)
    expect(empty.weightGrams).toBe(DEFAULT_PARCEL_SETTINGS.weightGrams)
    expect(empty.cod).toBe(0)
    expect(empty.weightUnit).toBe("g")
    expect(empty.dimensionUnit).toBe("cm")

    const units = goshipParcelBaseFromEnv({
      GOSHIP_WEIGHT_UNIT: "kg",
      GOSHIP_DIMENSION_UNIT: "m",
    } as NodeJS.ProcessEnv)
    expect(units.weightUnit).toBe("kg")
    expect(units.dimensionUnit).toBe("m")
  })
})

describe("goship config: parseGoshipParcelSettings", () => {
  it("DB ghi đè từng khoá, giữ nền cho khoá trống", () => {
    const parsed = parseGoshipParcelSettings(
      {
        [GOSHIP_PARCEL_KEYS.payer]: "0",
        [GOSHIP_PARCEL_KEYS.deliveryNote]: "view_only",
        [GOSHIP_PARCEL_KEYS.goodsTypes]: "Quần áo,Giày dép,Trang sức",
        [GOSHIP_PARCEL_KEYS.declareValue]: "order_total",
        [GOSHIP_PARCEL_KEYS.weight]: "1200",
        [GOSHIP_PARCEL_KEYS.cod]: "30000",
        [GOSHIP_PARCEL_KEYS.partDelivery]: "true",
      },
      { ...DEFAULT_PARCEL_SETTINGS, width: 99 },
    )
    expect(parsed).toEqual({
      payer: 0,
      deliveryNote: "view_only",
      goodsTypes: ["Quần áo", "Giày dép"],
      declareValue: "order_total",
      weightGrams: 1200,
      length: DEFAULT_PARCEL_SETTINGS.length,
      width: 99,
      height: DEFAULT_PARCEL_SETTINGS.height,
      cod: 30000,
      partDelivery: true,
      weightUnit: "g",
      dimensionUnit: "cm",
    })
  })

  it("đọc/ghi đơn vị đo (kg/m) từ DB", () => {
    const parsed = parseGoshipParcelSettings({
      [GOSHIP_PARCEL_KEYS.weightUnit]: "kg",
      [GOSHIP_PARCEL_KEYS.dimensionUnit]: "m",
    })
    expect(parsed.weightUnit).toBe("kg")
    expect(parsed.dimensionUnit).toBe("m")

    const bad = parseGoshipParcelSettings({
      [GOSHIP_PARCEL_KEYS.weightUnit]: "tấn",
      [GOSHIP_PARCEL_KEYS.dimensionUnit]: "inch",
    })
    expect(bad.weightUnit).toBe("g")
    expect(bad.dimensionUnit).toBe("cm")
  })

  it("giá trị sai kiểu → rơi về nền", () => {
    const parsed = parseGoshipParcelSettings({
      [GOSHIP_PARCEL_KEYS.payer]: "9",
      [GOSHIP_PARCEL_KEYS.deliveryNote]: "không-tồn-tại",
      [GOSHIP_PARCEL_KEYS.declareValue]: "bậy",
      [GOSHIP_PARCEL_KEYS.weight]: "-5",
    })
    expect(parsed.payer).toBe(DEFAULT_PARCEL_SETTINGS.payer)
    expect(parsed.deliveryNote).toBe("")
    expect(parsed.declareValue).toBe("off")
    expect(parsed.weightGrams).toBe(DEFAULT_PARCEL_SETTINGS.weightGrams)
  })
})
