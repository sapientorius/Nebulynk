import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BadRequest, Forbidden } from '@feathersjs/errors'
import { MEETING_TRANSCRIPT_WAIT_TIMEOUT_MS } from '../src/lib/meeting-recordings.js'
import { createMeetingsService } from './helpers/meetings-service.js'

function createPlatformSettingsQuery({ defaultMeetingLanguage = 'en', defaultLocale = 'en' } = {}) {
  const builder = {
    where(_field, value) {
      builder.requestedKey = value
      return builder
    },
    async first() {
      if (builder.requestedKey === 'default_meeting_language') {
        return { key: 'default_meeting_language', value: defaultMeetingLanguage }
      }
      if (builder.requestedKey === 'default_locale') {
        return { key: 'default_locale', value: defaultLocale }
      }
      return null
    }
  }
  return builder
}

test('meetings transcription timeout default is 30 minutes', () => {
  assert.equal(MEETING_TRANSCRIPT_WAIT_TIMEOUT_MS, 1_800_000)
  const envExample = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8')
  assert.match(envExample, /^MEETING_TRANSCRIPT_WAIT_TIMEOUT_MS=1800000$/m)
})

test('meetings behavior: create returns existing active meeting for same source channel', async () => {
  const db = (table) => {
    if (table === 'platform_settings') {
      return createPlatformSettingsQuery()
    }
    if (table === 'channel_members') {
      const builder = {
        where() { return builder },
        whereNot() { return builder },
        async select() { return [] }
      }
      return builder
    }
    throw new Error(`Unexpected table: ${table}`)
  }

  db.transaction = async (callback) => {
    const trx = (table) => {
      if (table === 'channels') {
        const builder = {
          where() { return builder },
          forUpdate() { return builder },
          async first() { return { id: 'source-1' } }
        }
        return builder
      }
      if (table === 'meetings') {
        const builder = {
          where() { return builder },
          orderBy() { return builder },
          async first() { return { id: 'meeting-existing' } }
        }
        return builder
      }
      throw new Error(`Unexpected trx table: ${table}`)
    }

    return callback(trx)
  }

  const service = createMeetingsService({ db })
  service._assertCanUseSourceChannel = async () => ({
    id: 'source-1',
    name: 'General',
    topic: null,
    type: 'public'
  })
  service.get = async (id) => ({ id, status: 'active' })

  const result = await service.create(
    { source_channel_id: 'source-1' },
    { user: { id: 'user-1', is_admin: false } }
  )

  assert.equal(result.id, 'meeting-existing')
  assert.equal(result.status, 'active')
})

test('meetings behavior: find allows source-channel members to see active meetings for that source channel', async () => {
  let assertedSourceChannel = null
  const rows = [{
    id: 'meeting-active-1',
    status: 'active',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1'
  }]

  const builder = {
    operations: [],
    limit(value) {
      this.operations.push(['limit', value])
      return this
    },
    where(...args) {
      this.operations.push(['where', ...args])
      return this
    },
    whereNotIn(...args) {
      this.operations.push(['whereNotIn', ...args])
      return this
    },
    orderByRaw(...args) {
      this.operations.push(['orderByRaw', ...args])
      return this
    },
    orderBy(...args) {
      this.operations.push(['orderBy', ...args])
      return this
    },
    join(...args) {
      this.operations.push(['join', ...args])
      return this
    },
    then(resolve, reject) {
      return Promise.resolve(rows).then(resolve, reject)
    }
  }

  const service = createMeetingsService()
  service._baseMeetingQuery = () => builder
  service._normalizeOverdueScheduledMeetings = async () => {}
  service._serializeMeetings = async (inputRows) => inputRows
  service._assertCanReadSourceChannel = async (sourceChannelId, user) => {
    assertedSourceChannel = { sourceChannelId, userId: user.id }
    return { id: sourceChannelId }
  }

  const result = await service.find({
    user: { id: 'user-1', is_admin: false },
    query: {
      source_channel_id: 'source-1',
      status: 'active',
      $limit: 10
    }
  })

  assert.deepEqual(assertedSourceChannel, {
    sourceChannelId: 'source-1',
    userId: 'user-1'
  })
  assert.equal(result.total, 1)
  assert.equal(result.data[0].id, 'meeting-active-1')
  assert.equal(
    builder.operations.some((entry) => entry[0] === 'join' && entry[1] === 'meeting_participants as self_participant'),
    false
  )
})

