export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['channel_id', 'last_read_at'],
  properties: {
    channel_id: { type: 'string', minLength: 1 },
    last_read_at: { type: 'string', format: 'date-time' }
  }
}
