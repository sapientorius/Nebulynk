import { defineStore } from 'pinia'
import {
  requestPasswordReset as requestPasswordResetRequest,
  resetPassword as resetPasswordRequest,
  validatePasswordResetToken as validatePasswordResetTokenRequest
} from '../lib/api.js'

export const usePasswordResetStore = defineStore('passwordReset', () => {
  async function requestReset(email) {
    return requestPasswordResetRequest(email)
  }

  async function validateToken(token) {
    if (!token) throw new Error('token is required')
    return validatePasswordResetTokenRequest(token)
  }

  async function resetPassword(token, password) {
    if (!token) throw new Error('token is required')
    return resetPasswordRequest(token, password)
  }

  return {
    requestReset,
    validateToken,
    resetPassword
  }
})
