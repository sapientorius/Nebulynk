export const DEFAULT_PASSWORD_POLICY = Object.freeze({
  level: 'basic',
  min_length: 8,
  min_types: 2
})

export function normalizePasswordPolicy(value) {
  const minLength = Number.parseInt(value?.min_length, 10)
  const minTypes = Number.parseInt(value?.min_types, 10)
  return {
    level: typeof value?.level === 'string' ? value.level : DEFAULT_PASSWORD_POLICY.level,
    min_length: Number.isFinite(minLength) && minLength >= 8 ? minLength : DEFAULT_PASSWORD_POLICY.min_length,
    min_types: Number.isFinite(minTypes) && minTypes >= 2 ? minTypes : DEFAULT_PASSWORD_POLICY.min_types
  }
}

export function countPasswordCharacterTypes(password) {
  if (typeof password !== 'string') return 0
  return [
    /\p{Ll}/u,
    /\p{Lu}/u,
    /\p{N}/u,
    /[^\p{L}\p{N}]/u
  ].reduce((count, expression) => count + (expression.test(password) ? 1 : 0), 0)
}

export function isPasswordValidForPolicy(password, policy) {
  const normalized = normalizePasswordPolicy(policy)
  return Array.from(password || '').length >= normalized.min_length
    && countPasswordCharacterTypes(password) >= normalized.min_types
}
