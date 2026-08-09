import { createApiClient } from './api-client.js'

let activeApiClient = createApiClient({
  persistCsrfToStorage: true
})

export const apiBaseUrl = activeApiClient.getBaseUrl()

function createAxiosProxy() {
  return new Proxy({}, {
    get(_target, property) {
      const value = activeApiClient.http[property]
      if (typeof value === 'function') {
        return value.bind(activeApiClient.http)
      }
      return value
    },
    set(_target, property, value) {
      activeApiClient.http[property] = value
      return true
    }
  })
}

const api = createAxiosProxy()

export function getActiveApiClient() {
  return activeApiClient
}

export function setActiveApiClient(client) {
  if (!client) return activeApiClient
  activeApiClient?.destroy?.()
  activeApiClient = client
  return activeApiClient
}

export function setActiveApiClientContext(options = {}) {
  activeApiClient?.destroy?.()
  activeApiClient = createApiClient(options)
  return activeApiClient
}

export { createApiClient }

export function resolveApiUrl(path = '') {
  return activeApiClient.resolveApiUrl(path)
}

export function clearStoredAuth() {
  return activeApiClient.clearStoredAuth()
}

export function getStoredAccessToken() {
  return activeApiClient.getStoredAccessToken()
}

export function getCurrentUser() {
  return activeApiClient.getCurrentUser()
}

export function subscribeToAuthState(listener) {
  return activeApiClient.subscribeToAuthState(listener)
}

export function storeAuthenticationResult(data) {
  return activeApiClient.storeAuthenticationResult(data)
}

export async function completeBrowserAuthentication(data, options = {}) {
  return activeApiClient.completeBrowserAuthentication(data, options)
}

export async function restoreBrowserSession(options = {}) {
  return activeApiClient.restoreBrowserSession(options)
}

export async function logout() {
  return activeApiClient.logout()
}

export async function getPlatformStatus(options = {}) {
  return activeApiClient.getPlatformStatus(options)
}

export async function setupPlatform(payload) {
  return activeApiClient.setupPlatform(payload)
}

export async function updatePlatformSettings(payload) {
  return activeApiClient.updatePlatformSettings(payload)
}

export async function getSelfRegistrationConfig() {
  return activeApiClient.getSelfRegistrationConfig()
}

export async function createSelfRegistration(payload) {
  return activeApiClient.createSelfRegistration(payload)
}

export async function confirmSelfRegistration(token) {
  return activeApiClient.confirmSelfRegistration(token)
}

export async function getRegistrationSettings() {
  return activeApiClient.getRegistrationSettings()
}

export async function updateRegistrationSettings(payload) {
  return activeApiClient.updateRegistrationSettings(payload)
}

export async function listPendingRegistrations() {
  return activeApiClient.listPendingRegistrations()
}

export async function confirmPendingRegistration(id) {
  return activeApiClient.confirmPendingRegistration(id)
}

export async function deletePendingRegistration(id) {
  return activeApiClient.deletePendingRegistration(id)
}

export async function getSecuritySettings() {
  return activeApiClient.getSecuritySettings()
}

export async function updateSecuritySettings(payload) {
  return activeApiClient.updateSecuritySettings(payload)
}

export async function getSponsorshipPromptPreference() {
  const { data } = await api.get('/platform-owner/sponsorship-prompt')
  return data
}

export async function claimSponsorshipPrompt() {
  const { data } = await api.post('/platform-owner/sponsorship-prompt/claim', {})
  return data
}

export async function updateSponsorshipPromptPreference(enabled) {
  const { data } = await api.patch('/platform-owner/sponsorship-prompt', { enabled })
  return data
}

export async function getPlatformUpdates() {
  const { data } = await api.get('/platform-updates')
  return data
}

export async function checkPlatformUpdates() {
  const { data } = await api.post('/platform-updates/check', {})
  return data
}

export async function acknowledgePlatformUpdates(versions) {
  const { data } = await api.post('/platform-updates/acknowledgements', { versions })
  return data
}

export async function updatePlatformUpdateSettings(payload) {
  const { data } = await api.patch('/platform-updates/settings', payload)
  return data
}

