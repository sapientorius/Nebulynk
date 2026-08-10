import test from 'node:test'
import assert from 'node:assert/strict'
import { Forbidden } from '@feathersjs/errors'
import {
  assertCanAccessMeetingContent,
  evaluateMeetingContentAccess,
  resolveChannelReadAccess,
  resolveMeetingContentAccess,
  resolveMeetingContentAccessBatch,
  snapshotMeetingStartMembers
} from '../src/domains/meetings/content-access.js'
import { createMeetingsService } from './helpers/meetings-service.js'

function createPolicyDb({ participant = null, sourceMember = false, startMember = false } = {}) {
  return (table) => {
    const criteria = {
      equals: {},
      in: {}
    }
    const rows = table === 'meeting_participants'
      ? (participant ? [participant] : [])
      : (table === 'channel_members'
          ? (sourceMember ? [{ channel_id: 'source-1', user_id: 'user-1' }] : [])
          : (table === 'meeting_start_members'
              ? (startMember ? [{ meeting_id: 'meeting-1', user_id: 'user-1' }] : [])
              : null))
    if (!rows) {
      throw new Error(`Unexpected table: ${table}`)
    }
    const matches = (row) => Object.entries(criteria.equals).every(([column, value]) => row[column] === value)
      && Object.entries(criteria.in).every(([column, values]) => values.has(row[column]))
    const builder = {
      where(nextCriteria) {
        Object.assign(criteria.equals, nextCriteria || {})
        return builder
      },
      whereIn(column, values) {
        criteria.in[column] = new Set(values)
        return builder
      },
      andWhere(column, value) {
        criteria.equals[column] = value
        return builder
      },
      async first() {
        return rows.find(matches) || null
      },
      async select() {
        return rows.filter(matches)
      }
    }
    return builder
  }
}

function endedMeeting(policy = 'all_channel_members', sourceType = 'private') {
  return {
    id: 'meeting-1',
    status: 'ended',
    source_channel_id: 'source-1',
    source_channel_type: sourceType,
    source_channel_meeting_history_access: policy
  }
}

const user = { id: 'user-1', is_admin: false }

function createBatchPolicyDb({ participants = [], sourceMemberships = [], startSnapshots = [] } = {}) {
  const calls = []
  const db = (table) => {
    calls.push(table)
    const criteria = {
      equals: {},
      in: {}
    }
    const builder = {
      whereIn(column, values) {
        criteria.in[column] = new Set(values)
        return builder
      },
      andWhere(column, value) {
        criteria.equals[column] = value
        return builder
      },
      select: async () => {
        const rows = table === 'meeting_participants'
          ? participants
          : (table === 'channel_members'
              ? sourceMemberships
              : (table === 'meeting_start_members' ? startSnapshots : []))
        return rows.filter((row) => Object.entries(criteria.equals).every(([column, value]) => row[column] === value)
          && Object.entries(criteria.in).every(([column, values]) => values.has(row[column])))
      }
    }
    return builder
  }
  db.calls = calls
  return db
}

function createChannelContextDb(row) {
  const calls = []
  const db = (table) => {
    calls.push(table)
    const builder = {
      leftJoin(_table, callback) {
        if (typeof callback === 'function') {
          const join = {
            on() { return join },
            andOnVal() { return join }
          }
          callback.call(join)
        }
        return builder
      },
      where() { return builder },
      select() { return builder },
      async first() { return row }
    }
    return builder
  }
  db.calls = calls
  return db
}

test('meeting content access: all current channel members can read ended meetings', async () => {
  const access = await resolveMeetingContentAccess(createPolicyDb({ sourceMember: true }), {
    meeting: endedMeeting('all_channel_members'),
    user
  })
  assert.equal(access.allowed, true)
  assert.equal(access.cardVisible, true)
})

test('meeting content access: start-member policy requires current membership and snapshot', async () => {
  const allowed = await resolveMeetingContentAccess(createPolicyDb({ sourceMember: true, startMember: true }), {
    meeting: endedMeeting('meeting_start_members'),
    user
  })
  const lateMember = await resolveMeetingContentAccess(createPolicyDb({ sourceMember: true, startMember: false }), {
    meeting: endedMeeting('meeting_start_members'),
    user
  })
  const formerNonParticipant = await resolveMeetingContentAccess(createPolicyDb({ sourceMember: false, startMember: true }), {
    meeting: endedMeeting('meeting_start_members'),
    user
  })

  assert.equal(allowed.allowed, true)
  assert.equal(lateMember.allowed, false)
  assert.equal(lateMember.cardVisible, true)
  assert.equal(formerNonParticipant.allowed, false)
})

