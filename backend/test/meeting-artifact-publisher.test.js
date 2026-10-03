import test from 'node:test'
import assert from 'node:assert/strict'
import { publishMeetingArtifactUpdate } from '../src/channels.js'
import { createMemoryDb } from './helpers/memory-db.js'

test('artifact updates reach admins, joined former members and policy-authorized source readers without chat membership', async () => {
  for (const policy of ['all_channel_members', 'meeting_start_members', 'active_participants']) {
    const db = createMemoryDb({
      meetings: [{ id: 'meeting', status: 'ended', source_channel_id: 'source' }],
      channels: [{ id: 'source', type: 'private', meeting_history_access: policy }],
      meeting_participants: [{ meeting_id: 'meeting', user_id: 'former', joined_at: '2026-10-01' }, { meeting_id: 'meeting', user_id: 'invited', joined_at: null }],
      channel_members: ['start', 'late'].map(user_id => ({ channel_id: 'source', user_id })),
      meeting_start_members: [{ meeting_id: 'meeting', user_id: 'start' }],
      users: [{ id: 'admin', is_admin: true }]
    })
    const app = { get: () => db, channel: name => name }
    const result = await publishMeetingArtifactUpdate(app, { meetingId: 'meeting', chatChannelId: 'chat' })
    const expected = ['user/former', 'user/admin', ...(policy !== 'active_participants' ? ['user/start'] : []), ...(policy === 'all_channel_members' ? ['user/late'] : [])]
    assert.deepEqual(result.sort(), expected.sort())
  }
})
