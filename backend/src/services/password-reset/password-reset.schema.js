export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['email'],
  properties: {
    email: { type: 'string', format: 'email', minLength: 1, maxLength: 255 }
  }
}

export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['password'],
  properties: {
    password: { type: 'string', minLength: 8, maxLength: 5000 }
  }
}
