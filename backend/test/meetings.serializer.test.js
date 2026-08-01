import test from 'node:test'
import assert from 'node:assert/strict'
import { encryptSecret } from '../src/lib/ai-secrets.js'
import { MEETING_RECORDING_STATUS } from '../src/lib/meeting-recordings.js'
import {
  buildSourceChannelDisplayNameIndex,
  serializeMeetings
} from '../src/domains/meetings/serializer.js'
import { createMeetingsService } from './helpers/meetings-service.js'

function createSourceDisplayDb(memberRows) {
  return (table) => {
    if (table === 'channel_members') {
      const builder = {
        join() { return builder },
        whereIn() { return builder },
        async select() { return memberRows }
      }
      return builder
    }
    throw new Error(`Unexpected table: ${table}`)
  }
}

function createRuntimeConfigDb({ participants = [], artifacts = [], messages = [], recordings = [], inviteLinks = [] } = {}) {
  return (table) => {
    if (table === 'messages') {
      const builder = {
        whereIn() { return builder },
        where() { return builder },
        whereNull() { return builder },
        async distinct() { return messages }
      }
      return builder
    }

    if (table === 'meeting_participants') {
      const builder = {
        join() { return builder },
        leftJoin() { return builder },
        whereIn() { return builder },
        whereNotNull() { return builder },
        async select() { return participants }
      }
      return builder
    }

    if (table === 'meeting_artifacts') {
      const builder = {
        whereIn() { return builder },
        async select() { return artifacts }
      }
      return builder
    }

    if (table === 'meeting_recordings') {
      const builder = {
        whereIn() { return builder },
        async select() { return recordings }
      }
      return builder
    }

    if (table === 'meeting_invite_links') {
      const builder = {
        whereIn() { return builder },
        whereNull() { return builder },
        orderBy() { return builder },
        async select() { return inviteLinks }
      }
      return builder
    }

    if (table === 'ai_function_configs') {
      return {
        where() { return this },
        whereNotNull() { return this },
        first: async () => undefined
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  }
}

const meetingRow = {
  id: 'meeting-1',
  title: 'Weekly Sync',
  status: 'ended',
  source_channel_id: 'source-1',
  chat_channel_id: 'meeting-channel-1',
  host_user_id: 'host-1',
  started_at: '2026-03-13T10:00:00.000Z',
  ended_at: '2026-03-13T10:30:00.000Z',
  ended_by: 'host-1',
  source_channel_name: 'general',
  source_channel_type: 'private',
  chat_channel_name: 'meeting-meeting-1',
  chat_channel_purpose: 'meeting',
  chat_channel_is_voice: true,
  chat_channel_is_archived: true
}

test('meetings serializer: source display names handle DM and group technical names', async () => {
  const db = createSourceDisplayDb([
    { channel_id: 'dm-source', user_id: 'self', display_name: 'Self' },
    { channel_id: 'dm-source', user_id: 'alex', display_name: 'Alex' },
    { channel_id: 'group-source', user_id: 'self', display_name: 'Self' },
    { channel_id: 'group-source', user_id: 'alex', display_name: 'Alex' },
    { channel_id: 'group-source', user_id: 'sam', display_name: 'Sam' },
    { channel_id: 'group-source', user_id: 'lee', display_name: 'Lee' }
  ])

  const result = await buildSourceChannelDisplayNameIndex(db, [
    {
      source_channel_id: 'dm-source',
      source_channel_type: 'dm',
      source_channel_name: 'dm-dm-source'
    },
    {
      source_channel_id: 'group-source',
      source_channel_type: 'group',
      source_channel_name: 'group-group-source'
    },
    {
      source_channel_id: 'named-group',
      source_channel_type: 'group',
      source_channel_name: 'Produkt Team'
    }
  ], { viewerUserId: 'self' })

  assert.equal(result['dm-source'], 'Alex')
  assert.equal(result['group-source'], 'Alex, Lee +1')
  assert.equal(result['named-group'], 'Produkt Team')
})

test('meetings serializer: summary payload omits full detail collections and keeps engaged count', async () => {
  const db = createRuntimeConfigDb({
    participants: [
      { meeting_id: 'meeting-1', user_id: 'user-joined' },
      { meeting_id: 'meeting-1', user_id: 'user-overlap' }
    ],
    messages: [
      { channel_id: 'meeting-channel-1', user_id: 'user-overlap' },
      { channel_id: 'meeting-channel-1', user_id: 'user-message-only' }
    ]
  })

  const [meeting] = await serializeMeetings({
    db,
    app: {},
    rows: [{ ...meetingRow, status: 'active', ended_at: null, ended_by: null }],
    viewerUserId: 'user-joined',
    detailLevel: 'summary',
    buildSourceDisplayNameIndex: async () => ({ 'source-1': 'General' }),
    buildTranscriptionStateIndex: async () => ({})
  })

  assert.equal(meeting.detail_level, 'summary')
  assert.equal(meeting.engaged_participant_count, 3)
  assert.equal(meeting.source_channel.display_name, 'General')
  assert.equal('participants' in meeting, false)
  assert.equal('artifacts' in meeting, false)
})

test('meetings serializer: full payload includes participants, visible artifacts, and generation state', async () => {
  const db = createRuntimeConfigDb({
    participants: [{
      meeting_id: 'meeting-1',
      user_id: 'host-1',
      role: 'host',
      invite_status: 'left',
      invited_at: '2026-03-13T10:00:00.000Z',
      joined_at: '2026-03-13T10:00:00.000Z',
      left_at: '2026-03-13T10:30:00.000Z',
      display_name: 'Host',
      account_type: 'guest',
      avatar_url: null,
      status: 'offline'
    }],
    artifacts: [
      {
        meeting_id: 'meeting-1',
        artifact_type: 'summary',
        status: 'pending',
        payload: null,
        updated_at: '2026-03-13T10:31:00.000Z'
      },
      {
        meeting_id: 'meeting-1',
        artifact_type: 'transcript',
        status: 'failed',
        payload: { warnings: [{ code: 'transcription_failed' }] },
        updated_at: '2026-03-13T10:32:00.000Z'
      }
    ],
    recordings: [{
      meeting_id: 'meeting-1',
      status: MEETING_RECORDING_STATUS.READY,
      failure_code: null,
      storage_bucket: 'recordings',
      storage_key: 'meeting-1/audio.mp4'
    }]
  })

  const [meeting] = await serializeMeetings({
    db,
    app: {},
    rows: [meetingRow],
    viewerUserId: 'host-1',
    viewerUser: { id: 'host-1', is_admin: false },
    detailLevel: 'full',
    buildSourceDisplayNameIndex: async () => ({ 'source-1': 'General' }),
    buildTranscriptionStateIndex: async () => ({})
  })

  assert.equal(meeting.detail_level, 'full')
  assert.equal(meeting.engaged_participant_count, 1)
  assert.equal(meeting.participants.length, 1)
  assert.equal(meeting.participants[0].account_type, 'guest')
  assert.deepEqual(meeting.artifacts, [{
    meeting_id: 'meeting-1',
    artifact_type: 'transcript',
    status: 'failed',
    payload: { warnings: [{ code: 'transcription_failed' }] },
    updated_at: '2026-03-13T10:32:00.000Z'
  }])
  assert.deepEqual(meeting.summary_generation, {
    available: false,
    allowed: false,
    action: 'generate',
    reason: 'missing_runtime'
  })
  assert.deepEqual(meeting.transcript_generation, {
    available: false,
    allowed: false,
    action: 'retry',
    reason: 'missing_runtime'
  })
})

test('meetings serializer: full payload selects participant account types from users', async () => {
  const participantSelectCalls = []
  const db = (table) => {
    if (table === 'messages') {
      const builder = {
        whereIn() { return builder },
        where() { return builder },
        whereNull() { return builder },
        async distinct() { return [] }
      }
      return builder
    }

    if (table === 'meeting_participants') {
      const builder = {
        join() { return builder },
        leftJoin() { return builder },
        whereIn() { return builder },
        async select(...args) {
          participantSelectCalls.push(args)
          return [{
            meeting_id: 'meeting-1',
            user_id: 'guest-1',
            role: 'participant',
            invite_status: 'joined',
            invited_at: '2026-03-13T10:00:00.000Z',
            joined_at: '2026-03-13T10:05:00.000Z',
            left_at: null,
            display_name: 'Gast Eins',
            account_type: 'guest',
            avatar_url: null,
            status: 'offline',
            chat_last_read_at: null
          }]
        }
      }
      return builder
    }

    if (table === 'meeting_artifacts') {
      const builder = {
        whereIn() { return builder },
        async select() { return [] }
      }
      return builder
    }

    if (table === 'meeting_recordings') {
      const builder = {
        whereIn() { return builder },
        async select() { return [] }
      }
      return builder
    }

    if (table === 'meeting_invite_links') {
      const builder = {
        whereIn() { return builder },
        whereNull() { return builder },
        orderBy() { return builder },
        async select() { return [] }
      }
      return builder
    }

    if (table === 'ai_function_configs') {
      return {
        where() { return this },
        whereNotNull() { return this },
        first: async () => undefined
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  }

  const [meeting] = await serializeMeetings({
    db,
    app: {},
    rows: [meetingRow],
    viewerUserId: 'host-1',
    viewerUser: { id: 'host-1', is_admin: false },
    detailLevel: 'full',
    buildSourceDisplayNameIndex: async () => ({ 'source-1': 'General' }),
    buildTranscriptionStateIndex: async () => ({})
  })

  assert.equal(participantSelectCalls.length, 1)
  assert.ok(participantSelectCalls[0].includes('users.account_type'))
  assert.equal(meeting.participants[0].account_type, 'guest')
})

test('meetings find: defaults to lightweight summary payloads', async () => {
  const rows = [{
    id: 'meeting-summary-1',
    title: 'Ops Sync',
    status: 'active',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1',
    started_at: '2026-03-16T10:00:00.000Z',
    ended_at: null,
    ended_by: null,
    source_channel_name: 'general',
    source_channel_type: 'private',
    chat_channel_name: 'meeting-meeting-summary-1',
    chat_channel_purpose: 'meeting',
    chat_channel_is_voice: true,
    chat_channel_is_archived: false
  }]

  const service = createMeetingsService({
    db: () => {
      throw new Error('db should not be called directly in this test')
    }
  })
  service._normalizeOverdueScheduledMeetings = async () => {}

  service._baseMeetingQuery = () => ({
    orderBy() { return this },
    orderByRaw() { return this },
    limit() { return this },
    where() { return this },
    whereNotIn() { return this },
    join() { return this },
    then(resolve) { return Promise.resolve(rows).then(resolve) }
  })
  service._serializeMeetings = async (inputRows, options) => inputRows.map((row) => ({
    id: row.id,
    detail_level: options.detailLevel,
    engaged_participant_count: 2,
    source_channel: { id: row.source_channel_id },
    chat_channel: { id: row.chat_channel_id }
  }))

  const result = await service.find({
    user: { id: 'user-1', is_admin: true },
    query: {}
  })

  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].detail_level, 'summary')
  assert.equal('participants' in result.data[0], false)
  assert.equal('artifacts' in result.data[0], false)
})

test('meetings find: detail=full keeps compatibility payloads', async () => {
  const rows = [{
    id: 'meeting-full-1',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1'
  }]

  const service = createMeetingsService({
    db: () => {
      throw new Error('db should not be called directly in this test')
    }
  })
  service._normalizeOverdueScheduledMeetings = async () => {}

  service._baseMeetingQuery = () => ({
    orderBy() { return this },
    orderByRaw() { return this },
    limit() { return this },
    where() { return this },
    whereNotIn() { return this },
    join() { return this },
    then(resolve) { return Promise.resolve(rows).then(resolve) }
  })
  service._serializeMeetings = async (inputRows, options) => inputRows.map((row) => ({
    id: row.id,
    detail_level: options.detailLevel,
    participants: [],
    artifacts: []
  }))

  const result = await service.find({
    user: { id: 'user-1', is_admin: true },
    query: { detail: 'full' }
  })

  assert.equal(result.data[0].detail_level, 'full')
  assert.deepEqual(result.data[0].participants, [])
  assert.deepEqual(result.data[0].artifacts, [])
})

test('meetings display names: DM source resolves other participant instead of technical name', async () => {
  const db = createSourceDisplayDb([
    { channel_id: 'dm-source', user_id: 'user-self', display_name: 'Self' },
    { channel_id: 'dm-source', user_id: 'user-2', display_name: 'Alex' }
  ])
  const service = createMeetingsService({ db })

  const result = await service._buildSourceChannelDisplayNameIndex([{
    source_channel_id: 'dm-source',
    source_channel_type: 'dm',
    source_channel_name: 'dm-dm-source'
  }], { viewerUserId: 'user-self' })

  assert.equal(result['dm-source'], 'Alex')
})

test('meetings display names: unnamed group source resolves compact participant list', async () => {
  const db = createSourceDisplayDb([
    { channel_id: 'group-source', user_id: 'user-self', display_name: 'Self' },
    { channel_id: 'group-source', user_id: 'user-2', display_name: 'Alex' },
    { channel_id: 'group-source', user_id: 'user-3', display_name: 'Sam' },
    { channel_id: 'group-source', user_id: 'user-4', display_name: 'Lee' }
  ])
  const service = createMeetingsService({ db })

  const result = await service._buildSourceChannelDisplayNameIndex([{
    source_channel_id: 'group-source',
    source_channel_type: 'group',
    source_channel_name: 'group-group-source'
  }], { viewerUserId: 'user-self' })

  assert.equal(result['group-source'], 'Alex, Lee +1')
})

test('meetings display names: named group source keeps custom group name', async () => {
  const db = createSourceDisplayDb([])
  const service = createMeetingsService({ db })

  const result = await service._buildSourceChannelDisplayNameIndex([{
    source_channel_id: 'group-source',
    source_channel_type: 'group',
    source_channel_name: 'Produkt Team'
  }], { viewerUserId: 'user-self' })

  assert.equal(result['group-source'], 'Produkt Team')
})

test('meetings serialization: summary payload omits participants and artifacts but keeps engaged count', async () => {
  const db = (table) => {
    if (table === 'meeting_participants') {
      const builder = {
        whereIn() { return builder },
        whereNotNull() { return builder },
        async select() {
          return [
            { meeting_id: 'meeting-1', user_id: 'user-joined' },
            { meeting_id: 'meeting-1', user_id: 'user-overlap' }
          ]
        }
      }
      return builder
    }

    if (table === 'messages') {
      const builder = {
        whereIn() { return builder },
        where() { return builder },
        whereNull() { return builder },
        async distinct() {
          return [
            { channel_id: 'meeting-channel-1', user_id: 'user-overlap' },
            { channel_id: 'meeting-channel-1', user_id: 'user-message-only' }
          ]
        }
      }
      return builder
    }

    if (table === 'meeting_recordings') {
      const builder = {
        whereIn() { return builder },
        async select() { return [] }
      }
      return builder
    }

    if (table === 'meeting_invite_links') {
      const builder = {
        whereIn() { return builder },
        whereNull() { return builder },
        orderBy() { return builder },
        async select() { return [] }
      }
      return builder
    }

    if (table === 'ai_function_configs') {
      return {
        where() { return this },
        whereNotNull() { return this },
        first: async () => undefined
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  }

  const service = createMeetingsService({ db })
  service._buildSourceChannelDisplayNameIndex = async () => ({
    'source-1': 'General'
  })

  const [meeting] = await service._serializeMeetings([{
    id: 'meeting-1',
    title: 'Weekly Sync',
    status: 'active',
    source_channel_id: 'source-1',
    chat_channel_id: 'meeting-channel-1',
    host_user_id: 'user-joined',
    started_at: '2026-03-13T10:00:00.000Z',
    ended_at: null,
    ended_by: null,
    source_channel_name: 'general',
    source_channel_type: 'private',
    chat_channel_name: 'meeting-meeting-1',
    chat_channel_purpose: 'meeting',
    chat_channel_is_voice: true,
    chat_channel_is_archived: false
  }], { viewerUserId: 'user-joined', detailLevel: 'summary' })

  assert.equal(meeting.detail_level, 'summary')
  assert.equal(meeting.engaged_participant_count, 3)
  assert.equal('participants' in meeting, false)
  assert.equal('artifacts' in meeting, false)
})

test('meetings serialization: full payload keeps participants and artifacts', async () => {
  const db = (table) => {
    if (table === 'meeting_participants') {
      const builder = {
        join() { return builder },
        leftJoin() { return builder },
        whereIn() { return builder },
        async select() {
          return [
            {
              meeting_id: 'meeting-1',
              user_id: 'user-joined',
              role: 'host',
              invite_status: 'left',
              invited_at: '2026-03-13T10:00:00.000Z',
              joined_at: '2026-03-13T10:00:00.000Z',
              left_at: '2026-03-13T10:30:00.000Z',
              display_name: 'Joined User',
              avatar_url: null,
              status: 'offline'
            },
            {
              meeting_id: 'meeting-1',
              user_id: 'user-invited-only',
              role: 'participant',
              invite_status: 'invited',
              invited_at: '2026-03-13T10:01:00.000Z',
              joined_at: null,
              left_at: null,
              display_name: 'Invited Only',
              avatar_url: null,
              status: 'offline'
            },
            {
              meeting_id: 'meeting-1',
              user_id: 'user-overlap',
              role: 'participant',
              invite_status: 'joined',
              invited_at: '2026-03-13T10:02:00.000Z',
              joined_at: '2026-03-13T10:05:00.000Z',
              left_at: '2026-03-13T10:20:00.000Z',
              display_name: 'Overlap User',
              avatar_url: null,
              status: 'offline'
            }
          ]
        }
      }
      return builder
    }

    if (table === 'meeting_artifacts') {
      const builder = {
        whereIn() { return builder },
        async select() { return [] }
      }
      return builder
    }

    if (table === 'meeting_recordings') {
      const builder = {
        whereIn() { return builder },
        async select() { return [] }
      }
      return builder
    }

    if (table === 'meeting_invite_links') {
      const builder = {
        whereIn() { return builder },
        whereNull() { return builder },
        orderBy() { return builder },
        async select() { return [] }
      }
      return builder
    }

    if (table === 'messages') {
      const builder = {
        whereIn() { return builder },
        where() { return builder },
        whereNull() { return builder },
        async distinct() {
          return [
            { channel_id: 'meeting-channel-1', user_id: 'user-overlap' },
            { channel_id: 'meeting-channel-1', user_id: 'user-message-only' }
          ]
        }
      }
      return builder
    }

    if (table === 'ai_function_configs') {
      return {
        where() { return this },
        whereNotNull() { return this },
        first: async () => undefined
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  }

  const service = createMeetingsService({ db })
  service._buildSourceChannelDisplayNameIndex = async () => ({
    'source-1': 'General'
  })

  const [meeting] = await service._serializeMeetings([{
    id: 'meeting-1',
    title: 'Weekly Sync',
    status: 'ended',
    source_channel_id: 'source-1',
    chat_channel_id: 'meeting-channel-1',
    host_user_id: 'user-joined',
    started_at: '2026-03-13T10:00:00.000Z',
    ended_at: '2026-03-13T10:30:00.000Z',
    ended_by: 'user-joined',
    source_channel_name: 'general',
    source_channel_type: 'private',
    chat_channel_name: 'meeting-meeting-1',
    chat_channel_purpose: 'meeting',
    chat_channel_is_voice: true,
    chat_channel_is_archived: true
  }], {
    viewerUserId: 'user-joined',
    viewerUser: { id: 'user-joined', is_admin: false },
    detailLevel: 'full'
  })

  assert.equal(meeting.detail_level, 'full')
  assert.equal(meeting.engaged_participant_count, 3)
  assert.equal(meeting.participants.length, 3)
})

test('meetings serialization: full payload hides legacy pending summary placeholders and exposes summary_generation', async () => {
  const app = {
    service() {
      return { emit() {} }
    }
  }
  const encryptedSecret = encryptSecret(app, 'secret-key')

  const db = (table) => {
    if (table === 'meeting_participants') {
      const builder = {
        join() { return builder },
        leftJoin() { return builder },
        whereIn() { return builder },
        async select() {
          return [{
            meeting_id: 'meeting-1',
            user_id: 'user-joined',
            role: 'host',
            invite_status: 'left',
            invited_at: '2026-03-13T10:00:00.000Z',
            joined_at: '2026-03-13T10:00:00.000Z',
            left_at: '2026-03-13T10:30:00.000Z',
            display_name: 'Joined User',
            avatar_url: null,
            status: 'offline'
          }]
        }
      }
      return builder
    }

    if (table === 'meeting_artifacts') {
      const builder = {
        whereIn() { return builder },
        async select() {
          return [
            {
              meeting_id: 'meeting-1',
              artifact_type: 'summary',
              status: 'pending',
              payload: null,
              updated_at: '2026-03-13T10:31:00.000Z'
            },
            {
              meeting_id: 'meeting-1',
              artifact_type: 'transcript',
              status: 'ready',
              payload: { text: 'Transcript' },
              updated_at: '2026-03-13T10:32:00.000Z'
            }
          ]
        }
      }
      return builder
    }

    if (table === 'messages') {
      const builder = {
        whereIn() { return builder },
        where() { return builder },
        whereNull() { return builder },
        async distinct() { return [] }
      }
      return builder
    }

    if (table === 'meeting_recordings') {
      const builder = {
        whereIn() { return builder },
        async select() { return [] }
      }
      return builder
    }

    if (table === 'meeting_invite_links') {
      const builder = {
        whereIn() { return builder },
        whereNull() { return builder },
        orderBy() { return builder },
        async select() { return [] }
      }
      return builder
    }

    if (table === 'ai_function_configs') {
      return {
        where() { return this },
        whereNotNull() { return this },
        first: async () => ({
          function_key: 'meeting_summary',
          enabled: false,
          provider_instance_id: 'provider-1',
          model: 'gpt-4.1-mini'
        })
      }
    }

    if (table === 'ai_provider_instances') {
      return {
        where() { return this },
        first: async () => ({
          id: 'provider-1',
          provider_type: 'openai',
          enabled: true
        })
      }
    }

    if (table === 'ai_provider_secrets') {
      return {
        where() { return this },
        first: async () => ({
          provider_instance_id: 'provider-1',
          encrypted_secret: encryptedSecret
        })
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  }

  const service = createMeetingsService({ db, app })
  service._buildSourceChannelDisplayNameIndex = async () => ({
    'source-1': 'General'
  })

  const [meeting] = await service._serializeMeetings([{
    id: 'meeting-1',
    title: 'Weekly Sync',
    status: 'ended',
    source_channel_id: 'source-1',
    chat_channel_id: 'meeting-channel-1',
    host_user_id: 'user-joined',
    started_at: '2026-03-13T10:00:00.000Z',
    ended_at: '2026-03-13T10:30:00.000Z',
    ended_by: 'user-joined',
    source_channel_name: 'general',
    source_channel_type: 'private',
    chat_channel_name: 'meeting-meeting-1',
    chat_channel_purpose: 'meeting',
    chat_channel_is_voice: true,
    chat_channel_is_archived: true
  }], {
    viewerUserId: 'user-joined',
    viewerUser: { id: 'user-joined', is_admin: false },
    detailLevel: 'full'
  })

  assert.deepEqual(meeting.artifacts, [{
    meeting_id: 'meeting-1',
    artifact_type: 'transcript',
    status: 'ready',
    payload: { text: 'Transcript' },
    updated_at: '2026-03-13T10:32:00.000Z'
  }])
  assert.deepEqual(meeting.summary_generation, {
    available: true,
    allowed: true,
    action: 'generate',
    reason: null
  })
  assert.deepEqual(meeting.transcript_generation, {
    available: false,
    allowed: false,
    action: null,
    reason: 'ready'
  })
})

test('meetings serialization: transcript retry remains hidden from non-host viewers', async () => {
  const db = (table) => {
    if (table === 'meeting_participants') {
      const builder = {
        join() { return builder },
        leftJoin() { return builder },
        whereIn() { return builder },
        async select() {
          return [{
            meeting_id: 'meeting-1',
            user_id: 'user-viewer',
            role: 'participant',
            invite_status: 'left',
            invited_at: '2026-03-13T10:00:00.000Z',
            joined_at: '2026-03-13T10:00:00.000Z',
            left_at: '2026-03-13T10:30:00.000Z',
            display_name: 'Viewer',
            avatar_url: null,
            status: 'offline'
          }]
        }
      }
      return builder
    }

    if (table === 'meeting_artifacts') {
      const builder = {
        whereIn() { return builder },
        async select() {
          return [{
            meeting_id: 'meeting-1',
            artifact_type: 'transcript',
            status: 'failed',
            payload: { failure_message: 'Provider failed' },
            updated_at: '2026-03-13T10:32:00.000Z'
          }]
        }
      }
      return builder
    }

    if (table === 'meeting_recordings') {
      const builder = {
        whereIn() { return builder },
        async select() {
          return [{
            meeting_id: 'meeting-1',
            status: MEETING_RECORDING_STATUS.READY,
            failure_code: null,
            storage_bucket: 'recordings',
            storage_key: 'meeting-1/audio.mp4'
          }]
        }
      }
      return builder
    }

    if (table === 'meeting_invite_links') {
      const builder = {
        whereIn() { return builder },
        whereNull() { return builder },
        orderBy() { return builder },
        async select() { return [] }
      }
      return builder
    }

    if (table === 'messages') {
      const builder = {
        whereIn() { return builder },
        where() { return builder },
        whereNull() { return builder },
        async distinct() { return [] }
      }
      return builder
    }

    if (table === 'ai_function_configs') {
      return {
        where() { return this },
        whereNotNull() { return this },
        first: async () => undefined
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  }

  const service = createMeetingsService({ db })
  service._buildSourceChannelDisplayNameIndex = async () => ({})

  const [meeting] = await service._serializeMeetings([{
    id: 'meeting-1',
    title: 'Weekly Sync',
    status: 'ended',
    source_channel_id: 'source-1',
    chat_channel_id: 'meeting-channel-1',
    host_user_id: 'user-host',
    started_at: '2026-03-13T10:00:00.000Z',
    ended_at: '2026-03-13T10:30:00.000Z',
    ended_by: 'user-host',
    source_channel_name: 'general',
    source_channel_type: 'private',
    chat_channel_name: 'meeting-meeting-1',
    chat_channel_purpose: 'meeting',
    chat_channel_is_voice: true,
    chat_channel_is_archived: true
  }], {
    viewerUserId: 'user-viewer',
    viewerUser: { id: 'user-viewer', is_admin: false },
    detailLevel: 'full'
  })

  assert.deepEqual(meeting.transcript_generation, {
    available: false,
    allowed: false,
    action: 'retry',
    reason: 'retry_forbidden'
  })
  assert.equal('admin_artifact_menu' in meeting, false)
})

test('meetings serialization: admin full payload exposes ended-meeting artifact menu only when both artifacts are ready', async () => {
  const db = createRuntimeConfigDb({
    participants: [{
      meeting_id: 'meeting-1',
      user_id: 'admin-1',
      role: 'host',
      invite_status: 'left',
      invited_at: '2026-03-13T10:00:00.000Z',
      joined_at: '2026-03-13T10:00:00.000Z',
      left_at: '2026-03-13T10:30:00.000Z',
      display_name: 'Admin',
      account_type: 'member',
      avatar_url: null,
      status: 'offline'
    }],
    artifacts: [{
      meeting_id: 'meeting-1',
      artifact_type: 'summary',
      status: 'ready',
      payload: { markdown: 'Summary' },
      updated_at: '2026-03-13T10:31:00.000Z'
    }, {
      meeting_id: 'meeting-1',
      artifact_type: 'transcript',
      status: 'ready',
      payload: { text: 'Transcript' },
      updated_at: '2026-03-13T10:32:00.000Z'
    }],
    recordings: [{
      meeting_id: 'meeting-1',
      status: MEETING_RECORDING_STATUS.COMPLETED,
      failure_code: null,
      storage_bucket: 'recordings',
      storage_key: 'meeting-1/audio.mp4'
    }]
  })

  const [meeting] = await serializeMeetings({
    db,
    app: {},
    rows: [meetingRow],
    viewerUserId: 'admin-1',
    viewerUser: { id: 'admin-1', is_admin: true },
    detailLevel: 'full',
    buildSourceDisplayNameIndex: async () => ({ 'source-1': 'General' }),
    buildTranscriptionStateIndex: async () => ({})
  })

  assert.deepEqual(meeting.admin_artifact_menu, {
    visible: true,
    can_regenerate_transcript: true,
    can_regenerate_summary: true,
    can_download_audio: true
  })
})
