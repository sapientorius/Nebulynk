export async function listUserPasskeys(db, userId) {
  return db('user_passkeys')
    .where('user_id', userId)
    .orderBy('created_at', 'desc')
}

export async function getUserPasskeyById(db, userId, passkeyId) {
  return db('user_passkeys')
    .where({
      id: passkeyId,
      user_id: userId
    })
    .first()
}

export async function getPasskeyByCredentialId(db, credentialId) {
  return db('user_passkeys')
    .where('credential_id', credentialId)
    .first()
}

export async function getPasskeyCountsByUserId(db, userIds = []) {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  if (ids.length === 0) {
    return new Map()
  }

  const rows = await db('user_passkeys')
    .whereIn('user_id', ids)
    .select('user_id')

  const counts = new Map()
  for (const row of rows) {
    counts.set(row.user_id, (counts.get(row.user_id) || 0) + 1)
  }

  return counts
}

export async function createPasskeyChallenge(db, payload) {
  await db('auth_passkey_challenges').insert(payload)
  return payload
}

export async function getPasskeyChallenge(db, challengeId) {
  return db('auth_passkey_challenges').where('id', challengeId).first()
}

export async function consumePasskeyChallenge(db, challengeId, nowIso = new Date().toISOString()) {
  await db('auth_passkey_challenges')
    .where('id', challengeId)
    .update({
      used_at: nowIso,
      updated_at: nowIso
    })
}

export function isPasskeyChallengeUsable(challenge, flow, nowIso = new Date().toISOString()) {
  if (!challenge || challenge.used_at) {
    return false
  }

  if (challenge.flow !== flow) {
    return false
  }

  const expiresAtMs = Date.parse(challenge.expires_at)
  const nowMs = Date.parse(nowIso)
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs
}

export async function deleteUserPasskeys(db, userId) {
  return db('user_passkeys').where('user_id', userId).del()
}
