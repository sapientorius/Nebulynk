export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    enabled: { type: 'boolean' },
    host: { type: ['string', 'null'], maxLength: 255 },
    port: { type: ['integer', 'null'], minimum: 1, maximum: 65535 },
    secure: { type: 'boolean' },
    ignore_tls: { type: 'boolean' },
    user: { type: ['string', 'null'], maxLength: 255 },
    password: { type: ['string', 'null'], maxLength: 5000 },
    from_email: { type: ['string', 'null'], format: 'email', maxLength: 255 },
    from_name: { type: ['string', 'null'], maxLength: 255 }
  }
}

export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: { type: 'string', enum: ['test_connection', 'send_test_email'] },
    to: { type: 'string', format: 'email', maxLength: 255 }
  }
}
