import { KnexService } from '@feathersjs/knex'
import { hooks as authHooks } from '@feathersjs/authentication-local'
import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { checkPermission } from '../../hooks/check-permission.js'
import { clearExpiredStatus } from '../../hooks/clear-expired-status.js'
import { clearAutoAwayState } from '../../presence.js'
import { validate } from '../../schemas/validators.js'
import { createSchema, patchSchema } from './users.schema.js'
import { badRequest, forbidden } from '../../lib/errors.js'
import { assertAvatarPatchAllowed } from '../../lib/avatar.js'
import { normalizeMeetingVideoPreferences } from '../../lib/meeting-video-preferences.js'
import { hasUserPlatformPermission } from '../../lib/user-permissions.js'
import { listEnabledTwoFactorUserIds } from '../../lib/two-factor-data.js'
import { getPasskeyCountsByUserId } from '../../lib/passkey-data.js'
import { createWebauthnUserId, encodeBytesForStorage } from '../../lib/passkeys.js'
import {
  assertPasswordStrength,
  getConfiguredPasswordStrengthPolicy
} from '../../lib/password-policy.js'

const { hashPassword, protect } = authHooks

function normalizeRequestedIds(query = {}) {
  const values = query.ids ?? query['ids[]']
  if (!values) return []
  if (Array.isArray(values)) return values.filter(Boolean)
  return [values].filter(Boolean)
}

