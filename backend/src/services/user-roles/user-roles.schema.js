export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['user_id', 'role_id'],
  properties: {
    user_id: { type: 'string', minLength: 1 },
    role_id: { type: 'string', minLength: 1 }
  }
}
