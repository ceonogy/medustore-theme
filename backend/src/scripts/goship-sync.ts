/**
 * Đồng bộ cấu hình GoShip (chạy 1 lần, idempotent):
 *
 *   npx medusa exec ./src/scripts/goship-sync.ts
 *
 * Việc làm:
 *  1. Gắn fulfillment provider `goship_goship` vào stock location dùng ở
 *     checkout (location của service zone chứa 2 option `flat` hiện có).
 *  2. Ghi mã địa giới + thông tin liên hệ điểm gửi (`goship_*_code`, tên/sđt/
 *     địa chỉ) vào `metadata` của location và vào `data.address_from` của option.
 *  3. Tạo/cập nhật 2 shipping option `calculated` ("Tiết kiệm (GoShip)",
 *     "Nhanh (GoShip)") — provider `goship_goship`, kèm rule
 *     `goship_enabled eq "true"`.
 *
 * LƯU Ý về cờ bật/tắt: việc tạo/kiểm tra shipping option `calculated` đi qua
 * `canCalculate` của provider, mà provider lại chặn khi GoShip TẮT. Nên script
 * tạm BẬT trong lúc provision rồi **khôi phục đúng trạng thái trước đó** — không
 * tự ý bật GoShip cho shop. Muốn bật, dùng trang Admin → GoShip.
 *
 * Chạy lại nhiều lần an toàn: option được nhận diện theo `data.goship_tier`.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  RuleOperator,
  ShippingOptionPriceType,
} from "@medusajs/framework/utils"
import {
  batchLinksWorkflow,
  createShippingOptionsWorkflow,
  updateShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { GOSHIP_RULE_ATTRIBUTE, GOSHIP_TIERS } from "../modules/goship/config"

const PROVIDER_ID = "goship_goship"
const MANUAL_PROVIDER_ID = "manual_manual"

/** Điểm gửi mặc định = Kho HCM (Bình Tân / Tân Tạo A). */
const ORIGIN = {
  city: process.env.GOSHIP_ORIGIN_CITY ?? "700000",
  district: process.env.GOSHIP_ORIGIN_DISTRICT ?? "701900",
  ward: process.env.GOSHIP_ORIGIN_WARD ?? "9276",
  name: process.env.GOSHIP_ORIGIN_NAME ?? "Kho HCM",
  phone: process.env.GOSHIP_ORIGIN_PHONE ?? "0900000000",
  street: process.env.GOSHIP_ORIGIN_ADDRESS ?? "1 Tân Tạo A",
}

type GraphLocation = {
  id: string
  name?: string
  metadata?: Record<string, unknown> | null
  fulfillment_providers?: { id: string }[] | null
  fulfillment_sets?: {
    id: string
    service_zones?: { id: string; name?: string }[] | null
  }[] | null
}

type GoshipToggle = {
  getToggle(): Promise<{ enabled: boolean; source: "db" | "env" | "default" }>
  setEnabled(enabled: boolean): Promise<boolean>
  clearEnabled(): Promise<void>
}

