export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['message_id', 'emoji'],
  properties: {
    message_id: { type: 'string', minLength: 1 },
    emoji: { type: 'string', minLength: 1, maxLength: 100 }
  }
}
