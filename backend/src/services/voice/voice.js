import { authenticate } from '@feathersjs/authentication'
import { validate } from '../../schemas/validators.js'
import { createSchema, patchSchema } from './voice.schema.js'
import { generateToken, getLivekitWsUrl, deleteRoom } from '../../lib/livekit.js'
import { logger } from '../../logger.js'
import { isChannelMember } from '../../hooks/is-channel-member.js'
import { checkPermission, resolveUserPermissions } from '../../hooks/check-permission.js'
import { isGuestAccount } from '../../lib/account-state.js'
import { VoiceRepository } from '../../domains/voice/repository.js'
import { VoiceDomainService } from '../../domains/voice/service.js'
import {
  clearMeetingIdleByChatChannelId,
  markMeetingIdleByChatChannelId
} from '../meetings/idle-timeout.js'
import {
  startMeetingParticipantRecording,
  stopMeetingParticipantRecordings
} from '../meetings/recordings-runtime.js'

function createVoiceDomainService(app) {
  return new VoiceDomainService({
    repository: new VoiceRepository(app.get('postgresqlClient'))
  })
}

function resolveVoiceDomainService(app) {
  let domainService = null
  try {
    domainService = app.get('voiceDomainService')
  } catch {
    domainService = null
  }

  return domainService || createVoiceDomainService(app)
}

function checkJoinVoiceAccess() {
  const enforcePermission = checkPermission('join_voice_channels')

  return async (context) => {
    if (isGuestAccount(context.params.user)) {
      return context
    }

    return enforcePermission(context)
  }
}

async function isMeetingVideoEnabled(db) {
  const row = await db('platform_settings')
    .where('key', 'meeting_video_enabled')
    .first()
  return row?.value !== 'false'
}

export class VoiceService {
  constructor(options) {
    this.app = options.app
    this.domainService = options.domainService
  }

  get db() {
    return this.app.get('postgresqlClient')
  }

  // GET /voice - list participants (optionally filtered by channel_id)
  async find(params) {
    return this.domainService.findParticipants({
      provider: params.provider,
      user: params.user,
      query: params.query || {},
      resolvePermissions: (userId, channelId) => resolveUserPermissions(this.app, userId, channelId)
    })
  }

  // POST /voice - join a voice channel
  async create(data, params) {
    const { channel_id: channelId } = data
    const user = params.user

    const channel = await this.domainService.resolveJoinChannel(channelId)

    // Check if user is already in a voice channel.
    const existingChannelId = await this.domainService.findCurrentChannelForUser(user.id)
    const isSameChannel = existingChannelId && existingChannelId === channelId
    if (existingChannelId && !isSameChannel) {
      await this._leaveVoice(existingChannelId, user.id)
    }

    if (!isSameChannel) {
      const participant = this.domainService.buildParticipant({
        channelId,
        userId: user.id
      })
      await this.domainService.addParticipant(participant)

      // Broadcast join event only for actual joins.
      this.app.service('voice').emit('participant-joined', {
        channelId,
        participant: {
          user_id: user.id,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          status: user.status,
          is_muted: false,
          is_deafened: false,
          is_video_enabled: false
        }
      })

      logger.info(`${user.display_name} joined voice channel ${channel.name}`)
    }

    // Active meetings remain active while empty; joining clears idle timeout state.
    await clearMeetingIdleByChatChannelId(this.app, channelId)
    if (!isSameChannel && channel?.purpose === 'meeting') {
      this._scheduleMeetingRecordingStart(channel, user)
    }

    // Always return a fresh token and participant snapshot.
    const meetingVideoEnabled = channel?.purpose === 'meeting'
      ? await isMeetingVideoEnabled(this.db)
      : false
    const token = await generateToken(channelId, user.id, user.display_name, {
      allowCamera: meetingVideoEnabled
    })
    const participants = await this.domainService.listParticipantsByChannel(channelId)

    return {
      token,
      url: getLivekitWsUrl(),
      channelId,
      channelName: channel.name,
      participants,
      features: {
        meeting_video_enabled: meetingVideoEnabled
      }
    }
  }