export default async function goshipSync({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const goship = container.resolve<GoshipToggle>("goship")

  // 0. Nhớ trạng thái cờ để khôi phục sau khi provision xong.
  const previous = await goship.getToggle()
  logger.info(
    `[goship-sync] cờ hiện tại: ${previous.enabled ? "BẬT" : "TẮT"} (nguồn: ${previous.source}).`,
  )

  // 1. Lấy service zone / shipping profile từ option flat hiện có (đúng vùng checkout).
  const fulfillment = container.resolve(Modules.FULFILLMENT)
  const allOptions = await fulfillment.listShippingOptions(
    {},
    { select: ["id", "name", "data", "provider_id", "service_zone_id", "shipping_profile_id", "price_type"] },
  )
  const flatOptions = allOptions.filter(
    (o) => o.provider_id === MANUAL_PROVIDER_ID && o.price_type === ShippingOptionPriceType.FLAT,
  )
  const reference = flatOptions.find((o) => o.service_zone_id && o.shipping_profile_id)
  if (!reference) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "[goship-sync] Không tìm thấy shipping option `flat` nào để lấy service_zone_id/shipping_profile_id.",
    )
  }
  const serviceZoneId = reference.service_zone_id
  const shippingProfileId = reference.shipping_profile_id
  logger.info(`[goship-sync] dùng service zone ${serviceZoneId}, profile ${shippingProfileId}`)

  // 2. Tìm stock location chứa service zone đó (điểm gửi).
  const { data: locations } = (await query.graph({
    entity: "stock_location",
    fields: [
      "id",
      "name",
      "metadata",
      "fulfillment_providers.id",
      "fulfillment_sets.id",
      "fulfillment_sets.service_zones.id",
    ],
  })) as { data: GraphLocation[] }

  const envLocationId = process.env.GOSHIP_STOCK_LOCATION_ID
  const location =
    locations.find((l) => l.id === envLocationId) ??
    locations.find((l) =>
      (l.fulfillment_sets ?? []).some((fs) =>
        (fs.service_zones ?? []).some((sz) => sz.id === serviceZoneId),
      ),
    )

  if (!location) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `[goship-sync] Không tìm thấy stock location cho service zone ${serviceZoneId}.`,
    )
  }
  logger.info(`[goship-sync] stock location = ${location.id} (${location.name ?? "-"})`)

  // 3. Ghi mã địa giới điểm gửi vào metadata (kiểm tra chéo ở admin).
  const stockLocation = container.resolve(Modules.STOCK_LOCATION)
  await stockLocation.updateStockLocations(location.id, {
    metadata: {
      ...(location.metadata ?? {}),
      goship_city_code: ORIGIN.city,
      goship_district_code: ORIGIN.district,
      goship_ward_code: ORIGIN.ward,
    },
  })

  // 4. Gắn provider GoShip vào location (nếu chưa).
  const alreadyLinked = (location.fulfillment_providers ?? []).some((p) => p.id === PROVIDER_ID)
  if (!alreadyLinked) {
    await batchLinksWorkflow(container).run({
      input: {
        create: [
          {
            [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
            [Modules.FULFILLMENT]: { fulfillment_provider_id: PROVIDER_ID },
          },
        ],
      },
    })
    logger.info(`[goship-sync] đã gắn provider ${PROVIDER_ID} vào ${location.id}`)
  } else {
    logger.info(`[goship-sync] provider ${PROVIDER_ID} đã gắn sẵn vào ${location.id}`)
  }

  // 5. Tạm bật GoShip để `canCalculate` cho phép tạo option `calculated`,
  //    rồi provision, sau đó khôi phục đúng cờ ban đầu.
  await goship.setEnabled(true)

  try {
    const existing = allOptions.filter((o) => o.provider_id === PROVIDER_ID)

    const rules = [
      { attribute: "enabled_in_store", operator: RuleOperator.EQ, value: "true" },
      { attribute: "is_return", operator: RuleOperator.EQ, value: "false" },
      { attribute: GOSHIP_RULE_ATTRIBUTE, operator: RuleOperator.EQ, value: "true" },
    ]

    for (const tier of GOSHIP_TIERS) {
      const name = `${tier.name} (GoShip)`
      const data = {
        service: tier.id,
        goship_tier: tier.id,
        // Điểm gửi đầy đủ (mã 3 cấp + liên hệ) — provider đọc khi tạo vận đơn.
        address_from: ORIGIN,
      }
      const type = { label: tier.name, description: tier.description, code: `goship_${tier.id}` }

      const found =
        existing.find((o) => (o.data as Record<string, unknown> | null)?.goship_tier === tier.id) ??
        existing.find((o) => o.name === name)

      if (found) {
        await updateShippingOptionsWorkflow(container).run({
          input: [
            {
              id: found.id,
              name,
              data,
              price_type: ShippingOptionPriceType.CALCULATED,
              provider_id: PROVIDER_ID,
              type,
              rules,
            },
          ] as never,
        })
        logger.info(`[goship-sync] cập nhật option "${name}" (${found.id})`)
      } else {
        await createShippingOptionsWorkflow(container).run({
          input: [
            {
              name,
              service_zone_id: serviceZoneId,
              shipping_profile_id: shippingProfileId,
              provider_id: PROVIDER_ID,
              price_type: ShippingOptionPriceType.CALCULATED,
              data,
              type,
              rules,
            },
          ] as never,
        })
        logger.info(`[goship-sync] đã tạo option "${name}"`)
      }
    }
  } finally {
    // Khôi phục đúng trạng thái trước khi chạy.
    if (previous.source === "db") {
      await goship.setEnabled(previous.enabled)
      logger.info(`[goship-sync] khôi phục cờ về ${previous.enabled ? "BẬT" : "TẮT"} (DB).`)
    } else {
      await goship.clearEnabled()
      logger.info("[goship-sync] đã xoá cấu hình tạm — cờ về dự phòng ENV/mặc định.")
    }
  }

  logger.info("[goship-sync] hoàn tất. Kiểm tra: GET /store/shipping-options?cart_id=...")
}
