import { makePatchSchema } from '../../schemas/validators.js'
import { AI_PROVIDER_TYPES } from '../../lib/ai-config.js'

export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['provider_type', 'display_name', 'api_key'],
  properties: {
    provider_type: { type: 'string', enum: AI_PROVIDER_TYPES },
    display_name: { type: 'string', minLength: 1, maxLength: 100 },
    api_key: { type: 'string', minLength: 1, maxLength: 5000 },
    enabled: { type: 'boolean' },
    base_url: { type: ['string', 'null'], minLength: 1, maxLength: 500 }
  }
}

export const patchSchema = makePatchSchema(createSchema)
