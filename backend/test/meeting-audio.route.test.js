import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { feathers } from '@feathersjs/feathers'
import { koa } from '@feathersjs/koa'
import { configureMeetingAudioRoute } from '../src/routes/meeting-audio.js'
import { createMemoryDb } from './helpers/memory-db.js'

async function createHarness({
  user = { id: 'admin-1', is_admin: true },
  recordings = [],
  storageClient = null
} = {}) {
  const db = createMemoryDb({
    users: [user],
    meeting_recordings: recordings
  })
  const app = koa(feathers())
  const services = {
    authentication: {
      async verifyAccessToken(token) {
        if (token !== 'valid-token') throw new Error('Invalid token')
        return { sub: user.id }
      }
    },
    meetings: {
      async get(meetingId) {
        return { id: meetingId }
      }
    }
  }
  const originalService = app.service.bind(app)
  app.service = (name) => services[name] || originalService(name)
  app.set('postgresqlClient', db)
  app.set('storageClient', storageClient)

  configureMeetingAudioRoute(app)

  const server = createServer(app.callback())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  }
}

test('meeting audio route requires authentication', async () => {
  const harness = await createHarness()

  try {
    const response = await fetch(`${harness.baseUrl}/meetings/meeting-1/audio`)
    const payload = await response.json()

    assert.equal(response.status, 401)
    assert.equal(payload.error_code, 'api.meetings.authentication_required')
  } finally {
    await harness.close()
  }
})

test('meeting audio route is admin-only', async () => {
  const harness = await createHarness({
    user: { id: 'user-1', is_admin: false }
  })

  try {
    const response = await fetch(`${harness.baseUrl}/meetings/meeting-1/audio`, {
      headers: { Authorization: 'Bearer valid-token' }
    })
    const payload = await response.json()

    assert.equal(response.status, 403)
    assert.equal(payload.error_code, 'api.meetings.audio_download_admin_only')
  } finally {
    await harness.close()
  }
})

test('meeting audio route streams a zip for downloadable recordings', async () => {
  const harness = await createHarness({
    recordings: [{
      id: 'recording-1',
      meeting_id: 'meeting-zip-1',
      participant_display_name: 'Alex Example',
      status: 'ready',
      storage_bucket: 'bucket-1',
      storage_key: 'meeting-recordings/meeting-zip-1/user-1/recording-1.mp4'
    }, {
      id: 'recording-2',
      meeting_id: 'meeting-zip-1',
      participant_identity: 'Speaker 2',
      status: 'completed',
      storage_bucket: 'bucket-1',
      storage_key: 'meeting-recordings/meeting-zip-1/user-2/recording-2.mp4'
    }],
    storageClient: {
      async send(command) {
        const key = command?.input?.Key
        return {
          Body: {
            async transformToByteArray() {
              return Buffer.from(key.includes('recording-1') ? 'alpha-audio' : 'beta-audio')
            }
          },
          ContentType: 'audio/mp4',
          ContentLength: 10
        }
      }
    }
  })

  try {
    const response = await fetch(`${harness.baseUrl}/meetings/meeting-zip-1/audio`, {
      headers: { Authorization: 'Bearer valid-token' }
    })
    const body = Buffer.from(await response.arrayBuffer())

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/zip')
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="meeting-meeting-zip-1-audio.zip"')
    assert.equal(body.includes(Buffer.from('alex-example-recording-1.mp4')), true)
    assert.equal(body.includes(Buffer.from('speaker-2-recording-2.mp4')), true)
  } finally {
    await harness.close()
  }
})

test('meeting audio route reports when storage is unavailable', async () => {
  const harness = await createHarness({
    recordings: [{
      id: 'recording-1',
      meeting_id: 'meeting-storage-1',
      status: 'ready',
      storage_bucket: 'bucket-1',
      storage_key: 'meeting-recordings/meeting-storage-1/user-1/recording-1.mp4'
    }]
  })

  try {
    const response = await fetch(`${harness.baseUrl}/meetings/meeting-storage-1/audio`, {
      headers: { Authorization: 'Bearer valid-token' }
    })
    const payload = await response.json()

    assert.equal(response.status, 503)
    assert.equal(payload.error_code, 'api.meetings.audio_download_storage_unavailable')
  } finally {
    await harness.close()
  }
})

test('meeting audio route reports when no downloadable recordings exist', async () => {
  const harness = await createHarness({
    recordings: [{
      id: 'recording-1',
      meeting_id: 'meeting-empty-1',
      status: 'failed',
      storage_bucket: 'bucket-1',
      storage_key: 'meeting-recordings/meeting-empty-1/user-1/recording-1.mp4',
      failure_code: 'egress_failed'
    }],
    storageClient: {
      async send() {
        throw new Error('should not read files')
      }
    }
  })

  try {
    const response = await fetch(`${harness.baseUrl}/meetings/meeting-empty-1/audio`, {
      headers: { Authorization: 'Bearer valid-token' }
    })
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.equal(payload.error_code, 'api.meetings.audio_download_no_recordings')
  } finally {
    await harness.close()
  }
})

test('meeting audio route uses a sanitized download filename', async () => {
  const meetingId = 'Meeting One!'
  const harness = await createHarness({
    recordings: [{
      id: 'recording-1',
      meeting_id: meetingId,
      participant_display_name: 'Alex Example',
      status: 'ready',
      storage_bucket: 'bucket-1',
      storage_key: 'meeting-recordings/meeting-one/user-1/recording-1.mp4'
    }],
    storageClient: {
      async send() {
        return {
          Body: {
            async transformToByteArray() {
              return Buffer.from('audio')
            }
          },
          ContentType: 'audio/mp4',
          ContentLength: 5
        }
      }
    }
  })

  try {
    const response = await fetch(`${harness.baseUrl}/meetings/${encodeURIComponent(meetingId)}/audio`, {
      headers: { Authorization: 'Bearer valid-token' }
    })

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="meeting-meeting-one-audio.zip"')
  } finally {
    await harness.close()
  }
})

test('meeting audio route does not leak storage internals when object reads fail', async () => {
  const harness = await createHarness({
    recordings: [{
      id: 'recording-1',
      meeting_id: 'meeting-read-fail',
      status: 'ready',
      storage_bucket: 'private-bucket',
      storage_key: 'meeting-recordings/meeting-read-fail/user-1/recording-1.mp4'
    }],
    storageClient: {
      async send(command) {
        throw new Error(`failed to read ${command.input.Bucket}/${command.input.Key}`)
      }
    }
  })

  try {
    const response = await fetch(`${harness.baseUrl}/meetings/meeting-read-fail/audio`, {
      headers: { Authorization: 'Bearer valid-token' }
    })
    const payload = await response.json()

    assert.equal(response.status, 502)
    assert.equal(payload.error_code, 'api.meetings.audio_download_read_failed')
    assert.equal(JSON.stringify(payload).includes('private-bucket'), false)
    assert.equal(JSON.stringify(payload).includes('meeting-recordings'), false)
  } finally {
    await harness.close()
  }
})
