import { getWebhookReceiver } from '../lib/livekit.js'
import { removeVoiceParticipant } from '../services/voice/voice.js'
import { markMeetingIdleByChatChannelId } from '../services/meetings/idle-timeout.js'
import { processPendingMeetingTranscripts } from '../services/meetings/transcript-processor.js'
import { processPendingMeetingSummaries } from '../services/meetings/summary-processor.js'
import { applyEgressUpdate } from '../services/meetings/recordings-runtime.js'
import { logger } from '../logger.js'
import { buildErrorBody } from '../lib/errors.js'

export function configureLivekitWebhook(app, options = {}) {
  const koaApp = app
  const resolveWebhookReceiver = options.getWebhookReceiver || getWebhookReceiver
  const handlers = {
    removeVoiceParticipant: options.removeVoiceParticipant || removeVoiceParticipant,
    markMeetingIdleByChatChannelId: options.markMeetingIdleByChatChannelId || markMeetingIdleByChatChannelId,
    processPendingMeetingTranscripts: options.processPendingMeetingTranscripts || processPendingMeetingTranscripts,
    processPendingMeetingSummaries: options.processPendingMeetingSummaries || processPendingMeetingSummaries,
    applyEgressUpdate: options.applyEgressUpdate || applyEgressUpdate
  }

  koaApp.use(async (ctx, next) => {
    if (ctx.method !== 'POST' || ctx.path !== '/livekit-webhook') {
      return next()
    }

    try {
      const chunks = []
      for await (const chunk of ctx.req) {
        chunks.push(chunk)
      }
      const rawBody = Buffer.concat(chunks).toString('utf8')
      const authHeader = ctx.request.headers.authorization || ''

      const receiver = resolveWebhookReceiver()
      const event = await receiver.receive(rawBody, authHeader)

      logger.info(`LiveKit webhook: ${event.event}`, {
        room: event.room?.name,
        participant: event.participant?.identity,
        egressId: event.egressInfo?.egressId || null
      })

      switch (event.event) {
        case 'participant_left': {
          const userId = event.participant?.identity
          if (userId) {
            await handlers.removeVoiceParticipant(app, userId)
          }
          break
        }
        case 'room_finished': {
          const channelId = event.room?.name
          if (channelId) {
            const db = app.get('postgresqlClient')
            await db('voice_participants').where('channel_id', channelId).del()
            await handlers.markMeetingIdleByChatChannelId(app, channelId)
          }
          break
        }
        case 'egress_started':
        case 'egress_updated':
        case 'egress_ended': {
          const updatedRecording = await handlers.applyEgressUpdate(app, event.egressInfo)
          if (updatedRecording) {
            await handlers.processPendingMeetingTranscripts(app)
            await handlers.processPendingMeetingSummaries(app)
          }
          break
        }
      }

      ctx.status = 200
      ctx.body = { ok: true }
    } catch (error) {
      logger.error('LiveKit webhook error:', { error: error.message })
      ctx.status = 401
      ctx.body = buildErrorBody('api.livekit_webhook.unauthorized', 'Unauthorized')
    }
  })
}
