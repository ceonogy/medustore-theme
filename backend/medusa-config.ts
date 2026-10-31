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
    {
      // Online banking qua SePay (VA theo đơn hàng). Provider nằm ở
      // src/modules/sepay/payment-provider — không khai báo `id` nên
      // provider id trong DB là `pp_sepay`. Khai báo module payment ở đây
      // không làm mất provider mặc định: loader của Medusa luôn đăng ký
      // `pp_system_default` trước khi đọc `providers` tùy chỉnh.
      resolve: '@medusajs/medusa/payment',
      options: {
        providers: [
          {
            resolve: './src/modules/sepay/payment-provider',
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
    {
      // Custom module SePay — bảng đối soát webhook `sepay_webhook_event`
      // (dedup theo transaction id UNIQUE) + service ghi log delivery.
      resolve: './src/modules/sepay',
    },
    {
      // Fulfillment module — thêm provider GoShip BÊN CẠNH provider mặc định
      // `manual`. Khai báo module này sẽ THAY thế entry fulfillment mặc định
      // của Medusa (module trùng `resolve` thì cái sau thắng), nên phải giữ
      // luôn `fulfillment-manual`: 2 shipping option flat hiện có đang dùng
      // `fp_manual_manual`. Provider GoShip = `fp_goship_goship`.
      resolve: '@medusajs/medusa/fulfillment',
      options: {
        providers: [
          {
            resolve: '@medusajs/medusa/fulfillment-manual',
            id: 'manual',
          },
          {
            resolve: './src/modules/goship/fulfillment-provider',
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
    {
      // Custom module GoShip — cache danh mục địa giới (`goship_location`)
      // cho dropdown tỉnh/quận/phường ở checkout.
      resolve: './src/modules/goship',
      options: {
        token: process.env.GOSHIP_TOKEN,
        base_url: process.env.GOSHIP_BASE_URL,
      },
    },
  ],
})
