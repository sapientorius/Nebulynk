export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['channel_id'],
  properties: {
    channel_id: { type: 'string', minLength: 1 },
    content: { type: 'string' },
    file_ids: { type: 'array', items: { type: 'string', minLength: 1 } },
    reply_to_message_id: { type: 'string', minLength: 1 },
    forward_source_message_id: { type: 'string', minLength: 1 },
    forward_source_channel_id: { type: 'string', minLength: 1 },
    forward_source_snapshot: { type: 'object' }
  },
  anyOf: [
    {
      required: ['content'],
      properties: {
        content: { type: 'string', minLength: 1 }
      }
    },
    {
      required: ['file_ids'],
      properties: {
        file_ids: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } }
      }
    },
    {
      required: ['forward_source_message_id']
    }
  ]
}

export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['content'],
  properties: {
    content: { type: 'string', minLength: 1 }
  }
}

export const forwardSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['target_channel_id'],
  properties: {
    source_message_id: { type: 'string', minLength: 1 },
    source_url: { type: 'string', minLength: 1 },
    target_channel_id: { type: 'string', minLength: 1 },
    comment: { type: 'string' }
  },
  anyOf: [
    { required: ['source_message_id'] },
    { required: ['source_url'] }
  ]
}
