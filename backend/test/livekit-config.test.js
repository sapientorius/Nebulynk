import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { TrackSource } from 'livekit-server-sdk'

const originalEnv = { ...process.env }

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key]
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value
  }
}

test.afterEach(() => {
  restoreEnv()
})

test('getEgressStorageConfig separates backend and egress S3 endpoints', async () => {
  process.env.MEETING_RECORDINGS_S3_ENDPOINT = 'http://127.0.0.1:3900'
  process.env.MEETING_RECORDINGS_EGRESS_S3_ENDPOINT = 'http://garage:3900'
  process.env.MEETING_RECORDINGS_BUCKET = 'meeting-bucket'

  const { getEgressStorageConfig } = await import(`../src/lib/livekit.js?case=${Date.now()}`)
  const config = getEgressStorageConfig()

  assert.equal(config.endpoint, 'http://127.0.0.1:3900')
  assert.equal(config.egressEndpoint, 'http://garage:3900')
  assert.equal(config.bucket, 'meeting-bucket')
})

test('getEgressStorageConfig rewrites loopback backend endpoints for containerized egress uploads', async () => {
  process.env.MEETING_RECORDINGS_S3_ENDPOINT = 'http://127.0.0.1:3900'
  delete process.env.MEETING_RECORDINGS_EGRESS_S3_ENDPOINT

  const { getEgressStorageConfig } = await import(`../src/lib/livekit.js?case=${Date.now()}`)
  const config = getEgressStorageConfig()

  assert.equal(config.endpoint, 'http://127.0.0.1:3900')
  assert.equal(config.egressEndpoint, 'http://garage:3900')
})

test('normalizeEgressFileInfo supports protobuf-style timestamp objects', async () => {
  const { normalizeEgressFileInfo } = await import(`../src/lib/livekit.js?case=${Date.now()}`)
  const info = normalizeEgressFileInfo({
    fileResults: [{
      filename: 'meeting-recordings/meeting-1/user-1/file.mp4',
      startedAt: { seconds: 1711297145, nanos: 123000000 },
      endedAt: { seconds: 1711297150, nanos: 456000000 },
      duration: '5000000000'
    }]
  })

  assert.equal(info.storageKey, 'meeting-recordings/meeting-1/user-1/file.mp4')
  assert.equal(info.startedAt, '2024-03-24T16:19:05.123Z')
  assert.equal(info.endedAt, '2024-03-24T16:19:10.456Z')
  assert.equal(info.durationMs, 5000)
})

test('normalizeEgressFileInfo supports nanosecond epoch values', async () => {
  const { normalizeEgressFileInfo } = await import(`../src/lib/livekit.js?case=${Date.now()}`)
  const info = normalizeEgressFileInfo({
    startedAt: '1711297145123000000',
    endedAt: '1711297150456000000'
  })

  assert.equal(info.startedAt, '2024-03-24T16:19:05.123Z')
  assert.equal(info.endedAt, '2024-03-24T16:19:10.456Z')
})

test('normalizeEgressFileInfo normalizes nanosecond duration values to milliseconds', async () => {
  const { normalizeEgressFileInfo } = await import(`../src/lib/livekit.js?case=${Date.now()}`)
  const info = normalizeEgressFileInfo({
    fileResults: [{
      filename: 'meeting-recordings/meeting-1/user-1/file.mp4',
      duration: '18073950106'
    }]
  })

  assert.equal(info.durationMs, 18074)
})

test('buildParticipantGrant includes camera only when explicitly allowed', async () => {
  const { buildParticipantGrant } = await import(`../src/lib/livekit.js?case=${Date.now()}`)

  const voiceGrant = buildParticipantGrant('voice-room')
  assert.equal(voiceGrant.canPublishSources.includes(TrackSource.CAMERA), false)
  assert.equal(voiceGrant.canPublishSources.includes(TrackSource.MICROPHONE), true)
  assert.equal(voiceGrant.canPublishSources.includes(TrackSource.SCREEN_SHARE), true)

  const meetingGrant = buildParticipantGrant('meeting-room', { allowCamera: true })
  assert.equal(meetingGrant.canPublishSources.includes(TrackSource.CAMERA), true)
})

test('livekit-egress config relies on env-provided LiveKit credentials and ws url', async () => {
  const configPath = new URL('../../livekit-egress.yaml', import.meta.url)
  const contents = await readFile(configPath, 'utf8')

  assert.equal(/^\s*api_key\s*:/m.test(contents), false)
  assert.equal(/^\s*api_secret\s*:/m.test(contents), false)
  assert.equal(/^\s*ws_url\s*:/m.test(contents), false)
  assert.match(contents, /LIVEKIT_API_KEY/)
  assert.match(contents, /LIVEKIT_API_SECRET/)
  assert.match(contents, /LIVEKIT_WS_URL/)
})
