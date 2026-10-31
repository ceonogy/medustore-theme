import { defineRouteConfig } from "@medusajs/admin-sdk"
import { TruckFast } from "@medusajs/icons"
import {
  Badge,
  Button,
  Checkbox,
  Container,
  Copy,
  Heading,
  Input,
  Select,
  Switch,
  Table,
  Text,
  Toaster,
  toast,
} from "@medusajs/ui"
import { useEffect, useState, type ReactNode } from "react"

/**
 * Trang cấu hình GoShip trong Admin (`/app/goship`).
 *
 * Điểm chính: **bật/tắt GoShip sau khi deploy** không cần sửa `.env` / restart.
 * Cờ lưu trong DB (`goship_setting`) qua API `POST /admin/goship/config`; hook
 * checkout đọc lại mỗi request nên có hiệu lực ngay.
 *
 * Trang còn hiện trạng thái provider, URL webhook (để dán vào dashboard GoShip
 * hoặc đăng ký tự động), và 2 tier giao hàng.
 */

interface GoshipConfig {
  toggle: {
    enabled: boolean
    source: "db" | "env" | "default" | string
    source_label: string
  }
  provider: {
    id: string
    registered: boolean
    configured: boolean
    base_url: string | null
    environment: "test" | "live" | null
    options_count: number
  }
  webhook: {
    url: string
    auth_method: string
    has_secret: boolean
    header: string
    /** URL của shop đã tồn tại trên GoShip chưa (đọc từ GoShip). */
    registered: boolean
    /** Mọi endpoint đang đăng ký trên GoShip. */
    endpoints: string[]
  }
  tiers: { id: string; name: string; description: string }[]
  origin: {
    city: string | null
    district: string | null
    ward: string | null
    name: string | null
    phone: string | null
    address: string | null
    payer: number
  }
  /** Cấu hình "Thông tin hàng gửi" hiện hành. */
  parcel: ParcelSettings | null
  /** Danh mục cho form. */
  parcel_options: ParcelOptions
}

/** Cấu hình "Thông tin hàng gửi" (khớp `GoshipParcelSettings` ở backend). */
interface ParcelSettings {
  payer: 0 | 1
  deliveryNote: string
  goodsTypes: string[]
  declareValue: "off" | "order_total"
  weightGrams: number
  length: number
  width: number
  height: number
  cod: number
  partDelivery: boolean
  weightUnit: "g" | "kg"
  dimensionUnit: "cm" | "m"
}

interface ParcelOptions {
  goods_types: string[]
  goods_type_max: number
  goods_type_meta_key: string
  delivery_notes: { id: string; label: string }[]
  declare_values: { id: string; label: string }[]
  payers: { id: number; label: string }[]
  weight_units: { id: string; label: string }[]
  dimension_units: { id: string; label: string }[]
}

const adminFetch = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, { credentials: "include", ...init })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-y-1">
    <Text size="small" leading="compact" weight="plus">
      {label}
    </Text>
    <div className="text-ui-fg-subtle txt-small">{children}</div>
  </div>
)

/** Ô nhập số (cân nặng/kích thước/COD) kèm đơn vị. */
const NumberField = ({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string
  value: number
  suffix?: string
  onChange: (value: number) => void
}) => (
  <Field label={label}>
    <div className="flex items-center gap-x-2">
      <Input
        type="number"
        min={0}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {suffix ? <span className="text-ui-fg-muted whitespace-nowrap">{suffix}</span> : null}
    </div>
  </Field>
)

