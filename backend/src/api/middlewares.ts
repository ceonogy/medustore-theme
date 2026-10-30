import {
  configureStoreSearch,
  defineMiddlewares,
  type MedusaRequest,
  type MedusaResponse,
} from '@medusajs/framework/http'
import type { NextFunction } from 'express'

// ── Password-reset abuse guard ─────────────────────────────────────────
// In-memory sliding window — fine for the single-instance (pm2) demo
// deployment. Throttles per identifier (stops one inbox being bombed)
// and per client IP. Real client IPs arrive via X-Forwarded-For: the
// storefront proxy forwards the header and OpenLiteSpeed APPENDS the
// connecting address, so the RIGHTMOST entry is the one our nearest
// trusted hop observed — a client-spoofed leftmost entry is ignored.
// The 429 is byte-identical whether or not the account exists, so the
// guard adds no account-enumeration channel on top of the native route
// (which always answers 201).
const RESET_WINDOW_MS = 15 * 60 * 1000
const RESET_MAX_PER_IDENTIFIER = 3
const RESET_MAX_PER_IP = 10
const resetHits = new Map<string, number[]>()

const resetThrottle = (
  req: MedusaRequest,
  res: MedusaResponse,
  next: NextFunction,
) => {
  // Keep the map bounded even for key-spraying traffic.
  if (resetHits.size > 5000) resetHits.clear()

  const now = Date.now()
  const within = (key: string, limit: number): boolean => {
    const hits = (resetHits.get(key) ?? []).filter(
      (t) => now - t < RESET_WINDOW_MS,
    )
    if (hits.length >= limit) {
      resetHits.set(key, hits)
      return false
    }
    hits.push(now)
    resetHits.set(key, hits)
    return true
  }
  const tooMany = () =>
    res.status(429).json({
      message: 'Too many password reset requests, please try again later.',
    })

  const identifier = String(
    (req.body as { identifier?: unknown })?.identifier ?? '',
  )
    .toLowerCase()
    .trim()
  if (identifier && !within(`id:${identifier}`, RESET_MAX_PER_IDENTIFIER)) {
    return tooMany()
  }

  const forwarded = String(req.headers['x-forwarded-for'] ?? '')
  const entries = forwarded
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
  // Rightmost = appended by the nearest trusted proxy (OLS); anything
  // further left came from the client and may be spoofed.
  const ip = entries[entries.length - 1] || req.ip || req.socket?.remoteAddress || ''
  if (ip && !within(`ip:${ip}`, RESET_MAX_PER_IP)) {
    return tooMany()
  }

  next()
}

export default defineMiddlewares({
  routes: [
    {
      method: ['POST'],
      matcher: '/store/search',
      middlewares: [
        configureStoreSearch({
          allowed_indexes: {
            product: true,
          },
        }),
      ],
    },
    {
      method: ['POST'],
      matcher: '/auth/:actor_type/:auth_provider/reset-password',
      middlewares: [resetThrottle],
    },
    {
      // Webhook SePay — HMAC được tính trên **raw body**, nên bật
      // preserveRawBody để Express json parser giữ `req.rawBody`
      // (Buffer) bên cạnh req.body đã parse.
      method: ['POST'],
      matcher: '/webhooks/sepay',
      bodyParser: { preserveRawBody: true },
    },
  ],
})
