import { feathers } from '@feathersjs/feathers'
import { koa, rest, bodyParser, errorHandler, cors } from '@feathersjs/koa'
import socketio from '@feathersjs/socketio'
import configuration from '@feathersjs/configuration'
import knex from 'knex'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

import { logger } from './logger.js'
import { authentication } from './authentication.js'
import { services } from './services/index.js'
import { channels } from './channels.js'
import { logErrorHook } from './hooks/log-error.js'
import { setupPresence, cleanupStalePresence, runAutoAwaySweep } from './presence.js'
import { createStorageClient, initBucket } from './lib/storage.js'
import { createNotificationSideEffectsDispatcher } from './lib/notification-side-effects.js'
import { createRateLimiter, createRateLimitStore } from './lib/rate-limit.js'
import { configureUploadRoute } from './routes/upload.js'
import { configureAvatarRoutes } from './routes/avatar.js'
import { configureVideoBackgroundRoutes } from './routes/video-backgrounds.js'
import { configureLivekitWebhook } from './routes/livekit-webhook.js'
import { configureMessageForwardRoute } from './routes/message-forward.js'
import { configureVoiceDraftRoutes } from './routes/voice-drafts.js'
import { configureMeetingIcsRoute } from './routes/meeting-ics.js'
import { configureMeetingAudioRoute } from './routes/meeting-audio.js'
import { configureAuthSessionRoutes } from './routes/auth-session.js'
import { configureAuthLoginRoutes } from './routes/auth-login.js'
import { configureUserTwoFactorRoutes } from './routes/user-two-factor.js'
import { configureUserPasskeyRoutes } from './routes/user-passkeys.js'
import { configurePrimaryAdminTransferRoutes } from './routes/primary-admin-transfer.js'
import { configureOwnerSponsorshipPromptRoutes } from './routes/owner-sponsorship-prompt.js'
import { configurePlatformUpdateRoutes } from './routes/platform-updates.js'
import { configureSystemInfoRoutes } from './routes/system-info.js'
import { endExpiredIdleMeetings } from './services/meetings/idle-timeout.js'
import { endOverdueScheduledMeetings } from './services/meetings/overdue-scheduled.js'
import { processPendingMeetingTranscripts } from './services/meetings/transcript-processor.js'
import { processPendingMeetingSummaries } from './services/meetings/summary-processor.js'
import { processDueMessageReminders } from './services/message-reminders/processor.js'
import { assertUserAccountActive } from './lib/account-state.js'
import { PlatformUpdateManager } from './lib/platform-updates.js'
import { StorageUsageManager } from './lib/storage-usage.js'
import {
  getApiSecurityHeaders,
  resolveAuthenticationSecret,
  resolveClientOrigins,
  resolveCorsOrigin,
  resolveDesktopFrontendOrigins,
  resolveFrontendOrigins,
  resolvePasskeyRpId,
  resolveStorageBucket,
  resolveStorageS3PublicEndpoint,
  shouldTrustProxy,
  validateRuntimeSecurity
} from './lib/security-config.js'

const app = koa(feathers())
app.proxy = shouldTrustProxy(process.env)

// Load configuration
app.configure(configuration())

const authenticationConfig = {
  ...(app.get('authentication') || {})
}
const authenticationSecret = resolveAuthenticationSecret(process.env, authenticationConfig.secret)
app.set('authentication', {
  ...authenticationConfig,
  secret: authenticationSecret
})

const frontendOrigins = resolveFrontendOrigins(process.env)
const desktopFrontendOrigins = resolveDesktopFrontendOrigins(process.env)
const clientOrigins = resolveClientOrigins(process.env)
const passkeyRpId = resolvePasskeyRpId(process.env)
const securityReport = validateRuntimeSecurity({
  env: process.env,
  authenticationSecret
})
app.set('frontendOrigins', frontendOrigins)
app.set('desktopFrontendOrigins', desktopFrontendOrigins)
app.set('clientOrigins', clientOrigins)
app.set('passkeyRpId', passkeyRpId)

if (securityReport.warnings.length > 0) {
  logger.warn('Runtime security warnings detected', {
    warnings: securityReport.warnings
  })
}

if (securityReport.errors.length > 0) {
  const error = new Error('Unsafe production runtime configuration detected')
  logger.error(error.message, {
    errors: securityReport.errors
  })
  throw error
}

