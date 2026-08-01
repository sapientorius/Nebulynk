import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { feathers } from '@feathersjs/feathers'
import { koa } from '@feathersjs/koa'
import { configureVoiceDraftRoutes, polishVoiceDraftTranscript } from '../src/routes/voice-drafts.js'
import { encryptSecret } from '../src/lib/ai-secrets.js'
import { createMemoryDb } from './helpers/memory-db.js'

function createApp({ db, generateStructuredObject } = {}) {
  return {
    get(key) {
      if (key === 'postgresqlClient') return db
      if (key === 'authentication') return { secret: 'voice-draft-test-secret' }
      if (key === 'generateStructuredObject') return generateStructuredObject
      return undefined
    }
  }
}

function createDb(app, overrides = {}) {
  return createMemoryDb({
    ai_provider_instances: [
      { id: 'provider-1', provider_type: 'openai', base_url: null, enabled: true }
    ],
    ai_provider_secrets: [
      { provider_instance_id: 'provider-1', encrypted_secret: encryptSecret(app, 'provider-key') }
    ],
    ai_function_configs: [
      { function_key: 'meeting_summary', enabled: true, provider_instance_id: 'provider-1', model: 'gpt-4.1-mini' }
    ],
    ...overrides
  })
}

async function createRouteHarness({
  user = { id: 'admin-1', is_admin: true, account_type: 'member' },
  seed = {},
  transcribeAudio,
  generateStructuredObject
} = {}) {
  const app = koa(feathers())
  const authApp = createApp()
  const db = createMemoryDb({
    users: [
      { id: 'admin-1', is_admin: true, account_type: 'member' },
      { id: 'user-1', is_admin: false, account_type: 'member' },
      user
    ],
    channels: [
      { id: 'channel-1', type: 'public', is_archived: false },
      { id: 'channel-2', type: 'public', is_archived: false },
      { id: 'channel-archived', type: 'public', is_archived: true },
      { id: 'dm-1', type: 'dm', is_archived: false }
    ],
    channel_members: [
      { id: 'member-1', channel_id: 'channel-1', user_id: 'user-1', role: 'member' },
      { id: 'member-2', channel_id: 'dm-1', user_id: 'user-1', role: 'member' }
    ],
    ai_provider_instances: [
      { id: 'provider-1', provider_type: 'openai', base_url: null, enabled: true }
    ],
    ai_provider_secrets: [
      { provider_instance_id: 'provider-1', encrypted_secret: encryptSecret(authApp, 'provider-key') }
    ],
    ai_function_configs: [
      { function_key: 'transcription', enabled: true, provider_instance_id: 'provider-1', model: 'gpt-4o-transcribe' },
      { function_key: 'meeting_summary', enabled: true, provider_instance_id: 'provider-1', model: 'gpt-4.1-mini' }
    ],
    ...seed
  })
  const services = {
    authentication: {
      async verifyAccessToken(token) {
        if (token === 'admin-token') return { sub: 'admin-1' }
        if (token === 'user-token') return { sub: 'user-1' }
        throw new Error('Invalid token')
      }
    }
  }
  const originalService = app.service.bind(app)
  app.service = (name) => services[name] || originalService(name)
  app.set('postgresqlClient', db)
  app.set('authentication', { secret: 'voice-draft-test-secret' })
  app.set('transcribeAudio', transcribeAudio || (async () => ({
    text: 'raw voice transcript',
    language: 'en',
    duration_ms: 900
  })))
  app.set('generateStructuredObject', generateStructuredObject || (async () => ({
    text: 'Polished voice draft.'
  })))

  configureVoiceDraftRoutes(app)

  const server = createServer(app.callback())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    db,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  }
}

