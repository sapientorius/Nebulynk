export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['channel_id', 'scope'],
  properties: {
    channel_id: { type: 'string', minLength: 1 },
    scope: { type: 'string', enum: ['message', 'selection', 'range'] },
    message_id: { type: 'string', minLength: 1 },
    message_ids: {
      type: 'array',
      minItems: 2,
      maxItems: 100,
      items: { type: 'string', minLength: 1 }
    },
    range_preset: {
      type: 'string',
      enum: ['last_hour', 'last_24h', 'last_48h', 'last_7d', 'custom']
    },
    range_value: { type: 'integer', minimum: 1 },
    range_unit: { type: 'string', enum: ['hours', 'days'] }
  }
}
