import test from 'node:test'
import assert from 'node:assert/strict'
import { NotFound } from '@feathersjs/errors'
import { VoiceMessageArtifactsService } from '../src/services/voice-message-artifacts/voice-message-artifacts.js'
import { encryptSecret } from '../src/lib/ai-secrets.js'
import { createMemoryDb } from './helpers/memory-db.js'

function createApp(db, settings = {}) {
  const state = {
    postgresqlClient: db,
    storageClient: {
      async send() {
        return {
          ContentType: 'audio/webm',
          ContentLength: 4,
          Body: {
            async transformToByteArray() {
              return new Uint8Array([1, 2, 3, 4])
            }
          }
        }
      }
    },
    authentication: { secret: 'test-secret' },
    ...settings
  }

  return {
    get(key) {
      return state[key]
    },
    set(key, value) {
      state[key] = value
    }
  }
}

function createSeed(app) {
  return {
    users: [
      { id: 'user-1', display_name: 'Ada' },
      { id: 'user-2', display_name: 'Ben' }
    ],
    channels: [
      { id: 'channel-1', type: 'public', is_archived: false }
    ],
    channel_members: [
      { id: 'member-1', channel_id: 'channel-1', user_id: 'user-1' },
      { id: 'member-2', channel_id: 'channel-1', user_id: 'user-2' }
    ],
    messages: [
      { id: 'message-1', channel_id: 'channel-1', user_id: 'user-2', content: '', type: 'file', deleted_at: null }
    ],
    files: [
      {
        id: 'file-1',
        message_id: 'message-1',
        user_id: 'user-2',
        original_name: 'voice.webm',
        storage_key: 'user-2/file-1/voice.webm',
        mime_type: 'audio/webm',
        size: 1234,
        purpose: 'voice_message',
        duration_ms: 2500,
        bucket: 'files'
      }
    ],
    ai_provider_instances: [
      { id: 'provider-1', provider_type: 'openai', enabled: true, base_url: 'https://api.openai.com/v1' }
    ],
    ai_provider_secrets: [
      { provider_instance_id: 'provider-1', encrypted_secret: encryptSecret(app, 'secret-key') }
    ],
    ai_function_configs: [
      { function_key: 'transcription', enabled: true, provider_instance_id: 'provider-1', model: 'gpt-4o-transcribe' },
      { function_key: 'meeting_summary', enabled: true, provider_instance_id: 'provider-1', model: 'gpt-4.1-mini' }
    ]
  }
}

function createService({ seed, settings } = {}) {
  const db = createMemoryDb()
  const app = createApp(db, settings)
  Object.assign(db.tables, createSeed(app), seed || {})
  const service = new VoiceMessageArtifactsService({ Model: db, app })
  return { app, db, service }
}

test('voice-message-artifacts creates a private ready artifact for the requesting user', async () => {
  const { app, db, service } = createService()
  app.set('transcribeAudio', async () => ({
    text: 'Bitte morgen den Launch pruefen.',
    language: 'de'
  }))
  app.set('generateStructuredObject', async () => ({
    summary: 'Launch morgen pruefen.',
    key_points: ['Launch pruefen']
  }))

  const result = await service.create({
    message_id: 'message-1',
    file_id: 'file-1'
  }, {
    provider: 'rest',
    user: { id: 'user-1', is_admin: false }
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.user_id, 'user-1')
  assert.equal(result.transcript, 'Bitte morgen den Launch pruefen.')
  assert.equal(result.summary, 'Launch morgen pruefen.')
  assert.deepEqual(result.payload.key_points, ['Launch pruefen'])
  assert.equal(db.tables.voice_message_artifacts.length, 1)
})

test('voice-message-artifacts keeps artifacts scoped to their owner', async () => {
  const { service } = createService({
    seed: {
      voice_message_artifacts: [{
        id: 'artifact-1',
        message_id: 'message-1',
        file_id: 'file-1',
        user_id: 'user-1',
        status: 'ready',
        transcript: 'Private transcript'
      }]
    }
  })

  const result = await service.find({
    provider: 'rest',
    user: { id: 'user-2', is_admin: false },
    query: { file_id: 'file-1' }
  })

  assert.deepEqual(result.data, [])
  await assert.rejects(
    service.get('artifact-1', {
      provider: 'rest',
      user: { id: 'user-2', is_admin: false }
    }),
    NotFound
  )
})

test('voice-message-artifacts returns an existing ready artifact unless retry is requested', async () => {
  const { app, service } = createService({
    seed: {
      voice_message_artifacts: [{
        id: 'artifact-1',
        message_id: 'message-1',
        file_id: 'file-1',
        user_id: 'user-1',
        status: 'ready',
        transcript: 'Old transcript',
        summary: 'Old summary'
      }]
    }
  })
  let transcribeCalls = 0
  app.set('transcribeAudio', async () => {
    transcribeCalls += 1
    return { text: 'New transcript' }
  })

  const result = await service.create({
    message_id: 'message-1',
    file_id: 'file-1'
  }, {
    provider: 'rest',
    user: { id: 'user-1', is_admin: false }
  })

  assert.equal(result.transcript, 'Old transcript')
  assert.equal(transcribeCalls, 0)
})

test('voice-message-artifacts records failed status when summary AI is not configured', async () => {
  const { app, service } = createService({
    seed: {
      ai_function_configs: [
        { function_key: 'transcription', enabled: true, provider_instance_id: 'provider-1', model: 'gpt-4o-transcribe' },
        { function_key: 'meeting_summary', enabled: false, provider_instance_id: 'provider-1', model: 'gpt-4.1-mini' }
      ]
    }
  })
  app.set('transcribeAudio', async () => ({
    text: 'Hallo Welt',
    language: 'de'
  }))

  const result = await service.create({
    message_id: 'message-1',
    file_id: 'file-1',
    retry: true
  }, {
    provider: 'rest',
    user: { id: 'user-1', is_admin: false }
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.failure_code, 'api.ai.function_config_incomplete')
})
