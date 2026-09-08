import { notFound } from '../../lib/errors.js'
import { DEFAULT_MEETING_LANGUAGE, normalizeMeetingLanguage } from '../../lib/meeting-languages.js'
import { isOverdueScheduledMeeting } from './lifecycle.js'
import { buildMeetingSummary, buildSourceChannelDisplayNameIndex, buildTranscriptionRecordingStateIndex, enrichMeetingsWithDetails, formatCompactGroupDisplayName, isTechnicalDmSourceName, isTechnicalGroupSourceName, normalizeLabel, resolveSourceChannelDisplayName, serializeMeetings, toUniqueSortedDisplayNames } from './serializer.js'
import { resolveMeetingContentAccess, resolveMeetingContentAccessBatch } from './content-access.js'

function normalizeBoolean(value) {
  return value === true || value === 'true'
}

function normalizeMeetingDetailLevel(value) {
  return value === 'full' ? 'full' : 'summary'
}

function normalizeTimeBucket(value) {
  if (value === 'upcoming' || value === 'live' || value === 'past') {
    return value
  }
  return null
}

export async function find({ reads, authorization, getNow }, params) {
  const user = params.user
  const query = params.query || {}
  const detailLevel = normalizeMeetingDetailLevel(query.detail)
  const sourceChannelId = typeof query.source_channel_id === 'string'
    ? query.source_channel_id
    : null
  const includeEnded = normalizeBoolean(query.include_ended)
  const statusFilter = typeof query.status === 'string' ? query.status.trim() : ''
  const timeBucket = normalizeTimeBucket(query.time_bucket)
  const limit = Math.min(Math.max(Number(query.$limit) || 50, 1), 100)
  const meetingQuery = reads._baseMeetingQuery().limit(limit)
  const now = getNow()
  const nowIso = now.toISOString()

  await reads._normalizeOverdueScheduledMeetings({
    sourceChannelId,
    meetingId: typeof query.id === 'string' ? query.id : null,
    now
  })

  const canReadActiveSourceChannelMeetings = !user.is_admin
    && sourceChannelId
    && statusFilter === 'active'

  if (sourceChannelId) {
    meetingQuery.where('meetings.source_channel_id', sourceChannelId)
  }

  if (statusFilter) {
    meetingQuery.where('meetings.status', statusFilter)
  } else if (timeBucket === 'upcoming') {
    meetingQuery.where((builder) => {
      builder
        .where((scheduled) => {
          scheduled
            .where('meetings.status', 'scheduled')
            .where((window) => {
              window
                .whereNull('meetings.scheduled_end_at')
                .orWhere('meetings.scheduled_end_at', '>', nowIso)
            })
        })
        .orWhere((nested) => {
          nested
            .where('meetings.status', 'active')
            .whereNotNull('meetings.scheduled_start_at')
            .where('meetings.scheduled_start_at', '>', nowIso)
        })
    })
  } else if (timeBucket === 'live') {
    meetingQuery.where('meetings.status', 'active')
  } else if (timeBucket === 'past') {
    meetingQuery.whereIn('meetings.status', ['ended', 'cancelled'])
  } else if (!includeEnded) {
    meetingQuery.whereNotIn('meetings.status', ['ended', 'cancelled'])
  }

  if (canReadActiveSourceChannelMeetings) {
    await authorization._assertCanReadSourceChannel(sourceChannelId, user)
  } else if (!user.is_admin) {
    meetingQuery.where((builder) => {
      builder
        .whereExists(function () {
          this.select(1)
            .from('meeting_participants as visible_participant')
            .whereRaw('visible_participant.meeting_id = meetings.id')
            .andWhere('visible_participant.user_id', user.id)
        })
        .orWhere(function () {
          this.whereIn('meetings.status', ['ended', 'cancelled'])
            .whereExists(function () {
              this.select(1)
                .from('channel_members as visible_source_member')
                .whereRaw('visible_source_member.channel_id = meetings.source_channel_id')
                .andWhere('visible_source_member.user_id', user.id)
            })
        })
    })
  }

  if (timeBucket === 'upcoming') {
    meetingQuery
      .orderBy('meetings.scheduled_start_at', 'asc')
      .orderBy('meetings.created_at', 'asc')
  } else {
    meetingQuery
      .orderByRaw('COALESCE(meetings.started_at, meetings.scheduled_start_at, meetings.created_at) DESC')
      .orderBy('meetings.id', 'desc')
  }

  const rows = await meetingQuery
  const data = await reads._serializeMeetings(rows, {
    viewerUserId: user.id,
    viewerUser: user,
    detailLevel
  })

  return {
    data,
    total: data.length,
    limit
  }
}

