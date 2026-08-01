export async function hasUserPlatformPermission(app, userId, permissionName) {
  if (!userId || !permissionName) {
    return false
  }

  const db = app.get('postgresqlClient')
  const user = await db('users').where('id', userId).first()
  if (!user) {
    return false
  }

  if (user.is_admin) {
    return true
  }

  const userRoles = await db('user_roles').where('user_id', userId).select('role_id')
  const roleIds = userRoles.map((entry) => entry.role_id).filter(Boolean)
  if (roleIds.length === 0) {
    return false
  }

  const rolePermissions = await db('role_permissions')
    .whereIn('role_id', roleIds)
    .select('permission_id')
  const permissionIds = rolePermissions.map((entry) => entry.permission_id).filter(Boolean)
  if (permissionIds.length === 0) {
    return false
  }

  const permission = await db('permissions')
    .whereIn('id', permissionIds)
    .where('name', permissionName)
    .first()

  return Boolean(permission)
}
