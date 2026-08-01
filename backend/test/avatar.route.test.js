import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { feathers } from '@feathersjs/feathers'
import { koa } from '@feathersjs/koa'
import sharp from 'sharp'
import { configureAvatarRoutes } from '../src/routes/avatar.js'

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

function createStorageClient(objects) {
  return {
    async send(command) {
      const { Key, Body, ContentType } = command.input
      const commandName = command.constructor?.name

      if (commandName === 'PutObjectCommand') {
        objects.set(Key, {
          buffer: Buffer.from(Body),
          mime: ContentType
        })
        return {}
      }

      if (commandName === 'GetObjectCommand') {
        const item = objects.get(Key)
        if (!item) throw new Error('Not found')

        return {
          Body: {
            async transformToByteArray() {
              return Uint8Array.from(item.buffer)
            }
          },
          ContentType: item.mime,
          ContentLength: item.buffer.length
        }
      }

      if (commandName === 'DeleteObjectCommand') {
        objects.delete(Key)
        return {}
      }

      throw new Error(`Unexpected storage command: ${commandName}`)
    }
  }
}

async function createHarness(initialUsers = [{
  id: 'user-1',
  avatar_url: null,
  avatar_storage_key: null
}], options = {}) {
  const app = koa(feathers())
  const users = initialUsers.map((entry) => ({ ...entry }))
  const objects = new Map()
  const db = createDb(users)
  const storageClient = createStorageClient(objects)

  const services = {
    authentication: {
      async verifyAccessToken(token) {
        if (token !== 'valid-token') throw new Error('Invalid token')
        return { sub: 'user-1' }
      }
    },
    users: {
      async patch(id, patchData) {
        if (options.patchImpl) {
          return options.patchImpl({ id, patchData, users })
        }
        const target = users.find((entry) => entry.id === id)
        Object.assign(target, patchData)
        return {
          id: target.id,
          avatar_url: target.avatar_url
        }
      }
    }
  }

  const originalService = app.service.bind(app)
  app.service = (name) => services[name] || originalService(name)
  app.set('postgresqlClient', db)
  app.set('storageClient', storageClient)
  app.set('storageBucket', 'avatars')

  configureAvatarRoutes(app)

  const server = createServer(app.callback())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  return {
    baseUrl,
    users,
    objects,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  }
}

async function uploadAvatar(baseUrl, body, headers = {}) {
  return fetch(`${baseUrl}/users/me/avatar`, {
    method: 'POST',
    headers,
    body
  })
}

async function createPngBuffer() {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 40, g: 120, b: 200, alpha: 1 }
    }
  }).png().toBuffer()
}

test('avatar upload stores a normalized avatar and patches the user avatar url', async () => {
  const harness = await createHarness()
  const pngBuffer = await createPngBuffer()
  const formData = new FormData()
  formData.append('file', new Blob([pngBuffer], { type: 'image/png' }), 'avatar.png')

  try {
    const response = await uploadAvatar(harness.baseUrl, formData, {
      Authorization: 'Bearer valid-token'
    })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.match(payload.avatar_url, /^\/api\/users\/user-1\/avatar\?v=/)
    assert.equal(Object.hasOwn(payload, 'avatar_storage_key'), false)
    assert.equal(harness.users[0].avatar_storage_key?.startsWith('avatars/user-1/'), true)
    assert.equal(harness.objects.size, 1)
  } finally {
    await harness.close()
  }
})

test('avatar upload removes the newly stored object when user patch fails', async () => {
  const harness = await createHarness([{
    id: 'user-1',
    avatar_url: null,
    avatar_storage_key: null
  }], {
    patchImpl: async () => {
      throw new Error('patch failed')
    }
  })
  const pngBuffer = await createPngBuffer()
  const formData = new FormData()
  formData.append('file', new Blob([pngBuffer], { type: 'image/png' }), 'avatar.png')

  try {
    const response = await uploadAvatar(harness.baseUrl, formData, {
      Authorization: 'Bearer valid-token'
    })
    const payload = await response.json()

    assert.equal(response.status, 500)
    assert.equal(payload.error_code, 'api.avatar.upload_failed')
    assert.equal(harness.objects.size, 0)
    assert.equal(harness.users[0].avatar_storage_key, null)
  } finally {
    await harness.close()
  }
})

