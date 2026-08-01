export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['channel_id', 'message_id'],
  properties: {
    channel_id: { type: 'string', minLength: 1 },
    message_id: { type: 'string', minLength: 1 }
  }
}
