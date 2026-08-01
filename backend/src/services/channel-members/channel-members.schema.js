export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['channel_id', 'user_id'],
  properties: {
    channel_id: { type: 'string', minLength: 1 },
    user_id: { type: 'string', minLength: 1 },
    role: { type: 'string', enum: ['owner', 'admin', 'member'] }
  }
}

export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    role: { type: 'string', enum: ['owner', 'admin', 'member'] },
    last_read_at: { type: 'string', format: 'date-time' },
    notifications: { type: 'string', enum: ['all', 'mentions', 'none'] }
  }
}
