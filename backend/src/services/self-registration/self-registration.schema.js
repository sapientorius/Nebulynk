export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password', 'display_name'],
  properties: {
    email: { type: 'string', format: 'email', minLength: 1, maxLength: 255 },
    password: { type: 'string', minLength: 8, maxLength: 5000 },
    display_name: { type: 'string', minLength: 1, maxLength: 100 }
  }
}

export const patchSchema = {
  type: 'object',
  additionalProperties: false
}
