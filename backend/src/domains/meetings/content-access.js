import { forbidden, notFound } from '../../lib/errors.js'
import { createId } from '@paralleldrive/cuid2'
import {
  DEFAULT_MEETING_HISTORY_ACCESS,
  MEETING_HISTORY_ACCESS,
  normalizeMeetingHistoryAccess
} from '../../lib/meeting-history-access.js'

const POLICY_DENIAL_REASON = 'channel_meeting_history_policy'

async function loadMeetingForAccess(db, meetingId) {
  return db('meetings')
    .leftJoin('channels as source_channel', 'source_channel.id', 'meetings.source_channel_id')
    .where('meetings.id', meetingId)
    .select(
      'meetings.*',
      'source_channel.type as source_channel_type',
      'source_channel.meeting_history_access as source_channel_meeting_history_access'
    )
    .first()
}

async function loadParticipant(db, meetingId, userId) {
  if (!userId) return null
  return db('meeting_participants')
    .where({ meeting_id: meetingId, user_id: userId })
    .first()
}

async function loadSourceMembership(db, sourceChannelId, userId) {
  if (!sourceChannelId || !userId) return null
  return db('channel_members')
    .where({ channel_id: sourceChannelId, user_id: userId })
    .first()
}

async function hasMeetingStartSnapshot(db, meetingId, userId) {
  if (!meetingId || !userId) return false
  const row = await db('meeting_start_members')
    .where({ meeting_id: meetingId, user_id: userId })
    .first()
  return !!row
}

function accessResult({ allowed, cardVisible, policy = null }) {
  return {
    allowed: !!allowed,
    cardVisible: !!cardVisible,
    policy,
    denialReason: allowed ? null : POLICY_DENIAL_REASON
  }
}

export async function resolveMeetingContentAccess(db, {
  meetingId,
  meeting: preloadedMeeting = null,
  user
}) {
  if (user?.is_admin === true) {
    return accessResult({ allowed: true, cardVisible: true, policy: null })
  }

  let meeting = preloadedMeeting
  if (!meeting
    || meeting.source_channel_type === undefined
    || meeting.source_channel_meeting_history_access === undefined) {
    meeting = await loadMeetingForAccess(db, meetingId || meeting?.id)
  }

  if (!meeting) {
    throw notFound('api.meetings.meeting_not_found', {}, 'Meeting nicht gefunden')
  }

  const userId = user?.id || null
  const [participant, sourceMembership] = await Promise.all([
    loadParticipant(db, meeting.id, userId),
    loadSourceMembership(db, meeting.source_channel_id, userId)
  ])
  const cardVisible = !!participant || !!sourceMembership

  // Scheduling and live-call access intentionally keep the established invite rules.
  if (meeting.status !== 'ended') {
    return accessResult({
      allowed: !!participant,
      cardVisible,
      policy: null
    })
  }

  // Direct messages are intentionally outside the configurable history policy.
  if (meeting.source_channel_type === 'dm') {
    return accessResult({
      allowed: !!participant,
      cardVisible,
      policy: null
    })
  }

  const policy = normalizeMeetingHistoryAccess(
    meeting.source_channel_meeting_history_access,
    DEFAULT_MEETING_HISTORY_ACCESS
  )
  const activelyParticipated = !!participant?.joined_at

  if (activelyParticipated) {
    return accessResult({ allowed: true, cardVisible: true, policy })
  }

  if (policy === MEETING_HISTORY_ACCESS.ALL_CHANNEL_MEMBERS) {
    return accessResult({ allowed: !!sourceMembership, cardVisible, policy })
  }

  if (policy === MEETING_HISTORY_ACCESS.MEETING_START_MEMBERS) {
    const inStartSnapshot = sourceMembership
      ? await hasMeetingStartSnapshot(db, meeting.id, userId)
      : false
    return accessResult({ allowed: inStartSnapshot, cardVisible, policy })
  }

  return accessResult({ allowed: false, cardVisible, policy })
}

export async function assertCanAccessMeetingContent(db, args) {
  const access = await resolveMeetingContentAccess(db, args)
  if (access.allowed) return access

  throw forbidden(
    'api.meetings.meeting_access_denied',
    { denial_reason: access.denialReason },
    'Kein Zugriff auf dieses Meeting'
  )
}

