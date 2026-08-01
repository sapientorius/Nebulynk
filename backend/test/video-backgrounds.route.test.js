import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { feathers } from '@feathersjs/feathers'
import { koa } from '@feathersjs/koa'
import sharp from 'sharp'
import { configureVideoBackgroundRoutes } from '../src/routes/video-backgrounds.js'

function createDb(users) {
  return (table) => {
    assert.equal(table, 'users')
    return {
      where(column, value) {
        assert.equal(column, 'id')
        return {
          async first() {
            const match = users.find((entry) => entry.id === value)
            return match ? { ...match } : undefined
          }
        }
      }
    }
  }
}

async function createHarness() {
  const app = koa(feathers())
  const users = [{ id: 'user-1', email: 'user@example.com', account_status: 'active' }]
  const uploads = []
  const services = {
    authentication: {
      async verifyAccessToken(token) {
        if (token !== 'valid-token') throw new Error('Invalid token')
        return { sub: 'user-1' }
      }
    },
    'video-backgrounds': {
      async storeUploadedBackground(user, { buffer, title = null } = {}) {
        uploads.push({ user, buffer, title })
        return {
          id: 'background-1',
          user_id: user.id,
          title,
          source: 'upload',
          is_global: false,
          url: '/api/video-backgrounds/background-1/content?v=test'
        }
      }
    }
  }

  const originalService = app.service.bind(app)
  app.service = (name) => services[name] || originalService(name)
  app.set('postgresqlClient', createDb(users))

  configureVideoBackgroundRoutes(app)

  const server = createServer(app.callback())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  return {
    baseUrl,
    uploads,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  }
}

async function createPngBuffer() {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 30, g: 90, b: 160, alpha: 1 }
    }
  }).png().toBuffer()
}

test('video background upload accepts multipart file', async () => {
  const harness = await createHarness()
  const pngBuffer = await createPngBuffer()
  const formData = new FormData()
  formData.append('file', new Blob([pngBuffer], { type: 'image/png' }), 'office.png')
  formData.append('title', 'Office')

  try {
    const response = await fetch(`${harness.baseUrl}/video-backgrounds/upload`, {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token' },
      body: formData
    })
    const payload = await response.json()

    assert.equal(response.status, 201)
    assert.equal(payload.id, 'background-1')
    assert.equal(payload.title, 'Office')
    assert.equal(harness.uploads.length, 1)
    assert.equal(harness.uploads[0].user.id, 'user-1')
    assert.equal(Buffer.isBuffer(harness.uploads[0].buffer), true)
  } finally {
    await harness.close()
  }
})

test('video background upload reports missing multipart file', async () => {
  const harness = await createHarness()
  const formData = new FormData()
  formData.append('title', 'Missing file')

  try {
    const response = await fetch(`${harness.baseUrl}/video-backgrounds/upload`, {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token' },
      body: formData
    })
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.equal(payload.error_code, 'api.video_backgrounds.no_file_provided')
    assert.equal(harness.uploads.length, 0)
  } finally {
    await harness.close()
  }
})
