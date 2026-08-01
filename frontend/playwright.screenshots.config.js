import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config.js'

const demoDb = process.env.DEMO_POSTGRES_DB_EN || 'nebulynk_demo_en'
const screenshotsBackendPort = process.env.SCREENSHOTS_BACKEND_PORT || '3041'
const screenshotsFrontendPort = process.env.SCREENSHOTS_FRONTEND_PORT || '4183'

const screenshotsFrontendUrl = `http://127.0.0.1:${screenshotsFrontendPort}`
const screenshotsBackendUrl = `http://127.0.0.1:${screenshotsBackendPort}`

function resolveBackendUrl(path = '/') {
  const normalized = String(path || '/').replace(/^\/+/, '')
  return new URL(normalized, `${screenshotsBackendUrl}/`).toString()
}

export default defineConfig({
  ...baseConfig,
  timeout: 180_000,
  testIgnore: [],
  testMatch: 'screenshots.spec.js',
  use: {
    ...baseConfig.use,
    baseURL: screenshotsFrontendUrl,
    // Fixed desktop viewport so screenshots are consistent, high-quality assets
    // for the platform website (captures the complete viewport, not a crop).
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  },
  webServer: [
    {
      command: 'npm run screenshots:backend --prefix ..',
      url: resolveBackendUrl('/platform'),
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        POSTGRES_DB: demoDb,
        BACKEND_PORT: screenshotsBackendPort,
        FRONTEND_URL: screenshotsFrontendUrl
      }
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${screenshotsFrontendPort} --strictPort`,
      url: screenshotsFrontendUrl,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        VITE_API_URL: screenshotsBackendUrl,
        VITE_FAKE_LIVEKIT: 'true'
      }
    }
  ]
})