export async function resolveChannelReadAccess(db, { channelId, user }) {
  if (user?.is_admin === true) return { allowed: true, membership: null, meetingAccess: null }
  if (!channelId || !user?.id) return { allowed: false, membership: null, meetingAccess: null }

  const channel = await db('channels').where('id', channelId).first()
  if (!channel) return { allowed: false, membership: null, meetingAccess: null }

  const membership = await db('channel_members')
    .where({ channel_id: channelId, user_id: user.id })
    .first()

  if (channel.purpose !== 'meeting') {
    return { allowed: !!membership, membership, meetingAccess: null }
  }

  const meetingReference = await db('meetings')
    .where('chat_channel_id', channelId)
    .select('id')
    .first()
  const meeting = meetingReference?.id
    ? await loadMeetingForAccess(db, meetingReference.id)
    : null
  if (!meeting) return { allowed: false, membership, meetingAccess: null }

  if (meeting.status !== 'ended') {
    return { allowed: !!membership, membership, meetingAccess: null }
  }

  const meetingAccess = await resolveMeetingContentAccess(db, { meeting, user })
  return {
    allowed: meetingAccess.allowed,
    membership,
    meetingAccess
  }
}

export async function assertCanReadChannel(db, args) {
  const access = await resolveChannelReadAccess(db, args)
  if (access.allowed) return access

  throw forbidden(
    'api.channels.membership_required',
    { channel_id: args.channelId },
    'You are not allowed to read this channel'
  )
}

export async function snapshotMeetingStartMembers(db, {
  meetingId,
  sourceChannelId,
  sourceChannelType = null,
  nowIso = new Date().toISOString()
}) {
  if (!meetingId || !sourceChannelId) return 0

  let channelType = sourceChannelType
  if (!channelType) {
    const channel = await db('channels').where('id', sourceChannelId).select('type').first()
    channelType = channel?.type || null
  }
  if (!['public', 'private', 'group'].includes(channelType)) return 0

  const members = await db('channel_members')
    .where('channel_id', sourceChannelId)
    .select('user_id')
  if (members.length === 0) return 0

  await db('meeting_start_members')
    .insert(members.map((member) => ({
      id: createId(),
      meeting_id: meetingId,
      user_id: member.user_id,
      created_at: nowIso
    })))
    .onConflict(['meeting_id', 'user_id'])
    .ignore()

  return members.length
}

export const MEETING_CONTENT_POLICY_DENIAL_REASON = POLICY_DENIAL_REASON

export function buildMeetingContentAccessSql(meetingIdExpression, userId) {
  return {
    sql: `EXISTS (
      SELECT 1
      FROM meetings access_meeting
      LEFT JOIN channels access_source ON access_source.id = access_meeting.source_channel_id
      WHERE access_meeting.id = ${meetingIdExpression}
        AND (
          (access_meeting.status <> 'ended' AND EXISTS (
            SELECT 1 FROM meeting_participants access_participant
            WHERE access_participant.meeting_id = access_meeting.id
              AND access_participant.user_id = ?
          ))
          OR
          (access_meeting.status = 'ended' AND (
            EXISTS (
              SELECT 1 FROM meeting_participants access_joined
              WHERE access_joined.meeting_id = access_meeting.id
                AND access_joined.user_id = ?
                AND access_joined.joined_at IS NOT NULL
            )
            OR (access_source.type = 'dm' AND EXISTS (
              SELECT 1 FROM meeting_participants access_dm_participant
              WHERE access_dm_participant.meeting_id = access_meeting.id
                AND access_dm_participant.user_id = ?
            ))
            OR (COALESCE(access_source.meeting_history_access, 'all_channel_members') = 'all_channel_members'
              AND EXISTS (
                SELECT 1 FROM channel_members access_current_member
                WHERE access_current_member.channel_id = access_meeting.source_channel_id
                  AND access_current_member.user_id = ?
              ))
            OR (access_source.meeting_history_access = 'meeting_start_members'
              AND EXISTS (
                SELECT 1 FROM channel_members access_snapshot_current
                WHERE access_snapshot_current.channel_id = access_meeting.source_channel_id
                  AND access_snapshot_current.user_id = ?
              )
              AND EXISTS (
                SELECT 1 FROM meeting_start_members access_snapshot
                WHERE access_snapshot.meeting_id = access_meeting.id
                  AND access_snapshot.user_id = ?
              ))
          ))
        )
    )`,
    bindings: [userId, userId, userId, userId, userId, userId]
  }
}

export function buildChannelReadAccessSql(channelIdExpression, userId) {
  const meetingAccess = buildMeetingContentAccessSql('access_channel_meeting.id', userId)
  return {
    sql: `EXISTS (
      SELECT 1
      FROM channels access_channel
      LEFT JOIN meetings access_channel_meeting ON access_channel_meeting.chat_channel_id = access_channel.id
      WHERE access_channel.id = ${channelIdExpression}
        AND (
          (access_channel.purpose <> 'meeting' AND EXISTS (
            SELECT 1 FROM channel_members access_channel_member
            WHERE access_channel_member.channel_id = access_channel.id
              AND access_channel_member.user_id = ?
          ))
          OR (access_channel.purpose = 'meeting' AND ${meetingAccess.sql})
        )
    )`,
    bindings: [userId, ...meetingAccess.bindings]
  }
}
