import { PASSWORD_STRENGTH_LEVELS } from '../../lib/password-policy.js'

export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['password_strength_level'],
  properties: {
    password_strength_level: {
      type: 'string',
      enum: Object.keys(PASSWORD_STRENGTH_LEVELS)
    }
  }
}
