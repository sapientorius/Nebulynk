export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['is_read'],
  properties: {
    is_read: { type: 'boolean' }
  }
}
