import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { XMarkMini } from "@medusajs/icons"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import {
  Badge,
  Button,
  Container,
  DropdownMenu,
  Heading,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

/**
 * Widget chọn **"Loại hàng"** (GoShip) ở trang chi tiết sản phẩm.
 *
 * Multi-select theo đúng giới hạn của GoShip (tối đa `goods_type_max`, mặc định
 * 2). Ghi vào `product.metadata.goship_goods_type` dạng **mảng chuỗi** — đúng
 * khoá + kiểu mà fulfillment provider đọc khi tạo vận đơn (ưu tiên:
 * variant.metadata → product.metadata → "Loại hàng mặc định" ở Admin → GoShip).
 * Danh mục + giới hạn lấy từ `GET /admin/goship/config`.
 */

/** Khoá metadata (khớp `GOSHIP_GOODS_TYPE_META_KEY` ở backend). */
const META_KEY = "goship_goods_type"

/** Dự phòng khi không gọi được `/admin/goship/config`. */
const FALLBACK_GOODS_TYPES = [
  "Quần áo",
  "Giày dép",
  "Balo túi",
  "Tài liệu",
  "Đồ điện tử",
  "Thực phẩm",
  "Mỹ phẩm",
  "Dược phẩm",
  "Đồ chơi",
  "Đồ dễ vỡ",
  "Trang sức",
]

const adminFetch = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, { credentials: "include", ...init })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

/** Đọc loại hàng hiện tại của sản phẩm — nhận cả chuỗi (dữ liệu cũ) lẫn mảng.
 *  Chỉ giữ giá trị có trong danh mục để UI luôn khớp; giá trị lạ sẽ bị dọn khi lưu. */
const readGoodsTypes = (metadata: AdminProduct["metadata"]): string[] => {
  const value = (metadata ?? {})[META_KEY]
  const raw = typeof value === "string" ? [value] : Array.isArray(value) ? value : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    const name = typeof item === "string" ? item.trim() : ""
    if (name && FALLBACK_GOODS_TYPES.includes(name) && !seen.has(name)) {
      seen.add(name)
      out.push(name)
    }
  }
  return out
}

const GoshipGoodsTypeWidget = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const [goodsTypes, setGoodsTypes] = useState<string[]>(FALLBACK_GOODS_TYPES)
  const [max, setMax] = useState(2)
  const [selected, setSelected] = useState(() => readGoodsTypes(data.metadata))
  const [saving, setSaving] = useState(false)

  // Danh mục + giới hạn từ backend (một nguồn duy nhất).
  useEffect(() => {
    let active = true
    adminFetch<{
      parcel_options?: { goods_types?: string[]; goods_type_max?: number }
    }>("/admin/goship/config")
      .then((cfg) => {
        if (!active) return
        const list = cfg.parcel_options?.goods_types
        if (Array.isArray(list) && list.length) setGoodsTypes(list)
        const limit = Number(cfg.parcel_options?.goods_type_max)
        if (Number.isFinite(limit) && limit > 0) setMax(limit)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // Sản phẩm refetch (React Query) → đồng bộ lại giá trị hiển thị.
  useEffect(() => {
    setSelected(readGoodsTypes(data.metadata))
  }, [data.metadata])

  const save = async (next: string[]) => {
    setSaving(true)
    try {
      const metadata: Record<string, unknown> = { ...(data.metadata ?? {}) }
      if (next.length) metadata[META_KEY] = next
      else delete metadata[META_KEY]

      await adminFetch(`/admin/products/${data.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: Object.keys(metadata).length ? metadata : null,
        }),
      })
      setSelected(next)
      toast.success(
        next.length
          ? `Đã lưu loại hàng: ${next.join(", ")}.`
          : "Đã bỏ chọn loại hàng.",
      )
    } catch {
      toast.error("Không lưu được loại hàng. Vui lòng thử lại.")
    } finally {
      setSaving(false)
    }
  }

  const toggle = (name: string) => {
    if (saving) return
    if (selected.includes(name)) {
      save(selected.filter((x) => x !== name))
      return
    }
    if (selected.length >= max) return
    save([...selected, name])
  }

  return (
    <Container className="flex flex-col gap-y-4 p-6">
      <div>
        <Heading level="h2">Loại hàng (GoShip)</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Cho GoShip biết sản phẩm này thuộc loại gì để tính phí và vận chuyển cho
          đúng. Chọn tối đa {max} loại.
        </Text>
        <Text size="small" className="text-ui-fg-muted mt-1">
          Nếu từng phiên bản (size/màu) đã khai loại hàng riêng thì dùng loại đó;
          để trống ở đây thì đơn sẽ dùng &quot;Loại hàng mặc định&quot; trong trang
          GoShip.
        </Text>
      </div>

      <div className="flex flex-col gap-y-2">
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <Button size="small" variant="secondary" disabled={saving}>
              {selected.length
                ? `Đã chọn ${selected.length}/${max} — sửa`
                : "Chọn loại hàng"}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start">
            <DropdownMenu.Label>
              Loại hàng (chọn tối đa {max})
            </DropdownMenu.Label>
            {selected.length ? (
              <DropdownMenu.Item
                // Bỏ chọn nhanh — cũng dọn được giá trị metadata cũ nhập tay.
                onSelect={(e) => {
                  e.preventDefault()
                  if (!saving) save([])
                }}
              >
                Xoá tất cả
              </DropdownMenu.Item>
            ) : null}
            {goodsTypes.map((name) => {
              const checked = selected.includes(name)
              const disabled = saving || (!checked && selected.length >= max)
              return (
                <DropdownMenu.CheckboxItem
                  key={name}
                  checked={checked}
                  disabled={disabled}
                  // Giữ menu mở để chọn tiếp loại thứ hai.
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => toggle(name)}
                >
                  {name}
                </DropdownMenu.CheckboxItem>
              )
            })}
          </DropdownMenu.Content>
        </DropdownMenu>

        {selected.length ? (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((name) => (
              <Badge
                key={name}
                size="2xsmall"
                color="blue"
                className="gap-x-0.5 pl-2 pr-1"
                asChild
              >
                <div className="flex min-w-0 items-center">
                  <span className="truncate">{name}</span>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => save(selected.filter((x) => x !== name))}
                    aria-label={`Bỏ ${name}`}
                    title={`Bỏ ${name}`}
                    className="text-ui-fg-subtle transition-fg hover:text-ui-fg-base focus-visible:text-ui-fg-base shrink-0 cursor-pointer outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <XMarkMini />
                  </button>
                </div>
              </Badge>
            ))}
          </div>
        ) : (
          <Text size="small" className="text-ui-fg-muted">
            Chưa chọn loại hàng — đơn sẽ dùng &quot;Loại hàng mặc định&quot;.
          </Text>
        )}
      </div>

      <Text size="small" className="text-ui-fg-muted">
        Thay đổi được lưu tự động.
      </Text>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default GoshipGoodsTypeWidget
