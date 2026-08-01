import { createId } from '@paralleldrive/cuid2'
import { badRequest, forbidden } from '../../lib/errors.js'
import {
  MEETING_RECORDING_STATUS,
  getActiveTranscriptionRuntime,
  getManualMeetingSummaryRuntime
} from '../../lib/meeting-recordings.js'
import { listQueuedMeetingArtifactTypes } from '../../services/ai-function-configs/ai-function-configs.js'
import {
  filterVisibleMeetingArtifacts,
  isRegeneratableTranscriptRecording
} from './artifact-state.js'

export class MeetingArtifactsDomainService {
  constructor({
    db,
    app,
    now = () => new Date(),
    createIdFn = createId
  }) {
    this.db = db
    this.app = app
    this.now = now
    this.createIdFn = createIdFn
  }

  async resolveEndedMeetingArtifactTypes(meetingId) {
    const queuedArtifactTypes = await listQueuedMeetingArtifactTypes(this.db)
    const queuedNonTranscriptArtifactTypes = queuedArtifactTypes.filter((type) => type !== 'transcript')
    const shouldQueueTranscript = queuedArtifactTypes.includes('transcript')
    const transcriptRecordingRows = shouldQueueTranscript
      ? await this.db('meeting_recordings').where('meeting_id', meetingId).select('id')
      : []

    return [
      ...queuedNonTranscriptArtifactTypes,
      ...(shouldQueueTranscript && transcriptRecordingRows.length > 0 ? ['transcript'] : [])
    ]
  }

  async queueProcessingArtifacts(trx, {
    meetingId,
    artifactTypes = [],
    nowIso,
    resetPayload = true
  }) {
    for (const artifactType of artifactTypes) {
      await this.queueProcessingArtifact(trx, {
        meetingId,
        artifactType,
        nowIso,
        resetPayload
      })
    }
  }

  async queueProcessingArtifact(trx, {
    meetingId,
    artifactType,
    nowIso,
    resetPayload = true
  }) {
    const patchData = {
      status: 'processing',
      updated_at: nowIso
    }

    if (resetPayload) {
      patchData.payload = null
    }

    const updatedArtifacts = await trx('meeting_artifacts')
      .where({
        meeting_id: meetingId,
        artifact_type: artifactType
      })
      .update(patchData)

    if (updatedArtifacts) {
      return
    }

    await trx('meeting_artifacts').insert({
      id: this.createIdFn(),
      meeting_id: meetingId,
      artifact_type: artifactType,
      status: 'processing',
      ...(resetPayload ? { payload: null } : {}),
      created_at: nowIso,
      updated_at: nowIso
    })
  }

  emitArtifactsQueued(meeting, {
    artifactTypes = [],
    reason = null
  } = {}) {
    if (!artifactTypes.length) {
      return
    }

    this.app.service('meetings').emit('artifacts-queued', {
      meetingId: meeting.id,
      chatChannelId: meeting.chat_channel_id,
      sourceChannelId: meeting.source_channel_id,
      artifactTypes,
      reason
    })
  }

  async generateSummary({
    meeting,
    user,
    reason = 'manual'
  }) {
    if (meeting.status !== 'ended') {
      throw badRequest(
        'api.meetings.summary_generation_not_ended',
        {},
        'Zusammenfassungen koennen erst nach dem Meeting gestartet werden'
      )
    }

    const storedSummaryArtifact = await this.db('meeting_artifacts')
      .where({
        meeting_id: meeting.id,
        artifact_type: 'summary'
      })
      .orderBy('updated_at', 'desc')
      .first()

    const [summaryArtifact = null] = filterVisibleMeetingArtifacts([storedSummaryArtifact])

    if (summaryArtifact?.status === 'processing' || summaryArtifact?.status === 'pending') {
      throw badRequest(
        'api.meetings.summary_generation_already_processing',
        {},
        'Die Zusammenfassung wird bereits erstellt'
      )
    }

    const isReadyRegenerate = summaryArtifact?.status === 'ready'
    const isRetry = summaryArtifact?.status === 'failed'
    if (isReadyRegenerate && !user.is_admin) {
      throw forbidden(
        'api.meetings.summary_regenerate_forbidden',
        {},
        'Nur Admins koennen eine vorhandene Zusammenfassung neu erstellen'
      )
    }

    if (isRetry && !user.is_admin && meeting.host_user_id !== user.id) {
      throw forbidden(
        'api.meetings.summary_retry_forbidden',
        {},
        'Nur Host oder Admin kann eine fehlgeschlagene Zusammenfassung erneut starten'
      )
    }

    const runtime = await getManualMeetingSummaryRuntime(this.db, this.app)
    if (!runtime) {
      throw badRequest(
        'api.meetings.summary_generation_unavailable',
        {},
        'Meeting-Zusammenfassung ist derzeit nicht konfiguriert'
      )
    }

    const nowIso = this.now().toISOString()
    await this.db.transaction(async (trx) => {
      await this.queueProcessingArtifact(trx, {
        meetingId: meeting.id,
        artifactType: 'summary',
        nowIso,
        resetPayload: true
      })
    })

    this.emitArtifactsQueued(meeting, {
      artifactTypes: ['summary'],
      reason
    })
  }