// Set up Koa middleware
app.use(cors({
  origin: (ctx) => resolveCorsOrigin(ctx.get('Origin'), clientOrigins),
  credentials: true,
  allowHeaders: ['Authorization', 'Content-Type', 'X-CSRF-Token', 'X-Refresh-Token', 'X-Auth-Session-Debug-Id'],
  exposeHeaders: ['Set-Cookie']
}))
app.use(async (ctx, next) => {
  await next()

  for (const [header, value] of Object.entries(getApiSecurityHeaders())) {
    ctx.set(header, value)
  }
})
app.use(errorHandler())

// Mount upload route before REST (needs raw Koa access for multipart)
configureUploadRoute(app)
configureAvatarRoutes(app)
configureVideoBackgroundRoutes(app)
configureVoiceDraftRoutes(app)
configureMeetingIcsRoute(app)
configureMeetingAudioRoute(app)

// Mount LiveKit webhook route (needs raw body for signature verification)
configureLivekitWebhook(app)

app.use(bodyParser())

configureAuthLoginRoutes(app)
configureAuthSessionRoutes(app)
configureUserTwoFactorRoutes(app)
configureUserPasskeyRoutes(app)
configurePrimaryAdminTransferRoutes(app)
configureOwnerSponsorshipPromptRoutes(app)
configurePlatformUpdateRoutes(app)
configureSystemInfoRoutes(app)

// Mount message forward route until Feathers custom REST methods are routed consistently
configureMessageForwardRoute(app)

// Set up REST and Socket.IO transports
app.configure(rest())
app.configure(socketio({
  cors: {
    origin: clientOrigins,
    methods: ['GET', 'POST']
  }
}))

// Set up database connection
const db = knex({
  client: 'pg',
  connection: {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: Number(process.env.POSTGRES_PORT) || 5433,
    database: process.env.POSTGRES_DB || 'nebulynk',
    user: process.env.POSTGRES_USER || 'nebulynk',
    password: process.env.POSTGRES_PASSWORD || 'nebulynk_dev_password'
  },
  pool: { min: 2, max: 10 }
})

app.set('postgresqlClient', db)
app.set('platformUpdateManager', new PlatformUpdateManager(app))
app.set('storageUsageManager', new StorageUsageManager(app))

// Set up authentication
app.configure(authentication)

// Set up services
app.configure(services)
app.set('notificationSideEffectsDispatcher', createNotificationSideEffectsDispatcher(app))

// Set up real-time channels
app.configure(channels)

// Set up presence tracking (Socket.IO connect/disconnect)
setupPresence(app)

// Global hooks
app.hooks({
  around: {
    all: [logErrorHook]
  },
  before: {
    all: [
      async (context) => {
        if (context.path === 'authentication') return context
        const user = context.params?.user
        if (!user) return context
        assertUserAccountActive(user)
        return context
      }
    ]
  },
  after: {},
  error: {}
})

