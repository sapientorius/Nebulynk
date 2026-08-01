import { makePatchSchema } from '../../schemas/validators.js'

export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'scope'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: ['string', 'null'] },
    scope: { type: 'string', enum: ['platform', 'channel'] }
  }
}

export const patchSchema = makePatchSchema(createSchema)