test('meetings behavior: patch dispatches meeting lifecycle and artifact actions', async () => {
  const service = createMeetingsService()
  service.cancel = async () => ({ ok: 'cancel' })
  service.reschedule = async () => ({ ok: 'reschedule' })
  service.decline = async () => ({ ok: 'decline' })
  service.setTitle = async () => ({ ok: 'set_title' })
  service.setLanguage = async () => ({ ok: 'set_language' })
  service.createInviteLink = async () => ({ ok: 'create_invite_link' })
  service.revokeInviteLink = async () => ({ ok: 'revoke_invite_link' })
  service.generateSummary = async () => ({ ok: 'generate_summary' })
  service.generateTranscript = async () => ({ ok: 'generate_transcript' })

  const cancelled = await service.patch('meeting-1', { action: 'cancel' }, { user: { id: 'user-1' } })
  assert.equal(cancelled.ok, 'cancel')

  const rescheduled = await service.patch(
    'meeting-1',
    { action: 'reschedule', scheduled_start_at: '2026-04-21T10:00:00.000Z' },
    { user: { id: 'user-1' } }
  )
  assert.equal(rescheduled.ok, 'reschedule')

  const declined = await service.patch('meeting-1', { action: 'decline' }, { user: { id: 'user-1' } })
  assert.equal(declined.ok, 'decline')

  const titled = await service.patch(
    'meeting-1',
    { action: 'set_title', title: 'Quarterly Sync' },
    { user: { id: 'user-1' } }
  )
  assert.equal(titled.ok, 'set_title')

  const relabeled = await service.patch(
    'meeting-1',
    { action: 'set_language', language: 'fr' },
    { user: { id: 'user-1' } }
  )
  assert.equal(relabeled.ok, 'set_language')

  const createdInviteLink = await service.patch(
    'meeting-1',
    { action: 'create_invite_link' },
    { user: { id: 'user-1' } }
  )
  assert.equal(createdInviteLink.ok, 'create_invite_link')

  const revokedInviteLink = await service.patch(
    'meeting-1',
    { action: 'revoke_invite_link', link_id: 'link-1' },
    { user: { id: 'user-1' } }
  )
  assert.equal(revokedInviteLink.ok, 'revoke_invite_link')

  const generated = await service.patch(
    'meeting-1',
    { action: 'generate_summary' },
    { user: { id: 'user-1' } }
  )
  assert.equal(generated.ok, 'generate_summary')

  const generatedTranscript = await service.patch(
    'meeting-1',
    { action: 'generate_transcript' },
    { user: { id: 'user-1' } }
  )
  assert.equal(generatedTranscript.ok, 'generate_transcript')
})