test('meeting content access: joined participants retain access under every policy', async () => {
  for (const policy of ['all_channel_members', 'meeting_start_members', 'active_participants']) {
    const access = await resolveMeetingContentAccess(createPolicyDb({
      participant: {
        meeting_id: 'meeting-1',
        user_id: 'user-1',
        joined_at: '2026-08-10T10:00:00.000Z'
      }
    }), {
      meeting: endedMeeting(policy),
      user
    })
    assert.equal(access.allowed, true, policy)
  }
})

test('meeting content access: invitation alone is denied by active-participant policy but keeps card visible', async () => {
  const db = createPolicyDb({
    participant: {
      meeting_id: 'meeting-1',
      user_id: 'user-1',
      joined_at: null
    }
  })
  const access = await resolveMeetingContentAccess(db, {
    meeting: endedMeeting('active_participants'),
    user
  })

  assert.equal(access.allowed, false)
  assert.equal(access.cardVisible, true)
  await assert.rejects(
    assertCanAccessMeetingContent(db, { meeting: endedMeeting('active_participants'), user }),
    Forbidden
  )
})

test('meeting content access: admins bypass policy and direct messages retain participant access', async () => {
  const adminAccess = await resolveMeetingContentAccess(() => {
    throw new Error('admin access must not query')
  }, {
    meeting: endedMeeting('active_participants'),
    user: { id: 'admin-1', is_admin: true }
  })
  const dmAccess = await resolveMeetingContentAccess(createPolicyDb({
    participant: { meeting_id: 'meeting-1', user_id: 'user-1', joined_at: null }
  }), {
    meeting: endedMeeting('active_participants', 'dm'),
    user
  })

  assert.equal(adminAccess.allowed, true)
  assert.equal(dmAccess.allowed, true)
})

test('meeting content access: unrelated users cannot see even the meeting card', async () => {
  const access = await resolveMeetingContentAccess(createPolicyDb(), {
    meeting: endedMeeting('all_channel_members'),
    user
  })

  assert.equal(access.allowed, false)
  assert.equal(access.cardVisible, false)
})

test('meeting content access: pure policy evaluation covers all historic access states', () => {
  const cases = [
    {
      name: 'all current members',
      meeting: endedMeeting('all_channel_members'),
      sourceMembership: { id: 'member-1' },
      expected: { allowed: true, cardVisible: true }
    },
    {
      name: 'start member requires its snapshot',
      meeting: endedMeeting('meeting_start_members'),
      sourceMembership: { id: 'member-1' },
      hasStartSnapshot: false,
      expected: { allowed: false, cardVisible: true }
    },
    {
      name: 'invited active-participant member sees only a card',
      meeting: endedMeeting('active_participants'),
      participant: { id: 'participant-1', joined_at: null },
      expected: { allowed: false, cardVisible: true }
    },
    {
      name: 'joined participant keeps access after leaving',
      meeting: endedMeeting('active_participants'),
      participant: { id: 'participant-1', joined_at: '2026-08-10T10:00:00.000Z' },
      expected: { allowed: true, cardVisible: true }
    },
    {
      name: 'DM invitations keep their participant access',
      meeting: endedMeeting('active_participants', 'dm'),
      participant: { id: 'participant-1', joined_at: null },
      expected: { allowed: true, cardVisible: true }
    }
  ]

  for (const entry of cases) {
    const access = evaluateMeetingContentAccess({ meeting: entry.meeting, user, ...entry })
    assert.equal(access.allowed, entry.expected.allowed, entry.name)
    assert.equal(access.cardVisible, entry.expected.cardVisible, entry.name)
  }

  const adminAccess = evaluateMeetingContentAccess({
    meeting: endedMeeting('active_participants'),
    user: { id: 'admin-1', is_admin: true }
  })
  assert.equal(adminAccess.allowed, true)
  assert.equal(adminAccess.cardVisible, true)
})

test('meeting content access: single and batch resolvers agree for each policy state', async () => {
  const cases = [
    { policy: 'all_channel_members', sourceMember: true },
    { policy: 'meeting_start_members', sourceMember: true, startMember: true },
    { policy: 'active_participants', participant: { meeting_id: 'meeting-1', user_id: user.id, joined_at: null } },
    { policy: 'active_participants', participant: { meeting_id: 'meeting-1', user_id: user.id, joined_at: '2026-08-10T10:00:00.000Z' } },
    { policy: 'active_participants', sourceType: 'dm', participant: { meeting_id: 'meeting-1', user_id: user.id, joined_at: null } }
  ]

  for (const entry of cases) {
    const meeting = endedMeeting(entry.policy, entry.sourceType || 'private')
    const single = await resolveMeetingContentAccess(createPolicyDb({
      participant: entry.participant || null,
      sourceMember: !!entry.sourceMember,
      startMember: !!entry.startMember
    }), { meeting, user })
    const batch = await resolveMeetingContentAccessBatch(createBatchPolicyDb({
      participants: entry.participant ? [entry.participant] : [],
      sourceMemberships: entry.sourceMember ? [{ channel_id: 'source-1', user_id: user.id }] : [],
      startSnapshots: entry.startMember ? [{ meeting_id: 'meeting-1', user_id: user.id }] : []
    }), { meetings: [meeting], user })

    assert.deepEqual(batch.get(meeting.id), single, entry.policy)
  }

  const admin = { id: 'admin-1', is_admin: true }
  const adminBatch = await resolveMeetingContentAccessBatch(() => {
    throw new Error('admins must not load batch access context')
  }, {
    meetings: [endedMeeting('active_participants')],
    user: admin
  })
  assert.equal(adminBatch.get('meeting-1').allowed, true)
})

