import { logger } from '../../logger.js'
import {
  MEETING_RECORDING_STATUS,
  createMeetingRecordingRow,
  getActiveTranscriptionRuntime,
  isActiveMeetingRecordingStatus
} from '../../lib/meeting-recordings.js'
import {
  ensureRoomExists,
  getEgressInfo,
  getEgressStorageConfig,
  mapEgressStatus,
  normalizeEgressFileInfo,
  startParticipantAudioRecording,
  stopEgress
} from '../../lib/livekit.js'

function buildEgressFailureCode(normalizedStatus) {
  if (normalizedStatus === 'aborted') return 'egress_aborted'
  if (normalizedStatus === 'limit_reached') return 'egress_limit_reached'
  return 'egress_failed'
}

function toTimestampMs(value) {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function preserveEarliestTimestamp(currentValue, nextValue, fallbackValue = null) {
  const currentMs = toTimestampMs(currentValue)
  const nextMs = toTimestampMs(nextValue)
  const fallbackMs = toTimestampMs(fallbackValue)

  if (currentMs != null && nextMs != null) {
    return currentMs <= nextMs ? currentValue : nextValue
  }
  if (currentMs != null) return currentValue
  if (nextMs != null) return nextValue
  if (fallbackMs != null) return fallbackValue
  return currentValue || nextValue || fallbackValue || null
}

async function emitMeetingRecordingStateUpdated(app, meetingId) {
  if (!meetingId) return

  try {
    const db = app.get('postgresqlClient')
    const meeting = await db('meetings').where('id', meetingId).first()
    if (!meeting?.chat_channel_id) return

    app.service('meetings').emit('recording-state-updated', {
      meetingId: meeting.id,
      chatChannelId: meeting.chat_channel_id,
      status: meeting.transcription_recording_status || 'active'
    })
  } catch (error) {
    logger.warn('Meeting recording state event failed', {
      meetingId,
      error: error.message
    })
  }
}

export async function applyEgressUpdate(app, egressInfo, existingRecording = null) {
  const db = app.get('postgresqlClient')
  const persistedRecording = existingRecording?.id
    ? await db('meeting_recordings').where('id', existingRecording.id).first()
    : null
  const recording = persistedRecording || existingRecording || await db('meeting_recordings')
    .where('livekit_egress_id', egressInfo?.egressId || null)
    .first()

  if (!recording) {
    return null
  }

  const normalizedStatus = mapEgressStatus(egressInfo.status)
  const fileInfo = normalizeEgressFileInfo(egressInfo, recording.storage_key)
  const nowIso = new Date().toISOString()
  const createdAtMs = toTimestampMs(recording.created_at)
  const fileStartedAtMs = toTimestampMs(fileInfo.startedAt)
  const startDelayMs = createdAtMs != null && fileStartedAtMs != null
    ? Math.max(0, fileStartedAtMs - createdAtMs)
    : null
  const stableStartedAt = preserveEarliestTimestamp(recording.started_at, fileInfo.startedAt, nowIso)
  const stableStartedAtMs = toTimestampMs(stableStartedAt)
  const startTimestampDriftMs = (
    recording.started_at
    && fileInfo.startedAt
    && stableStartedAtMs != null
    && fileStartedAtMs != null
  )
    ? Math.max(0, fileStartedAtMs - stableStartedAtMs)
    : null

  if (startTimestampDriftMs != null && startTimestampDriftMs > 100) {
    logger.warn('Meeting recording egress start timestamp drift detected', {
      meetingId: recording.meeting_id,
      recordingId: recording.id,
      userId: recording.user_id,
      participantIdentity: recording.participant_identity,
      existingStartedAt: recording.started_at || null,
      incomingStartedAt: fileInfo.startedAt || null,
      preservedStartedAt: stableStartedAt || null,
      startTimestampDriftMs
    })
  }

  logger.info('Meeting recording egress update', {
    meetingId: recording.meeting_id,
    recordingId: recording.id,
    userId: recording.user_id,
    participantIdentity: recording.participant_identity,
    egressId: egressInfo?.egressId || recording.livekit_egress_id || null,
    normalizedStatus,
    recordingCreatedAt: recording.created_at || null,
    fileStartedAt: fileInfo.startedAt || null,
    fileEndedAt: fileInfo.endedAt || null,
    durationMs: fileInfo.durationMs || recording.duration_ms || null,
    startDelayMs
  })

  if (normalizedStatus === 'recording') {
    await db('meeting_recordings')
      .where('id', recording.id)
      .update({
        status: MEETING_RECORDING_STATUS.RECORDING,
        livekit_egress_id: egressInfo.egressId || recording.livekit_egress_id,
        started_at: stableStartedAt,
        updated_at: nowIso
      })
    await emitMeetingRecordingStateUpdated(app, recording.meeting_id)
    return {
      ...recording,
      status: MEETING_RECORDING_STATUS.RECORDING,
      livekit_egress_id: egressInfo.egressId || recording.livekit_egress_id
    }
  }

  if (normalizedStatus === 'ending') {
    await db('meeting_recordings')
      .where('id', recording.id)
      .update({
        status: MEETING_RECORDING_STATUS.ENDING,
        livekit_egress_id: egressInfo.egressId || recording.livekit_egress_id,
        started_at: stableStartedAt,
        updated_at: nowIso
      })
    await emitMeetingRecordingStateUpdated(app, recording.meeting_id)
    return {
      ...recording,
      status: MEETING_RECORDING_STATUS.ENDING,
      livekit_egress_id: egressInfo.egressId || recording.livekit_egress_id
    }
  }

  if (normalizedStatus === 'complete') {
    await db('meeting_recordings')
      .where('id', recording.id)
      .update({
        status: MEETING_RECORDING_STATUS.READY,
        livekit_egress_id: egressInfo.egressId || recording.livekit_egress_id,
        storage_key: fileInfo.storageKey || recording.storage_key,
        duration_ms: fileInfo.durationMs || recording.duration_ms,
        started_at: stableStartedAt,
        ended_at: fileInfo.endedAt || nowIso,
        failure_code: null,
        failure_message: null,
        updated_at: nowIso
      })
    await emitMeetingRecordingStateUpdated(app, recording.meeting_id)
    return {
      ...recording,
      status: MEETING_RECORDING_STATUS.READY
    }
  }

  if (normalizedStatus === 'failed' || normalizedStatus === 'aborted' || normalizedStatus === 'limit_reached') {
    await db('meeting_recordings')
      .where('id', recording.id)
      .update({
        status: MEETING_RECORDING_STATUS.FAILED,
        ended_at: fileInfo.endedAt || nowIso,
        failure_code: buildEgressFailureCode(normalizedStatus),
        failure_message: egressInfo?.error || egressInfo?.details || 'Recording failed',
        updated_at: nowIso
      })
    await emitMeetingRecordingStateUpdated(app, recording.meeting_id)
    return {
      ...recording,
      status: MEETING_RECORDING_STATUS.FAILED
    }
  }

  return recording
}

export async function startMeetingParticipantRecording(app, {
  meetingId,
  roomName,
  userId,
  participantIdentity,
  participantDisplayName
}) {
  const db = app.get('postgresqlClient')
  const runtime = await getActiveTranscriptionRuntime(db, app)
  if (!runtime) {
    return null
  }

  const storage = getEgressStorageConfig()
  const recording = createMeetingRecordingRow({
    meetingId,
    userId,
    participantIdentity,
    participantDisplayName,
    bucket: storage.bucket
  })

  await db('meeting_recordings').insert(recording)
  await emitMeetingRecordingStateUpdated(app, meetingId)

  try {
    logger.info('Starting meeting participant recording', {
      meetingId,
      recordingId: recording.id,
      roomName,
      userId,
      participantIdentity,
      participantDisplayName,
      requestedAt: recording.created_at
    })

    await ensureRoomExists(roomName)
    const info = await startParticipantAudioRecording({
      roomName,
      participantIdentity,
      recording
    })
    logger.info('Meeting participant recording request accepted', {
      meetingId,
      recordingId: recording.id,
      roomName,
      userId,
      participantIdentity,
      egressId: info?.egressId || null,
      requestedAt: recording.created_at
    })
    return await applyEgressUpdate(app, info, {
      ...recording,
      livekit_egress_id: info.egressId || null
    })
  } catch (error) {
    const nowIso = new Date().toISOString()
    await db('meeting_recordings')
      .where('id', recording.id)
      .update({
        status: MEETING_RECORDING_STATUS.FAILED,
        failure_code: 'egress_start_failed',
        failure_message: error.message,
        updated_at: nowIso
      })

    logger.warn('Meeting participant recording could not be started', {
      meetingId,
      roomName,
      userId,
      participantIdentity,
      storageEndpoint: storage.egressEndpoint || storage.endpoint,
      error: error.message
    })

    await emitMeetingRecordingStateUpdated(app, meetingId)
    return null
  }
}

export async function stopMeetingParticipantRecordings(app, {
  meetingId = null,
  userId = null
} = {}) {
  const db = app.get('postgresqlClient')
  let query = db('meeting_recordings')

  if (meetingId) {
    query = query.where('meeting_id', meetingId)
  }

  if (userId) {
    query = query.where('user_id', userId)
  }

  const rows = await query.select('*')
  const activeRows = rows.filter((row) => isActiveMeetingRecordingStatus(row.status))

  const nowIso = new Date().toISOString()
  for (const row of activeRows) {
    if (!row.livekit_egress_id) {
      await db('meeting_recordings')
        .where('id', row.id)
        .update({
          status: MEETING_RECORDING_STATUS.FAILED,
          ended_at: row.ended_at || nowIso,
          failure_code: 'egress_missing',
          failure_message: 'Recording never received an egress id',
          updated_at: nowIso
        })
      await emitMeetingRecordingStateUpdated(app, row.meeting_id)
      continue
    }

    await db('meeting_recordings')
      .where('id', row.id)
      .update({
        status: MEETING_RECORDING_STATUS.ENDING,
        updated_at: nowIso
      })

    try {
      const stopInfo = await stopEgress(row.livekit_egress_id)
      if (stopInfo) {
        await applyEgressUpdate(app, stopInfo, row)
      }
    } catch (error) {
      logger.warn('Meeting participant recording stop failed', {
        meetingId: row.meeting_id,
        recordingId: row.id,
        egressId: row.livekit_egress_id,
        error: error.message
      })
    }
  }

  if (activeRows.length > 0) {
    const affectedMeetingIds = [...new Set(activeRows.map((row) => row.meeting_id).filter(Boolean))]
    for (const affectedMeetingId of affectedMeetingIds) {
      await emitMeetingRecordingStateUpdated(app, affectedMeetingId)
    }
  }
}

export async function reconcileMeetingRecordings(app, { meetingId }) {
  const db = app.get('postgresqlClient')
  const rows = await db('meeting_recordings')
    .where('meeting_id', meetingId)
    .select('*')

  for (const row of rows) {
    if (!row.livekit_egress_id) continue
    if (
      !isActiveMeetingRecordingStatus(row.status)
    ) {
      continue
    }

    try {
      const info = await getEgressInfo(row.livekit_egress_id)
      if (info) {
        await applyEgressUpdate(app, info, row)
      }
    } catch (error) {
      logger.warn('Meeting recording reconciliation failed', {
        meetingId,
        recordingId: row.id,
        egressId: row.livekit_egress_id,
        error: error.message
      })
    }
  }
}
