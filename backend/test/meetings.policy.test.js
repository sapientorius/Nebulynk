import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest, Forbidden, NotFound } from '@feathersjs/errors'
import {
  assertCanAccessMeeting,
  assertCanControlTranscriptionRecording,
  assertCanInviteToMeeting,
  assertCanManageMeeting,
  assertCanUseSourceChannel,
  assertUsersExist
} from '../src/domains/meetings/policy.js'

async function assertRejectsWithCode(promise, ErrorType, errorCode) {
  await assert.rejects(
    promise,
    (error) => {
      assert.ok(error instanceof ErrorType)
      assert.equal(error.error_code, errorCode)
      return true
    }
  )
}

test('meetings policy: admin can access meetings without lookups', async () => {
  await assertCanAccessMeeting({
    meetingId: 'meeting-1',
    user: { id: 'admin-1', is_admin: true },
    findMeetingParticipant() {
      throw new Error('participant lookup should be skipped for admins')
    },
    loadMeetingById() {
      throw new Error('meeting lookup should be skipped for admins')
    },
    findChannelMembership() {
      throw new Error('membership lookup should be skipped for admins')
    }
  })
})

test('meetings policy: participant can access meeting', async () => {
  await assertCanAccessMeeting({
    meetingId: 'meeting-1',
    user: { id: 'user-1', is_admin: false },
    async findMeetingParticipant(meetingId, userId) {
      assert.equal(meetingId, 'meeting-1')
      assert.equal(userId, 'user-1')
      return { id: 'participant-1' }
    },
    loadMeetingById() {
      throw new Error('meeting lookup should be skipped for participants')
    },
    findChannelMembership() {
      throw new Error('membership lookup should be skipped for participants')
    }
  })
})

test('meetings policy: non-participant is denied access even with source context', async () => {
  await assertRejectsWithCode(
    assertCanAccessMeeting({
      meetingId: 'meeting-1',
      user: { id: 'user-1', is_admin: false },
      async findMeetingParticipant() {
        return null
      },
      async loadMeetingById() {
        return {
          id: 'meeting-1',
          status: 'active',
          source_channel_id: 'source-1',
          source_channel_type: 'public'
        }
      }
    }),
    Forbidden,
    'api.meetings.meeting_access_denied'
  )
})

test('meetings policy: missing source channel keeps existing not-found error', async () => {
  await assertRejectsWithCode(
    assertCanUseSourceChannel({
      sourceChannelId: 'missing',
      user: { id: 'user-1', is_admin: false },
      async findChannelById() {
        return null
      },
      async findChannelMembership() {
        throw new Error('membership lookup should be skipped for missing source channels')
      }
    }),
    NotFound,
    'api.meetings.source_channel_not_found'
  )
})

test('meetings policy: archived source channel cannot start meetings', async () => {
  await assertRejectsWithCode(
    assertCanUseSourceChannel({
      sourceChannelId: 'source-1',
      user: { id: 'user-1', is_admin: false },
      async findChannelById() {
        return { id: 'source-1', is_archived: true }
      },
      async findChannelMembership() {
        throw new Error('membership lookup should be skipped for archived source channels')
      }
    }),
    BadRequest,
    'api.meetings.source_channel_archived'
  )
})

test('meetings policy: invalid invitee IDs keep existing bad-request error', async () => {
  await assertRejectsWithCode(
    assertUsersExist({
      userIds: ['user-1', 'missing-user'],
      async findExistingUserIds() {
        return ['user-1']
      }
    }),
    BadRequest,
    'api.meetings.one_or_more_user_ids_invalid'
  )
})

test('meetings policy: host and admin can invite without source-context lookups', async () => {
  for (const user of [
    { id: 'host-1', is_admin: false },
    { id: 'admin-1', is_admin: true }
  ]) {
    await assertCanInviteToMeeting({
      meeting: {
        id: 'meeting-1',
        host_user_id: 'host-1',
        source_channel_id: 'source-1'
      },
      user,
      findChannelById() {
        throw new Error('source lookup should be skipped for host/admin')
      },
      findChannelMembership() {
        throw new Error('membership lookup should be skipped for host/admin')
      }
    })
  }
})

test('meetings policy: non-host cannot invite even if source context exists', async () => {
  await assertRejectsWithCode(
    assertCanInviteToMeeting({
      meeting: {
        id: 'meeting-1',
        host_user_id: 'host-1',
        source_channel_id: 'source-1'
      },
      user: { id: 'user-1', is_admin: false },
      async findChannelById() {
        return { id: 'source-1', type: 'public' }
      }
    }),
    Forbidden,
    'api.meetings.invite_forbidden'
  )
})

test('meetings policy: host or admin can manage meeting', () => {
  assert.doesNotThrow(() => assertCanManageMeeting({
    meeting: { id: 'meeting-1', host_user_id: 'host-1' },
    user: { id: 'host-1', is_admin: false }
  }))

  assert.doesNotThrow(() => assertCanManageMeeting({
    meeting: { id: 'meeting-1', host_user_id: 'host-1' },
    user: { id: 'admin-1', is_admin: true }
  }))
})

test('meetings policy: non-host cannot manage meeting', () => {
  assert.throws(
    () => assertCanManageMeeting({
      meeting: { id: 'meeting-1', host_user_id: 'host-1' },
      user: { id: 'user-1', is_admin: false }
    }),
    (error) => {
      assert.ok(error instanceof Forbidden)
      assert.equal(error.error_code, 'api.meetings.manage_forbidden')
      return true
    }
  )
})

test('meetings policy: host or admin can control transcription recording', () => {
  assertCanControlTranscriptionRecording({
    meeting: { id: 'meeting-1', host_user_id: 'host-1' },
    user: { id: 'host-1', is_admin: false }
  })

  assertCanControlTranscriptionRecording({
    meeting: { id: 'meeting-1', host_user_id: 'host-1' },
    user: { id: 'admin-1', is_admin: true }
  })
})

test('meetings policy: non-host cannot control transcription recording', () => {
  assert.throws(
    () => assertCanControlTranscriptionRecording({
      meeting: { id: 'meeting-1', host_user_id: 'host-1' },
      user: { id: 'user-1', is_admin: false }
    }),
    (error) => {
      assert.ok(error instanceof Forbidden)
      assert.equal(error.error_code, 'api.meetings.transcription_recording_control_forbidden')
      return true
    }
  )
})
