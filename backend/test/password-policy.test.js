import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertPasswordStrength,
  countPasswordCharacterTypes,
  getPasswordStrengthValidation,
  serializePasswordStrengthPolicy
} from '../src/lib/password-policy.js'
import {
  isEmailDomainAllowed,
  normalizeAllowedDomains
} from '../src/lib/self-registration.js'
import { assertUserAccountActive } from '../src/lib/account-state.js'

test('password strength levels enforce the configured length and character type requirements', () => {
  assert.deepEqual(serializePasswordStrengthPolicy('basic'), {
    level: 'basic',
    min_length: 8,
    min_types: 2
  })
  assert.equal(getPasswordStrengthValidation('abcdefgh', 'basic').valid, false)
  assert.equal(getPasswordStrengthValidation('abcdefgh1', 'basic').valid, true)

  assert.deepEqual(serializePasswordStrengthPolicy('strong'), {
    level: 'strong',
    min_length: 8,
    min_types: 3
  })
  assert.equal(getPasswordStrengthValidation('abcdefgh1', 'strong').valid, false)
  assert.equal(getPasswordStrengthValidation('Abcdefgh1', 'strong').valid, true)

  assert.deepEqual(serializePasswordStrengthPolicy('very_strong'), {
    level: 'very_strong',
    min_length: 10,
    min_types: 3
  })
  assert.equal(getPasswordStrengthValidation('Abcdefgh1', 'very_strong').valid, false)
  assert.equal(getPasswordStrengthValidation('Abcdefgh12', 'very_strong').valid, true)
})

test('password policy counts lowercase, uppercase, number, and special character types', () => {
  assert.equal(countPasswordCharacterTypes('abcd'), 1)
  assert.equal(countPasswordCharacterTypes('Abcd'), 2)
  assert.equal(countPasswordCharacterTypes('Abcd4'), 3)
  assert.equal(countPasswordCharacterTypes('Abcd4!'), 4)
  assert.equal(countPasswordCharacterTypes('Äbc1'), 3)
})

test('password policy returns a localized API error payload when a password is too weak', () => {
  assert.throws(
    () => assertPasswordStrength('onlylowercase', 'strong'),
    (error) => {
      assert.equal(error.error_code, 'api.password_policy.requirements_not_met')
      assert.deepEqual(error.error_params, {
        min_length: 8,
        min_types: 3,
        level: 'strong'
      })
      return true
    }
  )
})

test('allowed registration domains are normalized and matched exactly', () => {
  const domains = normalizeAllowedDomains([
    ' Example.COM. ',
    'bücher.example',
    'example.com',
    'invalid/domain'
  ])

  assert.deepEqual(domains, ['example.com', 'xn--bcher-kva.example'])
  assert.equal(isEmailDomainAllowed('member@EXAMPLE.com', domains), true)
  assert.equal(isEmailDomainAllowed('member@sub.example.com', domains), false)
  assert.equal(isEmailDomainAllowed('member@bücher.example', domains), true)
  assert.equal(isEmailDomainAllowed('member@other.example', []), true)
})

test('pending registrations cannot authenticate while migrated active users remain eligible', () => {
  assert.doesNotThrow(() => assertUserAccountActive({ id: 'legacy-user' }))
  assert.throws(
    () => assertUserAccountActive({
      id: 'pending-user',
      registration_status: 'pending_admin_approval'
    }),
    (error) => {
      assert.equal(error.error_code, 'api.authentication.account_pending')
      return true
    }
  )
})
