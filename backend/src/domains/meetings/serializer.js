import { logger } from '../../logger.js'
import {
  getActiveTranscriptionRuntime,
  getManualMeetingSummaryRuntime
} from '../../lib/meeting-recordings.js'
import {
  buildAdminArtifactMenuState,
  buildSummaryGenerationState,
  buildTranscriptGenerationState,
  buildTranscriptionRecordingState,
  createRecordingStats,
  filterVisibleMeetingArtifacts,
  isDownloadableMeetingRecording,
  isRegeneratableTranscriptRecording
} from './artifact-state.js'

function uniqueIds(ids = []) {
  return [...new Set((ids || []).filter((id) => typeof id === 'string' && id.length > 0))]
}

function createDistinctUserSet(rows, predicate = null) {
  const userIds = new Set()

  for (const row of rows || []) {
    if (predicate && !predicate(row)) continue
    if (typeof row?.user_id === 'string' && row.user_id.length > 0) {
      userIds.add(row.user_id)
    }
  }

  return userIds
}

export function normalizeLabel(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function isTechnicalDmSourceName(name, channelId = null) {
  const normalized = normalizeLabel(name)
  if (!normalized) return false
  if (channelId) return normalized === `dm-${channelId}`
  return /^dm-[a-z0-9]+$/i.test(normalized)
}

export function isTechnicalGroupSourceName(name, channelId = null) {
  const normalized = normalizeLabel(name)
  if (!normalized) return false
  if (channelId) return normalized === `group-${channelId}`
  return /^group-[a-z0-9]+$/i.test(normalized)
}

export function toUniqueSortedDisplayNames(memberRows) {
  const deduped = new Map()
  for (const row of memberRows || []) {
    const displayName = normalizeLabel(row.display_name)
    if (!displayName) continue
    const key = displayName.toLowerCase()
    if (!deduped.has(key)) {
      deduped.set(key, displayName)
    }
  }

  return [...deduped.values()].sort((left, right) => left.localeCompare(right, 'de'))
}

export function formatCompactGroupDisplayName(names) {
  if (names.length === 0) return null
  if (names.length <= 2) {
    return names.join(', ')
  }
  return `${names[0]}, ${names[1]} +${names.length - 2}`
}

export async function resolveSourceChannelDisplayName({
  db,
  sourceChannelId,
  sourceChannelType,
  sourceChannelName,
  viewerUserId = null
}) {
  const rows = [{
    source_channel_id: sourceChannelId,
    source_channel_type: sourceChannelType,
    source_channel_name: sourceChannelName
  }]
  const displayNameByChannelId = await buildSourceChannelDisplayNameIndex(db, rows, { viewerUserId })
  return displayNameByChannelId[sourceChannelId] || null
}

export async function buildSourceChannelDisplayNameIndex(db, rows, { viewerUserId = null } = {}) {
  const displayNameByChannelId = {}
  if (!Array.isArray(rows) || rows.length === 0) {
    return displayNameByChannelId
  }

  const sourceRowsByChannelId = new Map()
  for (const row of rows) {
    const sourceChannelId = row?.source_channel_id
    if (!sourceChannelId || sourceRowsByChannelId.has(sourceChannelId)) continue
    sourceRowsByChannelId.set(sourceChannelId, row)
  }

  const sourceRows = [...sourceRowsByChannelId.values()]
  const memberScopedRows = sourceRows.filter((row) => (
    row?.source_channel_type === 'dm' || row?.source_channel_type === 'group'
  ))

  const membersByChannelId = {}
  if (memberScopedRows.length > 0) {
    const sourceChannelIds = memberScopedRows
      .map((row) => row.source_channel_id)
      .filter(Boolean)

    const memberRows = await db('channel_members')
      .join('users', 'users.id', '=', 'channel_members.user_id')
      .whereIn('channel_members.channel_id', sourceChannelIds)
      .select(
        'channel_members.channel_id',
        'channel_members.user_id',
        'users.display_name'
      )

    for (const member of memberRows) {
      if (!membersByChannelId[member.channel_id]) {
        membersByChannelId[member.channel_id] = []
      }
      membersByChannelId[member.channel_id].push(member)
    }
  }

  for (const row of sourceRows) {
    const sourceChannelId = row.source_channel_id
    const sourceType = row.source_channel_type
    const sourceName = normalizeLabel(row.source_channel_name)

    if (sourceType !== 'dm' && sourceType !== 'group') {
      displayNameByChannelId[sourceChannelId] = sourceName || null
      continue
    }

    const members = membersByChannelId[sourceChannelId] || []
    if (sourceType === 'dm') {
      if (sourceName && !isTechnicalDmSourceName(sourceName, sourceChannelId)) {
        displayNameByChannelId[sourceChannelId] = sourceName
        continue
      }

      const preferredRows = viewerUserId
        ? members.filter((member) => member.user_id !== viewerUserId)
        : members
      const fallbackRows = preferredRows.length > 0 ? preferredRows : members
      const dmNames = toUniqueSortedDisplayNames(fallbackRows)
      displayNameByChannelId[sourceChannelId] = dmNames[0] || null
      continue
    }

    if (sourceName && !isTechnicalGroupSourceName(sourceName, sourceChannelId)) {
      displayNameByChannelId[sourceChannelId] = sourceName
      continue
    }

    const preferredRows = viewerUserId
      ? members.filter((member) => member.user_id !== viewerUserId)
      : members
    const fallbackRows = preferredRows.length > 0 ? preferredRows : members
    const groupNames = toUniqueSortedDisplayNames(fallbackRows)
    displayNameByChannelId[sourceChannelId] = formatCompactGroupDisplayName(groupNames)
  }

  return displayNameByChannelId
}

export function buildMeetingSummary(row, {
  sourceChannelDisplayNameByChannelId = {},
  engagedParticipantCountByMeetingId = {},
  summaryGenerationByMeetingId = {},
  transcriptGenerationByMeetingId = {},
  transcriptionRecordingByMeetingId = {},
  adminArtifactMenuByMeetingId = {}
} = {}) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    source_channel_id: row.source_channel_id,
    chat_channel_id: row.chat_channel_id,
    host_user_id: row.host_user_id,
    language: row.language || null,
    description: row.description || null,
    visibility: row.visibility || 'invitees',
    scheduled_start_at: row.scheduled_start_at || null,
    scheduled_end_at: row.scheduled_end_at || null,
    join_not_before: row.join_not_before || null,
    cancelled_at: row.cancelled_at || null,
    started_at: row.started_at,
    ended_at: row.ended_at,
    ended_by: row.ended_by,
    detail_level: 'summary',
    engaged_participant_count: engagedParticipantCountByMeetingId[row.id] || 0,
    source_channel: {
      id: row.source_channel_id,
      name: row.source_channel_name,
      type: row.source_channel_type,
      display_name: sourceChannelDisplayNameByChannelId[row.source_channel_id] || null
    },
    chat_channel: {
      id: row.chat_channel_id,
      name: row.chat_channel_name,
      purpose: row.chat_channel_purpose,
      is_voice: row.chat_channel_is_voice,
      is_archived: row.chat_channel_is_archived
    },
    transcription_recording: transcriptionRecordingByMeetingId[row.id] || buildTranscriptionRecordingState({ meeting: row }),
    ...(summaryGenerationByMeetingId[row.id]
      ? { summary_generation: summaryGenerationByMeetingId[row.id] }
      : {}),
    ...(transcriptGenerationByMeetingId[row.id]
      ? { transcript_generation: transcriptGenerationByMeetingId[row.id] }
      : {}),
    ...(adminArtifactMenuByMeetingId[row.id]
      ? { admin_artifact_menu: adminArtifactMenuByMeetingId[row.id] }
      : {})
  }
}

