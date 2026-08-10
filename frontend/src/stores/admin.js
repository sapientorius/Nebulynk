import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../lib/api.js'
import {
  beginPrimaryAdminTransferPasskeyOptions as beginPrimaryAdminTransferPasskeyOptionsRequest,
  createAiProviderInstance as createAiProviderInstanceRequest,
  deleteAiProviderInstance as deleteAiProviderInstanceRequest,
  deleteUser as deleteUserRequest,
  deletePendingRegistration as deletePendingRegistrationRequest,
  confirmPendingRegistration as confirmPendingRegistrationRequest,
  disableUser as disableUserRequest,
  getPlatformStatus,
  getPendingRegistrationSummary as getPendingRegistrationSummaryRequest,
  getRegistrationSettings as getRegistrationSettingsRequest,
  getSecuritySettings as getSecuritySettingsRequest,
  getSmtpSettings as getSmtpSettingsRequest,
  listAiFunctionConfigs as listAiFunctionConfigsRequest,
  listAiProviderInstances as listAiProviderInstancesRequest,
  listAiProviderModels as listAiProviderModelsRequest,
  enableUser as enableUserRequest,
  resetUserPasskeys as resetUserPasskeysRequest,
  transferPrimaryAdmin as transferPrimaryAdminRequest,
  sendSmtpTestEmail as sendSmtpTestEmailRequest,
  testSmtpConnection as testSmtpConnectionRequest,
  updateAiFunctionConfig as updateAiFunctionConfigRequest,
  updateAiProviderInstance as updateAiProviderInstanceRequest,
  updatePlatformSettings as updatePlatformSettingsRequest,
  resetUserTwoFactor as resetUserTwoFactorRequest,
  listPendingRegistrations as listPendingRegistrationsRequest,
  updateRegistrationSettings as updateRegistrationSettingsRequest,
  updateSecuritySettings as updateSecuritySettingsRequest,
  updateSmtpSettings as updateSmtpSettingsRequest
} from '../lib/api.js'

function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data || []
}

