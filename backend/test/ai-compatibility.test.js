import test from 'node:test'
import assert from 'node:assert/strict'
import { generateImage, generateStructuredObject, transcribeAudio } from '../src/lib/ai-provider-adapters.js'
import { encryptSecret } from '../src/lib/ai-secrets.js'
import { AiFunctionConfigsService } from '../src/services/ai-function-configs/ai-function-configs.js'
import { AiProviderInstancesService } from '../src/services/ai-provider-instances/ai-provider-instances.js'
import { processPendingMeetingSummaries } from '../src/services/meetings/summary-processor.js'
import { createMemoryDb } from './helpers/memory-db.js'

const now = '2026-09-23T10:00:00.000Z'

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Bad Request', async json() { return payload } }
}

function textResult(value = '{"ok":true}') {
  return jsonResponse({ choices: [{ message: { content: value } }] })
}

function fixture(fetchFn) {
  const app = {
    get(name) {
      if (name === 'authentication') return { secret: 'test-auth-secret' }
      if (name === 'aiCompatibilityFetch') return fetchFn
      return null
    }
  }
  const db = createMemoryDb({
    ai_provider_instances: [{ id: 'provider-1', provider_type: 'openai', display_name: 'OpenAI', enabled: true, base_url: 'https://api.openai.com/v1', created_at: now, updated_at: now }],
    ai_provider_secrets: [{ provider_instance_id: 'provider-1', encrypted_secret: encryptSecret(app, 'old-key'), created_at: now, updated_at: now }],
    ai_function_configs: ['meeting_summary', 'chat_summary', 'transcription', 'image_generation'].map((functionKey) => ({
      function_key: functionKey, enabled: false, provider_instance_id: null, model: null, updated_at: now
    }))
  })
  return { app, db, service: new AiFunctionConfigsService({ Model: db, app }) }
}

test('GPT-5.6 Luna structured request omits temperature', async () => {
  let body
  const result = await generateStructuredObject({
    providerType: 'openai', apiKey: 'test', model: 'gpt-5.6-luna',
    systemPrompt: 'JSON only', userPrompt: 'Return {"ok":true}',
    fetchFn: async (_url, options) => { body = JSON.parse(options.body); return textResult() }
  })
  assert.deepEqual(result, { ok: true })
  assert.equal(Object.hasOwn(body, 'temperature'), false)
  assert.deepEqual(body.response_format, { type: 'json_object' })
})

test('optional rejected parameter is removed once and persisted in the request profile', async () => {
  const bodies = []
  const requestProfile = { version: 1, omit: [] }
  let savedProfile
  const result = await generateStructuredObject({
    providerType: 'openai', apiKey: 'test', model: 'future-model',
    systemPrompt: 'JSON only', userPrompt: 'Return {"ok":true}', requestProfile,
    onProfileAdapted: async (value) => { savedProfile = value },
    fetchFn: async (_url, options) => {
      bodies.push(JSON.parse(options.body))
      return bodies.length === 1
        ? jsonResponse({ error: { code: 'unsupported_parameter', param: 'response_format', message: 'response_format is unsupported' } }, 400)
        : textResult()
    }
  })
  assert.deepEqual(result, { ok: true })
  assert.equal(bodies.length, 2)
  assert.equal(Object.hasOwn(bodies[1], 'response_format'), false)
  assert.deepEqual(requestProfile.omit, ['response_format'])
  assert.deepEqual(savedProfile, requestProfile)
})

test('transcription retries without rejected response_format and keeps its result contract', async () => {
  const sentFormats = []
  const profile = { version: 1, omit: [] }
  const result = await transcribeAudio({
    providerType: 'openai', apiKey: 'test', model: 'whisper-1',
    file: { buffer: Buffer.from('audio'), mime: 'audio/wav' }, requestProfile: profile,
    fetchFn: async (_url, options) => {
      sentFormats.push(options.body.get('response_format'))
      return sentFormats.length === 1
        ? jsonResponse({ error: { code: 'unsupported_parameter', param: 'response_format', message: 'response_format unsupported' } }, 400)
        : jsonResponse({ text: 'Hallo Welt' })
    }
  })
  assert.deepEqual(sentFormats, ['verbose_json', null])
  assert.equal(result.text, 'Hallo Welt')
  assert.deepEqual(profile.omit, ['response_format'])
})

