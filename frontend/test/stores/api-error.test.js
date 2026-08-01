import { describe, it, expect, beforeEach } from 'vitest'
import { setLocale } from '../../src/lib/i18n.js'
import { translateApiError } from '../../src/lib/api-error.js'

describe('api error translation', () => {
  beforeEach(() => {
    setLocale('en', { persist: false })
  })

  it('translates error_code in active locale', () => {
    const error = {
      response: {
        data: {
          error_code: 'api.meetings.meeting_not_found',
          error_params: {}
        }
      }
    }

    expect(translateApiError(error)).toBe('Meeting not found')
  })

  it('supports nested data.error_code shape', () => {
    const error = {
      response: {
        data: {
          data: {
            error_code: 'api.invite_accept.invite_expired',
            error_params: {}
          }
        }
      }
    }

    expect(translateApiError(error)).toBe('Invitation has expired')
  })

  it('interpolates error params', () => {
    const error = {
      response: {
        data: {
          error_code: 'api.permissions.missing_required_permission',
          error_params: {
            required: 'manage_users'
          }
        }
      }
    }

    expect(translateApiError(error)).toBe('Missing permission: manage_users')
  })

  it('falls back to generic i18n key instead of backend message', () => {
    const error = {
      response: {
        data: {
          error_code: 'api.unknown.code',
          message: 'Raw backend message should not be shown'
        }
      }
    }

    expect(translateApiError(error)).toBe('Something went wrong')
  })

  it('uses de locale translations', () => {
    setLocale('de', { persist: false })
    const error = {
      response: {
        data: {
          error_code: 'api.meetings.meeting_not_found',
          error_params: {}
        }
      }
    }

    expect(translateApiError(error)).toBe('Meeting nicht gefunden')
  })
})
