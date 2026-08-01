import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { S3Client } from '@aws-sdk/client-s3'
import { feathers } from '@feathersjs/feathers'
import { koa } from '@feathersjs/koa'
import { configureUploadRoute } from '../src/routes/upload.js'
import {
  normalizeUploadSettingsMap,
  UPLOAD_SETTING_KEYS
} from '../src/lib/upload-settings.js'

function createDb({ settings = {} } = {}) {
  const tables = {
    users: [
      { id: 'admin-1', is_admin: true },
      { id: 'user-1', is_admin: false }
    ],
    platform_settings: Object.entries(settings).map(([key, value]) => ({ key, value })),
    roles: [],
    permissions: [],
    role_permissions: [],
    user_roles: [],
    channel_members: [],
    files: []
  }

  return (table) => {
    const rows = tables[table]
    assert.ok(rows, `Unexpected table: ${table}`)
    const whereClauses = []

    const builder = {
      where(column, value) {
        whereClauses.push({ column, value })
        return this
      },
      whereIn(column, values) {
        whereClauses.push({ column, values })
        return this
      },
      join() {
        return this
      },
      first() {
        return Promise.resolve(this._resolve()[0])
      },
      insert(payload) {
        rows.push(payload)
        return Promise.resolve(1)
      },
      select(...columns) {
        const resolved = this._resolve()
        if (!columns.length || columns[0] === '*') return Promise.resolve(resolved)
        return Promise.resolve(resolved.map((row) => Object.fromEntries(
          columns.map((column) => [String(column).split('.').pop(), row[String(column).split('.').pop()]])
        )))
      },
      then(resolve, reject) {
        return Promise.resolve(this._resolve()).then(resolve, reject)
      },
      _resolve() {
        return rows.filter((row) => whereClauses.every((clause) => {
          if (clause.values) return clause.values.includes(row[clause.column])
          return row[clause.column] === clause.value
        }))
      }
    }

    return builder
  }
}

async function createHarness(settings = {}) {
  const app = koa(feathers())
  const uploads = []
  const services = {
    authentication: {
      async verifyAccessToken(token) {
        if (token !== 'valid-token') throw new Error('Invalid token')
        if (token === 'valid-token' && settings.userId) return { sub: settings.userId }
        return { sub: 'admin-1' }
      }
    }
  }
  const originalService = app.service.bind(app)
  app.service = (name) => services[name] || originalService(name)
  app.set('postgresqlClient', createDb({ settings }))
  if (settings.storageClient !== null) {
    app.set('storageClient', settings.storageClient || {
      async send(command) {
        uploads.push(command.input)
        return {}
      }
    })
  }
  if (settings.storagePresignClient !== null) {
    app.set('storagePresignClient', settings.storagePresignClient || new S3Client({
      endpoint: 'https://storage.example.test',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key'
      },
      forcePathStyle: true
    }))
  }
  if (settings.bucket !== null) {
    app.set('storageBucket', settings.bucket || 'files')
  }

  configureUploadRoute(app)

  const server = createServer(app.callback())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    uploads,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  }
}

test('upload settings default to 20 MB image optimization defaults', () => {
  assert.deepEqual(normalizeUploadSettingsMap({}, {}), {
    [UPLOAD_SETTING_KEYS.maxFileSizeMb]: '20',
    [UPLOAD_SETTING_KEYS.imageMaxDimensionPx]: '1920',
    [UPLOAD_SETTING_KEYS.imageQuality]: '82'
  })
})

test('upload route enforces configured max file size', async () => {
  const harness = await createHarness({
    [UPLOAD_SETTING_KEYS.maxFileSizeMb]: '1'
  })

  try {
    const formData = new FormData()
    formData.append(
      'file',
      new Blob([Buffer.alloc(1024 * 1024 + 1, 1)], { type: 'text/plain' }),
      'too-large.txt'
    )

    const response = await fetch(`${harness.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-token'
      },
      body: formData
    })

    const payload = await response.json()
    assert.equal(response.status, 400)
    assert.equal(payload.error_code, 'api.upload.multipart_parse_failed')
  } finally {
    await harness.close()
  }
})

test('upload route reports unavailable storage before parsing multipart data', async () => {
  const harness = await createHarness({
    storageClient: null
  })

  try {
    const formData = new FormData()
    formData.append('file', new Blob(['hello'], { type: 'text/plain' }), 'hello.txt')

    const response = await fetch(`${harness.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-token'
      },
      body: formData
    })
    const payload = await response.json()

    assert.equal(response.status, 503)
    assert.equal(payload.error_code, 'api.upload.storage_unavailable')
  } finally {
    await harness.close()
  }
})

test('upload route rejects non-audio files for voice messages', async () => {
  const harness = await createHarness()

  try {
    const formData = new FormData()
    formData.append('purpose', 'voice_message')
    formData.append('file', new Blob(['hello'], { type: 'text/plain' }), 'voice.txt')

    const response = await fetch(`${harness.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-token'
      },
      body: formData
    })
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.equal(payload.error_code, 'api.upload.voice_message_audio_required')
  } finally {
    await harness.close()
  }
})

test('upload route rejects users without upload permission', async () => {
  const harness = await createHarness({
    userId: 'user-1'
  })

  try {
    const formData = new FormData()
    formData.append('file', new Blob(['hello'], { type: 'text/plain' }), 'hello.txt')

    const response = await fetch(`${harness.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-token'
      },
      body: formData
    })
    const payload = await response.json()

    assert.equal(response.status, 403)
    assert.equal(payload.error_code, 'api.upload.missing_permission_upload_files')
  } finally {
    await harness.close()
  }
})

test('upload route returns only public file metadata and a signed URL', async () => {
  const harness = await createHarness()

  try {
    const formData = new FormData()
    formData.append('duration_ms', '1200')
    formData.append('file', new Blob(['voice'], { type: 'audio/webm' }), 'voice.webm')

    const response = await fetch(`${harness.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-token'
      },
      body: formData
    })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.original_name, 'voice.webm')
    assert.equal(payload.mime_type, 'audio/webm')
    assert.equal(payload.duration_ms, 1200)
    assert.match(payload.url, /^https:\/\/storage\.example\.test\/files\//)
    assert.equal(Object.hasOwn(payload, 'storage_key'), false)
    assert.equal(Object.hasOwn(payload, 'bucket'), false)
    assert.equal(harness.uploads.length, 1)
  } finally {
    await harness.close()
  }
})