export async function beginPlatformUpdateSettingsPasskeyOptions() {
  const { data } = await api.post('/platform-updates/settings/passkey-options', {})
  return data
}

export async function getSmtpSettings() {
  const { data } = await api.get('/smtp-settings')
  return data
}

export async function updateSmtpSettings(payload) {
  const { data } = await api.patch('/smtp-settings', payload)
  return data
}

export async function testSmtpConnection() {
  const { data } = await api.post('/smtp-settings', {
    action: 'test_connection'
  })
  return data
}

export async function sendSmtpTestEmail(payload = {}) {
  const { data } = await api.post('/smtp-settings', {
    action: 'send_test_email',
    ...payload
  })
  return data
}

export async function listAiProviderInstances() {
  return activeApiClient.listAiProviderInstances()
}

export async function createAiProviderInstance(payload) {
  return activeApiClient.createAiProviderInstance(payload)
}

export async function updateAiProviderInstance(id, payload) {
  return activeApiClient.updateAiProviderInstance(id, payload)
}

export async function deleteAiProviderInstance(id) {
  return activeApiClient.deleteAiProviderInstance(id)
}

export async function listAiFunctionConfigs() {
  return activeApiClient.listAiFunctionConfigs()
}

export async function updateAiFunctionConfig(functionKey, payload) {
  return activeApiClient.updateAiFunctionConfig(functionKey, payload)
}

export async function listAiProviderModels(providerInstanceId, capability, options = {}) {
  return activeApiClient.listAiProviderModels(providerInstanceId, capability, options)
}

export async function login(email, password, options = {}) {
  return activeApiClient.login(email, password, options)
}

export async function verifyTwoFactorLogin(payload) {
  return activeApiClient.verifyTwoFactorLogin(payload)
}

export async function beginPasskeyAuthentication(payload = {}) {
  return activeApiClient.beginPasskeyAuthentication(payload)
}

export async function verifyPasskeyAuthentication(payload) {
  return activeApiClient.verifyPasskeyAuthentication(payload)
}

export async function requestPasswordReset(email) {
  return activeApiClient.requestPasswordReset(email)
}

export async function validatePasswordResetToken(token) {
  return activeApiClient.validatePasswordResetToken(token)
}

export async function resetPassword(token, password) {
  return activeApiClient.resetPassword(token, password)
}

export async function changePassword(payload) {
  return activeApiClient.changePassword(payload)
}

export async function getTwoFactorStatus() {
  return activeApiClient.getTwoFactorStatus()
}

export async function beginTwoFactorSetup() {
  return activeApiClient.beginTwoFactorSetup()
}

export async function confirmTwoFactorSetup(payload) {
  return activeApiClient.confirmTwoFactorSetup(payload)
}

export async function regenerateTwoFactorRecoveryCodes(payload) {
  return activeApiClient.regenerateTwoFactorRecoveryCodes(payload)
}

export async function disableTwoFactor(payload) {
  return activeApiClient.disableTwoFactor(payload)
}

export async function resetUserTwoFactor(userId) {
  return activeApiClient.resetUserTwoFactor(userId)
}

export async function getPasskeys() {
  return activeApiClient.getPasskeys()
}

export async function beginPasskeyRegistration(payload) {
  return activeApiClient.beginPasskeyRegistration(payload)
}

export async function verifyPasskeyRegistration(payload) {
  return activeApiClient.verifyPasskeyRegistration(payload)
}

export async function deletePasskey(passkeyId, payload) {
  return activeApiClient.deletePasskey(passkeyId, payload)
}

export async function resetUserPasskeys(userId) {
  return activeApiClient.resetUserPasskeys(userId)
}

export async function disableUser(userId) {
  return activeApiClient.disableUser(userId)
}

export async function enableUser(userId) {
  return activeApiClient.enableUser(userId)
}

export async function deleteUser(userId) {
  return activeApiClient.deleteUser(userId)
}

export async function beginPrimaryAdminTransferPasskeyOptions() {
  return activeApiClient.beginPrimaryAdminTransferPasskeyOptions()
}

export async function transferPrimaryAdmin(payload) {
  return activeApiClient.transferPrimaryAdmin(payload)
}

export function isAuthenticated() {
  return activeApiClient.isAuthenticated()
}

export default api