export async function serializeMeetings({
  db,
  app,
  rows,
  viewerUserId = null,
  viewerUser = null,
  detailLevel = 'summary',
  buildSourceDisplayNameIndex = (targetRows, options) => buildSourceChannelDisplayNameIndex(db, targetRows, options),
  buildTranscriptionStateIndex = (targetRows, options) => buildTranscriptionRecordingStateIndex({
    db,
    app,
    rows: targetRows,
    ...options
  }),
  enrichMeetingDetails = (targetRows, options) => enrichMeetingsWithDetails({
    db,
    app,
    rows: targetRows,
    ...options
  })
}) {
  if (!rows.length) return []

  const chatChannelIds = uniqueIds(rows.map((row) => row.chat_channel_id))
  const [
    textMessageAuthors,
    sourceChannelDisplayNameByChannelId,
    transcriptionRecordingByMeetingId
  ] = await Promise.all([
    chatChannelIds.length > 0
      ? db('messages')
        .whereIn('channel_id', chatChannelIds)
        .where('type', 'text')
        .whereNull('deleted_at')
        .distinct('channel_id', 'user_id')
      : Promise.resolve([]),
    buildSourceDisplayNameIndex(rows, { viewerUserId }),
    buildTranscriptionStateIndex(rows, { viewerUser })
  ])

  const messageAuthorIdsByChannelId = {}
  for (const row of textMessageAuthors) {
    if (!messageAuthorIdsByChannelId[row.channel_id]) {
      messageAuthorIdsByChannelId[row.channel_id] = new Set()
    }
    messageAuthorIdsByChannelId[row.channel_id].add(row.user_id)
  }

  if (detailLevel === 'full') {
    return enrichMeetingDetails(rows, {
      viewerUserId,
      viewerUser,
      sourceChannelDisplayNameByChannelId,
      messageAuthorIdsByChannelId,
      transcriptionRecordingByMeetingId
    })
  }

  const joinedParticipantRows = await db('meeting_participants')
    .whereIn('meeting_id', rows.map((row) => row.id))
    .whereNotNull('joined_at')
    .select('meeting_id', 'user_id')

  const joinedUserIdsByMeetingId = {}
  for (const participant of joinedParticipantRows) {
    if (!joinedUserIdsByMeetingId[participant.meeting_id]) {
      joinedUserIdsByMeetingId[participant.meeting_id] = new Set()
    }
    joinedUserIdsByMeetingId[participant.meeting_id].add(participant.user_id)
  }

  const engagedParticipantCountByMeetingId = {}
  for (const row of rows) {
    const joinedUserIds = joinedUserIdsByMeetingId[row.id] || new Set()
    const messageAuthorIds = messageAuthorIdsByChannelId[row.chat_channel_id] || new Set()
    engagedParticipantCountByMeetingId[row.id] = new Set([...joinedUserIds, ...messageAuthorIds]).size
  }

  return rows.map((row) => buildMeetingSummary(row, {
    sourceChannelDisplayNameByChannelId,
    engagedParticipantCountByMeetingId,
    transcriptionRecordingByMeetingId
  }))
}