test('avatar upload rejects unsupported media types', async () => {
  const harness = await createHarness()
  const formData = new FormData()
  formData.append('file', new Blob(['hello'], { type: 'text/plain' }), 'avatar.txt')

  try {
    const response = await uploadAvatar(harness.baseUrl, formData, {
      Authorization: 'Bearer valid-token'
    })
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.equal(payload.error_code, 'api.avatar.unsupported_image_type')
  } finally {
    await harness.close()
  }
})

test('avatar upload rejects files above the raw upload size limit', async () => {
  const harness = await createHarness()
  const formData = new FormData()
  formData.append('file', new Blob([Buffer.alloc(10 * 1024 * 1024 + 1, 7)], { type: 'image/png' }), 'huge.png')

  try {
    const response = await uploadAvatar(harness.baseUrl, formData, {
      Authorization: 'Bearer valid-token'
    })
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.equal(payload.error_code, 'api.avatar.multipart_parse_failed')
  } finally {
    await harness.close()
  }
})

test('avatar upload replaces an old stored avatar object', async () => {
  const harness = await createHarness([{
    id: 'user-1',
    avatar_url: '/api/users/user-1/avatar?v=old',
    avatar_storage_key: 'avatars/user-1/old.webp'
  }])
  harness.objects.set('avatars/user-1/old.webp', {
    buffer: Buffer.from('old-avatar'),
    mime: 'image/webp'
  })

  const pngBuffer = await createPngBuffer()
  const formData = new FormData()
  formData.append('file', new Blob([pngBuffer], { type: 'image/png' }), 'avatar.png')

  try {
    const response = await uploadAvatar(harness.baseUrl, formData, {
      Authorization: 'Bearer valid-token'
    })

    assert.equal(response.status, 200)
    assert.equal(harness.objects.has('avatars/user-1/old.webp'), false)
    assert.equal(harness.objects.size, 1)
  } finally {
    await harness.close()
  }
})

test('avatar delete removes the stored object and clears avatar fields', async () => {
  const harness = await createHarness([{
    id: 'user-1',
    avatar_url: '/api/users/user-1/avatar?v=old',
    avatar_storage_key: 'avatars/user-1/old.webp'
  }])
  harness.objects.set('avatars/user-1/old.webp', {
    buffer: Buffer.from('old-avatar'),
    mime: 'image/webp'
  })

  try {
    const response = await fetch(`${harness.baseUrl}/users/me/avatar`, {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid-token'
      }
    })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.avatar_url, null)
    assert.equal(harness.users[0].avatar_url, null)
    assert.equal(harness.users[0].avatar_storage_key, null)
    assert.equal(harness.objects.size, 0)
  } finally {
    await harness.close()
  }
})

test('avatar get requires authentication', async () => {
  const harness = await createHarness([{
    id: 'user-1',
    avatar_url: '/api/users/user-1/avatar?v=old',
    avatar_storage_key: 'avatars/user-1/old.webp'
  }])

  try {
    const response = await fetch(`${harness.baseUrl}/users/user-1/avatar`)
    const payload = await response.json()

    assert.equal(response.status, 401)
    assert.equal(payload.error_code, 'api.avatar.authentication_required')
  } finally {
    await harness.close()
  }
})

test('avatar get streams the stored avatar bytes for authenticated requests', async () => {
  const harness = await createHarness([{
    id: 'user-1',
    avatar_url: '/api/users/user-1/avatar?v=old',
    avatar_storage_key: 'avatars/user-1/old.webp'
  }])
  harness.objects.set('avatars/user-1/old.webp', {
    buffer: Buffer.from('avatar-binary'),
    mime: 'image/webp'
  })

  try {
    const response = await fetch(`${harness.baseUrl}/users/user-1/avatar`, {
      headers: {
        Authorization: 'Bearer valid-token'
      }
    })
    const body = Buffer.from(await response.arrayBuffer())

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/webp')
    assert.deepEqual(body, Buffer.from('avatar-binary'))
  } finally {
    await harness.close()
  }
})