const GoshipPage = () => {
  const [config, setConfig] = useState<GoshipConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [webhookBusy, setWebhookBusy] = useState(false)
  const [parcel, setParcel] = useState<ParcelSettings | null>(null)
  const [parcelBusy, setParcelBusy] = useState(false)

  const load = () =>
    adminFetch<GoshipConfig>("/admin/goship/config")
      .then((data) => {
        setConfig(data)
        setParcel(data.parcel)
      })
      .catch(() => setFailed(true))

  useEffect(() => {
    let active = true
    adminFetch<GoshipConfig>("/admin/goship/config")
      .then((data) => {
        if (active) {
          setConfig(data)
          setParcel(data.parcel)
        }
      })
      .catch(() => {
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const setEnabled = async (enabled: boolean) => {
    setSaving(true)
    try {
      await adminFetch("/admin/goship/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      toast.success(enabled ? "Đã BẬT GoShip." : "Đã TẮT GoShip.")
      await load()
    } catch {
      toast.error("Không lưu được. Kiểm tra log backend.")
    } finally {
      setSaving(false)
    }
  }

  const webhookAction = async (action: "register-webhook" | "unregister-webhook") => {
    setWebhookBusy(true)
    try {
      const res = await adminFetch<{ already?: boolean; removed?: number }>(
        "/admin/goship/config",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      )
      if (action === "register-webhook") {
        toast.success(
          res.already ? "Webhook đã tồn tại trên GoShip." : "Đã đăng ký webhook với GoShip.",
        )
      } else {
        toast.success(`Đã hủy ${res.removed ?? 0} webhook.`)
      }
      await load()
    } catch {
      toast.error("Thao tác webhook thất bại (kiểm tra token/MEDUSA_BACKEND_URL).")
    } finally {
      setWebhookBusy(false)
    }
  }

  const setParcelField = <K extends keyof ParcelSettings>(
    key: K,
    value: ParcelSettings[K],
  ) => setParcel((prev) => (prev ? { ...prev, [key]: value } : prev))

  /** Bật/tắt 1 loại hàng, không cho vượt quá giới hạn của GoShip (mặc định 2). */
  const toggleGoodsType = (name: string) => {
    setParcel((prev) => {
      if (!prev) return prev
      if (prev.goodsTypes.includes(name)) {
        return { ...prev, goodsTypes: prev.goodsTypes.filter((g) => g !== name) }
      }
      const max = config?.parcel_options.goods_type_max ?? 2
      if (prev.goodsTypes.length >= max) return prev
      return { ...prev, goodsTypes: [...prev.goodsTypes, name] }
    })
  }

  const saveParcel = async () => {
    if (!parcel) return
    setParcelBusy(true)
    try {
      const res = await adminFetch<{ parcel: ParcelSettings }>(
        "/admin/goship/config",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set-parcel", parcel }),
        },
      )
      setParcel(res.parcel)
      toast.success("Đã lưu 'Thông tin hàng gửi'.")
      await load()
    } catch {
      toast.error("Không lưu được 'Thông tin hàng gửi'. Kiểm tra log backend.")
    } finally {
      setParcelBusy(false)
    }
  }

  if (loading) {
    return (
      <Container className="p-6">
        <Text>Đang tải cấu hình GoShip...</Text>
      </Container>
    )
  }

  if (failed || !config) {
    return (
      <Container className="p-6">
        <Heading level="h1">GoShip</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          Không tải được cấu hình. Hãy tải lại trang.
        </Text>
      </Container>
    )
  }

  const { toggle, provider, webhook, tiers, origin, parcel_options } = config

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="flex flex-col gap-y-4 p-6">
        <div>
          <Heading level="h1">GoShip</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Đối tác vận chuyển tùy chọn. Khi <b>TẮT</b>, mọi phương thức giao hàng
            GoShip bị ẩn ở checkout — chỉ còn 2 mức giá cố định.
          </Text>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-ui-border-base p-4">
          <div className="flex flex-col gap-y-1">
            <Text weight="plus">Bật tính cước GoShip</Text>
            <Text size="small" className="text-ui-fg-subtle">
              Nguồn: {toggle.source_label}
            </Text>
          </div>
          <div className="flex items-center gap-x-3">
            <Badge color={toggle.enabled ? "green" : "grey"} size="small">
              {toggle.enabled ? "Đang bật" : "Đang tắt"}
            </Badge>
            <Switch
              checked={toggle.enabled}
              disabled={saving}
              onCheckedChange={(checked) => setEnabled(checked)}
            />
          </div>
        </div>

        {!provider.configured && (
          <Text size="small" className="text-ui-fg-error">
            Chưa có <code>GOSHIP_TOKEN</code> — provider không gọi được API GoShip.
          </Text>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Provider">
            <div className="flex flex-wrap gap-2">
              <Badge color={provider.registered ? "green" : "red"} size="small">
                {provider.registered ? "Đã đăng ký" : "Chưa đăng ký"}
              </Badge>
              <Badge color={provider.configured ? "green" : "red"} size="small">
                {provider.configured ? "Có token" : "Thiếu token"}
              </Badge>
              <Badge color={provider.options_count > 0 ? "green" : "orange"} size="small">
                {provider.options_count} shipping option
              </Badge>
            </div>
          </Field>

          <Field label="Môi trường">
            {provider.environment === "test" ? (
              <Badge color="orange" size="small">
                Test (sandbox)
              </Badge>
            ) : provider.environment === "live" ? (
              <Badge color="green" size="small">
                Live
              </Badge>
            ) : (
              <Badge color="grey" size="small">
                Không rõ
              </Badge>
            )}
          </Field>

          <Field label="Base URL">
            <span className="font-mono break-all">{provider.base_url ?? "—"}</span>
          </Field>

          <Field label="Điểm gửi (origin)">
            <span className="font-mono break-all">
              {[origin.name, origin.address].filter(Boolean).join(" — ") || "—"}
            </span>
            <div className="text-ui-fg-muted mt-1">
              city {origin.city ?? "—"} / district {origin.district ?? "—"} / ward{" "}
              {origin.ward ?? "—"} · payer {origin.payer}
            </div>
          </Field>
        </div>
      </Container>

      <Container className="flex flex-col gap-y-4 p-6">
        <div>
          <Heading level="h2">Thông tin hàng gửi</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Áp dụng cho mọi vận đơn GoShip tạo từ đơn hàng. "Loại hàng" và cân
            nặng của từng sản phẩm (khai ở variant/product) sẽ được ưu tiên hơn
            giá trị mặc định tại đây.
          </Text>
        </div>

        {!parcel ? (
          <Text size="small" className="text-ui-fg-error">
            Không đọc được cấu hình kiện hàng.
          </Text>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Người trả phí">
                <Select
                  value={String(parcel.payer)}
                  onValueChange={(v) =>
                    setParcelField("payer", Number(v) === 0 ? 0 : 1)
                  }
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {parcel_options.payers.map((p) => (
                      <Select.Item key={p.id} value={String(p.id)}>
                        {p.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </Field>

              <Field label="Ghi chú giao hàng">
                <Select
                  value={parcel.deliveryNote || "none"}
                  onValueChange={(v) =>
                    setParcelField("deliveryNote", v === "none" ? "" : v)
                  }
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="none">Không đặt</Select.Item>
                    {parcel_options.delivery_notes.map((n) => (
                      <Select.Item key={n.id} value={n.id}>
                        {n.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </Field>

              <Field label="Khai giá">
                <Select
                  value={parcel.declareValue}
                  onValueChange={(v) =>
                    setParcelField(
                      "declareValue",
                      v === "order_total" ? "order_total" : "off",
                    )
                  }
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {parcel_options.declare_values.map((d) => (
                      <Select.Item key={d.id} value={d.id}>
                        {d.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </Field>

              <NumberField
                label="Thu hộ mặc định"
                suffix="₫"
                value={parcel.cod}
                onChange={(v) => setParcelField("cod", v)}
              />
            </div>

            <Field
              label={`Loại hàng mặc định (tối đa ${parcel_options.goods_type_max})`}
            >
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {parcel_options.goods_types.map((name) => {
                  const checked = parcel.goodsTypes.includes(name)
                  const disabled =
                    !checked &&
                    parcel.goodsTypes.length >= parcel_options.goods_type_max
                  return (
                    <label key={name} className="flex items-center gap-x-2">
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={() => toggleGoodsType(name)}
                      />
                      <span>{name}</span>
                    </label>
                  )
                })}
              </div>
              <Text size="small" className="text-ui-fg-muted mt-1">
                Dùng khi sản phẩm không khai. Khai riêng ở metadata sản phẩm với
                khoá <code>{parcel_options.goods_type_meta_key}</code> (variant →
                product).
              </Text>
            </Field>

            <Field label="Đơn vị đo">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-y-1">
                  <Text size="small" leading="compact" weight="plus">
                    Đơn vị cân nặng
                  </Text>
                  <Select
                    value={parcel.weightUnit}
                    onValueChange={(v) =>
                      setParcelField("weightUnit", v === "kg" ? "kg" : "g")
                    }
                  >
                    <Select.Trigger>
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      {parcel_options.weight_units.map((u) => (
                        <Select.Item key={u.id} value={u.id}>
                          {u.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
                <div className="flex flex-col gap-y-1">
                  <Text size="small" leading="compact" weight="plus">
                    Đơn vị kích thước
                  </Text>
                  <Select
                    value={parcel.dimensionUnit}
                    onValueChange={(v) =>
                      setParcelField("dimensionUnit", v === "m" ? "m" : "cm")
                    }
                  >
                    <Select.Trigger>
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      {parcel_options.dimension_units.map((u) => (
                        <Select.Item key={u.id} value={u.id}>
                          {u.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
              </div>
              <Text size="small" className="text-ui-fg-muted mt-1">
                Đơn vị bạn dùng khi nhập cân nặng/kích thước sản phẩm. GoShip luôn
                nhận gram và cm — hệ thống tự quy đổi khi gửi.
              </Text>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField
                label="Cân nặng mặc định"
                suffix={parcel.weightUnit}
                value={parcel.weightGrams}
                onChange={(v) => setParcelField("weightGrams", v)}
              />
              <NumberField
                label="Dài mặc định"
                suffix={parcel.dimensionUnit}
                value={parcel.length}
                onChange={(v) => setParcelField("length", v)}
              />
              <NumberField
                label="Rộng mặc định"
                suffix={parcel.dimensionUnit}
                value={parcel.width}
                onChange={(v) => setParcelField("width", v)}
              />
              <NumberField
                label="Cao mặc định"
                suffix={parcel.dimensionUnit}
                value={parcel.height}
                onChange={(v) => setParcelField("height", v)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-ui-border-base p-4">
              <div className="flex flex-col gap-y-1">
                <Text weight="plus">Giao 1 phần</Text>
                <Text size="small" className="text-ui-fg-subtle">
                  Chỉ áp dụng với đơn gửi qua GHN, GHTK — ghi vào ghi chú kiện hàng.
                </Text>
              </div>
              <Switch
                checked={parcel.partDelivery}
                onCheckedChange={(c) => setParcelField("partDelivery", c)}
              />
            </div>

            <div>
              <Button
                size="small"
                variant="primary"
                isLoading={parcelBusy}
                disabled={parcelBusy}
                onClick={saveParcel}
              >
                Lưu "Thông tin hàng gửi"
              </Button>
            </div>
          </>
        )}
      </Container>

      <Container className="flex flex-col gap-y-4 p-6">
        <div>
          <Heading level="h2">Webhook trạng thái vận đơn</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Đăng ký URL này ở dashboard GoShip (hoặc bấm nút bên dưới). GoShip ký
            mỗi request bằng header <code>{webhook.header}</code>.
          </Text>
        </div>

        <Field label="Webhook URL">
          <div className="flex flex-wrap items-center gap-x-2">
            <code className="rounded-md bg-ui-bg-subtle px-2 py-1 font-mono text-xs break-all">
              {webhook.url}
            </code>
            <Copy content={webhook.url} />
          </div>
        </Field>

        <Field label="Xác thực">
          <Badge size="small" color={webhook.auth_method === "NONE" ? "red" : "blue"}>
            {webhook.auth_method}
          </Badge>
        </Field>

        <Field label="Trạng thái trên GoShip">
          <div className="flex flex-wrap items-center gap-2">
            <Badge size="small" color={webhook.registered ? "green" : "red"}>
              {webhook.registered ? "Đã đăng ký" : "Chưa đăng ký"}
            </Badge>
            <Text size="small" className={webhook.registered ? "text-ui-fg-subtle" : "text-ui-fg-error"}>
              {webhook.registered
                ? "GoShip sẽ tự đẩy thay đổi trạng thái về đây."
                : "Chưa đăng ký → thay đổi trạng thái trên GoShip sẽ KHÔNG tự cập nhật."}
            </Text>
          </div>
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button
            size="small"
            variant="secondary"
            disabled={webhookBusy || !provider.configured}
            isLoading={webhookBusy}
            onClick={() => webhookAction("register-webhook")}
          >
            Đăng ký webhook với GoShip
          </Button>
          <Button
            size="small"
            variant="transparent"
            disabled={webhookBusy || !provider.configured}
            onClick={() => webhookAction("unregister-webhook")}
          >
            Hủy webhook
          </Button>
        </div>
      </Container>

      <Container className="p-0">
        <div className="px-6 pt-6">
          <Heading level="h2">Mức giao hàng</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1 mb-4">
            Mỗi tier = 1 shipping option tính cước động.
          </Text>
        </div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Tier</Table.HeaderCell>
              <Table.HeaderCell>Mô tả</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {tiers.map((tier) => (
              <Table.Row key={tier.id}>
                <Table.Cell>
                  {tier.name} (GoShip)
                  <span className="text-ui-fg-muted"> · {tier.id}</span>
                </Table.Cell>
                <Table.Cell>{tier.description}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Container>

      <Toaster />
    </div>
  )
}

export const config = defineRouteConfig({
  label: "GoShip",
  icon: TruckFast,
})

export default GoshipPage
