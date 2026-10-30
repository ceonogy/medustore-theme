import { InjectManager, MedusaContext, MedusaService } from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import SePayWebhookEvent from "./models/webhook-event"

export type RecordWebhookEventInput = {
  sepay_transaction_id: string
  gateway?: string | null
  account_number?: string | null
  sub_account?: string | null
  code?: string | null
  transfer_type?: string | null
  transfer_amount?: number | null
  content?: string | null
  status?: string
  session_id?: string | null
  order_id?: string | null
  payload: Record<string, unknown>
}

export type RecordWebhookEventResult = {
  /** true = trùng transaction id (delivery/replay) → bỏ qua, không xử lý lại */
  duplicate: boolean
  event: Record<string, unknown> | null
}

const isUniqueViolation = (err: unknown): boolean => {
  const e = err as { code?: string; errno?: number; message?: string; cause?: { code?: string } }
  const code = e?.code ?? e?.cause?.code
  if (code === "23505") return true
  if (typeof e?.errno === "number" && e.errno === 23505) return true
  return /duplicate key|unique constraint/i.test(String(e?.message ?? ""))
}

/**
 * Service của custom module SePay.
 *
 * MedusaService tự sinh CRUD cho model `sepay_webhook_event`
 * (`createSePayWebhookEvents`, `retrieveSePayWebhookEvent`,
 * `listSePayWebhookEvents`, ...). Method đặc biệt duy nhất ở đây là
 * `recordWebhookEvent` — chốt chống trùng webhook theo đúng khuyến nghị của
 * SePay: INSERT trên transaction id UNIQUE, lỗi unique = delivery trùng.
 */
class SePayModuleService extends MedusaService({
  SePayWebhookEvent,
}) {
  /**
   * Ghi một webhook delivery vào bảng đối soát.
   *
   * Trả về `duplicate: true` nếu `sepay_transaction_id` đã tồn tại —
   * hai delivery đồng thời của cùng giao dịch thì chỉ một insert thắng
   * (DB unique index là chốt, không dùng check-then-insert trong RAM).
   */
  @InjectManager()
  async recordWebhookEvent(
    input: RecordWebhookEventInput,
    @MedusaContext() sharedContext?: Context,
  ): Promise<RecordWebhookEventResult> {
    try {
      const created = await this.createSePayWebhookEvents(
        { ...input, status: input.status ?? "processed" },
        sharedContext,
      )
      return { duplicate: false, event: created as unknown as Record<string, unknown> }
    } catch (err) {
      // MikroORM/Postgres unique violation (23505) bị dbErrorMapper đổi thành
      // MedusaError "... already exists" và MẤT code gốc — nên thay vì so khớp
      // kiểu lỗi, chỉ cần tra lại: đã tồn tại row = delivery trùng. INSERT vẫn
      // là chốt race-safe, tra cứu chỉ chạy khi insert thất bại.
      if (!isUniqueViolation(err)) {
        const existing = await this.listSePayWebhookEvents(
          { sepay_transaction_id: input.sepay_transaction_id },
          { take: 1 },
          sharedContext,
        )
        if (!existing?.length) throw err
      }
      const existing = await this.listSePayWebhookEvents(
        { sepay_transaction_id: input.sepay_transaction_id },
        { take: 1 },
        sharedContext,
      )
      return {
        duplicate: true,
        event: (existing?.[0] as unknown as Record<string, unknown>) ?? null,
      }
    }
  }

  /** Cập nhật trạng thái/đối chiếu sau khi xử lý (unmatched, amount_mismatch...). */
  @InjectManager()
  async markWebhookEvent(
    id: string,
    patch: Partial<RecordWebhookEventInput>,
    @MedusaContext() sharedContext?: Context,
  ) {
    return await this.updateSePayWebhookEvents({ id, ...patch } as never, sharedContext)
  }
}

export default SePayModuleService
