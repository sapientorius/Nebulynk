import test from 'node:test'
import assert from 'node:assert/strict'
import { validate } from '../src/schemas/validators.js'
import { patchSchema } from '../src/services/users/users.schema.js'

test('users patch validation accepts meeting video preferences', async () => {
  const hook = validate(patchSchema)
  const context = {
    params: { provider: 'rest' },
    data: {
      meeting_video_preferences: {
        background_mode: 'blur',
        preferred_camera_device_id: 'camera-front',
 background_image_id: null,
 video_mirror: true
      }
    }
  }

  await hook(context)
  assert.deepEqual(context.data, {
    meeting_video_preferences: {
      background_mode: 'blur',
      preferred_camera_device_id: 'camera-front',
 background_image_id: null,
 video_mirror: true
    }
  })
})

test('users patch validation accepts image meeting video preferences', async () => {
  const hook = validate(patchSchema)
  const context = {
    params: { provider: 'rest' },
    data: {
      meeting_video_preferences: {
        background_mode: 'image',
        preferred_camera_device_id: null,
 background_image_id: 'background-1',
 video_mirror: false
      }
    }
  }

  await hook(context)
  assert.deepEqual(context.data.meeting_video_preferences, {
    background_mode: 'image',
    preferred_camera_device_id: null,
 background_image_id: 'background-1',
 video_mirror: false
  })
})

test('users patch validation rejects invalid meeting video preference values', async () => {
  const hook = validate(patchSchema)

  await assert.rejects(
    hook({
      params: { provider: 'rest' },
      data: {
        meeting_video_preferences: {
          background_mode: 'virtual-background'
        }
      }
    }),
    (error) => {
      assert.equal(error.error_code, 'api.validation.failed')
      return true
    }
  )
})

test('users patch validation rejects invalid video mirror values', async () => {
 const hook = validate(patchSchema)

 await assert.rejects(
 hook({
 params: { provider: 'rest' },
 data: {
 meeting_video_preferences: {
 video_mirror: 'true'
 }
 }
 }),
 (error) => {
 assert.equal(error.error_code, 'api.validation.failed')
 return true
 }
 )
})
