import { describe, expect, it } from 'vitest'
import {
  countPasswordCharacterTypes,
  isPasswordValidForPolicy,
  normalizePasswordPolicy
} from '../../src/lib/password-policy.js'

describe('password policy helpers', () => {
  it('uses the basic policy when no server policy is available yet', () => {
    expect(normalizePasswordPolicy()).toEqual({
      level: 'basic',
      min_length: 8,
      min_types: 2
    })
  })

  it('counts the four configured character types', () => {
    expect(countPasswordCharacterTypes('abcdef')).toBe(1)
    expect(countPasswordCharacterTypes('Abcdef')).toBe(2)
    expect(countPasswordCharacterTypes('Abcdef1')).toBe(3)
    expect(countPasswordCharacterTypes('Abcdef1!')).toBe(4)
  })

  it('matches the server policy rules before the form is submitted', () => {
    expect(isPasswordValidForPolicy('abcdefgh1', {
      level: 'basic',
      min_length: 8,
      min_types: 2
    })).toBe(true)
    expect(isPasswordValidForPolicy('abcdefgh1', {
      level: 'strong',
      min_length: 8,
      min_types: 3
    })).toBe(false)
    expect(isPasswordValidForPolicy('Abcdefgh1', {
      level: 'strong',
      min_length: 8,
      min_types: 3
    })).toBe(true)
    expect(isPasswordValidForPolicy('Abcdefgh1', {
      level: 'very_strong',
      min_length: 10,
      min_types: 3
    })).toBe(false)
  })
})