// Setup hook — runs once when the app starts
// IMPORTANT: Setup/teardown hooks are middleware — must call await next()
// so the rest of the chain runs (Socket.IO init, service setup, etc.)
app.hooks({
  setup: [
    async (context, next) => {
      // Auto-run migrations on startup
      try {
        const { driver, store } = await createRateLimitStore(process.env)
        app.set('rateLimitDriver', driver)
        app.set('rateLimiter', createRateLimiter(store))
        logger.info(`Rate limiting initialized (${driver})`)
      } catch (error) {
        logger.error('Rate limiting initialization failed', {
          error: error.message
        })
        throw error
      }

      try {
        const result = await db.migrate.latest({
          directory: './migrations'
        })
        if (result[1].length > 0) {
          logger.info(`Ran ${result[1].length} migration(s): ${result[1].join(', ')}`)
        } else {
          logger.info('Database is up to date')
        }
      } catch (error) {
        logger.error('Migration failed:', { error: error.message })
        throw error
      }

      // Initialize S3-compatible object storage clients
      try {
        const storageClient = createStorageClient()
        const publicEndpoint = resolveStorageS3PublicEndpoint(process.env)
        const storagePresignClient = publicEndpoint
          ? createStorageClient({ endpoint: publicEndpoint })
          : storageClient
        const bucket = resolveStorageBucket(process.env)
        await initBucket(storageClient, bucket)
        app.set('storageClient', storageClient)
        app.set('storagePresignClient', storagePresignClient)
        app.set('storageBucket', bucket)
        logger.info(`Storage initialized (bucket: ${bucket})`)
      } catch (error) {
        logger.warn('Storage initialization failed (S3-compatible storage not available):', { error: error.message })
      }

      // Clean up stale online statuses from previous server run
      await cleanupStalePresence(app)

      // Clean up stale voice participants (server restart = all rooms gone)
      try {
        const voiceDeleted = await db('voice_participants').del()
        if (voiceDeleted > 0) {
          logger.info(`${voiceDeleted} stale Voice-Teilnehmer bereinigt (Server-Neustart)`)
        }
      } catch (error) {
        logger.warn('Voice-Participants-Cleanup fehlgeschlagen:', { error: error.message })
      }

      // Periodic cleanup: expire custom statuses every 60 seconds
      setInterval(async () => {
        try {
          const now = new Date().toISOString()
          const expired = await db('users')
            .where('status_expires_at', '<', now)
            .whereNotNull('status_expires_at')
            .select('id')

          if (expired.length > 0) {
            await db('users')
              .whereIn('id', expired.map((u) => u.id))
              .update({
                custom_status: null,
                custom_status_emoji: null,
                status_expires_at: null,
                updated_at: now
              })

            for (const user of expired) {
              app.channel('authenticated').send({
                type: 'status-cleared',
                userId: user.id
              })
            }

            logger.info(`${expired.length} abgelaufene Custom-Status bereinigt`)
          }
        } catch (error) {
          logger.error('Status-Expiration-Cleanup fehlgeschlagen:', { error: error.message })
        }
      }, 60_000)

      setInterval(async () => {
        try {
          const nowIso = new Date().toISOString()
          await db('users')
            .where('account_type', 'guest')
            .whereNull('disabled_at')
            .whereNotNull('guest_expires_at')
            .where('guest_expires_at', '<=', nowIso)
            .update({
              disabled_at: nowIso,
              status: 'offline',
              updated_at: nowIso
            })
        } catch (error) {
          logger.error('Guest account expiration sweep failed:', { error: error.message })
        }
      }, 300_000)

      setInterval(async () => {
        try {
          await runAutoAwaySweep(app)
        } catch (error) {
          logger.error('Presence auto-away sweep failed:', { error: error.message })
        }
      }, 60_000)

      // Periodic cleanup: end active meetings after 10 minutes without participants.
      setInterval(async () => {
        try {
          await endExpiredIdleMeetings(app)
        } catch (error) {
          logger.error('Meeting idle-timeout cleanup failed:', { error: error.message })
        }
      }, 60_000)

      setInterval(async () => {
        try {
          await endOverdueScheduledMeetings(app)
        } catch (error) {
          logger.error('Scheduled meeting expiry cleanup failed:', { error: error.message })
        }
      }, 60_000)

      setInterval(async () => {
        try {
          await processPendingMeetingTranscripts(app)
          await processPendingMeetingSummaries(app)
        } catch (error) {
          logger.error('Meeting intelligence processing failed:', { error: error.message })
        }
      }, 15_000)

      let messageReminderProcessing = false
      setInterval(async () => {
        if (messageReminderProcessing) return
        messageReminderProcessing = true
        try {
          await processDueMessageReminders(app)
        } catch (error) {
          logger.error('Message reminder processing failed:', { error: error.message })
        } finally {
          messageReminderProcessing = false
        }
      }, 30_000)

      try {
        await processPendingMeetingTranscripts(app)
        await processPendingMeetingSummaries(app)
        await processDueMessageReminders(app)
      } catch (error) {
        logger.error('Initial background processing failed:', { error: error.message })
      }

      app.get('platformUpdateManager')?.start()

      // Continue the setup chain (Socket.IO init, service setup, etc.)
      await next()
    }
  ],
  teardown: [
    async (context, next) => {
      // Continue teardown chain first (services, etc.)
      await next()

      const db = app.get('postgresqlClient')
      const rateLimiter = app.get('rateLimiter')
      app.get('platformUpdateManager')?.stop()
      if (rateLimiter?.close) {
        await rateLimiter.close()
        logger.info('Rate limiter closed')
      }
      if (db) {
        await db.destroy()
        logger.info('Database connection closed')
      }
    }
  ]
})

export { app }