async function postVoiceDraft(baseUrl, { token = 'admin-token', channelId = 'channel-1', fileType = 'audio/webm' } = {}) {
  const formData = new FormData()
  if (channelId !== null) formData.append('channel_id', channelId)
  formData.append('duration_ms', '1200')
  formData.append('file', new Blob(['voice'], { type: fileType }), fileType.startsWith('audio/') ? 'voice.webm' : 'voice.txt')

  return fetch(`${baseUrl}/voice-drafts/transcribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  })
}

test('voice draft polishing returns composer-ready text when meeting_summary is configured', async () => {
  let prompt = ''
  const authApp = createApp()
  const db = createDb(authApp)
  const app = createApp({
    db,
    generateStructuredObject: async (request) => {
      assert.equal(request.providerType, 'openai')
      assert.equal(request.apiKey, 'provider-key')
      assert.equal(request.capability, 'meeting_summary')
      prompt = request.userPrompt
      return { text: 'Hallo Team, ich pruefe morgen den Launch und melde mich danach.' }
    }
  })

  const result = await polishVoiceDraftTranscript({
    app,
    db,
    transcript: 'hallo team ich pruefe morgen den launch und melde mich danach',
    language: 'de'
  })

  assert.equal(result.text, 'Hallo Team, ich pruefe morgen den Launch und melde mich danach.')
  assert.equal(result.raw_text, 'hallo team ich pruefe morgen den launch und melde mich danach')
  assert.equal(result.polished, true)
  assert.match(prompt, /change as little as possible/i)
  assert.match(prompt, /organize it into a concise readable message/i)
})

test('voice draft polishing falls back to raw transcript when meeting_summary is unavailable', async () => {
  const authApp = createApp()
  const db = createDb(authApp, {
    ai_function_configs: [
      { function_key: 'meeting_summary', enabled: false, provider_instance_id: 'provider-1', model: 'gpt-4.1-mini' }
    ]
  })
  const app = createApp({
    db,
    generateStructuredObject: async () => {
      throw new Error('should not be called')
    }
  })

  const result = await polishVoiceDraftTranscript({
    app,
    db,
    transcript: 'raw draft text'
  })

  assert.deepEqual(result, {
    text: 'raw draft text',
    raw_text: 'raw draft text',
    polished: false
  })
})

test('voice draft polishing falls back to raw transcript when cleanup generation fails', async () => {
  const authApp = createApp()
  const db = createDb(authApp)
  const warnings = []
  const app = createApp({
    db,
    generateStructuredObject: async () => {
      throw new Error('provider unavailable')
    }
  })

  const result = await polishVoiceDraftTranscript({
    app,
    db,
    transcript: 'bitte morgen launch pruefen',
    log: {
      warn(message, data) {
        warnings.push({ message, data })
      }
    }
  })

  assert.deepEqual(result, {
    text: 'bitte morgen launch pruefen',
    raw_text: 'bitte morgen launch pruefen',
    polished: false
  })
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0].data.error, 'provider unavailable')
})

test('voice draft route rejects non-audio uploads', async () => {
  const harness = await createRouteHarness()

  try {
    const response = await postVoiceDraft(harness.baseUrl, { fileType: 'text/plain' })
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.equal(payload.error_code, 'api.voice_drafts.audio_required')
  } finally {
    await harness.close()
  }
})

test('voice draft route requires channel_id', async () => {
  const harness = await createRouteHarness()

  try {
    const response = await postVoiceDraft(harness.baseUrl, { channelId: null })
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.equal(payload.error_code, 'api.voice_drafts.channel_id_required')
  } finally {
    await harness.close()
  }
})

test('voice draft route rejects archived channels', async () => {
  const harness = await createRouteHarness()

  try {
    const response = await postVoiceDraft(harness.baseUrl, {
      token: 'user-token',
      channelId: 'channel-archived'
    })
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.equal(payload.error_code, 'api.messages.channel_archived')
  } finally {
    await harness.close()
  }
})

test('voice draft route rejects non-members', async () => {
  const harness = await createRouteHarness()

  try {
    const response = await postVoiceDraft(harness.baseUrl, {
      token: 'user-token',
      channelId: 'channel-2'
    })
    const payload = await response.json()

    assert.equal(response.status, 403)
    assert.equal(payload.error_code, 'api.channels.membership_required')
  } finally {
    await harness.close()
  }
})

test('voice draft route rejects members without send_messages permission', async () => {
  const harness = await createRouteHarness()

  try {
    const response = await postVoiceDraft(harness.baseUrl, {
      token: 'user-token',
      channelId: 'channel-1'
    })
    const payload = await response.json()

    assert.equal(response.status, 403)
    assert.equal(payload.error_code, 'api.permissions.missing_required_permission')
  } finally {
    await harness.close()
  }
})

test('voice draft route transcribes and polishes an authorized draft', async () => {
  const harness = await createRouteHarness()

  try {
    const response = await postVoiceDraft(harness.baseUrl)
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(payload, {
      text: 'Polished voice draft.',
      raw_text: 'raw voice transcript',
      polished: true,
      language: 'en',
      duration_ms: 1200
    })
  } finally {
    await harness.close()
  }
})
