import { loadEnv, defineConfig } from '@medusajs/framework/utils'
import fs from 'node:fs'
import path from 'node:path'

// `medusa start` runs with cwd = .medusa/server, TWO levels below the project
// root that holds the real .env (DATABASE_URL, BREVO_*, ...), and pm2's saved
// process env only carries whatever was exported when the process was first
// started. Walk up to the nearest directory containing .env so it stays the
// source of truth after adding new keys — no `pm2 delete` needed.
{
  let envDir = process.cwd()
  for (let i = 0; i < 3 && !fs.existsSync(path.join(envDir, '.env')); i++) {
    envDir = path.join(envDir, '..')
  }
  loadEnv(process.env.NODE_ENV || 'development', envDir)
}

/**
 * Optional addons — `medusavn-goship` (fulfillment) and `medusavn-sepay`
 * (payment). Neither is bundled with this theme: install the package(s) in
 * the Medusa workspace and they are picked up automatically; remove them and
 * the backend falls back to Medusa's built-in manual fulfillment / system
 * payment provider.
 *
 * Resolution is intentionally dynamic (`require.resolve`) so a missing addon
 * never breaks `medusa build` / `medusa start`.
 */
const hasPackage = (id: string): boolean => {
  try {
    require.resolve(`${id}/package.json`, { paths: [__dirname] })
    return true
  } catch {
    return false
  }
}

const goshipInstalled = hasPackage('medusavn-goship')
const sepayInstalled = hasPackage('medusavn-sepay')

/**
 * The local file provider falls back to `http://localhost:9000/static`, so an
 * image uploaded from the admin is stored with an URL that only resolves on
 * the server itself — the browser gets ERR_CONNECTION_REFUSED. Point it at the
 * public backend origin instead; OpenLiteSpeed already proxies `/static/*`.
 */
const backendUrl = (
  process.env.MEDUSA_BACKEND_URL ||
  `http://localhost:${process.env.PORT || 9000}`
).replace(/\/$/, '')

/**
 * Express serves `/static` from `<cwd>/static`, and `medusa build` deletes the
 * whole `.medusa/server` folder — uploads made between two builds would vanish
 * with it. Keep that folder a symlink to a directory outside the build output.
 * At build time cwd is the project root, where both paths coincide, so this
 * only rewrites the link while the built server is starting.
 */
const UPLOADS_DIR = '/home/medusa/apps/backend/static'
const servedStaticDir = path.join(process.cwd(), 'static')

if (path.resolve(servedStaticDir) !== UPLOADS_DIR) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  let linkTarget: string | null = null
  try {
    linkTarget = fs.readlinkSync(servedStaticDir)
  } catch {
    // not a symlink (missing, or a real folder from before this change)
  }
  if (linkTarget === null) {
    const existing = fs.lstatSync(servedStaticDir, { throwIfNoEntry: false })
    if (existing) {
      fs.cpSync(servedStaticDir, UPLOADS_DIR, { recursive: true })
      fs.rmSync(servedStaticDir, { recursive: true, force: true })
    }
  }
  if (linkTarget !== UPLOADS_DIR) {
    fs.rmSync(servedStaticDir, { recursive: true, force: true })
    fs.symlinkSync(UPLOADS_DIR, servedStaticDir, 'dir')
  }
}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    }
  },

  /**
   * Addon packages. Their `src/modules/*` are merged automatically; providers
   * are still registered explicitly below (Medusa does not auto-register
   * module providers from plugins).
   */
  plugins: [
    ...(goshipInstalled ? [{ resolve: 'medusavn-goship', options: {} }] : []),
    ...(sepayInstalled ? [{ resolve: 'medusavn-sepay', options: {} }] : []),
  ],

  modules: [
    {
      resolve: '@medusajs/medusa/file',
      options: {
        providers: [
          {
            resolve: '@medusajs/medusa/file-local',
            id: 'local',
            options: {
              backend_url: `${backendUrl}/static`,
              upload_dir: UPLOADS_DIR,
            },
          },
        ],
      },
    },
    {
      // Transactional mail over Brevo (v3 SMTP API), provider at
      // src/modules/brevo — follows the official Resend integration guide.
      resolve: '@medusajs/medusa/notification',
      options: {
        providers: [
          {
            resolve: './src/modules/brevo',
            id: 'brevo',
            options: {
              channels: ['email'],
              api_key: process.env.BREVO_API_KEY,
              from: process.env.BREVO_FROM,
              from_name: process.env.BREVO_FROM_NAME,
              store_url: process.env.BREVO_STORE_URL,
            },
          },
        ],
      },
    },

    // ── medusavn-sepay (optional) ────────────────────────────────────────
    // Declaring the payment module replaces the default entry, but Medusa
    // always registers `pp_system_default` first, so manual payments keep
    // working alongside `pp_sepay`.
    ...(sepayInstalled
      ? [
          {
            resolve: '@medusajs/medusa/payment',
            options: {
              providers: [
                {
                  resolve: 'medusavn-sepay/providers/sepay-payment',
                  options: {
                    api_token: process.env.SEPAY_API_TOKEN,
                    base_url: process.env.SEPAY_BASE_URL,
                    bank_account_id: process.env.SEPAY_BANK_ACCOUNT_ID,
                    tid: process.env.SEPAY_TID,
                    mode: process.env.SEPAY_MODE,
                    webhook_secret: process.env.SEPAY_WEBHOOK_SECRET,
                    webhook_api_key: process.env.SEPAY_WEBHOOK_API_KEY,
                  },
                },
              ],
            },
          },
        ]
      : []),

    // ── medusavn-goship (optional) ───────────────────────────────────────
    // Keep `fulfillment-manual`: the two `flat` shipping options use
    // `fp_manual_manual`. GoShip adds `fp_goship_goship` next to it.
    ...(goshipInstalled
      ? [
          {
            resolve: '@medusajs/medusa/fulfillment',
            options: {
              providers: [
                {
                  resolve: '@medusajs/medusa/fulfillment-manual',
                  id: 'manual',
                },
                {
                  resolve: 'medusavn-goship/providers/goship',
                  id: 'goship',
                  options: {
                    token: process.env.GOSHIP_TOKEN,
                    base_url: process.env.GOSHIP_BASE_URL,
                    fallback_fee: process.env.GOSHIP_FALLBACK_FEE,
                    default_service: process.env.GOSHIP_DEFAULT_SERVICE,
                  },
                },
              ],
            },
          },
        ]
      : []),
  ],
})