function normalizeScopedChannelId(query = {}) {
  if (typeof query.channel_id !== 'string') return null
  const trimmed = query.channel_id.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeSearchLimit(rawLimit, fallback = 20, max = 50) {
  const parsed = Number.parseInt(rawLimit, 10)
  if (Number.isNaN(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

function sanitizeMeetingVideoPreferencesForExternalUser(entry, currentUserId) {
  if (!entry || typeof entry !== 'object') return entry

  const next = { ...entry }
  delete next.webauthn_user_id
  if (entry.id === currentUserId) {
    next.meeting_video_preferences = normalizeMeetingVideoPreferences(entry.meeting_video_preferences)
    return next
  }

  delete next.meeting_video_preferences
  return next
}

function sanitizeExternalUsersResult(result, currentUserId) {
  if (Array.isArray(result)) {
    return result.map((entry) => sanitizeMeetingVideoPreferencesForExternalUser(entry, currentUserId))
  }

  if (Array.isArray(result?.data)) {
    return {
      ...result,
      data: result.data.map((entry) => sanitizeMeetingVideoPreferencesForExternalUser(entry, currentUserId))
    }
  }

  return sanitizeMeetingVideoPreferencesForExternalUser(result, currentUserId)
}

async function attachTwoFactorStatus(app, result) {
  if (!result) return result

  const users = Array.isArray(result)
    ? result
    : Array.isArray(result?.data)
      ? result.data
      : [result]
  const userIds = users.map((entry) => entry?.id).filter(Boolean)
  const enabledUserIds = await listEnabledTwoFactorUserIds(app.get('postgresqlClient'), userIds)

  const attach = (entry) => {
    if (!entry || typeof entry !== 'object') return entry
    return {
      ...entry,
      two_factor_enabled: enabledUserIds.has(entry.id)
    }
  }

  if (Array.isArray(result)) {
    return result.map(attach)
  }

  if (Array.isArray(result?.data)) {
    return {
      ...result,
      data: result.data.map(attach)
    }
  }

  return attach(result)
}

async function attachPasskeyStatus(app, result) {
  if (!result) return result

  const users = Array.isArray(result)
    ? result
    : Array.isArray(result?.data)
      ? result.data
      : [result]
  const userIds = users.map((entry) => entry?.id).filter(Boolean)
  const passkeyCounts = await getPasskeyCountsByUserId(app.get('postgresqlClient'), userIds)

  const attach = (entry) => {
    if (!entry || typeof entry !== 'object') return entry
    const passkeyCount = passkeyCounts.get(entry.id) || 0
    return {
      ...entry,
      passkey_count: passkeyCount,
      passkeys_enabled: passkeyCount > 0
    }
  }

  if (Array.isArray(result)) {
    return result.map(attach)
  }

  if (Array.isArray(result?.data)) {
    return {
      ...result,
      data: result.data.map(attach)
    }
  }

  return attach(result)
}

async function resolveGuestScopedRequestedIds({
  db,
  currentUserId,
  requestedIds,
  scopedChannelId = null
}) {
  if (!Array.isArray(requestedIds) || requestedIds.length === 0) {
    return []
  }

  const requestedIdSet = new Set(requestedIds)
  if (!scopedChannelId) {
    return requestedIdSet.has(currentUserId) ? [currentUserId] : []
  }

  const selfMembership = await db('channel_members')
    .where({
      channel_id: scopedChannelId,
      user_id: currentUserId
    })
    .first()

  if (!selfMembership) {
    return requestedIdSet.has(currentUserId) ? [currentUserId] : []
  }

  const scopedMemberships = await db('channel_members')
    .where('channel_id', scopedChannelId)
    .whereIn('user_id', requestedIds)
    .select('user_id')

  const allowedIds = new Set(scopedMemberships.map((row) => row.user_id))
  if (requestedIdSet.has(currentUserId)) {
    allowedIds.add(currentUserId)
  }

  return requestedIds.filter((id) => allowedIds.has(id))
}

async function assertPrimaryAdminRemoveAllowed(context) {
  const app = context.app || context.service?.options?.app
  const db = app?.get('postgresqlClient')
  if (!db || !context.id) return context

  const targetUser = await db('users').where('id', context.id).first()
  if (targetUser?.is_primary_admin) {
    throw forbidden(
      'api.primary_admin.cannot_delete_primary_admin',
      {},
      'The primary admin account cannot be deleted'
    )
  }

  return context
}

async function assertMeetingVideoBackgroundPreferenceAllowed(context) {
  const preferences = context.data?.meeting_video_preferences
  if (preferences?.background_mode !== 'image') return context

  const backgroundImageId = preferences.background_image_id
  if (!backgroundImageId) {
    throw badRequest(
      'api.users.video_background_image_required',
      {},
      'A video background image is required'
    )
  }

  const user = context.params.user
  if (!user?.id) return context

  const db = context.app.get('postgresqlClient')
  const row = await db('video_backgrounds').where('id', backgroundImageId).first()
  if (!row || (row.user_id !== user.id && row.is_global !== true)) {
    throw badRequest(
      'api.users.video_background_not_accessible',
      { backgroundImageId },
      'Video background is not accessible'
    )
  }

  return context
}

async function assertConfiguredPasswordPolicy(context) {
  if (!Object.prototype.hasOwnProperty.call(context.data || {}, 'password')) {
    return context
  }

  const policy = await getConfiguredPasswordStrengthPolicy(context.app.get('postgresqlClient'))
  assertPasswordStrength(context.data.password, policy.level)
  return context
}

export class UsersService extends KnexService {
  async find(params = {}) {
    const query = { ...(params.query || {}) }
    let requestedIds = normalizeRequestedIds(query)
    const rawSearchTerm = typeof query.q === 'string' ? query.q.trim() : ''
    const scopedChannelId = normalizeScopedChannelId(query)
    const currentUser = params.user || null
    const isExternal = !!params.provider
    const isGuestUser = currentUser?.account_type === 'guest'

    if (requestedIds.length === 0 && !rawSearchTerm) {
      const limit = normalizeSearchLimit(query.$limit)
      if (isExternal && isGuestUser) {
        return {
          total: 0,
          limit,
          skip: 0,
          data: []
        }
      }
      if (isExternal) {
        return super.find({
          ...params,
          query: {
            ...(params.query || {}),
            account_type: 'member',
            registration_status: 'active',
            $limit: limit,
            $sort: {
              display_name: 1
            }
          }
        })
      }
      return super.find(params)
    }

    delete query.q
    delete query.ids
    delete query['ids[]']
    delete query.channel_id
    delete query.$sort
    delete query.$skip
    delete query.$select

    const app = this.app || this.options?.app
    const db = app.get('postgresqlClient')
    const baseQuery = db(this.options.name)
    const limit = normalizeSearchLimit(query.$limit)

    const hadRequestedIds = requestedIds.length > 0

    if (isExternal && isGuestUser) {
      requestedIds = await resolveGuestScopedRequestedIds({
        db,
        currentUserId: currentUser.id,
        requestedIds,
        scopedChannelId
      })

      if (requestedIds.length > 0) {
        baseQuery.whereIn('id', requestedIds)
      } else {
        baseQuery.where('id', currentUser.id)
      }
    } else if (isExternal) {
      baseQuery.where('account_type', 'member')
      baseQuery.where('registration_status', 'active')
    }

    if (requestedIds.length > 0) {
      const rows = await baseQuery
        .whereIn('id', requestedIds)
        .orderBy('display_name', 'asc')
        .limit(Math.min(limit, requestedIds.length))
      return {
        total: rows.length,
        limit: Math.min(limit, requestedIds.length),
        skip: 0,
        data: rows
      }
    }

    if (hadRequestedIds && requestedIds.length === 0) {
      return {
        total: 0,
        limit: Math.min(limit, 1),
        skip: 0,
        data: []
      }
    }

    const escapedPrefix = rawSearchTerm.replace(/[%_]/g, '\\$&').toLowerCase()
    const rows = await baseQuery
      .whereRaw("LOWER(display_name) LIKE ? ESCAPE '\\'", [`${escapedPrefix}%`])
      .orderBy('display_name', 'asc')
      .limit(limit)

    return {
      total: rows.length,
      limit,
      skip: 0,
      data: rows
    }
  }
}

export const users = (app) => {
  const options = {
    Model: app.get('postgresqlClient'),
    name: 'users',
    paginate: app.get('paginate'),
    app
  }

  app.use('users', new UsersService(options), {
    methods: ['find', 'get', 'create', 'patch', 'remove'],
    events: []
  })

  const service = app.service('users')

  service.hooks({
    around: {
      all: [authenticate('jwt')],
      create: []
    },
    before: {
      create: [
        async (context) => {
          // Public account creation must go through setup/invite services.
          if (context.params.provider) {
            throw forbidden(
              'api.users.direct_creation_not_allowed',
              {},
              'Direkte Benutzererstellung ist nicht erlaubt'
            )
          }
          return context
        },
        validate(createSchema),
        assertConfiguredPasswordPolicy,
        hashPassword('password'),
        async (context) => {
          context.data.id = createId()
          context.data.webauthn_user_id = encodeBytesForStorage(createWebauthnUserId())
          return context
        }
      ],
      patch: [
        validate(patchSchema),
        assertConfiguredPasswordPolicy,
        hashPassword('password'),
        assertAvatarPatchAllowed,
        // Own profile: always allowed. Other users: needs manage_users
        async (context) => {
          if (Object.prototype.hasOwnProperty.call(context.data, 'meeting_video_preferences')) {
            context.data.meeting_video_preferences = normalizeMeetingVideoPreferences(context.data.meeting_video_preferences)
            await assertMeetingVideoBackgroundPreferenceAllowed(context)
          }

          if (Object.prototype.hasOwnProperty.call(context.data, 'status') && !context.params.autoAwayTransition) {
            clearAutoAwayState(context.id)
          }

          if (context.params.provider && context.id !== context.params.user?.id) {
            await checkPermission('manage_users')(context)
          }

          context.data.updated_at = new Date().toISOString()
          return context
        }
      ],
      remove: [
        checkPermission('manage_users'),
        assertPrimaryAdminRemoveAllowed
      ]
    },
    after: {
      all: [
        protect('password', 'avatar_storage_key'),
        async (context) => {
          if (!context.params.provider) return context
          context.result = sanitizeExternalUsersResult(context.result, context.params.user?.id || null)
          return context
        }
      ],
      find: [
        clearExpiredStatus,
        async (context) => {
          const currentUser = context.params.user || null
          if (!currentUser?.id) return context
          const canManageUsers = await hasUserPlatformPermission(app, currentUser.id, 'manage_users')
          if (!canManageUsers) return context
          context.result = await attachTwoFactorStatus(app, context.result)
          context.result = await attachPasskeyStatus(app, context.result)
          return context
        }
      ],
      get: [clearExpiredStatus]
    },
    error: {}
  })
}