  // DELETE /voice/:channelId - leave a voice channel
  async remove(channelId, params) {
    const user = params.user
    await this._leaveVoice(channelId, user.id)
    return { channelId, userId: user.id, left: true }
  }

  // PATCH /voice/:channelId - update mute/deafen state
  async patch(channelId, data, params) {
    const user = params.user
    const updated = await this.domainService.updateParticipant(channelId, user.id, data)

    // Broadcast state change
    this.app.service('voice').emit('participant-updated', {
      channelId,
      userId: user.id,
      is_muted: updated.is_muted,
      is_deafened: updated.is_deafened,
      is_video_enabled: updated.is_video_enabled
    })

    return updated
  }

  // Internal helper: remove participant and broadcast
  async _leaveVoice(channelId, userId) {
    const leaveResult = await this.domainService.leaveParticipant(channelId, userId)
    if (!leaveResult.left) return

    // Broadcast leave event
    this.app.service('voice').emit('participant-left', { channelId, userId })

    const meeting = await this._findMeetingByChatChannelId(channelId)
    if (meeting) {
      await stopMeetingParticipantRecordings(this.app, { meetingId: meeting.id, userId })
    }

    if (leaveResult.cleanupRoom) {
      await markMeetingIdleByChatChannelId(this.app, channelId)
      await deleteRoom(channelId)
    }

    logger.info(`User ${userId} left voice channel ${channelId}`)
  }

  _scheduleMeetingRecordingStart(channel, user) {
    Promise.resolve()
      .then(async () => {
        const meeting = await this._findMeetingByChatChannelId(channel.id)
        if (!meeting) return
        if (!this._shouldStartMeetingRecording(meeting)) {
          logger.info('Skipping meeting recording start because transcription recording is paused', {
            meetingId: meeting.id,
            channelId: channel.id,
            userId: user.id
          })
          return
        }

        logger.info('Scheduling meeting recording start after voice join', {
          meetingId: meeting.id,
          channelId: channel.id,
          userId: user.id,
          participantIdentity: user.id,
          meetingStartedAt: meeting.started_at || null
        })

        await startMeetingParticipantRecording(this.app, {
          meetingId: meeting.id,
          roomName: channel.id,
          userId: user.id,
          participantIdentity: user.id,
          participantDisplayName: user.display_name
        })
      })
      .catch((error) => {
        logger.warn('Meeting recording start failed in background', {
          channelId: channel?.id || null,
          userId: user?.id || null,
          error: error.message
        })
      })
  }

  _shouldStartMeetingRecording(meeting) {
    return !!meeting && meeting.transcription_recording_status !== 'paused'
  }

  async _findMeetingByChatChannelId(channelId) {
    return this.db('meetings')
      .where({
        chat_channel_id: channelId,
        status: 'active'
      })
      .first()
  }
}

// Exported helper for cleanup from other modules (presence, webhook)
export async function removeVoiceParticipant(app, userId) {
  const removal = await resolveVoiceDomainService(app).removeParticipantByUser(userId)
  if (!removal) return

  app.service('voice').emit('participant-left', {
    channelId: removal.channelId,
    userId
  })

  const db = app.get('postgresqlClient')
  const meeting = await db('meetings')
    .where({
      chat_channel_id: removal.channelId,
      status: 'active'
    })
    .first()

  if (meeting) {
    await stopMeetingParticipantRecordings(app, { meetingId: meeting.id, userId })
  }

  // Clean up empty room
  if (removal.cleanupRoom) {
    await markMeetingIdleByChatChannelId(app, removal.channelId)
    await deleteRoom(removal.channelId)
  }

  logger.info(`Voice participant ${userId} removed (disconnect/cleanup)`)
}

export const voice = (app) => {
  const domainService = resolveVoiceDomainService(app)
  app.set('voiceDomainService', domainService)

  const service = new VoiceService({
    app,
    domainService
  })

  app.use('voice', service, {
    methods: ['find', 'create', 'patch', 'remove'],
    events: ['participant-joined', 'participant-left', 'participant-updated']
  })

  app.service('voice').hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      create: [
        validate(createSchema),
        isChannelMember(),
        checkJoinVoiceAccess()
      ],
      patch: [validate(patchSchema)]
    }
  })
}
