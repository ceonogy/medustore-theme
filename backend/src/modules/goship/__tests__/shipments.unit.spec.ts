import { DEFAULT_PARCEL } from "../rates"
import {
  buildShipmentContact,
  buildShipmentParcel,
  collectGoodsTypes,
  composeParcelMetadata,
  fullName,
  normalizeTrackingNumber,
  resolveOriginContact,
  streetLine,
} from "../shipments"

describe("goship shipments: name + street", () => {
  it("ghép họ tên, bỏ phần rỗng", () => {
    expect(fullName("An", "Nguyễn")).toBe("An Nguyễn")
    expect(fullName("An", "")).toBe("An")
    expect(fullName(null, "Nguyễn")).toBe("Nguyễn")
    expect(fullName(undefined, undefined)).toBe("")
  })

  it("ghép address_1 + address_2 thành street", () => {
    expect(streetLine({ address_1: "1 Lê Lợi", address_2: "Tầng 2" })).toBe(
      "1 Lê Lợi, Tầng 2",
    )
    expect(streetLine({ address_1: "1 Lê Lợi" })).toBe("1 Lê Lợi")
    expect(streetLine(null)).toBe("")
  })
})

describe("goship shipments: contact", () => {
  it("gắn mã địa giới + tên dự phòng", () => {
    const contact = buildShipmentContact(
      { name: "An", phone: "0900000000", street: "1 Lê Lợi" },
      { city: "700000", district: "701900", ward: "9276" },
    )
    expect(contact).toMatchObject({
      name: "An",
      phone: "0900000000",
      street: "1 Lê Lợi",
      city: "700000",
      district: "701900",
      ward: "9276",
    })
    expect(contact.email).toBeUndefined()
  })

  it("thiếu tên → dùng fallback; có email thì kèm", () => {
    const contact = buildShipmentContact(
      { email: "a@b.c" },
      { city: 1, district: 2, ward: 3 },
      "Kho gửi",
    )
    expect(contact.name).toBe("Kho gửi")
    expect(contact.email).toBe("a@b.c")
    expect(contact.ward).toBe(3)
  })
})

describe("goship shipments: origin contact", () => {
  it("ưu tiên data.address_from, rơi về ENV", () => {
    expect(
      resolveOriginContact(
        { address_from: { name: "Kho A", phone: "090", street: "1 Tân Tạo" } },
        { name: "Kho HCM", phone: "000", street: "x" },
      ),
    ).toEqual({ name: "Kho A", phone: "090", street: "1 Tân Tạo" })

    expect(resolveOriginContact(undefined, { name: "Kho HCM", phone: "000", street: "x" })).toEqual({
      name: "Kho HCM",
      phone: "000",
      street: "x",
    })
  })

  it("đọc khoá `address` như bí danh của `street`", () => {
    expect(
      resolveOriginContact(
        { address_from: { address: "12 Nguyễn Huệ" } },
        { name: "Kho", phone: "1", street: "z" },
      ).street,
    ).toBe("12 Nguyễn Huệ")
  })
})

describe("goship shipments: parcel", () => {
  it("thêm cod/amount vào kiện cơ bản", () => {
    const parcel = buildShipmentParcel(
      [{ quantity: 1, variant: { weight: 500, length: 20, width: 15, height: 10 } }],
      DEFAULT_PARCEL,
      { cod: 120000, amount: 0, metadata: "đơn 42" },
    )
    expect(parcel).toMatchObject({
      cod: 120000,
      amount: 0,
      weight: 500,
      length: 20,
      width: 15,
      height: 10,
      metadata: "đơn 42",
    })
  })

  it("cod/amount âm hoặc không hợp lệ → 0; metadata rỗng bị bỏ", () => {
    const parcel = buildShipmentParcel(undefined, DEFAULT_PARCEL, {
      cod: -5,
      amount: Number.NaN,
    })
    expect(parcel.cod).toBe(0)
    expect(parcel.amount).toBe(0)
    expect("metadata" in parcel).toBe(false)
  })

  it("quy đổi kg/m sang g/cm trước khi gửi kiện", () => {
    const parcel = buildShipmentParcel(
      [{ quantity: 1, variant: { weight: 2, length: 0.5, width: 0.3, height: 0.2 } }],
      { weightGrams: 1, length: 0.4, width: 0.4, height: 0.1, weightUnit: "kg", dimensionUnit: "m" },
    )
    expect(parcel.weight).toBe(2000)
    expect(parcel.length).toBe(50)
    expect(parcel.width).toBe(30)
    expect(parcel.height).toBe(20)
  })
})

describe("goship shipments: tracking number", () => {
  it("chuẩn hoá 'NULL' / rỗng thành null", () => {
    expect(normalizeTrackingNumber("NULL")).toBeNull()
    expect(normalizeTrackingNumber("null")).toBeNull()
    expect(normalizeTrackingNumber("")).toBeNull()
    expect(normalizeTrackingNumber(null)).toBeNull()
    expect(normalizeTrackingNumber("GHN123")).toBe("GHN123")
  })
})

describe("goship shipments: goods types", () => {
  it("gom loại hàng từ item (mỗi item có thể nhiều loại), khử trùng, tối đa 2", () => {
    const types = collectGoodsTypes(
      [
        { goodsTypes: ["Quần áo", "Giày dép"] },
        { goodsTypes: ["Quần áo"] },
        { goodsTypes: ["Trang sức"] },
      ],
      ["Balo túi"],
    )
    expect(types).toEqual(["Quần áo", "Giày dép"])
  })

  it("rỗng → dùng fallback (mặc định toàn cục)", () => {
    expect(collectGoodsTypes([{ goodsTypes: [] }, {}], ["Đồ điện tử"])).toEqual([
      "Đồ điện tử",
    ])
    expect(collectGoodsTypes(undefined, [])).toEqual([])
  })

  it("BỎ giá trị không có trong danh mục (sai chính tả / tự do)", () => {
    const types = collectGoodsTypes(
      [
        { goodsTypes: ["Quần áoo", "Quần áo"] },
        { goodsTypes: ["Áo thun", "Giày dép"] },
      ],
      ["Không tồn tại"],
    )
    expect(types).toEqual(["Quần áo", "Giày dép"])
  })

  it("fallback lạ cũng bị bỏ → []", () => {
    expect(collectGoodsTypes([], ["Áo thun"])).toEqual([])
  })
})

describe("goship shipments: parcel metadata", () => {
  it("ghép loại hàng + giao 1 phần + ghi chú giao hàng + ghi chú chung", () => {
    expect(
      composeParcelMetadata({
        goodsTypes: ["Quần áo", "Giày dép"],
        partDelivery: true,
        deliveryNote: "Cho xem hàng, không cho thử",
        note: "Gọi trước khi giao",
      }),
    ).toBe(
      "Loại hàng: Quần áo, Giày dép · Giao 1 phần · Cho xem hàng, không cho thử · Gọi trước khi giao",
    )
  })

  it("chỉ có loại hàng; phần còn lại rỗng", () => {
    expect(composeParcelMetadata({ goodsTypes: ["Tài liệu"] })).toBe(
      "Loại hàng: Tài liệu",
    )
  })

  it("tất cả rỗng → undefined (bỏ hẳn field)", () => {
    expect(composeParcelMetadata({})).toBeUndefined()
    expect(
      composeParcelMetadata({ goodsTypes: [], deliveryNote: "", note: "  " }),
    ).toBeUndefined()
  })
})
