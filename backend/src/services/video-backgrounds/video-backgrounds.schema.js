export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['prompt'],
  properties: {
    prompt: { type: 'string', minLength: 3, maxLength: 1000 },
    title: { type: ['string', 'null'], maxLength: 120 }
  }
}

export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    title: { type: ['string', 'null'], maxLength: 120 },
    is_global: { type: 'boolean' }
  }
}
