export function canAccessAdmin(channelsStore) {
  if (!channelsStore?.can) return false
  return channelsStore.can('manage_roles')
    || channelsStore.can('manage_users')
    || channelsStore.can('create_invites')
}

export function buildQuickStatusPayload(status) {
  return {
    status,
    status_expires_at: null
  }
}
