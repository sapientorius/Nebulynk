export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['email'],
  properties: {
    email: { type: 'string', format: 'email', minLength: 1 },
    role_to_assign: { type: 'string', minLength: 1 },
    message: { type: ['string', 'null'] },
    expires_in: { type: 'number', minimum: 0 }
  }
}

export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['revoked'] }
  }
}