test('image generation retries without rejected quality while preserving size', async () => {
  const bodies = []
  const result = await generateImage({
    providerType: 'openai', apiKey: 'test', model: 'gpt-image-1', prompt: 'Blue circle',
    fetchFn: async (_url, options) => {
      bodies.push(JSON.parse(options.body))
      return bodies.length === 1
        ? jsonResponse({ error: { code: 'unsupported_parameter', param: 'quality', message: 'quality unsupported' } }, 400)
        : jsonResponse({ data: [{ b64_json: Buffer.from('image').toString('base64') }] })
    }
  })
  assert.equal(result.buffer.toString(), 'image')
  assert.equal(Object.hasOwn(bodies[1], 'quality'), false)
  assert.equal(bodies[1].size, '1536x1024')
})

for (const [status, error] of [
  [401, { code: 'invalid_api_key', param: null, message: 'Invalid key' }],
  [429, { code: 'rate_limit_exceeded', param: null, message: 'Rate limited' }],
  [400, { code: 'invalid_request_error', param: null, message: 'Malformed request' }]
]) {
  test(`HTTP ${status} without a named unsupported parameter is not retried`, async () => {
    let calls = 0
    await assert.rejects(generateStructuredObject({
      providerType: 'openai', apiKey: 'test', model: 'future-model',
      systemPrompt: 'JSON only', userPrompt: 'Return JSON',
      fetchFn: async () => { calls += 1; return jsonResponse({ error }, status) }
    }))
    assert.equal(calls, 1)
  })
}

test('all four active functions are tested before activation with the operational endpoint', async () => {
  const endpoints = []
  const { db, service } = fixture(async (url, options) => {
    endpoints.push(url)
    if (url.endsWith('/audio/transcriptions')) {
      assert.equal(options.body.get('file').type, 'audio/wav')
      return jsonResponse({ text: '' })
    }
    if (url.endsWith('/images/generations')) {
      const body = JSON.parse(options.body)
      assert.equal(body.size, '1536x1024')
      assert.equal(body.quality, 'auto')
      return jsonResponse({ data: [{ b64_json: Buffer.from('image').toString('base64') }] })
    }
    return textResult()
  })
  for (const [functionKey, model] of [
    ['meeting_summary', 'gpt-5.6-luna'],
    ['chat_summary', 'gpt-5.6-luna'],
    ['transcription', 'whisper-1'],
    ['image_generation', 'gpt-image-1']
  ]) {
    const result = await service.patch(functionKey, { enabled: true, provider_instance_id: 'provider-1', model })
    assert.equal(result.verification_status, 'verified')
    assert.ok(result.verified_at)
    assert.ok(db.tables.ai_function_configs.find((row) => row.function_key === functionKey).verification_fingerprint)
  }
  assert.deepEqual(endpoints, [
    'https://api.openai.com/v1/chat/completions',
    'https://api.openai.com/v1/chat/completions',
    'https://api.openai.com/v1/audio/transcriptions',
    'https://api.openai.com/v1/images/generations'
  ])
})

test('failed or inconclusive verification retains the previous active model', async () => {
  let fail = false
  const { db, service } = fixture(async () => {
    if (fail) return jsonResponse({ error: { code: 'unsupported_parameter', param: 'model', message: 'Model unsupported' } }, 400)
    return textResult()
  })
  await service.patch('meeting_summary', { enabled: true, provider_instance_id: 'provider-1', model: 'gpt-4.1-mini' })
  const previous = structuredClone(db.tables.ai_function_configs[0])
  fail = true
  await assert.rejects(service.patch('meeting_summary', { model: 'future-model' }), /Modellpruefung fehlgeschlagen/)
  assert.deepEqual(db.tables.ai_function_configs[0], previous)

  service.options.verifyConfiguration = async () => { throw new Error('Timeout') }
  await assert.rejects(service.patch('meeting_summary', { model: 'slow-model' }), /Timeout/)
  assert.deepEqual(db.tables.ai_function_configs[0], previous)
})

test('provider key rotation rechecks linked active functions before changing credentials', async () => {
  let rejectNewKey = false
  const { app, db, service } = fixture(async (_url, options) => {
    if (rejectNewKey && options.headers.Authorization === 'Bearer new-key') return jsonResponse({ error: { message: 'Invalid key' } }, 401)
    return textResult()
  })
  await service.patch('meeting_summary', { enabled: true, provider_instance_id: 'provider-1', model: 'gpt-5.6-luna' })
  const oldSecret = db.tables.ai_provider_secrets[0].encrypted_secret
  const providerService = new AiProviderInstancesService({ Model: db, app })
  rejectNewKey = true
  await assert.rejects(providerService.patch('provider-1', { api_key: 'new-key' }), /Modellpruefung fehlgeschlagen/)
  assert.equal(db.tables.ai_provider_secrets[0].encrypted_secret, oldSecret)
})

