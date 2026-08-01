export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['message_id', 'file_id'],
  properties: {
    message_id: { type: 'string', minLength: 1 },
    file_id: { type: 'string', minLength: 1 },
    retry: { type: 'boolean' }
  }
}