export async function get({ reads, authorization }, id, params) {
  const meeting = await reads._getNormalizedMeetingOrThrow(id)
  const access = await reads._resolveMeetingContentAccess(meeting, params.user)
  if (!access.cardVisible || (meeting.status !== 'ended' && !access.allowed)) {
    await authorization._assertCanAccessMeeting(meeting.id, params.user, meeting)
  }

  const [enriched] = await reads._serializeMeetings([meeting], {
    viewerUserId: params.user?.id || null,
    viewerUser: params.user || null,
    detailLevel: 'full'
  })
  return enriched
}

export function _baseMeetingQuery({ repository }) {
  return repository.baseMeetingQueryFindMeetings()
}

export async function _getMeetingOrThrow({ reads }, meetingId) {
  const meeting = await reads._baseMeetingQuery().where('meetings.id', meetingId).first()
  if (!meeting) {
    throw notFound('api.meetings.meeting_not_found', {}, 'Meeting nicht gefunden')
  }
  return meeting
}

export async function _getNormalizedMeetingOrThrow({ reads, getNow }, meetingId, { now = getNow() } = {}) {
  const meeting = await reads._getMeetingOrThrow(meetingId)
  return reads._maybeNormalizeOverdueScheduledMeeting(meeting, { now })
}

export async function _maybeNormalizeOverdueScheduledMeeting({ repository, reads, effects, artifacts, normalizeOverdue, getNow }, meeting, { now = getNow() } = {}) {
  if (!isOverdueScheduledMeeting(meeting, now)) {
    return meeting
  }

  await normalizeOverdue({
    app: effects.app,
    db: repository.db,
    meeting,
    now,
    artifactDomainService: artifacts
  })

  return reads._getMeetingOrThrow(meeting.id)
}

export async function _normalizeOverdueScheduledMeetings({ repository, effects, artifacts, normalizeOverdue, getNow }, {
    sourceChannelId = null,
    meetingId = null,
    now = getNow()
  } = {}) {
  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString()
  const query = repository.normalizeOverdueScheduledMeetingsFindMeetings({ nowIso })

  if (sourceChannelId) {
    query.where('source_channel_id', sourceChannelId)
  }

  if (meetingId) {
    query.where('id', meetingId)
  }

  const overdueMeetings = await query.select('id', 'status', 'scheduled_end_at', 'chat_channel_id', 'source_channel_id')

  for (const overdueMeeting of overdueMeetings) {
    await normalizeOverdue({
      app: effects.app,
      db: repository.db,
      meeting: overdueMeeting,
      now,
      artifactDomainService: artifacts
    })
  }
}

export async function _resolveMeetingContentAccess({ repository }, meeting, user) {
  return resolveMeetingContentAccess(repository.db, {
    meetingId: meeting?.id,
    meeting,
    user
  })
}

export async function _getMeetingParticipant({ repository }, meetingId, userId) {
  return repository.getMeetingParticipantFindMeetingParticipants({ meetingId, userId })
}

export async function _findChannelById({ repository }, channelId) {
  return repository.findChannelByIdFindChannels({ channelId })
}

export async function _findChannelMembership({ repository }, channelId, userId) {
  return repository.findChannelMembershipFindChannelMembers({ channelId, userId })
}

export async function _findExistingUserIds({ repository }, userIds) {
  const users = await repository.findExistingUserIdsFindUsers({ userIds })

  return users.map((user) => user.id)
}

export function _normalizeMeetingLanguageInput(_dependencies, language) {
  if (typeof language !== 'string') return null
  return normalizeMeetingLanguage(language, DEFAULT_MEETING_LANGUAGE)
}

export async function _resolveDefaultMeetingLanguage({ repository }) {
  const row = await repository.resolveDefaultMeetingLanguageFindPlatformSettings()

  if (row?.value) {
    return normalizeMeetingLanguage(row.value, DEFAULT_MEETING_LANGUAGE)
  }

  const localeRow = await repository.resolveDefaultMeetingLanguageFindPlatformSettings2()

  return normalizeMeetingLanguage(localeRow?.value, DEFAULT_MEETING_LANGUAGE)
}

export function _normalizeLabel(_dependencies, value) {
  return normalizeLabel(value)
}

export function _isTechnicalDmSourceName(_dependencies, name, channelId = null) {
  return isTechnicalDmSourceName(name, channelId)
}

export function _isTechnicalGroupSourceName(_dependencies, name, channelId = null) {
  return isTechnicalGroupSourceName(name, channelId)
}

export function _toUniqueSortedDisplayNames(_dependencies, memberRows) {
  return toUniqueSortedDisplayNames(memberRows)
}

export function _formatCompactGroupDisplayName(_dependencies, names) {
  return formatCompactGroupDisplayName(names)
}

