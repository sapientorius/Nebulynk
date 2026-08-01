import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { badRequest } from '../lib/errors.js'

const ajv = new Ajv({
  allErrors: true,
  removeAdditional: true,
  useDefaults: false,
  coerceTypes: false
})
addFormats(ajv)

/**
 * Derives a patch schema from a create schema.
 * Removes `required` and sets `minProperties: 1`.
 */
export function makePatchSchema(createSchema) {
  const { required, ...rest } = createSchema
  return { ...rest, minProperties: 1 }
}

/**
 * Before-hook factory: validates context.data against a JSON Schema.
 * Skips validation for internal (server-side) calls.
 */
export const validate = (schema) => {
  const compiledValidate = ajv.compile(schema)

  return async (context) => {
    if (!context.params.provider) return context

    const valid = compiledValidate(context.data)
    if (!valid) {
      const errors = compiledValidate.errors.map((err) => ({
        field: err.instancePath || '/',
        message: err.message,
        params: err.params
      }))
      throw badRequest('api.validation.failed', { errors }, 'Validierungsfehler')
    }

    return context
  }
}
