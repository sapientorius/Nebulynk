import { logger } from '../../logger.js'
import { deleteRoom } from '../../lib/livekit.js'
import { stopMeetingParticipantRecordings } from '../../services/meetings/recordings-runtime.js'

export async function _createSourceMessage({ effects }, { meetingId, sourceChannel, user }) {
  try {
    await effects.app.service('messages').create(
      {
        channel_id: sourceChannel.id,
        content: `[Meeting] /meetings/${meetingId}`
      },
      {
        user,
        skipNotifications: true
      }
    )
  } catch (error) {
    logger.warn('Failed to create meeting source message', {
      meetingId,
      sourceChannelId: sourceChannel.id,
      error: error.message
    })
  }
}

export function _joinConnectionsToChannel({ effects }, channelId, memberUserIds) {
  if (!memberUserIds.length) return

  try {
    const room = effects.app.channel('authenticated')
    const connections = room?.connections || []
    for (const connection of connections) {
      if (memberUserIds.includes(connection.user?.id)) {
        effects.app.channel(`channel/${channelId}`).join(connection)
      }
    }
  } catch {
    // Non-critical: users rejoin channel rooms on next login.
  }
}

export function _emitNotificationEvents({ effects }, rows) {
  if (!rows || rows.length === 0) return

  for (const row of rows) {
    try {
      effects.app.service('notifications').emit('created', row)
    } catch (error) {
      logger.warn('Failed to emit meeting notification', {
        notificationId: row.id,
        userId: row.user_id,
        error: error.message
      })
    }
  }
}


export function createMeetingIntegrations(app, { removeRoom = deleteRoom, stopRecordings = stopMeetingParticipantRecordings } = {}) {
  return {
    app,
    voiceCreate: (data, params) => app.service('voice').create(data, params),
    voicePatch: (id, data, params) => app.service('voice').patch(id, data, params),
    emitMeeting: (event, payload) => app.service('meetings').emit(event, payload),
    emitChannel: (event, payload) => app.service('channels').emit(event, payload),
    removeRoom,
    stopRecordings: options => stopRecordings(app, options)
  }
}
