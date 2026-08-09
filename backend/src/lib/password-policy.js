import { badRequest } from './errors.js'

export const DEFAULT_PASSWORD_STRENGTH_LEVEL = 'basic'

export const PASSWORD_STRENGTH_LEVELS = Object.freeze({
  basic: Object.freeze({
    level: 'basic',
    minLength: 8,
    minTypes: 2
  }),
  strong: Object.freeze({
    level: 'strong',
    minLength: 8,
    minTypes: 3
  }),
  very_strong: Object.freeze({
    level: 'very_strong',
    minLength: 10,
    minTypes: 3
  })
})

const LOWERCASE_RE = /\p{Ll}/u
const UPPERCASE_RE = /\p{Lu}/u
const NUMBER_RE = /\p{N}/u
const SPECIAL_RE = /[^\p{L}\p{N}]/u

export function normalizePasswordStrengthLevel(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return Object.prototype.hasOwnProperty.call(PASSWORD_STRENGTH_LEVELS, normalized)
    ? normalized
    : DEFAULT_PASSWORD_STRENGTH_LEVEL
}

export function getPasswordStrengthPolicy(value) {
  return PASSWORD_STRENGTH_LEVELS[normalizePasswordStrengthLevel(value)]
}

export function serializePasswordStrengthPolicy(value) {
  const policy = getPasswordStrengthPolicy(value)
  return {
    level: policy.level,
    min_length: policy.minLength,
    min_types: policy.minTypes
  }
}

export function countPasswordCharacterTypes(password) {
  if (typeof password !== 'string') return 0

  return [LOWERCASE_RE, UPPERCASE_RE, NUMBER_RE, SPECIAL_RE]
    .reduce((count, expression) => count + (expression.test(password) ? 1 : 0), 0)
}

export function getPasswordStrengthValidation(password, level) {
  const policy = getPasswordStrengthPolicy(level)
  const length = typeof password === 'string' ? Array.from(password).length : 0
  const characterTypes = countPasswordCharacterTypes(password)

  return {
    valid: length >= policy.minLength && characterTypes >= policy.minTypes,
    minLength: policy.minLength,
    minTypes: policy.minTypes,
    length,
    characterTypes,
    level: policy.level
  }
}

export function assertPasswordStrength(password, level) {
  const validation = getPasswordStrengthValidation(password, level)
  if (validation.valid) return validation

  throw badRequest(
    'api.password_policy.requirements_not_met',
    {
      min_length: validation.minLength,
      min_types: validation.minTypes,
      level: validation.level
    },
    'Das Passwort erfuellt die konfigurierten Sicherheitsanforderungen nicht'
  )
}

export async function getConfiguredPasswordStrengthPolicy(db) {
  const row = await db('platform_settings').where('key', 'password_strength_level').first()
  return getPasswordStrengthPolicy(row?.value)
}
