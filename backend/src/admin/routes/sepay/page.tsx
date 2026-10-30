import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CreditCard } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Copy,
  Heading,
  Table,
  Text,
  Toaster,
  toast,
} from "@medusajs/ui"
import { useEffect, useState, type ReactNode } from "react"

/**
 * Trang cấu hình SePay trong Admin (`/app/sepay`).
 *
 * Medusa không có UI sẵn cho webhook/secret của payment provider, nên trang
 * này bù vào: hiện URL webhook để dán vào my.sepay.vn, phương thức xác thực,
 * môi trường, trạng thái provider theo region và cho xem HMAC secret (che mặc
 * định, bấm "Hiện" mới gọi API — có ghi log audit).
 */

interface RegionRow {
  id: string
  name: string
  enabled: boolean
}

interface SePayConfig {
  provider: {
    id: string
    registered: boolean
    configured: boolean
    mode: string | null
    environment: "test" | "live" | null
    base_url: string | null
    bank_account_id: string | null
  }
  webhook: {
    url: string
    auth_method: "HMAC_SHA256" | "API_KEY" | "NONE"
    has_secret: boolean
    secret_masked: string | null
    secret_length: number | null
  }
  regions: RegionRow[]
  regions_enabled_count: number
}

const adminFetch = async <T,>(path: string): Promise<T> => {
  const res = await fetch(path, { credentials: "include" })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

const authLabel: Record<SePayConfig["webhook"]["auth_method"], string> = {
  HMAC_SHA256: "HMAC-SHA256",
  API_KEY: "API key",
  NONE: "Chưa đặt",
}

const Field = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) => (
  <div className="flex flex-col gap-y-1">
    <Text size="small" leading="compact" weight="plus">
      {label}
    </Text>
    <div className="text-ui-fg-subtle txt-small">{children}</div>
  </div>
)

const SePayPage = () => {
  const [config, setConfig] = useState<SePayConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [revealed, setRevealed] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)

  useEffect(() => {
    let active = true
    adminFetch<SePayConfig>("/admin/sepay/config")
      .then((data) => {
        if (active) setConfig(data)
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

  const revealSecret = async () => {
    setRevealing(true)
    try {
      const { secret } = await adminFetch<{ secret: string }>(
        "/admin/sepay/config/secret",
      )
      setRevealed(secret)
    } catch {
      toast.error("Không lấy được secret. Kiểm tra SEPAY_WEBHOOK_SECRET.")
    } finally {
      setRevealing(false)
    }
  }

  if (loading) {
    return (
      <Container className="p-6">
        <Text>Đang tải cấu hình SePay…</Text>
      </Container>
    )
  }

  if (failed || !config) {
    return (
      <Container className="p-6">
        <Heading level="h1">SePay</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          Không tải được cấu hình. Hãy tải lại trang.
        </Text>
      </Container>
    )
  }

  const { provider, webhook, regions, regions_enabled_count } = config
  const secretDisplay = revealed ?? webhook.secret_masked ?? "—"

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="flex flex-col gap-y-4 p-6">
        <div>
          <Heading level="h1">SePay</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Cổng thanh toán chuyển khoản ngân hàng (VA/QR). Bật/tắt provider
            theo từng Region ở{" "}
            <a
              href="/app/settings/regions"
              className="underline underline-offset-2"
            >
              Settings → Regions
            </a>
            .
          </Text>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Trạng thái provider">
            <div className="flex flex-wrap gap-2">
              <Badge color="green" size="small">
                Đã đăng ký
              </Badge>
              {provider.configured ? (
                <Badge color="green" size="small">
                  Đã cấu hình
                </Badge>
              ) : (
                <Badge color="red" size="small">
                  Thiếu API token/VA
                </Badge>
              )}
              {regions_enabled_count > 0 ? (
                <Badge color="green" size="small">
                  Bật ở {regions_enabled_count} region
                </Badge>
              ) : (
                <Badge color="orange" size="small">
                  Chưa bật ở region nào
                </Badge>
              )}
            </div>
          </Field>

          <Field label="Môi trường">
            <div className="flex flex-wrap items-center gap-2">
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
              <Text size="small" className="text-ui-fg-subtle">
                Chế độ: {provider.mode ?? "—"}
              </Text>
            </div>
          </Field>

          <Field label="Tài khoản ngân hàng (VA)">
            <span className="font-mono">
              {provider.bank_account_id ?? "—"}
            </span>
          </Field>

          <Field label="Base URL SePay">
            <span className="font-mono break-all">
              {provider.base_url ?? "—"}
            </span>
          </Field>
        </div>
      </Container>

      <Container className="flex flex-col gap-y-4 p-6">
        <div>
          <Heading level="h2">Webhook</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Dán URL này vào my.sepay.vn → Webhooks và chọn{" "}
            {authLabel[webhook.auth_method]}. Phương thức xác thực đang dùng:{" "}
            <Badge
              size="small"
              color={webhook.auth_method === "NONE" ? "red" : "blue"}
            >
              {authLabel[webhook.auth_method]}
            </Badge>
          </Text>
        </div>

        <Field label="Webhook URL">
          <div className="flex items-center gap-x-2">
            <code className="rounded-md bg-ui-bg-subtle px-2 py-1 font-mono text-xs">
              {webhook.url}
            </code>
            <Copy content={webhook.url} />
          </div>
        </Field>

        <Field label="HMAC secret">
          <div className="flex items-center gap-x-2">
            <code className="rounded-md bg-ui-bg-subtle px-2 py-1 font-mono text-xs break-all">
              {secretDisplay}
            </code>
            {revealed ? (
              <>
                <Copy content={revealed} />
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => setRevealed(null)}
                >
                  Ẩn
                </Button>
              </>
            ) : (
              <Button
                size="small"
                variant="secondary"
                disabled={!webhook.has_secret}
                isLoading={revealing}
                onClick={revealSecret}
              >
                Hiện
              </Button>
            )}
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-2">
            Mỗi lần bấm “Hiện” đều được ghi log audit.
            {webhook.secret_length
              ? ` Độ dài secret: ${webhook.secret_length} ký tự.`
              : ""}
          </Text>
        </Field>
      </Container>

      <Container className="p-0">
        <div className="px-6 pt-6">
          <Heading level="h2">Provider theo Region</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1 mb-4">
            SePay chỉ xuất hiện khi thanh toán ở những region được bật.
          </Text>
        </div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Region</Table.HeaderCell>
              <Table.HeaderCell>SePay</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {regions.map((region) => (
              <Table.Row
                key={region.id}
                className="[&_td:last-child]:w-[1%] [&_td:last-child]:whitespace-nowrap"
              >
                <Table.Cell>{region.name}</Table.Cell>
                <Table.Cell>
                  {region.enabled ? (
                    <Badge color="green" size="small">
                      Đang bật
                    </Badge>
                  ) : (
                    <Badge color="grey" size="small">
                      Tắt
                    </Badge>
                  )}
                </Table.Cell>
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
  label: "SePay",
  icon: CreditCard,
})

export default SePayPage
