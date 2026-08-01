import { makePatchSchema } from '../../schemas/validators.js'

export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['channel_id'],
  properties: {
    channel_id: { type: 'string', minLength: 1 }
  }
}

export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    is_muted: { type: 'boolean' },
    is_deafened: { type: 'boolean' },
    is_video_enabled: { type: 'boolean' }
  }
}