export async function _resolveSourceChannelDisplayName({ repository }, {
    sourceChannelId,
    sourceChannelType,
    sourceChannelName,
    viewerUserId = null
  }) {
  return resolveSourceChannelDisplayName({
    db: repository.db,
    sourceChannelId,
    sourceChannelType,
    sourceChannelName,
    viewerUserId
  })
}

export async function _buildSourceChannelDisplayNameIndex({ repository }, rows, { viewerUserId = null } = {}) {
  return buildSourceChannelDisplayNameIndex(repository.db, rows, { viewerUserId })
}

export function _buildMeetingSummary(_dependencies, row, {
    sourceChannelDisplayNameByChannelId = {},
    engagedParticipantCountByMeetingId = {},
    summaryGenerationByMeetingId = {},
    transcriptGenerationByMeetingId = {},
    transcriptionRecordingByMeetingId = {}
  } = {}) {
  return buildMeetingSummary(row, {
    sourceChannelDisplayNameByChannelId,
    engagedParticipantCountByMeetingId,
    summaryGenerationByMeetingId,
    transcriptGenerationByMeetingId,
    transcriptionRecordingByMeetingId
  })
}

export async function _serializeMeetings({ repository, reads, effects }, rows, { viewerUserId = null, viewerUser = null, detailLevel = 'summary' } = {}) {
  if (!viewerUser) {
    return serializeMeetings({
      db: repository.db,
      app: effects.app,
      rows,
      viewerUserId,
      viewerUser,
      detailLevel,
      buildSourceDisplayNameIndex: (targetRows, options) => reads._buildSourceChannelDisplayNameIndex(targetRows, options),
      buildTranscriptionStateIndex: (targetRows, options) => reads._buildTranscriptionRecordingStateIndex(targetRows, options),
      enrichMeetingDetails: (targetRows, options) => reads._enrichMeetingsWithDetails(targetRows, options)
    })
  }

  const accessByMeetingId = await resolveMeetingContentAccessBatch(repository.db, {
    meetings: rows,
    user: viewerUser
  })
  const readableRows = rows.filter((row) => {
    const access = accessByMeetingId.get(row.id)
    return access?.allowed || (row.status !== 'ended' && access?.cardVisible)
  })
  const serializedAllowed = await serializeMeetings({
    db: repository.db,
    app: effects.app,
    rows: readableRows,
    viewerUserId,
    viewerUser,
    detailLevel,
    buildSourceDisplayNameIndex: (targetRows, options) => reads._buildSourceChannelDisplayNameIndex(targetRows, options),
    buildTranscriptionStateIndex: (targetRows, options) => reads._buildTranscriptionRecordingStateIndex(targetRows, options),
    enrichMeetingDetails: (targetRows, options) => reads._enrichMeetingsWithDetails(targetRows, options)
  })
  const allowedById = Object.fromEntries(serializedAllowed.map((meeting) => [meeting.id, meeting]))

  return rows.map((row) => {
    const access = accessByMeetingId.get(row.id)
    if (access?.allowed || (row.status !== 'ended' && access?.cardVisible)) {
      return {
        ...allowedById[row.id],
        content_access: {
          allowed: true,
          denial_reason: null
        }
      }
    }

    return {
      id: row.id,
      title: row.title || null,
      status: row.status,
      source_channel_id: row.source_channel_id || null,
      scheduled_start_at: row.scheduled_start_at || null,
      scheduled_end_at: row.scheduled_end_at || null,
      cancelled_at: row.cancelled_at || null,
      started_at: row.started_at || null,
      ended_at: row.ended_at || null,
      detail_level: 'card',
      source_channel: {
        id: row.source_channel_id || null,
        name: row.source_channel_name || null,
        type: row.source_channel_type || null,
        display_name: row.source_channel_name || null
      },
      content_access: {
        allowed: false,
        denial_reason: access?.denialReason || 'channel_meeting_history_policy'
      }
    }
  })
}

export async function _enrichMeetingsWithDetails({ repository, effects }, rows, {
    viewerUserId = null,
    viewerUser = null,
    sourceChannelDisplayNameByChannelId = {},
    messageAuthorIdsByChannelId = {},
    transcriptionRecordingByMeetingId = {}
  } = {}) {
  return enrichMeetingsWithDetails({
    db: repository.db,
    app: effects.app,
    rows,
    viewerUserId,
    viewerUser,
    sourceChannelDisplayNameByChannelId,
    messageAuthorIdsByChannelId,
    transcriptionRecordingByMeetingId
  })
}

export async function _buildTranscriptionRecordingStateIndex({ repository, effects }, rows, { viewerUser = null } = {}) {
  return buildTranscriptionRecordingStateIndex({
    db: repository.db,
    app: effects.app,
    rows,
    viewerUser
  })
}