test('meeting content access: batch resolution has a fixed three-query budget and preserves policy results', async () => {
  const meetings = Array.from({ length: 100 }, (_, index) => {
    const policy = index % 3 === 0
      ? 'all_channel_members'
      : (index % 3 === 1 ? 'meeting_start_members' : 'active_participants')
    return {
      ...endedMeeting(policy),
      id: `meeting-${index}`,
      source_channel_id: `source-${index}`
    }
  })
  const db = createBatchPolicyDb({
    participants: [{
      meeting_id: 'meeting-2',
      user_id: user.id,
      joined_at: '2026-08-10T10:00:00.000Z'
    }],
    sourceMemberships: meetings.map((meeting) => ({
      channel_id: meeting.source_channel_id,
      user_id: user.id
    })),
    startSnapshots: [{ meeting_id: 'meeting-1', user_id: user.id }]
  })

  const accessByMeetingId = await resolveMeetingContentAccessBatch(db, { meetings, user })

  assert.deepEqual(db.calls, [
    'meeting_participants',
    'channel_members',
    'meeting_start_members'
  ])
  assert.equal(accessByMeetingId.get('meeting-0').allowed, true)
  assert.equal(accessByMeetingId.get('meeting-1').allowed, true)
  assert.equal(accessByMeetingId.get('meeting-2').allowed, true)
  assert.equal(accessByMeetingId.get('meeting-5').allowed, false)
  assert.equal(accessByMeetingId.get('meeting-5').cardVisible, true)
})

test('meeting content access: batch resolution skips snapshot queries when no start-member policy is present', async () => {
  const db = createBatchPolicyDb({
    sourceMemberships: [{ channel_id: 'source-1', user_id: user.id }]
  })

  const accessByMeetingId = await resolveMeetingContentAccessBatch(db, {
    meetings: [endedMeeting('all_channel_members')],
    user
  })

  assert.deepEqual(db.calls, ['meeting_participants', 'channel_members'])
  assert.equal(accessByMeetingId.get('meeting-1').allowed, true)
})

test('meeting content access: batch query budget stays bounded for 1, 50, and 100 cards', async () => {
  for (const count of [1, 50, 100]) {
    const meetings = Array.from({ length: count }, (_, index) => ({
      ...endedMeeting('meeting_start_members'),
      id: `meeting-${index}`,
      source_channel_id: `source-${index}`
    }))
    const db = createBatchPolicyDb({
      sourceMemberships: meetings.map((meeting) => ({ channel_id: meeting.source_channel_id, user_id: user.id })),
      startSnapshots: meetings.map((meeting) => ({ meeting_id: meeting.id, user_id: user.id }))
    })

    await resolveMeetingContentAccessBatch(db, { meetings, user })
    assert.ok(db.calls.length <= 3, `${count} cards used ${db.calls.length} access queries`)
    assert.deepEqual(db.calls, ['meeting_participants', 'channel_members', 'meeting_start_members'])
  }
})

test('meeting content access: channel reads use one joined access-context query', async () => {
  const db = createChannelContextDb({
    read_channel_id: 'meeting-chat-1',
    read_channel_purpose: 'meeting',
    membership_id: null,
    access_meeting_id: 'meeting-1',
    access_meeting_status: 'ended',
    access_meeting_source_channel_id: 'source-1',
    access_source_channel_type: 'private',
    access_source_channel_meeting_history_access: 'meeting_start_members',
    access_source_membership_id: 'source-membership-1',
    access_participant_id: null,
    access_participant_joined_at: null,
    access_snapshot_id: 'snapshot-1'
  })

  const access = await resolveChannelReadAccess(db, {
    channelId: 'meeting-chat-1',
    user
  })

  assert.deepEqual(db.calls, ['channels as read_channel'])
  assert.equal(access.allowed, true)
  assert.equal(access.meetingAccess.allowed, true)
})

