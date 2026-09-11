import test from 'node:test'
import assert from 'node:assert/strict'
import { end } from '../src/domains/meetings/completion.js'
import { publishMeetingEnd } from '../src/channels.js'

test('committed meeting end is published before recording cleanup, even when cleanup fails', async () => {
  const order = []
  const meeting = { id: 'meeting', host_user_id: 'host', status: 'active', chat_channel_id: 'chat', source_channel_id: 'source' }
  let release
  const recording = new Promise(resolve => { release = resolve })
  const repository = {
    transaction: async work => { await work({}); order.push('commit') },
    endUpdateMeetings: async () => {}, endUpdateChannels: async () => {},
    endUpdateMeetingParticipants: async () => {}, endUpdateMeetingRecordingPauses: async () => {},
    endDeleteVoiceParticipants: async () => { order.push('voice-cleanup') },
    endFindChannels: async () => null
  }
  const completion = end({ repository,
    reads: { _getNormalizedMeetingOrThrow: async () => meeting, get: async () => ({ ...meeting, status: 'ended' }) },
    authorization: { _assertCanAccessMeeting: async () => {} },
    artifacts: { resolveEndedMeetingArtifactTypes: async () => [], emitArtifactsQueued: () => {} },
    effects: {
      emitMeeting: (event, payload) => { assert.equal(event, 'ended'); assert.equal(payload.sourceChannelId, 'source'); order.push('ended') },
      stopRecordings: async () => { order.push('recording-cleanup'); await recording; throw new Error('recording offline') },
      removeRoom: async () => { order.push('room-cleanup') }
    }, getNow: () => new Date()
  }, 'meeting', {}, { user: { id: 'host' } })
  // Wait until the deliberately pending external step is reached.
  while (!order.includes('recording-cleanup')) await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(order, ['commit', 'ended', 'recording-cleanup'])
  release()
  assert.equal((await completion).status, 'ended')
  assert.deepEqual(order, ['commit', 'ended', 'recording-cleanup', 'voice-cleanup', 'room-cleanup'])
})

test('end delivery uses authoritative current memberships and personal channels, including guests', async () => {
  let members = [
    { channel_id: 'chat', user_id: 'guest' }, { channel_id: 'source', user_id: 'member' },
    { channel_id: 'chat', user_id: 'member' }, { channel_id: 'unrelated', user_id: 'outsider' }
  ]
  const db = table => {
    if (table === 'meetings') return { where(field, id) {
      assert.equal(field, 'id'); assert.equal(id, 'meeting')
      return { first: async () => ({ chat_channel_id: 'chat', source_channel_id: 'source' }) }
    } }
    assert.equal(table, 'channel_members')
    return { whereIn(field, ids) {
      assert.equal(field, 'channel_id'); assert.deepEqual(ids, ['chat', 'source'])
      return { distinct: async () => [...new Set(members.filter(member => ids.includes(member.channel_id)).map(member => member.user_id))].map(user_id => ({ user_id })) }
    } }
  }
  const app = { get: () => db, channel: name => name }
  const event = { meetingId: 'meeting', chatChannelId: 'unrelated', sourceChannelId: 'unrelated' }
  assert.deepEqual(await publishMeetingEnd(app, event), ['user/guest', 'user/member'])
  members = members.filter(member => member.user_id !== 'member')
  assert.deepEqual(await publishMeetingEnd(app, event), ['user/guest'])
})
