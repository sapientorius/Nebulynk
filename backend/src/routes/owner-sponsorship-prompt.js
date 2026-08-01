import { authenticateRequest } from './authenticate-request.js'
import { attachErrorMetadata, badRequest, buildErrorBody, forbidden } from '../lib/errors.js'
import { logger } from '../logger.js'

const PREFERENCES_TABLE = 'user_sponsorship_prompt_preferences'
export const SPONSORSHIP_PROMPT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

function sendError(ctx, status, code, message, params = {}) {
  ctx.status = status
  ctx.body = buildErrorBody(code, message, params)
}

function requirePrimaryAdmin(user) {
  if (!user?.is_primary_admin) {
    throw forbidden(
      'api.sponsorship.primary_admin_required',
      {},
      'Only the primary admin can manage sponsorship prompts'
    )
  }
}

function wasShownWithinInterval(lastShownAt, now) {
  const lastShownAtMs = new Date(lastShownAt || '').getTime()
  if (!Number.isFinite(lastShownAtMs)) return false
  return now.getTime() - lastShownAtMs < SPONSORSHIP_PROMPT_INTERVAL_MS
}

function isUniqueViolation(error) {
  return error?.code === '23505' || error?.constraint === `${PREFERENCES_TABLE}_pkey`
}

async function withLockedPreference(db, userId, mutation) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await db.transaction(async (trx) => {
        let query = trx(PREFERENCES_TABLE).where('user_id', userId)
        if (typeof query.forUpdate === 'function') {
          query = query.forUpdate()
        }
        const preference = await query.first()
        return mutation(trx, preference)
      })
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 1) throw error
    }
  }

  throw new Error('Unable to lock sponsorship prompt preference')
}

export async function getSponsorshipPromptPreference(db, userId) {
  const preference = await db(PREFERENCES_TABLE).where('user_id', userId).first()
  return { enabled: !preference?.disabled_at }
}

export async function claimSponsorshipPrompt(db, userId, now = new Date()) {
  const nowIso = now.toISOString()
  const show = await withLockedPreference(db, userId, async (trx, preference) => {
    if (preference?.disabled_at || wasShownWithinInterval(preference?.last_shown_at, now)) {
      return false
    }

    if (!preference) {
      await trx(PREFERENCES_TABLE).insert({
        user_id: userId,
        last_shown_at: nowIso,
        disabled_at: null,
        created_at: nowIso,
        updated_at: nowIso
      })
      return true
    }

    await trx(PREFERENCES_TABLE)
      .where('user_id', userId)
      .update({ last_shown_at: nowIso, updated_at: nowIso })
    return true
  })

  return { show }
}

export async function updateSponsorshipPromptPreference(db, userId, enabled, now = new Date()) {
  const nowIso = now.toISOString()
  await withLockedPreference(db, userId, async (trx, preference) => {
    const patch = {
      disabled_at: enabled ? null : nowIso,
      updated_at: nowIso
    }

    if (preference) {
      await trx(PREFERENCES_TABLE).where('user_id', userId).update(patch)
      return
    }

    await trx(PREFERENCES_TABLE).insert({
      user_id: userId,
      last_shown_at: null,
      disabled_at: patch.disabled_at,
      created_at: nowIso,
      updated_at: nowIso
    })
  })

  return { enabled }
}

export function configureOwnerSponsorshipPromptRoutes(app, { now = () => new Date() } = {}) {
  app.use(async (ctx, next) => {
    const isPreferenceRequest = ctx.path === '/platform-owner/sponsorship-prompt'
      && (ctx.method === 'GET' || ctx.method === 'PATCH')
    const isClaimRequest = ctx.path === '/platform-owner/sponsorship-prompt/claim' && ctx.method === 'POST'

    if (!isPreferenceRequest && !isClaimRequest) {
      return next()
    }

    try {
      const user = await authenticateRequest(app, ctx)
      if (!user) return
      requirePrimaryAdmin(user)

      const db = app.get('postgresqlClient')
      if (ctx.method === 'GET') {
        ctx.status = 200
        ctx.body = await getSponsorshipPromptPreference(db, user.id)
        return
      }

      if (isClaimRequest) {
        ctx.status = 200
        ctx.body = await claimSponsorshipPrompt(db, user.id, now())
        return
      }

      const enabled = ctx.request.body?.enabled
      if (typeof enabled !== 'boolean') {
        throw badRequest('api.sponsorship.enabled_required', {}, 'enabled must be a boolean')
      }

      ctx.status = 200
      ctx.body = await updateSponsorshipPromptPreference(db, user.id, enabled, now())
    } catch (error) {
      if (error?.statusCode || error?.code) {
        const normalized = attachErrorMetadata(error)
        sendError(
          ctx,
          normalized.statusCode || normalized.code || 400,
          normalized.error_code || normalized.data?.error_code || 'errors.unexpected',
          normalized.message || 'Request failed',
          normalized.error_params || normalized.data?.error_params || {}
        )
        return
      }

      logger.error('Owner sponsorship prompt route failed unexpectedly', {
        error: error?.message || String(error),
        stack: error?.stack,
        path: ctx.path,
        method: ctx.method,
        ip: ctx.ip
      })
      sendError(ctx, 500, 'api.sponsorship.unexpected_error', 'Sponsorship prompt request failed unexpectedly')
    }
  })
}
