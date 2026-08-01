export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['endpoint', 'p256dh', 'auth'],
  properties: {
    endpoint: { type: 'string', minLength: 1 },
    p256dh: { type: 'string', minLength: 1 },
    auth: { type: 'string', minLength: 1 }
  }
}
