import { normalizeSessionTransport } from './session.js'

export function createAuthenticationEndpoints({ http, completeBrowserAuthentication }, options = {}) {
  const defaultSessionTransport = normalizeSessionTransport(options.defaultSessionTransport)

  async function login(email, password, {
    remember = true,
    sessionTransport = defaultSessionTransport
  } = {}) {
    const { data } = await http.post('/auth/login', {
      email,
      password,
      remember
    }, {
      __skipAuthRefresh: true
    })

    if (data?.requiresTwoFactor) {
      return data
    }

    return completeBrowserAuthentication(data, { remember, sessionTransport })
  }

  async function verifyTwoFactorLogin({
    challengeId,
    method = 'totp',
    code,
    remember = true,
    sessionTransport = defaultSessionTransport
  }) {
    const { data } = await http.post('/auth/login/verify-2fa', {
      challengeId,
      method,
      code
    }, {
      __skipAuthRefresh: true
    })

    return completeBrowserAuthentication(data, { remember, sessionTransport })
  }

  async function beginPasskeyAuthentication({ remember = true } = {}) {
    const { data } = await http.post('/auth/passkeys/authentication-options', {
      remember
    }, {
      __skipAuthRefresh: true
    })

    return data
  }

  async function verifyPasskeyAuthentication({
    challengeId,
    authenticationResponse,
    remember = true,
    sessionTransport = defaultSessionTransport
  }) {
    const { data } = await http.post('/auth/passkeys/verify-authentication', {
      challengeId,
      authenticationResponse
    }, {
      __skipAuthRefresh: true
    })

    return completeBrowserAuthentication(data, { remember, sessionTransport })
  }

  async function requestPasswordReset(email) {
    const { data } = await http.post('/password-reset', {
      email
    }, {
      __skipAuthRefresh: true
    })
    return data
  }

  async function validatePasswordResetToken(token) {
    const { data } = await http.get('/password-reset', {
      __skipAuthRefresh: true,
      params: {
        token
      }
    })
    return data
  }

  async function resetPassword(token, password) {
    const { data } = await http.patch(`/password-reset/${encodeURIComponent(token)}`, {
      password
    }, {
      __skipAuthRefresh: true
    })
    return data
  }

  async function changePassword({ currentPassword, newPassword }) {
    const { data } = await http.post('/password-change', {
      current_password: currentPassword,
      new_password: newPassword
    })
    return data
  }

  async function getTwoFactorStatus() {
    const { data } = await http.get('/users/me/2fa')
    return data
  }

  async function beginTwoFactorSetup() {
    const { data } = await http.post('/users/me/2fa/setup', {})
    return data
  }

  async function confirmTwoFactorSetup({ currentPassword, code }) {
    const { data } = await http.post('/users/me/2fa/confirm', {
      current_password: currentPassword,
      code
    })
    return data
  }

  async function regenerateTwoFactorRecoveryCodes({ currentPassword, code }) {
    const { data } = await http.post('/users/me/2fa/recovery-codes/regenerate', {
      current_password: currentPassword,
      code
    })
    return data
  }

  async function disableTwoFactor({ currentPassword, code }) {
    const { data } = await http.post('/users/me/2fa/disable', {
      current_password: currentPassword,
      code
    })
    return data
  }

  async function resetUserTwoFactor(userId) {
    const { data } = await http.post(`/users/${encodeURIComponent(userId)}/2fa/reset`, {})
    return data
  }

  async function getPasskeys() {
    const { data } = await http.get('/users/me/passkeys')
    return data
  }

  async function beginPasskeyRegistration({ currentPassword }) {
    const { data } = await http.post('/users/me/passkeys/registration-options', {
      current_password: currentPassword
    })
    return data
  }

  async function verifyPasskeyRegistration({ challengeId, registrationResponse, name = null }) {
    const { data } = await http.post('/users/me/passkeys/verify-registration', {
      challengeId,
      registrationResponse,
      name
    })
    return data
  }

  async function deletePasskey(passkeyId, { currentPassword }) {
    const { data } = await http.post(`/users/me/passkeys/${encodeURIComponent(passkeyId)}/delete`, {
      current_password: currentPassword
    })
    return data
  }

  async function resetUserPasskeys(userId) {
    const { data } = await http.post(`/users/${encodeURIComponent(userId)}/passkeys/reset`, {})
    return data
  }

  async function disableUser(userId) {
    const { data } = await http.patch(`/users/${encodeURIComponent(userId)}`, {
      disabled_at: new Date().toISOString()
    })
    return data
  }

  async function enableUser(userId) {
    const { data } = await http.patch(`/users/${encodeURIComponent(userId)}`, {
      disabled_at: null
    })
    return data
  }

  async function deleteUser(userId) {
    const { data } = await http.delete(`/users/${encodeURIComponent(userId)}`)
    return data
  }

  async function beginPrimaryAdminTransferPasskeyOptions() {
    const { data } = await http.post('/admin/primary-admin-transfer/passkey-options', {})
    return data
  }

  async function transferPrimaryAdmin({ targetUserId, confirmation, reauth }) {
    const { data } = await http.post('/admin/primary-admin-transfer', {
      target_user_id: targetUserId,
      confirmation,
      reauth
    })
    return data
  }

  return { login, verifyTwoFactorLogin, beginPasskeyAuthentication, verifyPasskeyAuthentication, requestPasswordReset, validatePasswordResetToken, resetPassword, changePassword, getTwoFactorStatus, beginTwoFactorSetup, confirmTwoFactorSetup, regenerateTwoFactorRecoveryCodes, disableTwoFactor, resetUserTwoFactor, getPasskeys, beginPasskeyRegistration, verifyPasskeyRegistration, deletePasskey, resetUserPasskeys, disableUser, enableUser, deleteUser, beginPrimaryAdminTransferPasskeyOptions, transferPrimaryAdmin }
}