  async generateTranscript({
    meeting,
    user,
    reason = 'manual'
  }) {
    if (meeting.status !== 'ended') {
      throw badRequest(
        'api.meetings.transcript_generation_not_ended',
        {},
        'Transkripte koennen erst nach dem Meeting erneut gestartet werden'
      )
    }

    const transcriptArtifact = await this.db('meeting_artifacts')
      .where({
        meeting_id: meeting.id,
        artifact_type: 'transcript'
      })
      .orderBy('updated_at', 'desc')
      .first()

    if (transcriptArtifact?.status === 'processing' || transcriptArtifact?.status === 'pending') {
      throw badRequest(
        'api.meetings.transcript_generation_already_processing',
        {},
        'Das Transkript wird bereits erstellt'
      )
    }

    const isReadyRegenerate = transcriptArtifact?.status === 'ready'
    const isRetry = transcriptArtifact?.status === 'failed'

    if (!isReadyRegenerate && !isRetry) {
      throw badRequest(
        'api.meetings.transcript_generation_no_retryable_recordings',
        {},
        'Fuer dieses Meeting gibt es kein fehlgeschlagenes Transkript zum erneuten Starten'
      )
    }

    if (isReadyRegenerate && !user.is_admin) {
      throw forbidden(
        'api.meetings.transcript_regenerate_forbidden',
        {},
        'Nur Admins koennen ein vorhandenes Transkript neu erstellen'
      )
    }

    if (isRetry && !user.is_admin && meeting.host_user_id !== user.id) {
      throw forbidden(
        'api.meetings.transcript_retry_forbidden',
        {},
        'Nur Host oder Admin kann ein fehlgeschlagenes Transkript erneut starten'
      )
    }

    const runtime = await getActiveTranscriptionRuntime(this.db, this.app)
    if (!runtime) {
      throw badRequest(
        'api.meetings.transcript_generation_unavailable',
        {},
        'Meeting-Transkription ist derzeit nicht konfiguriert'
      )
    }

    const recordings = await this.db('meeting_recordings')
      .where('meeting_id', meeting.id)
      .select('*')
    const retryableRecordings = recordings.filter((recording) => isRegeneratableTranscriptRecording(recording))

    if (retryableRecordings.length === 0) {
      throw badRequest(
        'api.meetings.transcript_generation_no_retryable_recordings',
        {},
        'Es gibt keine gespeicherte Aufnahme, die erneut transkribiert werden kann'
      )
    }

    const recordingIdsToReset = retryableRecordings
      .filter((recording) => recording.status !== MEETING_RECORDING_STATUS.READY)
      .map((recording) => recording.id)
    const nowIso = this.now().toISOString()

    await this.db.transaction(async (trx) => {
      if (recordingIdsToReset.length > 0) {
        await trx('meeting_recordings')
          .whereIn('id', recordingIdsToReset)
          .update({
            status: MEETING_RECORDING_STATUS.READY,
            failure_code: null,
            failure_message: null,
            updated_at: nowIso
          })
      }

      await this.queueProcessingArtifact(trx, {
        meetingId: meeting.id,
        artifactType: 'transcript',
        nowIso,
        resetPayload: true
      })
    })

    this.emitArtifactsQueued(meeting, {
      artifactTypes: ['transcript'],
      reason
    })
  }
}