export async function enrichMeetingsWithDetails({
  db,
  app,
  rows,
  viewerUserId = null,
  viewerUser = null,
  sourceChannelDisplayNameByChannelId = {},
  messageAuthorIdsByChannelId = {},
  transcriptionRecordingByMeetingId = {}
} = {}) {
  const meetingIds = rows.map((row) => row.id)

  const [participants, artifacts] = await Promise.all([
    db('meeting_participants')
      .join('meetings', 'meetings.id', 'meeting_participants.meeting_id')
      .join('users', 'users.id', 'meeting_participants.user_id')
      .leftJoin('channel_members as meeting_chat_members', function () {
        this
          .on('meeting_chat_members.channel_id', '=', 'meetings.chat_channel_id')
          .andOn('meeting_chat_members.user_id', '=', 'meeting_participants.user_id')
      })
      .whereIn('meeting_participants.meeting_id', meetingIds)
      .select(
        'meeting_participants.meeting_id',
        'meeting_participants.user_id',
        'meeting_participants.role',
        'meeting_participants.invite_status',
        'meeting_participants.invited_at',
        'meeting_participants.joined_at',
        'meeting_participants.left_at',
        'users.display_name',
        'users.account_type',
        'users.avatar_url',
        'users.status',
        'meeting_chat_members.last_read_at as chat_last_read_at'
      ),
    db('meeting_artifacts')
      .whereIn('meeting_id', meetingIds)
      .select('meeting_id', 'artifact_type', 'status', 'payload', 'updated_at')
  ])
  const activeInviteLinks = await db('meeting_invite_links')
    .whereIn('meeting_id', meetingIds)
    .whereNull('revoked_at')
    .orderBy('created_at', 'desc')
    .select('id', 'meeting_id', 'expires_at', 'created_at')
  const manualSummaryRuntime = await getManualMeetingSummaryRuntime(db, app)
  const manualSummaryRuntimeAvailable = !!manualSummaryRuntime
  let transcriptionRuntimeAvailable = false
  try {
    transcriptionRuntimeAvailable = !!(await getActiveTranscriptionRuntime(db, app))
  } catch (error) {
    logger.warn('Could not resolve transcription runtime while serializing meeting transcript generation state', {
      error: error.message
    })
  }

  let transcriptRecordingRows = []
  try {
    transcriptRecordingRows = await db('meeting_recordings')
      .whereIn('meeting_id', meetingIds)
      .select('meeting_id', 'status', 'failure_code', 'storage_bucket', 'storage_key')
  } catch (error) {
    logger.warn('Could not load meeting recordings for transcript generation state', {
      error: error.message
    })
  }

  const participantsByMeeting = {}
  for (const participant of participants) {
    if (!participantsByMeeting[participant.meeting_id]) {
      participantsByMeeting[participant.meeting_id] = []
    }
    participantsByMeeting[participant.meeting_id].push(participant)
  }

  const artifactsByMeeting = {}
  for (const artifact of artifacts) {
    if (!artifactsByMeeting[artifact.meeting_id]) {
      artifactsByMeeting[artifact.meeting_id] = []
    }
    artifactsByMeeting[artifact.meeting_id].push(artifact)
  }

  const inviteLinkByMeetingId = {}
  for (const link of activeInviteLinks) {
    if (inviteLinkByMeetingId[link.meeting_id]) continue
    if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) continue
    inviteLinkByMeetingId[link.meeting_id] = link
  }

  const retryableTranscriptRecordingCountByMeetingId = {}
  const downloadableRecordingCountByMeetingId = {}
  for (const recording of transcriptRecordingRows) {
    if (isRegeneratableTranscriptRecording(recording)) {
      retryableTranscriptRecordingCountByMeetingId[recording.meeting_id] =
        (retryableTranscriptRecordingCountByMeetingId[recording.meeting_id] || 0) + 1
    }
    if (isDownloadableMeetingRecording(recording)) {
      downloadableRecordingCountByMeetingId[recording.meeting_id] =
        (downloadableRecordingCountByMeetingId[recording.meeting_id] || 0) + 1
    }
  }

  return rows.map((row) => {
    const meetingParticipants = participantsByMeeting[row.id] || []
    const visibleArtifacts = filterVisibleMeetingArtifacts(artifactsByMeeting[row.id] || [])
    const summaryArtifact = visibleArtifacts.find((artifact) => artifact.artifact_type === 'summary') || null
    const transcriptArtifact = visibleArtifacts.find((artifact) => artifact.artifact_type === 'transcript') || null
    const joinedUserIds = createDistinctUserSet(
      meetingParticipants,
      (participant) => !!participant?.joined_at
    )
    const messageAuthorIds = messageAuthorIdsByChannelId[row.chat_channel_id] || new Set()
    const engagedUserIds = new Set([...joinedUserIds, ...messageAuthorIds])

    return {
      ...buildMeetingSummary(row, {
        sourceChannelDisplayNameByChannelId,
        engagedParticipantCountByMeetingId: { [row.id]: engagedUserIds.size },
        summaryGenerationByMeetingId: {
          [row.id]: buildSummaryGenerationState({
            meeting: row,
            summaryArtifact,
            viewerUser,
            manualRuntimeAvailable: manualSummaryRuntimeAvailable
          })
        },
        transcriptGenerationByMeetingId: {
          [row.id]: buildTranscriptGenerationState({
            meeting: row,
            transcriptArtifact,
            viewerUser,
            transcriptionRuntimeAvailable,
            retryableRecordingCount: retryableTranscriptRecordingCountByMeetingId[row.id] || 0
          })
        },
        transcriptionRecordingByMeetingId,
        adminArtifactMenuByMeetingId: viewerUser?.is_admin === true
          ? {
              [row.id]: buildAdminArtifactMenuState({
                meeting: row,
                summaryArtifact,
                transcriptArtifact,
                viewerUser,
                downloadableRecordingCount: downloadableRecordingCountByMeetingId[row.id] || 0
              })
            }
          : {}
      }),
      detail_level: 'full',
      participants: meetingParticipants,
      artifacts: visibleArtifacts,
      guest_invite_link: viewerUser?.is_admin === true || viewerUser?.id === row.host_user_id
        ? (() => {
            const link = inviteLinkByMeetingId[row.id]
            if (!link) return null
            return {
              id: link.id,
              expires_at: link.expires_at || null,
              created_at: link.created_at || null
            }
          })()
        : null
    }
  })
}

