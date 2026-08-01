import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePasswordResetStore } from '../../src/stores/password-reset.js'

const requestPasswordResetMock = vi.hoisted(() => vi.fn())
const resetPasswordMock = vi.hoisted(() => vi.fn())
const validatePasswordResetTokenMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/api.js', () => ({
  requestPasswordReset: requestPasswordResetMock,
  resetPassword: resetPasswordMock,
  validatePasswordResetToken: validatePasswordResetTokenMock
}))

describe('password-reset store', () => {
  beforeEach(() => {
    requestPasswordResetMock.mockReset()
    resetPasswordMock.mockReset()
    validatePasswordResetTokenMock.mockReset()
  })

  it('delegates reset requests to the API helper', async () => {
    const store = usePasswordResetStore()
    requestPasswordResetMock.mockResolvedValue({ ok: true })

    const result = await store.requestReset('member@example.com')

    expect(requestPasswordResetMock).toHaveBeenCalledWith('member@example.com')
    expect(result).toEqual({ ok: true })
  })

  it('requires a token before validation or reset', async () => {
    const store = usePasswordResetStore()

    await expect(store.validateToken('')).rejects.toThrow('token is required')
    await expect(store.resetPassword('', 'secret')).rejects.toThrow('token is required')
  })

  it('delegates token validation and password reset to the API helper', async () => {
    const store = usePasswordResetStore()
    validatePasswordResetTokenMock.mockResolvedValue({ ok: true })
    resetPasswordMock.mockResolvedValue({ ok: true })

    const validationResult = await store.validateToken('reset-token')
    const resetResult = await store.resetPassword('reset-token', 'NewPassw0rd!')

    expect(validatePasswordResetTokenMock).toHaveBeenCalledWith('reset-token')
    expect(resetPasswordMock).toHaveBeenCalledWith('reset-token', 'NewPassw0rd!')
    expect(validationResult).toEqual({ ok: true })
    expect(resetResult).toEqual({ ok: true })
  })
})
