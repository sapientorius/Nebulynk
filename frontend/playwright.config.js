import { defineConfig } from '@playwright/test'
import {
  backendPort,
  frontendPort,
  backendUrl,
  frontendUrl,
  shouldUsePreviewFrontend,
  useExternalServers,
  resolveBackendUrl
} from './test/e2e/test-urls.js'

const isCI = !!process.env.CI
const strictCI = process.env.NEBULYNK_CI_STRICT === 'true'
const postgresDb = process.env.E2E_POSTGRES_DB || 'nebulynk_e2e'
const frontendServeCommand = shouldUsePreviewFrontend
  ? `npm run e2e:security:serve -- --port ${frontendPort}`
  : 'npm run e2e:dev'
const screenshotsSpec = /screenshots\.spec\.js$/
const corePathsSpec = /core-paths\.spec\.js$/

export default defineConfig({
  testDir: './test/e2e',
  timeout: 90_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  workers: 1,
  retries: strictCI ? 0 : (isCI ? 1 : 0),
  projects: [
    {
      name: 'onboarding',
      testMatch: corePathsSpec
    },
    {
      name: 'e2e',
      dependencies: ['onboarding'],
      testIgnore: [corePathsSpec, screenshotsSpec]
    }
  ],
  reporter: isCI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: frontendUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream'
      ]
    }
  },
  webServer: useExternalServers
    ? undefined
    : [
        {
          command: 'npm run e2e:backend --prefix ..',
          url: resolveBackendUrl('/platform'),
          timeout: 180_000,
          reuseExistingServer: !isCI && !strictCI,
          env: {
            ...process.env,
            BACKEND_PORT: backendPort,
            FRONTEND_URL: frontendUrl,
            E2E_POSTGRES_DB: postgresDb,
            POSTGRES_DB: postgresDb
          }
        },
        {
          command: frontendServeCommand,
          url: frontendUrl,
          timeout: 180_000,
          reuseExistingServer: !isCI && !strictCI,
          env: {
            ...process.env,
            VITE_API_URL: backendUrl,
            VITE_FAKE_LIVEKIT: 'true'
          }
        }
      ]
})