export async function buildTranscriptionRecordingStateIndex({ db, app, rows, viewerUser = null } = {}) {
  const meetingIds = uniqueIds(rows.map((row) => row.id))
  if (meetingIds.length === 0) return {}

  let runtimeAvailable = false
  try {
    runtimeAvailable = !!(await getActiveTranscriptionRuntime(db, app))
  } catch (error) {
    logger.warn('Could not resolve transcription runtime while serializing meetings', {
      error: error.message
    })
  }

  const rowsByMeetingId = {}
  let recordingRows = []
  try {
    recordingRows = await db('meeting_recordings')
      .whereIn('meeting_id', meetingIds)
      .select('meeting_id', 'status')
  } catch (error) {
    logger.warn('Could not load meeting recording state', {
      error: error.message
    })
  }

  for (const recording of recordingRows) {
    if (!rowsByMeetingId[recording.meeting_id]) {
      rowsByMeetingId[recording.meeting_id] = []
    }
    rowsByMeetingId[recording.meeting_id].push(recording)
  }

  const states = {}
  for (const row of rows) {
    states[row.id] = buildTranscriptionRecordingState({
      meeting: row,
      stats: createRecordingStats(rowsByMeetingId[row.id] || []),
      viewerUser,
      runtimeAvailable
    })
  }

  return states
}
