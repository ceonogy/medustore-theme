import { sdk } from "@lib/sdk";

/**
 * Danh mục địa giới GoShip (tỉnh/quận/phường) cho form checkout.
 *
 * GoShip bắt buộc **mã số** khi tính phí / tạo vận đơn, nên form phải chọn
 * theo code và lưu kèm name. Dữ liệu lấy từ backend đã cache
 * (`/store/goship/locations*`), không gọi thẳng GoShip từ browser.
 *
 * Lưu ý: đây là danh mục **pre-2025 (63 tỉnh, 3 cấp)** của GoShip — khác với
 * `vietnam-address-data` 2 cấp (34 tỉnh) mà repo từng dùng. Chọn 3 cấp là để
 * khớp mã GoShip.
 */
export interface GoshipLocation {
  code: string;
  name: string;
  parent_code: string | null;
  support_carriers?: string[] | null;
}

const fetchLocations = async <K extends string>(
  path: string,
  key: K,
): Promise<GoshipLocation[]> => {
  const res = await sdk.client.fetch<Record<K, GoshipLocation[]>>(path);
  return res[key] ?? [];
};

/** 63 tỉnh/thành (dropdown cấp 1). */
export function fetchGoshipProvinces(): Promise<GoshipLocation[]> {
  return fetchLocations("/store/goship/locations", "provinces");
}

/** Quận/huyện của một tỉnh/thành (dropdown cấp 2). */
export function fetchGoshipDistricts(
  cityCode: string,
): Promise<GoshipLocation[]> {
  return fetchLocations(
    `/store/goship/locations/districts?city_code=${encodeURIComponent(cityCode)}`,
    "districts",
  );
}

/** Phường/xã của một quận/huyện (dropdown cấp 3). */
export function fetchGoshipWards(
  districtCode: string,
): Promise<GoshipLocation[]> {
  return fetchLocations(
    `/store/goship/locations/wards?district_code=${encodeURIComponent(districtCode)}`,
    "wards",
  );
}

/** Đơn vị đo shop đã khai ở Admin → GoShip (Medusa không có cấu hình đơn vị). */
export interface GoshipUnits {
  weightUnit: "g" | "kg";
  dimensionUnit: "cm" | "m";
}

/**
 * Đọc đơn vị cân nặng/kích thước shop chọn để hiển thị đúng nhãn ở trang sản
 * phẩm. Giá trị Medusa lưu đã ở đúng đơn vị này nên chỉ cần đổi nhãn. Lỗi mạng
 * → mặc định quy ước cũ (gram/cm) để trang không vỡ.
 */
export async function fetchGoshipUnits(): Promise<GoshipUnits> {
  try {
    const res = await sdk.client.fetch<{
      weight_unit?: string;
      dimension_unit?: string;
    }>("/store/goship/config");
    return {
      weightUnit: res.weight_unit === "kg" ? "kg" : "g",
      dimensionUnit: res.dimension_unit === "m" ? "m" : "cm",
    };
  } catch {
    return { weightUnit: "g", dimensionUnit: "cm" };
  }
}
