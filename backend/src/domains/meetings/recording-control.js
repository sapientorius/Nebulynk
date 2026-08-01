import { createId } from '@paralleldrive/cuid2'
import { badRequest } from '../../lib/errors.js'
import { getActiveTranscriptionRuntime } from '../../lib/meeting-recordings.js'
import {
  TRANSCRIPTION_RECORDING_STATUS,
  normalizeTranscriptionRecordingStatus
} from './artifact-state.js'
import {
  startMeetingParticipantRecording,
  stopMeetingParticipantRecordings
} from '../../services/meetings/recordings-runtime.js'

function uniqueIds(ids = []) {
  return [...new Set((ids || []).filter((id) => typeof id === 'string' && id.length > 0))]
}

export class MeetingRecordingControlDomainService {
  constructor({
    db,
    app,
    now = () => new Date(),
    createIdFn = createId,
    getActiveTranscriptionRuntimeFn = getActiveTranscriptionRuntime,
    startParticipantRecording = startMeetingParticipantRecording,
    stopParticipantRecordings = stopMeetingParticipantRecordings
  }) {
    this.db = db
    this.app = app
    this.now = now
    this.createIdFn = createIdFn
    this.getActiveTranscriptionRuntimeFn = getActiveTranscriptionRuntimeFn
    this.startParticipantRecording = startParticipantRecording
    this.stopParticipantRecordings = stopParticipantRecordings
  }

  async pause({ meeting, user }) {
    if (meeting.status !== 'active') {
      throw badRequest(
        'api.meetings.transcription_recording_not_active',
        {},
        'Transkriptionsaufnahme kann nur in aktiven Meetings gesteuert werden'
      )
    }

    if (
      normalizeTranscriptionRecordingStatus(meeting.transcription_recording_status) ===
      TRANSCRIPTION_RECORDING_STATUS.PAUSED
    ) {
      return
    }

    const nowIso = this.now().toISOString()
    await this.db.transaction(async (trx) => {
      await trx('meetings')
        .where('id', meeting.id)
        .update({
          transcription_recording_status: TRANSCRIPTION_RECORDING_STATUS.PAUSED,
          transcription_recording_paused_at: nowIso,
          transcription_recording_paused_by: user.id,
          updated_at: nowIso
        })

      const openPause = await trx('meeting_recording_pauses')
        .where({
          meeting_id: meeting.id,
          resumed_at: null
        })
        .first()

      if (!openPause) {
        await trx('meeting_recording_pauses').insert({
          id: this.createIdFn(),
          meeting_id: meeting.id,
          paused_by: user.id,
          resumed_by: null,
          paused_at: nowIso,
          resumed_at: null,
          created_at: nowIso,
          updated_at: nowIso
        })
      }
    })

    await this.stopParticipantRecordings(this.app, { meetingId: meeting.id })
    this.emitRecordingStateUpdated({
      ...meeting,
      transcription_recording_status: TRANSCRIPTION_RECORDING_STATUS.PAUSED,
      transcription_recording_paused_at: nowIso,
      transcription_recording_paused_by: user.id
    })
  }

  async resume({ meeting, user }) {
    if (meeting.status !== 'active') {
      throw badRequest(
        'api.meetings.transcription_recording_not_active',
        {},
        'Transkriptionsaufnahme kann nur in aktiven Meetings gesteuert werden'
      )
    }

    if (
      normalizeTranscriptionRecordingStatus(meeting.transcription_recording_status) !==
      TRANSCRIPTION_RECORDING_STATUS.PAUSED
    ) {
      return
    }

    const runtime = await this.getActiveTranscriptionRuntimeFn(this.db, this.app)
    if (!runtime) {
      throw badRequest(
        'api.meetings.transcription_recording_unavailable',
        {},
        'Transkriptionsaufnahme ist derzeit nicht konfiguriert'
      )
    }

    const nowIso = this.now().toISOString()
    await this.db.transaction(async (trx) => {
      await trx('meetings')
        .where('id', meeting.id)
        .update({
          transcription_recording_status: TRANSCRIPTION_RECORDING_STATUS.ACTIVE,
          transcription_recording_paused_at: null,
          transcription_recording_paused_by: null,
          updated_at: nowIso
        })

      await trx('meeting_recording_pauses')
        .where({
          meeting_id: meeting.id,
          resumed_at: null
        })
        .update({
          resumed_by: user.id,
          resumed_at: nowIso,
          updated_at: nowIso
        })
    })

    await this.startRecordingsForConnectedMeetingParticipants(meeting)
    this.emitRecordingStateUpdated({
      ...meeting,
      transcription_recording_status: TRANSCRIPTION_RECORDING_STATUS.ACTIVE,
      transcription_recording_paused_at: null,
      transcription_recording_paused_by: null
    })
  }

  async startRecordingsForConnectedMeetingParticipants(meeting) {
    const voiceParticipants = await this.db('voice_participants')
      .where('channel_id', meeting.chat_channel_id)
      .select('user_id')

    const userIds = uniqueIds(voiceParticipants.map((participant) => participant.user_id))
    if (userIds.length === 0) return

    const users = await this.db('users')
      .whereIn('id', userIds)
      .select('id', 'display_name')
    const displayNameByUserId = new Map(users.map((user) => [user.id, user.display_name]))

    for (const participant of voiceParticipants) {
      await this.startParticipantRecording(this.app, {
        meetingId: meeting.id,
        roomName: meeting.chat_channel_id,
        userId: participant.user_id,
        participantIdentity: participant.user_id,
        participantDisplayName: displayNameByUserId.get(participant.user_id) || participant.user_id
      })
    }
  }

  emitRecordingStateUpdated(meeting) {
    this.app.service('meetings').emit('recording-state-updated', {
      meetingId: meeting.id,
      chatChannelId: meeting.chat_channel_id,
      status: meeting.transcription_recording_status || TRANSCRIPTION_RECORDING_STATUS.ACTIVE
    })
  }
}