test('meeting content access: regular and active meeting channel reads retain a one-query budget', async () => {
  const regularDb = createChannelContextDb({
    read_channel_id: 'channel-1',
    read_channel_purpose: 'default',
    membership_id: 'membership-1',
    membership_channel_id: 'channel-1',
    membership_user_id: user.id
  })
  const activeMeetingDb = createChannelContextDb({
    read_channel_id: 'meeting-chat-1',
    read_channel_purpose: 'meeting',
    membership_id: 'membership-1',
    membership_channel_id: 'meeting-chat-1',
    membership_user_id: user.id,
    access_meeting_id: 'meeting-1',
    access_meeting_status: 'active'
  })

  assert.equal((await resolveChannelReadAccess(regularDb, { channelId: 'channel-1', user })).allowed, true)
  assert.equal((await resolveChannelReadAccess(activeMeetingDb, { channelId: 'meeting-chat-1', user })).allowed, true)
  assert.deepEqual(regularDb.calls, ['channels as read_channel'])
  assert.deepEqual(activeMeetingDb.calls, ['channels as read_channel'])
})

test('meeting details redact protected fields for card-visible denied users', async () => {
  const db = createPolicyDb({ sourceMember: true })
  const service = createMeetingsService({ db })
  const [meeting] = await service._serializeMeetings([{
    ...endedMeeting('active_participants'),
    title: 'Quarterly planning',
    description: 'Confidential details',
    chat_channel_id: 'meeting-chat-1',
    started_at: '2026-08-10T10:00:00.000Z',
    ended_at: '2026-08-10T11:00:00.000Z',
    source_channel_name: 'planning',
    mini_summary: 'Do not expose',
    recording_status: 'ready'
  }], {
    viewerUserId: user.id,
    viewerUser: user,
    detailLevel: 'full'
  })

  assert.deepEqual(meeting.content_access, {
    allowed: false,
    denial_reason: 'channel_meeting_history_policy'
  })
  assert.equal(meeting.detail_level, 'card')
  assert.equal(meeting.title, 'Quarterly planning')
  for (const protectedField of [
    'description',
    'chat_channel_id',
    'participants',
    'engaged_participant_count',
    'artifacts',
    'mini_summary',
    'recording_status'
  ]) {
    assert.equal(protectedField in meeting, false, protectedField)
  }
})

test('meeting start snapshots capture all source members and ignore direct messages', async () => {
  const insertedRows = []
  const db = (table) => {
    if (table === 'channel_members') {
      return {
        where() { return this },
        andWhere() { return this },
        orderBy() { return this },
        limit() { return this },
        select: async () => [{ user_id: 'user-1' }, { user_id: 'user-2' }]
      }
    }
    if (table === 'meeting_start_members') {
      const builder = {
        insert(rows) {
          insertedRows.push(...rows)
          return builder
        },
        onConflict() { return builder },
        ignore: async () => undefined
      }
      return builder
    }
    throw new Error(`Unexpected table: ${table}`)
  }

  const count = await snapshotMeetingStartMembers(db, {
    meetingId: 'meeting-1',
    sourceChannelId: 'source-1',
    sourceChannelType: 'private',
    nowIso: '2026-08-10T10:00:00.000Z'
  })
  const dmCount = await snapshotMeetingStartMembers(db, {
    meetingId: 'meeting-dm',
    sourceChannelId: 'dm-1',
    sourceChannelType: 'dm'
  })

  assert.equal(count, 2)
  assert.equal(dmCount, 0)
  assert.deepEqual(insertedRows.map((row) => row.user_id), ['user-1', 'user-2'])
})

test('meeting start snapshots page source members in bounded batches', async () => {
  const members = Array.from({ length: 501 }, (_, index) => ({
    user_id: `user-${String(index).padStart(4, '0')}`
  }))
  const insertedBatches = []
  const db = (table) => {
    if (table === 'channel_members') {
      let afterUserId = null
      const builder = {
        where() { return builder },
        orderBy() { return builder },
        limit() { return builder },
        andWhere(_column, _operator, value) {
          afterUserId = value
          return builder
        },
        async select() {
          return members
            .filter((member) => !afterUserId || member.user_id > afterUserId)
            .slice(0, 500)
        }
      }
      return builder
    }
    if (table === 'meeting_start_members') {
      const builder = {
        insert(rows) {
          insertedBatches.push(rows)
          return builder
        },
        onConflict() { return builder },
        async ignore() { return undefined }
      }
      return builder
    }
    throw new Error(`Unexpected table: ${table}`)
  }

  const count = await snapshotMeetingStartMembers(db, {
    meetingId: 'meeting-1',
    sourceChannelId: 'source-1',
    sourceChannelType: 'private'
  })

  assert.equal(count, 501)
  assert.deepEqual(insertedBatches.map((batch) => batch.length), [500, 1])
})
