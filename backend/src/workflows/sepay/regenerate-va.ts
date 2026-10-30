import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"

/**
 * Tái tạo VA/QR SePay cho một payment session đã hết hạn.
 *
 * Được tách thành workflow (thay vì gọi payment module thẳng trong API route)
 * để hợp với quy ước Medusa: mọi thao tác ghi đều đi qua step, có thể
 * retry/compensate. Step này uỷ quyền cho payment provider qua
 * `updatePaymentSession` với cờ `sepay_regenerate` (xem SePayPaymentProvider).
 */
export type RegenerateSepayVaInput = {
  session_id: string
  /** Toàn bộ session data hiện tại + cờ `sepay_regenerate: true`. */
  data: Record<string, unknown>
  amount: number
  currency_code: string
}

const regenerateSepayVaStep = createStep(
  "regenerate-sepay-va",
  async (input: RegenerateSepayVaInput, { container }) => {
    const payment = container.resolve(Modules.PAYMENT)
    const updated = await payment.updatePaymentSession({
      id: input.session_id,
      data: input.data,
      amount: input.amount,
      currency_code: input.currency_code,
    })
    return new StepResponse({
      data: (updated?.data ?? {}) as Record<string, unknown>,
    })
  },
)

export const regenerateSepayVaWorkflow = createWorkflow(
  "regenerate-sepay-va",
  (input: RegenerateSepayVaInput) => {
    const result = regenerateSepayVaStep(input)
    return new WorkflowResponse(result)
  },
)

export default regenerateSepayVaWorkflow