export const useAdminStore = defineStore('admin', () => {
  const users = ref([])
  const roles = ref([])
  const permissions = ref([])
  const rolePermissions = ref([])
  const userRoles = ref([])
  const invites = ref([])
  const platformSettings = ref({})
  const smtpSettings = ref({})
  const registrationSettings = ref({})
  const pendingRegistrations = ref([])
  const pendingRegistrationAlertCount = ref(0)
  const securitySettings = ref({})
  const aiProviderInstances = ref([])
  const aiFunctionConfigs = ref([])
  const aiProviderModelsByCacheKey = ref({})

  const loadingRoleData = ref(false)
  const loadingUserRoleData = ref(false)
  const loadingInvites = ref(false)
  const loadingPlatformSettings = ref(false)
  const loadingSmtpSettings = ref(false)
  const loadingRegistrationSettings = ref(false)
  const loadingPendingRegistrations = ref(false)
  const loadingSecuritySettings = ref(false)
  const loadingAiProviderInstances = ref(false)
  const loadingAiFunctionConfigs = ref(false)

  async function loadUsers(limit = 200) {
    const { data } = await api.get('/users', { params: { $limit: limit } })
    users.value = asList(data)
    return users.value
  }

  async function loadRoles(limit = 100) {
    const { data } = await api.get('/roles', { params: { $limit: limit } })
    roles.value = asList(data)
    return roles.value
  }

  async function loadPermissions(limit = 100) {
    const { data } = await api.get('/permissions', { params: { $limit: limit } })
    permissions.value = asList(data)
    return permissions.value
  }

  async function loadRolePermissions(limit = 500) {
    const { data } = await api.get('/role-permissions', { params: { $limit: limit } })
    rolePermissions.value = asList(data)
    return rolePermissions.value
  }

  async function loadUserRoles(limit = 500) {
    const { data } = await api.get('/user-roles', { params: { $limit: limit } })
    userRoles.value = asList(data)
    return userRoles.value
  }

  async function loadInvites(limit = 100) {
    const { data } = await api.get('/invites', { params: { $limit: limit } })
    invites.value = asList(data)
    return invites.value
  }

  async function refreshRoleData() {
    loadingRoleData.value = true
    try {
      await Promise.all([
        loadRoles(),
        loadPermissions(),
        loadRolePermissions()
      ])
    } finally {
      loadingRoleData.value = false
    }
  }

  async function refreshUserRoleData() {
    loadingUserRoleData.value = true
    try {
      await Promise.all([
        loadUsers(),
        loadRoles(),
        loadUserRoles()
      ])
    } finally {
      loadingUserRoleData.value = false
    }
  }

  async function refreshInviteData() {
    loadingInvites.value = true
    try {
      await Promise.all([
        loadInvites(),
        loadRoles()
      ])
    } finally {
      loadingInvites.value = false
    }
  }

  async function loadPlatformSettings({ refresh = false } = {}) {
    const data = await getPlatformStatus({ refresh })
    platformSettings.value = data || {}
    return platformSettings.value
  }

  async function updatePlatformSettings(payload) {
    const data = await updatePlatformSettingsRequest(payload)
    platformSettings.value = data || {}
    return platformSettings.value
  }

  async function refreshPlatformSettings() {
    loadingPlatformSettings.value = true
    try {
      return await loadPlatformSettings({ refresh: true })
    } finally {
      loadingPlatformSettings.value = false
    }
  }

  async function loadRegistrationSettings() {
    const data = await getRegistrationSettingsRequest()
    registrationSettings.value = data || {}
    return registrationSettings.value
  }

  async function refreshRegistrationSettings() {
    loadingRegistrationSettings.value = true
    try {
      return await loadRegistrationSettings()
    } finally {
      loadingRegistrationSettings.value = false
    }
  }

  async function updateRegistrationSettings(payload) {
    const data = await updateRegistrationSettingsRequest(payload)
    registrationSettings.value = data || {}
    return registrationSettings.value
  }

  async function loadPendingRegistrations() {
    const data = await listPendingRegistrationsRequest()
    pendingRegistrations.value = asList(data)
    return pendingRegistrations.value
  }

  async function loadPendingRegistrationSummary() {
    const summary = await getPendingRegistrationSummaryRequest()
    const count = Number(summary?.count)
    pendingRegistrationAlertCount.value = Number.isFinite(count)
      ? Math.max(0, Math.trunc(count))
      : 0
    return pendingRegistrationAlertCount.value
  }

  async function refreshPendingRegistrationSummary() {
    return loadPendingRegistrationSummary()
  }

  function setPendingRegistrationAlertCount(count) {
    const normalized = Number(count)
    pendingRegistrationAlertCount.value = Number.isFinite(normalized)
      ? Math.max(0, Math.trunc(normalized))
      : 0
  }

  async function refreshPendingRegistrations() {
    loadingPendingRegistrations.value = true
    try {
      return await loadPendingRegistrations()
    } finally {
      loadingPendingRegistrations.value = false
    }
  }

  async function confirmPendingRegistration(id) {
    const result = await confirmPendingRegistrationRequest(id)
    pendingRegistrations.value = pendingRegistrations.value.filter((entry) => entry.id !== id)
    await refreshPendingRegistrationSummary().catch(() => {})
    return result
  }

  async function deletePendingRegistration(id) {
    const result = await deletePendingRegistrationRequest(id)
    pendingRegistrations.value = pendingRegistrations.value.filter((entry) => entry.id !== id)
    await refreshPendingRegistrationSummary().catch(() => {})
    return result
  }

  async function loadSecuritySettings() {
    const data = await getSecuritySettingsRequest()
    securitySettings.value = data || {}
    return securitySettings.value
  }

  async function refreshSecuritySettings() {
    loadingSecuritySettings.value = true
    try {
      return await loadSecuritySettings()
    } finally {
      loadingSecuritySettings.value = false
    }
  }

  async function updateSecuritySettings(payload) {
    const data = await updateSecuritySettingsRequest(payload)
    securitySettings.value = data || {}
    return securitySettings.value
  }

  async function loadSmtpSettings() {
    const data = await getSmtpSettingsRequest()
    smtpSettings.value = data || {}
    return smtpSettings.value
  }

  async function refreshSmtpSettings() {
    loadingSmtpSettings.value = true
    try {
      return await loadSmtpSettings()
    } finally {
      loadingSmtpSettings.value = false
    }
  }

  async function updateSmtpSettings(payload) {
    const data = await updateSmtpSettingsRequest(payload)
    smtpSettings.value = data || {}
    return smtpSettings.value
  }

  async function testSmtpConnection() {
    return testSmtpConnectionRequest()
  }

  async function sendSmtpTestEmail(payload) {
    return sendSmtpTestEmailRequest(payload)
  }

  async function loadAiProviderInstances() {
    const data = await listAiProviderInstancesRequest()
    aiProviderInstances.value = asList(data)
    return aiProviderInstances.value
  }

  async function refreshAiProviderInstances() {
    loadingAiProviderInstances.value = true
    try {
      return await loadAiProviderInstances()
    } finally {
      loadingAiProviderInstances.value = false
    }
  }

  async function createAiProviderInstance(payload) {
    const created = await createAiProviderInstanceRequest(payload)
    await loadAiProviderInstances()
    return created
  }

  async function updateAiProviderInstance(id, payload) {
    const updated = await updateAiProviderInstanceRequest(id, payload)
    await loadAiProviderInstances()
    return updated
  }

  async function deleteAiProviderInstance(id) {
    const removed = await deleteAiProviderInstanceRequest(id)
    await loadAiProviderInstances()
    return removed
  }

  async function loadAiFunctionConfigs() {
    const data = await listAiFunctionConfigsRequest()
    aiFunctionConfigs.value = asList(data)
    return aiFunctionConfigs.value
  }

  async function refreshAiFunctionConfigs() {
    loadingAiFunctionConfigs.value = true
    try {
      return await loadAiFunctionConfigs()
    } finally {
      loadingAiFunctionConfigs.value = false
    }
  }

  async function updateAiFunctionConfig(functionKey, payload) {
    const updated = await updateAiFunctionConfigRequest(functionKey, payload)
    await loadAiFunctionConfigs()
    return updated
  }

  async function loadAiProviderModels(providerInstanceId, capability, { refresh = false } = {}) {
    const response = await listAiProviderModelsRequest(providerInstanceId, capability, { refresh })
    aiProviderModelsByCacheKey.value = {
      ...aiProviderModelsByCacheKey.value,
      [`${providerInstanceId}:${capability}`]: response
    }
    return response
  }

  function getRolePermissionNames(roleId) {
    const permissionIds = rolePermissions.value
      .filter((entry) => entry.role_id === roleId)
      .map((entry) => entry.permission_id)

    return permissions.value
      .filter((permission) => permissionIds.includes(permission.id))
      .map((permission) => permission.name)
  }

  async function updateRolePermissions(roleId, newPermissionNames) {
    const nextPermissions = newPermissionNames || []
    const currentPermissionNames = getRolePermissionNames(roleId)
    const added = nextPermissions.filter((name) => !currentPermissionNames.includes(name))
    const removed = currentPermissionNames.filter((name) => !nextPermissions.includes(name))

    for (const permissionName of added) {
      const permission = permissions.value.find((entry) => entry.name === permissionName)
      if (!permission) continue
      await api.post('/role-permissions', {
        role_id: roleId,
        permission_id: permission.id
      })
    }

    for (const permissionName of removed) {
      const permission = permissions.value.find((entry) => entry.name === permissionName)
      if (!permission) continue
      const existingRolePermission = rolePermissions.value.find(
        (entry) => entry.role_id === roleId && entry.permission_id === permission.id
      )
      if (!existingRolePermission) continue
      await api.delete(`/role-permissions/${existingRolePermission.id}`)
    }

    await loadRolePermissions()
  }

  async function createRole(payload) {
    const { data } = await api.post('/roles', payload)
    await loadRoles()
    return data
  }

  async function deleteRole(roleId) {
    await api.delete(`/roles/${roleId}`)
    await Promise.all([
      loadRoles(),
      loadRolePermissions()
    ])
  }

  function getUserRoleIds(userId) {
    return userRoles.value
      .filter((entry) => entry.user_id === userId)
      .map((entry) => entry.role_id)
  }

  async function updateUserRoles(userId, newRoleIds) {
    const nextRoleIds = newRoleIds || []
    const currentRoleIds = getUserRoleIds(userId)
    const added = nextRoleIds.filter((id) => !currentRoleIds.includes(id))
    const removed = currentRoleIds.filter((id) => !nextRoleIds.includes(id))

    for (const roleId of added) {
      await api.post('/user-roles', { user_id: userId, role_id: roleId })
    }

    for (const roleId of removed) {
      const userRole = userRoles.value.find(
        (entry) => entry.user_id === userId && entry.role_id === roleId
      )
      if (!userRole) continue
      await api.delete(`/user-roles/${userRole.id}`)
    }

    await loadUserRoles()
  }

  async function resetUserTwoFactor(userId) {
    const result = await resetUserTwoFactorRequest(userId)
    users.value = users.value.map((user) =>
      user.id === userId
        ? { ...user, two_factor_enabled: false }
        : user
    )
    return result
  }

  async function resetUserPasskeys(userId) {
    const result = await resetUserPasskeysRequest(userId)
    users.value = users.value.map((user) =>
      user.id === userId
        ? { ...user, passkey_count: 0, passkeys_enabled: false }
        : user
    )
    return result
  }

  function mergeUser(userId, patch) {
    users.value = users.value.map((user) =>
      user.id === userId ? { ...user, ...patch } : user
    )
  }

  async function disableUser(userId) {
    const result = await disableUserRequest(userId)
    mergeUser(userId, result)
    return result
  }

  async function enableUser(userId) {
    const result = await enableUserRequest(userId)
    mergeUser(userId, result)
    return result
  }

  async function deleteUser(userId) {
    const result = await deleteUserRequest(userId)
    users.value = users.value.filter((user) => user.id !== userId)
    userRoles.value = userRoles.value.filter((userRole) => userRole.user_id !== userId)
    return result
  }

  async function beginPrimaryAdminTransferPasskeyOptions() {
    return beginPrimaryAdminTransferPasskeyOptionsRequest()
  }

  async function transferPrimaryAdmin(payload) {
    const result = await transferPrimaryAdminRequest(payload)
    users.value = users.value.map((user) => {
      if (user.id === result.previous_primary_admin_id) {
        return { ...user, is_primary_admin: false }
      }
      if (user.id === result.primary_admin_id) {
        return { ...user, is_primary_admin: true, is_admin: true }
      }
      return user
    })
    await Promise.all([loadUsers(), loadUserRoles()])
    return result
  }

  async function createInvite(payload) {
    const { data } = await api.post('/invites', payload)
    if (!invites.value.find((invite) => invite.id === data.id)) {
      invites.value = [data, ...invites.value]
    }
    return data
  }

  async function revokeInvite(inviteId) {
    await api.patch(`/invites/${inviteId}`, { status: 'revoked' })
    invites.value = invites.value.map((invite) =>
      invite.id === inviteId ? { ...invite, status: 'revoked' } : invite
    )
  }

  const platformRoles = computed(() =>
    roles.value.filter((role) => role.scope === 'platform')
  )

  return {
    users,
    roles,
    permissions,
    rolePermissions,
    userRoles,
    invites,
    platformSettings,
    smtpSettings,
    registrationSettings,
    pendingRegistrations,
    pendingRegistrationAlertCount,
    securitySettings,
    aiProviderInstances,
    aiFunctionConfigs,
    aiProviderModelsByCacheKey,
    platformRoles,
    loadingRoleData,
    loadingUserRoleData,
    loadingInvites,
    loadingPlatformSettings,
    loadingSmtpSettings,
    loadingRegistrationSettings,
    loadingPendingRegistrations,
    loadingSecuritySettings,
    loadingAiProviderInstances,
    loadingAiFunctionConfigs,
    loadUsers,
    loadRoles,
    loadPermissions,
    loadRolePermissions,
    loadUserRoles,
    loadInvites,
    loadPlatformSettings,
    loadSmtpSettings,
    loadRegistrationSettings,
    loadPendingRegistrations,
    loadPendingRegistrationSummary,
    loadSecuritySettings,
    refreshRoleData,
    refreshUserRoleData,
    refreshInviteData,
    refreshPlatformSettings,
    refreshSmtpSettings,
    refreshRegistrationSettings,
    refreshPendingRegistrations,
    refreshPendingRegistrationSummary,
    refreshSecuritySettings,
    loadAiProviderInstances,
    refreshAiProviderInstances,
    createAiProviderInstance,
    updateAiProviderInstance,
    deleteAiProviderInstance,
    loadAiFunctionConfigs,
    refreshAiFunctionConfigs,
    updateAiFunctionConfig,
    loadAiProviderModels,
    getRolePermissionNames,
    updateRolePermissions,
    createRole,
    deleteRole,
    getUserRoleIds,
    updateUserRoles,
    resetUserTwoFactor,
    resetUserPasskeys,
    disableUser,
    enableUser,
    deleteUser,
    createInvite,
    revokeInvite,
    updatePlatformSettings,
    updateRegistrationSettings,
    setPendingRegistrationAlertCount,
    confirmPendingRegistration,
    deletePendingRegistration,
    updateSecuritySettings,
    updateSmtpSettings,
    testSmtpConnection,
    sendSmtpTestEmail
  }
})
