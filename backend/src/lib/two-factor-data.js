export async function getActiveTwoFactor(db, userId) {
  return db('user_two_factor').where('user_id', userId).first()
}

export async function getPendingTwoFactor(db, userId) {
  return db('user_two_factor_pending').where('user_id', userId).first()
}

export async function getUsablePendingTwoFactor(db, userId, nowIso = new Date().toISOString()) {
  const pending = await getPendingTwoFactor(db, userId)
  if (!pending) return null

  const expiresAtMs = Date.parse(pending.expires_at)
  const nowMs = Date.parse(nowIso)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    await db('user_two_factor_pending').where('user_id', userId).del()
    return null
  }

  return pending
}

export async function countRemainingRecoveryCodes(db, userId) {
  const rows = await db('user_two_factor_recovery_codes')
    .where('user_id', userId)
    .whereNull('used_at')
    .select('id')

  return rows.length
}

export async function listEnabledTwoFactorUserIds(db, userIds = []) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return new Set()
  }

  const rows = await db('user_two_factor')
    .whereIn('user_id', userIds)
    .select('user_id')

  return new Set(rows.map((row) => row.user_id))
}

export async function replaceRecoveryCodes(db, userId, codeHashes = [], nowIso = new Date().toISOString(), createId) {
  await db('user_two_factor_recovery_codes').where('user_id', userId).del()
  if (!Array.isArray(codeHashes) || codeHashes.length === 0) {
    return
  }

  await db('user_two_factor_recovery_codes').insert(
    codeHashes.map((codeHash) => ({
      id: createId(),
      user_id: userId,
      code_hash: codeHash,
      used_at: null,
      created_at: nowIso
    }))
  )
}

export async function clearTwoFactorState(db, userId) {
  await db('user_two_factor').where('user_id', userId).del()
  await db('user_two_factor_pending').where('user_id', userId).del()
  await db('user_two_factor_recovery_codes').where('user_id', userId).del()
}

export async function createLoginChallenge(db, payload) {
  await db('auth_login_challenges').insert(payload)
  return payload
}

export async function getLoginChallenge(db, challengeId) {
  return db('auth_login_challenges').where('id', challengeId).first()
}

export async function consumeLoginChallenge(db, challengeId, nowIso = new Date().toISOString()) {
  await db('auth_login_challenges')
    .where('id', challengeId)
    .update({
      consumed_at: nowIso,
      updated_at: nowIso
    })
}

export async function updateLoginChallengeFailure(db, challengeId, {
  attemptCount,
  consumedAt = null,
  updatedAt = new Date().toISOString()
}) {
  const patch = {
    attempt_count: attemptCount,
    updated_at: updatedAt
  }

  if (consumedAt) {
    patch.consumed_at = consumedAt
  }

  await db('auth_login_challenges')
    .where('id', challengeId)
    .update(patch)
}

export async function revokeLoginChallengesForUser(db, userId, nowIso = new Date().toISOString()) {
  await db('auth_login_challenges')
    .where('user_id', userId)
    .whereNull('consumed_at')
    .update({
      consumed_at: nowIso,
      updated_at: nowIso
    })
}