test('meetings behavior: scheduled create persists schedule fields and does not emit source message', async () => {
  const insertedMeetings = []
  let sourceMessageCreated = false

  const db = (table) => {
    if (table === 'platform_settings') {
      return createPlatformSettingsQuery({ defaultMeetingLanguage: 'fr' })
    }
    if (table === 'channel_members') {
      const builder = {
        where() { return builder },
        whereNot() { return builder },
        async select() { return [] }
      }
      return builder
    }
    throw new Error(`Unexpected table: ${table}`)
  }

  db.transaction = async (callback) => {
    const trx = (table) => {
      if (table === 'channels') {
        const builder = {
          where() { return builder },
          forUpdate() { return builder },
          async first() { return { id: 'source-1' } },
          async insert() { return undefined }
        }
        return builder
      }
      if (table === 'meetings') {
        const builder = {
          where() { return builder },
          orderBy() { return builder },
          async first() { return null },
          async insert(payload) {
            insertedMeetings.push(payload)
            return undefined
          }
        }
        return builder
      }
      if (table === 'meeting_participants' || table === 'channel_members' || table === 'notifications') {
        return {
          insert() { return this },
          onConflict() { return this },
          ignore: async () => undefined
        }
      }
      throw new Error(`Unexpected trx table: ${table}`)
    }

    return callback(trx)
  }

  const service = createMeetingsService({ db })
  service._assertCanUseSourceChannel = async () => ({
    id: 'source-1',
    name: 'General',
    topic: null,
    type: 'public'
  })
  service._resolveSourceChannelDisplayName = async () => 'General'
  service._joinConnectionsToChannel = () => {}
  service._emitNotificationEvents = () => {}
  service._createSourceMessage = async () => {
    sourceMessageCreated = true
  }
  service.get = async (id) => ({ id, status: 'scheduled' })

  const result = await service.create({
    source_channel_id: 'source-1',
    language: 'it',
    scheduled_start_at: '2026-04-21T10:00:00.000Z',
    scheduled_end_at: '2026-04-21T11:00:00.000Z'
  }, {
    user: { id: 'user-1', display_name: 'Host', is_admin: false }
  })

  assert.equal(result.status, 'scheduled')
  assert.equal(insertedMeetings.length, 1)
  assert.equal(insertedMeetings[0].status, 'scheduled')
  assert.equal(insertedMeetings[0].started_at, null)
  assert.equal(insertedMeetings[0].language, 'it')
  assert.equal(insertedMeetings[0].scheduled_start_at, '2026-04-21T10:00:00.000Z')
  assert.equal(insertedMeetings[0].scheduled_end_at, '2026-04-21T11:00:00.000Z')
  assert.equal(insertedMeetings[0].join_not_before, '2026-04-21T09:50:00.000Z')
  assert.equal(sourceMessageCreated, false)
})

test('meetings policy: set_title action requires title field', async () => {
  const service = createMeetingsService()

  await assert.rejects(
    service.patch('meeting-1', { action: 'set_title' }, { user: { id: 'user-1' } }),
    BadRequest
  )
})

test('meetings policy: set_language action requires language field', async () => {
  const service = createMeetingsService()

  await assert.rejects(
    service.patch('meeting-1', { action: 'set_language' }, { user: { id: 'user-1' } }),
    BadRequest
  )
})

