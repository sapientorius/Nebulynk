export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'display_name', 'password'],
  properties: {
    token: { type: 'string', minLength: 1 },
    display_name: { type: 'string', minLength: 1, maxLength: 100 },
    password: { type: 'string', minLength: 8 }
  }
}
