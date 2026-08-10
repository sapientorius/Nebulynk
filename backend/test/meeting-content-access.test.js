import test from 'node:test'
import assert from 'node:assert/strict'
import { Forbidden } from '@feathersjs/errors'
import {
  assertCanAccessMeetingContent,
  resolveMeetingContentAccess,
  snapshotMeetingStartMembers
} from '../src/domains/meetings/content-access.js'
import { createMeetingsService } from './helpers/meetings-service.js'

function createPolicyDb({ participant = null, sourceMember = false, startMember = false } = {}) {
  return (table) => {
    let criteria = {}
    return {
      where(nextCriteria) {
        criteria = nextCriteria || {}
        return this
      },
      async first() {
        if (table === 'meeting_participants') {
          return participant && participant.meeting_id === criteria.meeting_id
            && participant.user_id === criteria.user_id
            ? participant
            : null
        }
        if (table === 'channel_members') {
          return sourceMember ? { channel_id: criteria.channel_id, user_id: criteria.user_id } : null
        }
        if (table === 'meeting_start_members') {
          return startMember ? { meeting_id: criteria.meeting_id, user_id: criteria.user_id } : null
        }
        throw new Error(`Unexpected table: ${table}`)
      }
    }
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
