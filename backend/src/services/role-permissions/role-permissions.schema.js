export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['role_id', 'permission_id'],
  properties: {
    role_id: { type: 'string', minLength: 1 },
    permission_id: { type: 'string', minLength: 1 }
  }
}