test('verification status becomes unverified when the provider credential version changes', async () => {
  const { db, service } = fixture(async () => textResult())
  await service.patch('meeting_summary', { enabled: true, provider_instance_id: 'provider-1', model: 'gpt-5.6-luna' })
  assert.equal((await service.get('meeting_summary')).verification_status, 'verified')
  db.tables.ai_provider_secrets[0].updated_at = '2026-09-24T10:00:00.000Z'
  assert.equal((await service.get('meeting_summary')).verification_status, 'unverified')
})

test('successful provider key rotation refreshes verification for linked active functions', async () => {
  const { app, db, service } = fixture(async () => textResult())
  await service.patch('meeting_summary', { enabled: true, provider_instance_id: 'provider-1', model: 'gpt-5.6-luna' })
  const previousFingerprint = db.tables.ai_function_configs[0].verification_fingerprint
  const providerService = new AiProviderInstancesService({ Model: db, app })
  await providerService.patch('provider-1', { api_key: 'new-key' })
  assert.notEqual(db.tables.ai_function_configs[0].verification_fingerprint, previousFingerprint)
  assert.equal((await service.get('meeting_summary')).verification_status, 'verified')
  assert.equal((await service.find()).data.find((row) => row.function_key === 'meeting_summary').verification_status, 'verified')
})

test('re-enabling a provider rechecks an already linked active function', async () => {
  let calls = 0
  const { app, db, service } = fixture(async () => { calls += 1; return textResult() })
  await service.patch('meeting_summary', { enabled: true, provider_instance_id: 'provider-1', model: 'gpt-5.6-luna' })
  db.tables.ai_provider_instances[0].enabled = false
  const providerService = new AiProviderInstancesService({ Model: db, app })
  await providerService.patch('provider-1', { enabled: true })
  assert.equal(calls, 2)
  assert.equal((await service.get('meeting_summary')).verification_status, 'verified')
})

test('validated GPT-5.6 Luna configuration produces a meeting summary without temperature', async () => {
  const bodies = []
  const fetchFn = async (_url, options) => {
    const body = JSON.parse(options.body)
    bodies.push(body)
    const isProbe = body.messages[1].content.includes('configuration test')
    return textResult(JSON.stringify(isProbe ? { ok: true } : {
      language: 'de', mini_summary: 'Das Team plant den Rollout.',
      summary_points: ['Rollout am Freitag'], decisions: [], open_items: [], topic_chapters: []
    }))
  }
  const { app, db, service } = fixture(fetchFn)
  db.tables.meetings.push({ id: 'meeting-1', title: 'Rollout', language: 'de', status: 'ended', source_channel_id: 'source-1', chat_channel_id: 'chat-1', started_at: now, ended_at: now, updated_at: now })
  db.tables.channels.push({ id: 'source-1', name: 'Team' })
  db.tables.users.push({ id: 'user-1', display_name: 'Alex' })
  db.tables.messages.push({ id: 'message-1', channel_id: 'chat-1', user_id: 'user-1', type: 'text', content: 'Rollout am Freitag.', deleted_at: null, created_at: now })
  db.tables.meeting_artifacts.push({ id: 'summary-1', meeting_id: 'meeting-1', artifact_type: 'summary', status: 'processing', payload: null, created_at: now, updated_at: now })
  const originalGet = app.get.bind(app)
  app.get = (name) => {
    if (name === 'postgresqlClient') return db
    if (name === 'generateStructuredObject') return (args) => generateStructuredObject({ ...args, fetchFn })
    if (name === 'upsertMeetingArtifactSearchDocument') return async () => {}
    return originalGet(name)
  }
  app.service = () => ({ emit() {} })

  const config = await service.patch('meeting_summary', { enabled: true, provider_instance_id: 'provider-1', model: 'gpt-5.6-luna' })
  assert.equal(config.verification_status, 'verified')
  assert.equal(await processPendingMeetingSummaries(app), 1)
  assert.equal(db.tables.meeting_artifacts[0].status, 'ready')
  assert.equal(db.tables.meeting_artifacts[0].payload.mini_summary, 'Das Team plant den Rollout.')
  assert.equal(bodies.length, 2)
  assert.ok(bodies.every((body) => !Object.hasOwn(body, 'temperature')))
})
