import { createId } from '@paralleldrive/cuid2'
import { badRequest } from './errors.js'
import {
  buildStoredPasskeyCredential,
  defaultPasskeyHelpers,
  PASSKEY_CHALLENGE_WINDOW_MS
} from './passkeys.js'
import {
  consumePasskeyChallenge,
  createPasskeyChallenge,
  getPasskeyByCredentialId,
  getPasskeyChallenge,
  isPasskeyChallengeUsable,
  listUserPasskeys
} from './passkey-data.js'

function getPasskeyHelpers(app) {
  return app.get('passkeyHelpers') || defaultPasskeyHelpers
}

export async function createSensitivePasskeyOptions(app, db, user, {
  flow,
  ip = null,
  userAgent = null,
  now = new Date()
}) {
  const passkeys = await listUserPasskeys(db, user.id)
  if (passkeys.length === 0) {
    throw badRequest('api.sensitive_reauth.no_passkey_available', {}, 'No passkey is available for this account')
  }
  const options = await getPasskeyHelpers(app).generateAuthenticationOptions({
    rpID: app.get('passkeyRpId'),
    userVerification: 'required',
    allowCredentials: passkeys.map((passkey) => ({
      id: passkey.credential_id,
      transports: (() => {
        try {
          return JSON.parse(passkey.transports || '[]')
        } catch {
          return []
        }
      })()
    }))
  })
  const challenge = await createPasskeyChallenge(db, {
    id: createId(),
    user_id: user.id,
    flow,
    challenge: options.challenge,
    remember: false,
    expires_at: new Date(now.getTime() + PASSKEY_CHALLENGE_WINDOW_MS).toISOString(),
    used_at: null,
    created_ip: ip,
    user_agent: userAgent,
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  })
  return { challengeId: challenge.id, options }
}

async function verifyCurrentPassword(app, user, password) {
  if (typeof password !== 'string' || !password.trim()) {
    throw badRequest('api.sensitive_reauth.current_password_required', {}, 'Current password is required')
  }
  try {
    await app.service('authentication').create({ strategy: 'local', email: user.email, password }, {})
  } catch (error) {
    if (error?.name === 'NotAuthenticated' || error?.className === 'not-authenticated') {
      throw badRequest('api.sensitive_reauth.invalid_current_password', {}, 'Current password is incorrect')
    }
    throw error
  }
}

async function verifyPasskey(app, db, user, reauth, flow) {
  const challengeId = typeof reauth?.challenge_id === 'string' ? reauth.challenge_id.trim() : ''
  const authenticationResponse = reauth?.authentication_response
  if (!challengeId || !authenticationResponse || typeof authenticationResponse !== 'object') {
    throw badRequest('api.sensitive_reauth.invalid_passkey_reauth', {}, 'Passkey reauthentication is invalid')
  }
  const challenge = await getPasskeyChallenge(db, challengeId)
  if (!isPasskeyChallengeUsable(challenge, flow) || challenge.user_id !== user.id) {
    throw badRequest('api.sensitive_reauth.invalid_passkey_challenge', {}, 'Passkey challenge is invalid')
  }
  const passkey = await getPasskeyByCredentialId(db, authenticationResponse.id)
  if (!passkey || passkey.user_id !== user.id) {
    await consumePasskeyChallenge(db, challenge.id)
    throw badRequest('api.sensitive_reauth.passkey_not_found', {}, 'Passkey credential not found')
  }

  let verification
  try {
    verification = await getPasskeyHelpers(app).verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge: challenge.challenge,
      expectedOrigin: app.get('frontendOrigins') || [],
      expectedRPID: app.get('passkeyRpId'),
      requireUserVerification: true,
      credential: buildStoredPasskeyCredential(passkey)
    })
  } catch (error) {
    await consumePasskeyChallenge(db, challenge.id)
    throw badRequest('api.sensitive_reauth.passkey_authentication_failed', {}, error?.message || 'Passkey authentication failed')
  }
  if (!verification?.verified) {
    await consumePasskeyChallenge(db, challenge.id)
    throw badRequest('api.sensitive_reauth.passkey_authentication_failed', {}, 'Passkey authentication failed')
  }

  const nowIso = new Date().toISOString()
  await db.transaction(async (trx) => {
    await trx('user_passkeys').where('id', passkey.id).update({
      counter: verification.authenticationInfo.newCounter,
      device_type: verification.authenticationInfo.credentialDeviceType,
      backed_up: verification.authenticationInfo.credentialBackedUp,
      last_used_at: nowIso,
      updated_at: nowIso
    })
    await consumePasskeyChallenge(trx, challenge.id, nowIso)
  })
}

export async function verifySensitiveReauth(app, db, user, reauth, { flow }) {
  if (reauth?.method === 'password') return verifyCurrentPassword(app, user, reauth.current_password)
  if (reauth?.method === 'passkey') return verifyPasskey(app, db, user, reauth, flow)
  throw badRequest('api.sensitive_reauth.reauth_required', {}, 'Password or passkey reauthentication is required')
}
