import { MEETING_HISTORY_ACCESS_VALUES } from '../../lib/meeting-history-access.js'

export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: ['string', 'null'] },
    topic: { type: ['string', 'null'] },
    type: { type: 'string', enum: ['public', 'private'] },
    is_voice: { type: 'boolean' },
    initial_user_ids: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      uniqueItems: true
    }
  }
}

export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: ['string', 'null'] },
    topic: { type: ['string', 'null'] },
    type: { type: 'string', enum: ['public', 'private'] },
    is_voice: { type: 'boolean' },
    is_archived: { type: 'boolean' },
    meeting_history_access: { type: 'string', enum: MEETING_HISTORY_ACCESS_VALUES }
  }
}
