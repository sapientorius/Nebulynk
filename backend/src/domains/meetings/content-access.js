import { forbidden, notFound } from '../../lib/errors.js'
import { createId } from '@paralleldrive/cuid2'
import {
  DEFAULT_MEETING_HISTORY_ACCESS,
  MEETING_HISTORY_ACCESS,
  normalizeMeetingHistoryAccess
} from '../../lib/meeting-history-access.js'

const POLICY_DENIAL_REASON = 'channel_meeting_history_policy'
export const MEETING_START_SNAPSHOT_BATCH_SIZE = 500

function uniqueIds(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))]
}

function hasMeetingAccessMetadata(meeting) {
  return !!meeting
    && meeting.source_channel_type !== undefined
    && meeting.source_channel_meeting_history_access !== undefined
}

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

async function loadMeetingsForAccess(db, meetingIds) {
  if (meetingIds.length === 0) return []

  return db('meetings')
    .leftJoin('channels as source_channel', 'source_channel.id', 'meetings.source_channel_id')
    .whereIn('meetings.id', meetingIds)
    .select(
      'meetings.*',
      'source_channel.type as source_channel_type',
      'source_channel.meeting_history_access as source_channel_meeting_history_access'
    )
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

function needsMeetingStartSnapshot(meeting, participant, sourceMembership) {
  if (!meeting || meeting.status !== 'ended' || meeting.source_channel_type === 'dm') return false
  if (!sourceMembership || participant?.joined_at) return false

  return normalizeMeetingHistoryAccess(
    meeting.source_channel_meeting_history_access,
    DEFAULT_MEETING_HISTORY_ACCESS
  ) === MEETING_HISTORY_ACCESS.MEETING_START_MEMBERS
}

export function evaluateMeetingContentAccess({
  meeting,
  user,
  participant = null,
  sourceMembership = null,
  hasStartSnapshot = false
}) {
  if (user?.is_admin === true) {
    return accessResult({ allowed: true, cardVisible: true, policy: null })
  }

  const cardVisible = !!participant || !!sourceMembership

  if (meeting.status !== 'ended') {
    return accessResult({
      allowed: !!participant,
      cardVisible,
      policy: null
    })
  }

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

  if (participant?.joined_at) {
    return accessResult({ allowed: true, cardVisible: true, policy })
  }

  if (policy === MEETING_HISTORY_ACCESS.ALL_CHANNEL_MEMBERS) {
    return accessResult({ allowed: !!sourceMembership, cardVisible, policy })
  }

  if (policy === MEETING_HISTORY_ACCESS.MEETING_START_MEMBERS) {
    return accessResult({ allowed: !!sourceMembership && hasStartSnapshot, cardVisible, policy })
  }

  return accessResult({ allowed: false, cardVisible, policy })
}

export async function resolveMeetingContentAccessBatch(db, {
  meetings = [],
  user
} = {}) {
  const requestedMeetings = [...new Map(
    meetings
      .filter((meeting) => meeting?.id)
      .map((meeting) => [meeting.id, meeting])
  ).values()]

  if (requestedMeetings.length === 0) return new Map()

  if (user?.is_admin === true) {
    return new Map(requestedMeetings.map((meeting) => [
      meeting.id,
      evaluateMeetingContentAccess({ meeting, user })
    ]))
  }

  const missingMetadataIds = requestedMeetings
    .filter((meeting) => !hasMeetingAccessMetadata(meeting))
    .map((meeting) => meeting.id)
  const loadedById = missingMetadataIds.length > 0
    ? new Map((await loadMeetingsForAccess(db, missingMetadataIds)).map((meeting) => [meeting.id, meeting]))
    : new Map()
  const resolvedMeetings = requestedMeetings.map((meeting) => {
    if (hasMeetingAccessMetadata(meeting)) return meeting
    const loadedMeeting = loadedById.get(meeting.id)
    if (!loadedMeeting) {
      throw notFound('api.meetings.meeting_not_found', {}, 'Meeting nicht gefunden')
    }
    return loadedMeeting
  })

  const userId = user?.id || null
  if (!userId) {
    return new Map(resolvedMeetings.map((meeting) => [
      meeting.id,
      evaluateMeetingContentAccess({ meeting, user })
    ]))
  }

  const meetingIds = resolvedMeetings.map((meeting) => meeting.id)
  const sourceChannelIds = uniqueIds(resolvedMeetings.map((meeting) => meeting.source_channel_id))
  const [participants, sourceMemberships] = await Promise.all([
    db('meeting_participants')
      .whereIn('meeting_id', meetingIds)
      .andWhere('user_id', userId)
      .select('meeting_id', 'user_id', 'joined_at'),
    sourceChannelIds.length > 0
      ? db('channel_members')
        .whereIn('channel_id', sourceChannelIds)
        .andWhere('user_id', userId)
        .select('channel_id', 'user_id')
      : Promise.resolve([])
  ])
  const participantByMeetingId = new Map(participants.map((participant) => [participant.meeting_id, participant]))
  const sourceMembershipByChannelId = new Map(
    sourceMemberships.map((membership) => [membership.channel_id, membership])
  )

  const startSnapshotMeetingIds = resolvedMeetings
    .filter((meeting) => needsMeetingStartSnapshot(
      meeting,
      participantByMeetingId.get(meeting.id),
      sourceMembershipByChannelId.get(meeting.source_channel_id)
    ))
    .map((meeting) => meeting.id)
  const startSnapshots = startSnapshotMeetingIds.length > 0
    ? await db('meeting_start_members')
      .whereIn('meeting_id', startSnapshotMeetingIds)
      .andWhere('user_id', userId)
      .select('meeting_id')
    : []
  const startSnapshotMeetingIdSet = new Set(startSnapshots.map((snapshot) => snapshot.meeting_id))

  return new Map(resolvedMeetings.map((meeting) => [
    meeting.id,
    evaluateMeetingContentAccess({
      meeting,
      user,
      participant: participantByMeetingId.get(meeting.id) || null,
      sourceMembership: sourceMembershipByChannelId.get(meeting.source_channel_id) || null,
      hasStartSnapshot: startSnapshotMeetingIdSet.has(meeting.id)
    })
  ]))
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
  if (!meeting || !hasMeetingAccessMetadata(meeting)) {
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
  const startSnapshot = needsMeetingStartSnapshot(meeting, participant, sourceMembership)
    ? await hasMeetingStartSnapshot(db, meeting.id, userId)
    : false

  return evaluateMeetingContentAccess({
    meeting,
    user,
    participant,
    sourceMembership,
    hasStartSnapshot: startSnapshot
  })
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

function serializeMembershipContext(row) {
  if (!row?.membership_id) return null
  return {
    id: row.membership_id,
    channel_id: row.membership_channel_id,
    user_id: row.membership_user_id,
    role: row.membership_role,
    last_read_at: row.membership_last_read_at,
    notifications: row.membership_notifications,
    created_at: row.membership_created_at,
    updated_at: row.membership_updated_at
  }
}

async function loadChannelReadContext(db, channelId, userId) {
  return db('channels as read_channel')
    .leftJoin('channel_members as chat_membership', function () {
      this.on('chat_membership.channel_id', '=', 'read_channel.id')
        .andOnVal('chat_membership.user_id', userId)
    })
    .leftJoin('meetings as channel_meeting', 'channel_meeting.chat_channel_id', 'read_channel.id')
    .leftJoin('channels as source_channel', 'source_channel.id', 'channel_meeting.source_channel_id')
    .leftJoin('channel_members as source_membership', function () {
      this.on('source_membership.channel_id', '=', 'source_channel.id')
        .andOnVal('source_membership.user_id', userId)
    })
    .leftJoin('meeting_participants as access_participant', function () {
      this.on('access_participant.meeting_id', '=', 'channel_meeting.id')
        .andOnVal('access_participant.user_id', userId)
    })
    .leftJoin('meeting_start_members as access_snapshot', function () {
      this.on('access_snapshot.meeting_id', '=', 'channel_meeting.id')
        .andOnVal('access_snapshot.user_id', userId)
    })
    .where('read_channel.id', channelId)
    .select(
      'read_channel.id as read_channel_id',
      'read_channel.purpose as read_channel_purpose',
      'chat_membership.id as membership_id',
      'chat_membership.channel_id as membership_channel_id',
      'chat_membership.user_id as membership_user_id',
      'chat_membership.role as membership_role',
      'chat_membership.last_read_at as membership_last_read_at',
      'chat_membership.notifications as membership_notifications',
      'chat_membership.created_at as membership_created_at',
      'chat_membership.updated_at as membership_updated_at',
      'channel_meeting.id as access_meeting_id',
      'channel_meeting.status as access_meeting_status',
      'channel_meeting.source_channel_id as access_meeting_source_channel_id',
      'source_channel.type as access_source_channel_type',
      'source_channel.meeting_history_access as access_source_channel_meeting_history_access',
      'source_membership.id as access_source_membership_id',
      'access_participant.id as access_participant_id',
      'access_participant.joined_at as access_participant_joined_at',
      'access_snapshot.id as access_snapshot_id'
    )
    .first()
}

export async function resolveChannelReadAccess(db, { channelId, user }) {
  if (user?.is_admin === true) return { allowed: true, membership: null, meetingAccess: null }
  if (!channelId || !user?.id) return { allowed: false, membership: null, meetingAccess: null }

  const context = await loadChannelReadContext(db, channelId, user.id)
  if (!context) return { allowed: false, membership: null, meetingAccess: null }

  const membership = serializeMembershipContext(context)
  if (context.read_channel_purpose !== 'meeting') {
    return { allowed: !!membership, membership, meetingAccess: null }
  }

  if (!context.access_meeting_id) {
    return { allowed: false, membership, meetingAccess: null }
  }

  if (context.access_meeting_status !== 'ended') {
    return { allowed: !!membership, membership, meetingAccess: null }
  }

  const meetingAccess = evaluateMeetingContentAccess({
    meeting: {
      id: context.access_meeting_id,
      status: context.access_meeting_status,
      source_channel_id: context.access_meeting_source_channel_id,
      source_channel_type: context.access_source_channel_type,
      source_channel_meeting_history_access: context.access_source_channel_meeting_history_access
    },
    user,
    participant: context.access_participant_id
      ? { id: context.access_participant_id, joined_at: context.access_participant_joined_at }
      : null,
    sourceMembership: context.access_source_membership_id
      ? { id: context.access_source_membership_id }
      : null,
    hasStartSnapshot: !!context.access_snapshot_id
  })

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

async function loadSnapshotMemberPage(db, { sourceChannelId, afterUserId = null }) {
  const query = db('channel_members')
    .where('channel_id', sourceChannelId)
    .orderBy('user_id', 'asc')
    .limit(MEETING_START_SNAPSHOT_BATCH_SIZE)

  if (afterUserId) {
    query.andWhere('user_id', '>', afterUserId)
  }

  return query.select('user_id')
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

  let afterUserId = null
  let count = 0
  while (true) {
    const members = await loadSnapshotMemberPage(db, { sourceChannelId, afterUserId })
    if (members.length === 0) break

    await db('meeting_start_members')
      .insert(members.map((member) => ({
        id: createId(),
        meeting_id: meetingId,
        user_id: member.user_id,
        created_at: nowIso
      })))
      .onConflict(['meeting_id', 'user_id'])
      .ignore()

    count += members.length
    afterUserId = members[members.length - 1].user_id
    if (members.length < MEETING_START_SNAPSHOT_BATCH_SIZE) break
  }

  return count
}

export const MEETING_CONTENT_POLICY_DENIAL_REASON = POLICY_DENIAL_REASON

export function buildAccessibleMeetingIdsSql(userId) {
  return {
    sql: `(
      SELECT access_nonended_meeting.id AS meeting_id
      FROM meeting_participants access_nonended_participant
      JOIN meetings access_nonended_meeting ON access_nonended_meeting.id = access_nonended_participant.meeting_id
      WHERE access_nonended_participant.user_id = ?
        AND access_nonended_meeting.status <> 'ended'
      UNION
      SELECT access_joined_meeting.id AS meeting_id
      FROM meeting_participants access_joined_participant
      JOIN meetings access_joined_meeting ON access_joined_meeting.id = access_joined_participant.meeting_id
      WHERE access_joined_participant.user_id = ?
        AND access_joined_participant.joined_at IS NOT NULL
        AND access_joined_meeting.status = 'ended'
      UNION
      SELECT access_dm_meeting.id AS meeting_id
      FROM meeting_participants access_dm_participant
      JOIN meetings access_dm_meeting ON access_dm_meeting.id = access_dm_participant.meeting_id
      JOIN channels access_dm_source ON access_dm_source.id = access_dm_meeting.source_channel_id
      WHERE access_dm_participant.user_id = ?
        AND access_dm_meeting.status = 'ended'
        AND access_dm_source.type = 'dm'
      UNION
      SELECT access_current_meeting.id AS meeting_id
      FROM channel_members access_current_member
      JOIN meetings access_current_meeting ON access_current_meeting.source_channel_id = access_current_member.channel_id
      JOIN channels access_current_source ON access_current_source.id = access_current_meeting.source_channel_id
      WHERE access_current_member.user_id = ?
        AND access_current_meeting.status = 'ended'
        AND COALESCE(access_current_source.meeting_history_access, 'all_channel_members') = 'all_channel_members'
      UNION
      SELECT access_snapshot_meeting.id AS meeting_id
      FROM channel_members access_snapshot_current
      JOIN meetings access_snapshot_meeting ON access_snapshot_meeting.source_channel_id = access_snapshot_current.channel_id
      JOIN channels access_snapshot_source ON access_snapshot_source.id = access_snapshot_meeting.source_channel_id
      JOIN meeting_start_members access_snapshot ON (
        access_snapshot.meeting_id = access_snapshot_meeting.id
        AND access_snapshot.user_id = access_snapshot_current.user_id
      )
      WHERE access_snapshot_current.user_id = ?
        AND access_snapshot_meeting.status = 'ended'
        AND access_snapshot_source.meeting_history_access = 'meeting_start_members'
    )`,
    bindings: [userId, userId, userId, userId, userId]
  }
}

export function buildCurrentReadableChannelIdsSql(userId) {
  return {
    sql: `(
      SELECT access_regular_member.channel_id
      FROM channel_members access_regular_member
      JOIN channels access_regular_channel ON access_regular_channel.id = access_regular_member.channel_id
      WHERE access_regular_member.user_id = ?
        AND COALESCE(access_regular_channel.purpose, 'default') <> 'meeting'
    )`,
    bindings: [userId]
  }
}

export function buildAccessibleChannelIdsSql(userId) {
  const regularChannels = buildCurrentReadableChannelIdsSql(userId)
  const meetings = buildAccessibleMeetingIdsSql(userId)
  return {
    sql: `(
      SELECT access_regular_channel_ids.channel_id
      FROM ${regularChannels.sql} AS access_regular_channel_ids
      UNION
      SELECT access_meeting.chat_channel_id AS channel_id
      FROM meetings access_meeting
      JOIN ${meetings.sql} AS access_meeting_ids ON access_meeting_ids.meeting_id = access_meeting.id
    )`,
    bindings: [...regularChannels.bindings, ...meetings.bindings]
  }
}

export function buildAccessibleContentScopeSql(userId, {
  meetingCteName = 'accessible_meeting_ids',
  channelCteName = 'accessible_channel_ids'
} = {}) {
  const meetings = buildAccessibleMeetingIdsSql(userId)
  const regularChannels = buildCurrentReadableChannelIdsSql(userId)
  return {
    sql: `WITH ${meetingCteName} AS ${meetings.sql},
      ${channelCteName} AS (
        SELECT access_regular_channel_ids.channel_id
        FROM ${regularChannels.sql} AS access_regular_channel_ids
        UNION
        SELECT access_meeting.chat_channel_id AS channel_id
        FROM meetings access_meeting
        JOIN ${meetingCteName} AS access_meeting_ids ON access_meeting_ids.meeting_id = access_meeting.id
      )`,
    bindings: [...meetings.bindings, ...regularChannels.bindings],
    meetingCteName,
    channelCteName
  }
}

export function buildMeetingContentAccessSql(meetingIdExpression, userId) {
  const meetingIds = buildAccessibleMeetingIdsSql(userId)
  return {
    sql: `${meetingIdExpression} IN ${meetingIds.sql}`,
    bindings: meetingIds.bindings
  }
}

export function buildChannelReadAccessSql(channelIdExpression, userId) {
  const channelIds = buildAccessibleChannelIdsSql(userId)
  return {
    sql: `${channelIdExpression} IN ${channelIds.sql}`,
    bindings: channelIds.bindings
  }
}
