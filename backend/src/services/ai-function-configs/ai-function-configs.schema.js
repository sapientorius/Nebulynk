import { AI_FUNCTION_KEYS } from '../../lib/ai-config.js'

export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    function_key: { type: 'string', enum: AI_FUNCTION_KEYS },
    enabled: { type: 'boolean' },
    provider_instance_id: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
    model: { type: ['string', 'null'], minLength: 1, maxLength: 255 }
  }
}
