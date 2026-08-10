import { MEETING_HISTORY_ACCESS_VALUES } from '../../lib/meeting-history-access.js'

export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['user_ids'],
  properties: {
    user_ids: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 1
    },
    name: { type: 'string', minLength: 1, maxLength: 100 }
  }
}

export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    topic: { type: ['string', 'null'], maxLength: 500 },
    meeting_history_access: { type: 'string', enum: MEETING_HISTORY_ACCESS_VALUES }
  }
}
