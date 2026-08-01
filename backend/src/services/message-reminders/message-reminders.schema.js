export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['message_id', 'remind_at'],
  properties: {
    message_id: { type: 'string', minLength: 1 },
    remind_at: { type: 'string', format: 'date-time' }
  }
}

export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['remind_at'],
  properties: {
    remind_at: { type: 'string', format: 'date-time' }
  }
}
