/**
 * Đọc cờ bật/tắt GoShip từ DB **không cần module service**.
 *
 * Fulfillment provider chỉ được inject 6 dependency dùng chung (manager /
 * configModule / logger / `__pg_connection__` / event_bus / caching) — KHÔNG
 * resolve được service của module `goship`. Nên provider đọc thẳng bảng
 * `goship_setting` qua knex, đúng cách provider SePay dò payment_session.
 *
 * Nguồn chân lý (theo thứ tự ưu tiên):
 *  1. dòng `goship_setting.key = "enabled"` (Admin UI ghi) — nếu có;
 *  2. biến môi trường `GOSHIP_ENABLED` — dự phòng khi DB chưa có dòng / lỗi.
 */
import { GOSHIP_SETTING_KEY, isGoshipEnabled, parseGoshipEnabled } from "./config"

type KnexLike = {
  raw(sql: string, bindings?: unknown[]): Promise<unknown>
}

/**
 * `SELECT value FROM goship_setting WHERE key = ? AND deleted_at IS NULL`.
 * Trả `null` khi chưa có dòng (phân biệt với `"false"`).
 */
export async function readGoshipEnabledSetting(
  knex: KnexLike | undefined,
): Promise<boolean | null> {
  if (!knex) return null
  try {
    const result = await knex.raw(
      `SELECT "value" FROM "goship_setting" WHERE "key" = ? AND deleted_at IS NULL LIMIT 1`,
      [GOSHIP_SETTING_KEY],
    )
    const rows = (result as { rows?: Array<{ value: string | null }> })?.rows
    const row = rows?.[0]
    if (!row) return null
    return parseGoshipEnabled(row.value, false)
  } catch {
    // Bảng chưa migrate / DB lỗi → coi như chưa cấu hình.
    return null
  }
}

/** Cờ hiệu lực cho provider: DB trước, rơi về `GOSHIP_ENABLED`. */
export async function isGoshipEnabledEffective(
  knex: KnexLike | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const fromDb = await readGoshipEnabledSetting(knex)
  return fromDb ?? isGoshipEnabled(env)
}

/**
 * Đọc **toàn bộ** `key/value` trong `goship_setting` (bỏ bản ghi đã xoá mềm).
 * Dùng một truy vấn để provider dựng cấu hình kiện hàng mà không cần resolve
 * service của module. Lỗi DB → trả `{}` (rơi về mặc định ENV).
 */
export async function readGoshipSettingValues(
  knex: KnexLike | undefined,
): Promise<Record<string, string | null>> {
  if (!knex) return {}
  try {
    const result = await knex.raw(
      `SELECT "key", "value" FROM "goship_setting" WHERE deleted_at IS NULL`,
    )
    const rows = (result as { rows?: Array<{ key: string; value: string | null }> })?.rows
    const out: Record<string, string | null> = {}
    for (const row of rows ?? []) out[row.key] = row.value
    return out
  } catch {
    return {}
  }
}
