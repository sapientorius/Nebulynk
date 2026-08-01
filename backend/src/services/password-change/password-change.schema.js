export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['current_password', 'new_password'],
  properties: {
    current_password: { type: 'string', minLength: 1, maxLength: 5000 },
    new_password: { type: 'string', minLength: 8, maxLength: 5000 }
  }
}
