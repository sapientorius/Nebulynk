import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AVATAR_OUTPUT_MIME_TYPE,
  AVATAR_SIZE,
  MAX_AVATAR_FILE_SIZE,
  assertAvatarPatchAllowed,
  buildAvatarUrl,
  isManagedAvatarUrl,
  normalizeAvatarImage
} from '../src/lib/avatar.js'
import sharp from 'sharp'

test('buildAvatarUrl returns the versioned managed avatar path', () => {
  const url = buildAvatarUrl('user-1', '2026-04-05T10:00:00.000Z')

  assert.equal(url, '/api/users/user-1/avatar?v=2026-04-05T10%3A00%3A00.000Z')
  assert.equal(isManagedAvatarUrl(url), true)
  assert.equal(isManagedAvatarUrl('https://example.com/avatar.png'), false)
})

test('assertAvatarPatchAllowed rejects external avatar field patches', async () => {
  await assert.rejects(
    async () => assertAvatarPatchAllowed({
      params: { provider: 'rest' },
      data: { avatar_url: '/api/users/user-1/avatar?v=1' }
    }),
    (error) => {
      assert.equal(error.data?.error_code, 'api.users.avatar_updates_use_avatar_endpoint')
      return true
    }
  )
})

test('normalizeAvatarImage converts valid input into a bounded webp avatar', async () => {
  const buffer = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 40, g: 120, b: 200, alpha: 1 }
    }
  }).png().toBuffer()

  const result = await normalizeAvatarImage(buffer)

  assert.equal(result.mimeType, AVATAR_OUTPUT_MIME_TYPE)
  assert.ok(result.size <= MAX_AVATAR_FILE_SIZE)

  const metadata = await sharp(result.buffer).metadata()
  assert.equal(metadata.format, 'webp')
  assert.equal(metadata.width, AVATAR_SIZE)
  assert.equal(metadata.height, AVATAR_SIZE)
})

test('normalizeAvatarImage rejects invalid image payloads', async () => {
  await assert.rejects(
    normalizeAvatarImage(Buffer.from('not-an-image')),
    (error) => {
      assert.equal(error.data?.error_code, 'api.avatar.invalid_image')
      return true
    }
  )
})
