import { NotAuthenticated } from '@feathersjs/errors'
import { forbidden } from '../lib/errors.js'

/**
 * Resolves the effective permissions for the current user.
 * Results are cached on context.params.resolvedPermissions for the request lifecycle.
 *
 * Resolution order:
 * 1. user.is_admin → wildcard ('*') = all permissions
 * 2. Channel context → channel_members.role → channel role permissions
 * 3. Fallback → user_roles → platform role permissions
 */
async function resolvePermissions(context) {
  const user = context.params.user
  if (!user) throw new NotAuthenticated('Not authenticated')

  // Admin bypass
  if (user.is_admin) {
    return new Set(['*'])
  }

  const db = context.app.get('postgresqlClient')
  const permissions = new Set()

  // 1. Load platform-level permissions via user_roles
  const platformPerms = await db('permissions')
    .join('role_permissions', 'role_permissions.permission_id', '=', 'permissions.id')
    .join('user_roles', 'user_roles.role_id', '=', 'role_permissions.role_id')
    .where('user_roles.user_id', user.id)
    .select('permissions.name')

  for (const row of platformPerms) {
    permissions.add(row.name)
  }

  // 2. If channel context exists, load channel-level permissions
  const channelId = context.data?.channel_id
    || context.params.query?.channel_id
    || context.id

  if (channelId) {
    const membership = await db('channel_members')
      .where({ channel_id: channelId, user_id: user.id })
      .first()

    if (membership) {
      const channelRoleName = `channel:${membership.role}`
      const channelPerms = await db('permissions')
        .join('role_permissions', 'role_permissions.permission_id', '=', 'permissions.id')
        .join('roles', 'roles.id', '=', 'role_permissions.role_id')
        .where('roles.name', channelRoleName)
        .select('permissions.name')

      // Channel permissions are additive to platform permissions
      for (const row of channelPerms) {
        permissions.add(row.name)
      }
    }
  }

  return permissions
}

/**
 * Before-hook factory that checks if the user has at least one of the required permissions.
 * Uses OR logic: any one of the listed permissions grants access.
 *
 * Usage: checkPermission('manage_channels')
 *        checkPermission('manage_messages', 'manage_channels')
 */
export const checkPermission = (...required) => async (context) => {
  // Skip permission checks for internal calls (no connection = server-side)
  if (!context.params.provider) return context

  if (!context.params.resolvedPermissions) {
    context.params.resolvedPermissions = await resolvePermissions(context)
  }

  const perms = context.params.resolvedPermissions

  // Admin wildcard
  if (perms.has('*')) return context

  const hasPermission = required.some((p) => perms.has(p))
  if (!hasPermission) {
    throw forbidden(
      'api.permissions.missing_required_permission',
      { required },
      `Fehlende Berechtigung: ${required.join(' oder ')}`
    )
  }

  return context
}

/**
 * Resolves permissions for a user, optionally scoped to a channel.
 * Used by the my-permissions service.
 */
export async function resolveUserPermissions(app, userId, channelId) {
  const db = app.get('postgresqlClient')

  const user = await db('users').where('id', userId).first()
  if (!user) throw new NotAuthenticated('User not found')

  if (user.is_admin) {
    const allPerms = await db('permissions').select('name')
    return {
      permissions: allPerms.map((p) => p.name),
      roles: ['platform:admin'],
      isAdmin: true,
      channelRole: null
    }
  }

  // Platform permissions
  const platformRoleRows = await db('roles')
    .join('user_roles', 'user_roles.role_id', '=', 'roles.id')
    .where('user_roles.user_id', userId)
    .select('roles.name')

  const platformRoles = platformRoleRows.map((r) => r.name)

  const platformPerms = await db('permissions')
    .join('role_permissions', 'role_permissions.permission_id', '=', 'permissions.id')
    .join('user_roles', 'user_roles.role_id', '=', 'role_permissions.role_id')
    .where('user_roles.user_id', userId)
    .select('permissions.name')

  const permSet = new Set(platformPerms.map((p) => p.name))

  let channelRole = null

  // Channel-level permissions (if channel specified)
  if (channelId) {
    const membership = await db('channel_members')
      .where({ channel_id: channelId, user_id: userId })
      .first()

    if (membership) {
      channelRole = membership.role
      const channelRoleName = `channel:${membership.role}`
      const channelPerms = await db('permissions')
        .join('role_permissions', 'role_permissions.permission_id', '=', 'permissions.id')
        .join('roles', 'roles.id', '=', 'role_permissions.role_id')
        .where('roles.name', channelRoleName)
        .select('permissions.name')

      for (const row of channelPerms) {
        permSet.add(row.name)
      }
    }
  }

  return {
    permissions: [...permSet],
    roles: platformRoles,
    isAdmin: false,
    channelRole
  }
}
