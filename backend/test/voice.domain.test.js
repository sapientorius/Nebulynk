import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest, Forbidden, NotFound } from '@feathersjs/errors'
import { VoiceDomainService } from '../src/domains/voice/service.js'

function createDomainService({
  repositoryOverrides = {},
  createIdFn = () => 'voice-participant-1'
} = {}) {
  const state = {
    participants: [{ id: 'existing', channel_id: 'voice-1', user_id: 'user-2' }],
    insertedMembers: []
  }

  const repository = {
    async findChannelById(channelId) {
      if (channelId === 'voice-1') {
        return { id: channelId, name: 'Voice 1', type: 'public', is_voice: true, is_archived: false }
      }
      if (channelId === 'archived-voice') {
        return { id: channelId, name: 'Voice 2', type: 'public', is_voice: true, is_archived: true }
      }
      if (channelId === 'text-1') {
        return { id: channelId, name: 'Text', type: 'public', is_voice: false, is_archived: false }
      }
      return null
    },
    async findVoiceParticipantByUserId(userId) {
      return state.participants.find((entry) => entry.user_id === userId) || null
    },
    async insertVoiceParticipant(participant) {
      state.participants.push({ ...participant })
    },
    async updateVoiceParticipant(channelId, userId, patchData) {
      const participant = state.participants.find((entry) => (
        entry.channel_id === channelId && entry.user_id === userId
      ))
      if (!participant) return []
      Object.assign(participant, patchData)
      return [{ ...participant }]
    },
    async deleteVoiceParticipant(channelId, userId) {
      const index = state.participants.findIndex((entry) => (
        entry.channel_id === channelId && entry.user_id === userId
      ))
      if (index < 0) return 0
      state.participants.splice(index, 1)
      return 1
    },
    async deleteVoiceParticipantById(participantId) {
      const index = state.participants.findIndex((entry) => entry.id === participantId)
      if (index < 0) return 0
      state.participants.splice(index, 1)
      return 1
    },
    async countVoiceParticipants(channelId) {
      const count = state.participants.filter((entry) => entry.channel_id === channelId).length
      return { count: String(count) }
    },
    async findChannelMembership(channelId, userId) {
      const inserted = state.insertedMembers.find((member) => (
        member.channel_id === channelId && member.user_id === userId
      ))
      if (inserted) return inserted

      if (channelId === 'voice-1' && userId === 'user-1') {
        return { channel_id: channelId, user_id: userId }
      }
      return null
    },
    async findMembershipChannelIds(userId) {
      if (userId === 'user-1') return ['voice-1']
      return []
    },
    async insertChannelMembership(member) {
      state.insertedMembers.push({ ...member })
    },
    async findParticipantsByChannelId(channelId) {
      return state.participants.filter((entry) => entry.channel_id === channelId)
    },
    async findParticipantsByChannelIds(channelIds) {
      return state.participants.filter((entry) => channelIds.includes(entry.channel_id))
    },
    async findAllParticipants() {
      return state.participants.map((entry) => ({ ...entry }))
    },
    ...repositoryOverrides
  }

  return {
    service: new VoiceDomainService({ repository, createIdFn }),
    state
  }
}

test('voice policy: join rejects missing channels', async () => {
  const { service } = createDomainService()
  await assert.rejects(service.resolveJoinChannel('missing'), NotFound)
})

test('voice policy: join rejects non-voice and archived channels', async () => {
  const { service } = createDomainService()
  await assert.rejects(service.resolveJoinChannel('text-1'), BadRequest)
  await assert.rejects(service.resolveJoinChannel('archived-voice'), BadRequest)
})

test('voice behavior: find requires join_voice_channels permission for external non-admin', async () => {
  const { service } = createDomainService()

  await assert.rejects(
    service.findParticipants({
      provider: 'rest',
      user: { id: 'user-1', is_admin: false },
      query: { channel_id: 'voice-1' },
      resolvePermissions: async () => ({ permissions: [] })
    }),
    Forbidden
  )
})

test('voice behavior: find allows guest members without join_voice_channels permission', async () => {
  const { service } = createDomainService()

  const result = await service.findParticipants({
    provider: 'rest',
    user: { id: 'user-1', is_admin: false, account_type: 'guest' },
    query: { channel_id: 'voice-1' },
    resolvePermissions: async () => ({ permissions: [] })
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].user_id, 'user-2')
})

test('voice behavior: find by channel checks membership for external non-admin', async () => {
  const { service } = createDomainService()

  await assert.rejects(
    service.findParticipants({
      provider: 'rest',
      user: { id: 'user-2', is_admin: false },
      query: { channel_id: 'voice-1' },
      resolvePermissions: async () => ({ permissions: ['join_voice_channels'] })
    }),
    Forbidden
  )
})

test('voice behavior: find by channel returns participants for authorized user', async () => {
  const { service } = createDomainService()

  const result = await service.findParticipants({
    provider: 'rest',
    user: { id: 'user-1', is_admin: false },
    query: { channel_id: 'voice-1' },
    resolvePermissions: async () => ({ permissions: ['join_voice_channels'] })
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].user_id, 'user-2')
})

test('voice behavior: update rejects users outside voice channel', async () => {
  const { service } = createDomainService()
  await assert.rejects(
    service.updateParticipant('voice-1', 'user-1', { is_muted: true }),
    NotFound
  )
})

test('voice behavior: leave reports cleanup when channel becomes empty', async () => {
  const { service, state } = createDomainService({
    repositoryOverrides: {
      async findVoiceParticipantByUserId(userId) {
        return state.participants.find((entry) => entry.user_id === userId) || null
      }
    }
  })

  state.participants.push({
    id: 'participant-user-1',
    channel_id: 'voice-1',
    user_id: 'user-1',
    is_muted: false,
    is_deafened: false
  })

  const result = await service.leaveParticipant('voice-1', 'user-2')
  assert.equal(result.left, true)
  assert.equal(result.cleanupRoom, false)

  const second = await service.leaveParticipant('voice-1', 'user-1')
  assert.equal(second.left, true)
  assert.equal(second.cleanupRoom, true)
})

test('voice behavior: removeParticipantByUser returns null when user is not in voice', async () => {
  const { service } = createDomainService()
  const result = await service.removeParticipantByUser('missing-user')
  assert.equal(result, null)
})