test('meetings behavior: reschedule persists updated meeting language', async () => {
  let updatedMeeting = null
  const db = (table) => {
    if (table === 'meetings') {
      return {
        where() { return this },
        update: async (payload) => {
          updatedMeeting = payload
        }
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  }

  const service = createMeetingsService({ db })
  service._getNormalizedMeetingOrThrow = async () => ({
    id: 'meeting-reschedule-1',
    status: 'scheduled',
    host_user_id: 'host-1',
    description: 'Old agenda',
    language: 'de'
  })
  service._assertCanAccessMeeting = async () => {}
  service.get = async () => ({ id: 'meeting-reschedule-1', status: 'scheduled', language: 'fr' })

  const result = await service.reschedule('meeting-reschedule-1', {
    scheduled_start_at: '2026-04-21T10:00:00.000Z',
    scheduled_end_at: '2026-04-21T11:00:00.000Z',
    description: 'Updated agenda',
    language: 'fr'
  }, {
    user: { id: 'host-1', is_admin: false }
  })

  assert.equal(updatedMeeting.language, 'fr')
  assert.equal(result.language, 'fr')
})

test('meetings behavior: only admins can change language for ended meetings', async () => {
  const db = () => {
    throw new Error('Unexpected root db access')
  }
  const service = createMeetingsService({ db })
  service._getNormalizedMeetingOrThrow = async () => ({
    id: 'meeting-ended-language-1',
    status: 'ended',
    host_user_id: 'host-1',
    language: 'de'
  })
  service._assertCanAccessMeeting = async () => {}

  await assert.rejects(
    service.setLanguage('meeting-ended-language-1', { language: 'fr' }, {
      user: { id: 'host-1', is_admin: false }
    }),
    Forbidden
  )
})

test('meetings behavior: setLanguage rejects cancelled meetings and allows admin ended changes', async () => {
  let updatedMeeting = null
  const db = (table) => {
    if (table === 'meetings') {
      return {
        where() { return this },
        update: async (payload) => {
          updatedMeeting = payload
        }
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  }

  const service = createMeetingsService({ db })
  const cancelledMeeting = {
    id: 'meeting-cancelled-language-1',
    status: 'cancelled',
    host_user_id: 'host-1',
    language: 'de'
  }
  const endedMeeting = {
    id: 'meeting-ended-language-2',
    status: 'ended',
    host_user_id: 'host-1',
    language: 'de'
  }
  service._assertCanAccessMeeting = async () => {}
  service.get = async () => ({ id: 'meeting-ended-language-2', status: 'ended', language: 'es' })

  service._getNormalizedMeetingOrThrow = async () => cancelledMeeting
  await assert.rejects(
    service.setLanguage('meeting-cancelled-language-1', { language: 'fr' }, {
      user: { id: 'admin-1', is_admin: true }
    }),
    BadRequest
  )

  service._getNormalizedMeetingOrThrow = async () => endedMeeting
  const result = await service.setLanguage('meeting-ended-language-2', { language: 'es' }, {
    user: { id: 'admin-1', is_admin: true }
  })

  assert.equal(updatedMeeting.language, 'es')
  assert.equal(result.language, 'es')
})

test('meetings behavior: create on DM source does not persist technical source name as meeting title', async () => {
  let insertedMeetingTitle = '__unset__'
  let insertedMeetingLanguage = '__unset__'

  const db = (table) => {
    if (table === 'platform_settings') {
      return createPlatformSettingsQuery({ defaultMeetingLanguage: 'pt' })
    }
    if (table === 'channel_members') {
      const builder = {
        where() { return builder },
        whereNot() { return builder },
        async select() { return [] }
      }
      return builder
    }
    throw new Error(`Unexpected table: ${table}`)
  }

  db.transaction = async (callback) => {
    const trx = (table) => {
      if (table === 'channels') {
        const builder = {
          where() { return builder },
          forUpdate() { return builder },
          async first() { return { id: 'dm-source' } },
          async insert() { return undefined }
        }
        return builder
      }
      if (table === 'meetings') {
        const builder = {
          where() { return builder },
          orderBy() { return builder },
          async first() { return null },
          async insert(payload) {
            insertedMeetingTitle = payload.title
            insertedMeetingLanguage = payload.language
            return undefined
          }
        }
        return builder
      }
      if (table === 'channel_members' || table === 'meeting_participants' || table === 'meeting_artifacts') {
        return {
          async insert() { return undefined }
        }
      }
      throw new Error(`Unexpected trx table: ${table}`)
    }

    return callback(trx)
  }

  const service = createMeetingsService({ db })
  service._assertCanUseSourceChannel = async () => ({
    id: 'dm-source',
    name: 'dm-dm-source',
    topic: null,
    type: 'dm'
  })
  service._resolveSourceChannelDisplayName = async () => 'Alex'
  service._joinConnectionsToChannel = () => {}
  service._emitNotificationEvents = () => {}
  service._createSourceMessage = async () => {}
  service.get = async (id) => ({ id, title: insertedMeetingTitle, status: 'active' })

  const result = await service.create(
    { source_channel_id: 'dm-source' },
    { user: { id: 'user-1', is_admin: false } }
  )

  assert.equal(insertedMeetingTitle, null)
  assert.equal(insertedMeetingLanguage, 'pt')
  assert.equal(result.title, null)
})

test('meetings behavior: create does not precreate summary placeholder artifacts', async () => {
  const db = (table) => {
    if (table === 'platform_settings') {
      return createPlatformSettingsQuery()
    }
    if (table === 'channel_members') {
      const builder = {
        where() { return builder },
        whereNot() { return builder },
        async select() { return [] }
      }
      return builder
    }
    throw new Error(`Unexpected table: ${table}`)
  }

  db.transaction = async (callback) => {
    const trx = (table) => {
      if (table === 'channels') {
        const builder = {
          where() { return builder },
          forUpdate() { return builder },
          async first() { return null },
          async insert() { return undefined }
        }
        return builder
      }
      if (table === 'meetings') {
        const builder = {
          where() { return builder },
          orderBy() { return builder },
          async first() { return null },
          async insert() { return undefined }
        }
        return builder
      }
      if (table === 'channel_members' || table === 'meeting_participants') {
        return {
          async insert() { return undefined }
        }
      }
      if (table === 'meeting_artifacts') {
        throw new Error('create should not precreate meeting artifacts')
      }
      throw new Error(`Unexpected trx table: ${table}`)
    }

    return callback(trx)
  }

  const service = createMeetingsService({ db })
  service._assertCanUseSourceChannel = async () => ({
    id: 'source-1',
    name: 'General',
    topic: null,
    type: 'public'
  })
  service._resolveSourceChannelDisplayName = async () => 'General'
  service._joinConnectionsToChannel = () => {}
  service._emitNotificationEvents = () => {}
  service._createSourceMessage = async () => {}
  service.get = async (id) => ({ id, status: 'active' })

  const result = await service.create(
    { source_channel_id: 'source-1' },
    { user: { id: 'user-1', is_admin: false } }
  )

  assert.equal(result.status, 'active')
})

test('meetings realtime: join emits additive incremental payload', async () => {
  const emitted = []

  const db = (table) => {
    if (table === 'channel_members') {
      return {
        where() { return this },
        first: async () => ({ id: 'membership-1' })
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  }

  db.transaction = async (callback) => {
    const trx = (table) => {
      if (table === 'meeting_participants') {
        return {
          where() { return this },
          update: async () => undefined
        }
      }

      if (table === 'channel_members') {
        return {
          insert() { return this },
          onConflict() { return this },
          ignore: async () => undefined
        }
      }

      throw new Error(`Unexpected trx table: ${table}`)
    }

    return callback(trx)
  }

  const app = {
    service(name) {
      if (name === 'meetings') {
        return {
          emit(eventName, payload) {
            emitted.push({ eventName, payload })
          }
        }
      }

      if (name === 'voice') {
        return {
          async create() {
            return { token: 'voice-token' }
          },
          async patch() {
            return undefined
          }
        }
      }

      throw new Error(`Unexpected service: ${name}`)
    },
    channel() {
      return {
        connections: [],
        join() {}
      }
    }
  }

  const service = createMeetingsService({ db, app })
  service._getMeetingOrThrow = async () => ({
    id: 'meeting-join-1',
    status: 'active',
    source_channel_id: 'source-1',
    source_channel_type: 'private',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1'
  })
  service._getMeetingParticipant = async () => ({
    id: 'participant-1',
    meeting_id: 'meeting-join-1',
    user_id: 'user-2',
    invite_status: 'invited'
  })
  service._joinConnectionsToChannel = () => {}
  service.get = async () => ({ id: 'meeting-join-1', status: 'active' })

  await service.join('meeting-join-1', {}, {
    user: { id: 'user-2', is_admin: false },
    provider: 'rest'
  })

  assert.deepEqual(emitted, [{
    eventName: 'joined',
    payload: {
      meetingId: 'meeting-join-1',
      chatChannelId: 'chat-1',
      userId: 'user-2',
      participantUserId: 'user-2',
      status: 'active'
    }
  }])
})

test('meetings behavior: join allows active source-channel members who were added after meeting start', async () => {
  let assertedSourceChannel = null
  let insertedParticipant = null

  const db = () => {
    throw new Error('Unexpected root db access')
  }

  db.transaction = async (callback) => {
    const trx = (table) => {
      if (table === 'meeting_participants') {
        return {
          insert(payload) {
            insertedParticipant = payload
            return this
          },
          where() {
            return this
          },
          update: async () => undefined
        }
      }

      if (table === 'channel_members') {
        return {
          insert() {
            return this
          },
          onConflict() {
            return this
          },
          ignore: async () => undefined
        }
      }

      throw new Error(`Unexpected trx table: ${table}`)
    }

    return callback(trx)
  }

  const app = {
    service(name) {
      if (name === 'meetings') {
        return {
          emit() {}
        }
      }

      if (name === 'voice') {
        return {
          async create() {
            return { token: 'voice-token' }
          },
          async patch() {
            return undefined
          }
        }
      }

      throw new Error(`Unexpected service: ${name}`)
    },
    channel() {
      return {
        connections: [],
        join() {}
      }
    }
  }

  const service = createMeetingsService({ db, app })
  service._getNormalizedMeetingOrThrow = async () => ({
    id: 'meeting-source-join-1',
    status: 'active',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1'
  })
  service._getMeetingParticipant = async () => null
  service._assertCanUseSourceChannel = async (sourceChannelId, user) => {
    assertedSourceChannel = { sourceChannelId, userId: user.id }
    return { id: sourceChannelId }
  }
  service._joinConnectionsToChannel = () => {}
  service.get = async () => ({
    id: 'meeting-source-join-1',
    status: 'active',
    chat_channel_id: 'chat-1'
  })

  const result = await service.join('meeting-source-join-1', {}, {
    user: { id: 'user-late-member', is_admin: false },
    provider: 'rest'
  })

  assert.deepEqual(assertedSourceChannel, {
    sourceChannelId: 'source-1',
    userId: 'user-late-member'
  })
  assert.equal(insertedParticipant.meeting_id, 'meeting-source-join-1')
  assert.equal(insertedParticipant.user_id, 'user-late-member')
  assert.equal(insertedParticipant.invite_status, 'joined')
  assert.equal(result.meeting.id, 'meeting-source-join-1')
  assert.equal(result.voice.token, 'voice-token')
})

test('meetings realtime: end emits additive ended payload and queues only configured artifact types', async () => {
  const emitted = []
  const artifactOperations = []
  const meetingRecordingRows = [{
    id: 'recording-1',
    meeting_id: 'meeting-end-1',
    user_id: 'host-2',
    status: 'ready',
    livekit_egress_id: null
  }]

  const db = (table) => {
    if (table === 'ai_function_configs') {
      return {
        where() { return this },
        whereNotNull() { return this },
        async select() {
          return [
            { function_key: 'transcription' },
            { function_key: 'meeting_summary' }
          ]
        }
      }
    }

    if (table === 'meeting_recordings') {
      const filters = []
      return {
        where(field, value) {
          if (typeof field === 'object') {
            filters.push((row) => Object.entries(field).every(([key, expected]) => row[key] === expected))
          } else {
            filters.push((row) => row[field] === value)
          }
          return this
        },
        async select() {
          return meetingRecordingRows.filter((row) => filters.every((predicate) => predicate(row)))
        },
        async update(patch) {
          let count = 0
          for (const row of meetingRecordingRows) {
            if (!filters.every((predicate) => predicate(row))) continue
            Object.assign(row, patch)
            count += 1
          }
          return count
        }
      }
    }

    if (table === 'voice_participants') {
      return {
        where() { return this },
        del: async () => undefined
      }
    }

    if (table === 'channels') {
      return {
        where() { return this },
        first: async () => ({ id: 'chat-2', is_archived: true })
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  }

  db.transaction = async (callback) => {
    const trx = (table) => {
      if (table === 'meetings' || table === 'channels' || table === 'meeting_participants') {
        return {
          where() { return this },
          update: async () => undefined
        }
      }

      if (table === 'meeting_artifacts') {
        const filters = {}
        return {
          where(field, value) {
            if (typeof field === 'object') {
              Object.assign(filters, field)
            } else {
              filters[field] = value
            }
            return this
          },
          async update(patch) {
            artifactOperations.push({ type: 'update', filters: { ...filters }, patch })
            return filters.artifact_type === 'transcript' ? 1 : 0
          },
          async insert(row) {
            artifactOperations.push({ type: 'insert', row })
            return undefined
          }
        }
      }

      if (table === 'meeting_recording_pauses') {
        return {
          where() { return this },
          update: async () => 0
        }
      }

      throw new Error(`Unexpected trx table: ${table}`)
    }

    return callback(trx)
  }

  const app = {
    service(name) {
      if (name === 'meetings' || name === 'channels') {
        return {
          emit(eventName, payload) {
            emitted.push({ service: name, eventName, payload })
          }
        }
      }

      throw new Error(`Unexpected service: ${name}`)
    },
    channel() {
      return {
        connections: [],
        join() {}
      }
    },
    get(name) {
      if (name === 'postgresqlClient') {
        return db
      }
      throw new Error(`Unexpected app.get: ${name}`)
    }
  }

  const service = createMeetingsService({ db, app })
  service._getMeetingOrThrow = async () => ({
    id: 'meeting-end-1',
    status: 'active',
    source_channel_id: 'source-2',
    chat_channel_id: 'chat-2',
    host_user_id: 'host-2'
  })
  service._assertCanAccessMeeting = async () => {}
  service.get = async () => ({ id: 'meeting-end-1', status: 'ended' })

  await service.end('meeting-end-1', { reason: 'host_left' }, {
    user: { id: 'host-2', is_admin: false }
  })

  const endedAt = emitted[1]?.payload?.endedAt

  assert.deepEqual(emitted, [
    {
      service: 'channels',
      eventName: 'patched',
      payload: { id: 'chat-2', is_archived: true }
    },
    {
      service: 'meetings',
      eventName: 'ended',
      payload: {
        meetingId: 'meeting-end-1',
        chatChannelId: 'chat-2',
        endedAt,
        endedBy: 'host-2',
        status: 'ended',
        chatChannelArchived: true
      }
    },
    {
      service: 'meetings',
      eventName: 'artifacts-queued',
      payload: {
        meetingId: 'meeting-end-1',
        chatChannelId: 'chat-2',
        sourceChannelId: 'source-2',
        artifactTypes: ['summary', 'transcript'],
        reason: 'host_left'
      }
    }
  ])
  assert.deepEqual(artifactOperations, [
    {
      type: 'update',
      filters: { meeting_id: 'meeting-end-1', artifact_type: 'summary' },
      patch: {
        status: 'processing',
        updated_at: artifactOperations[0].patch.updated_at,
        payload: null
      }
    },
    {
      type: 'insert',
      row: {
        id: artifactOperations[1].row.id,
        meeting_id: 'meeting-end-1',
        artifact_type: 'summary',
        status: 'processing',
        payload: null,
        created_at: artifactOperations[1].row.created_at,
        updated_at: artifactOperations[1].row.updated_at
      }
    },
    {
      type: 'update',
      filters: { meeting_id: 'meeting-end-1', artifact_type: 'transcript' },
      patch: {
        status: 'processing',
        updated_at: artifactOperations[2].patch.updated_at,
        payload: null
      }
    }
  ])
})
