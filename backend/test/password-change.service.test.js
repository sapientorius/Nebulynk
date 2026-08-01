import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { feathers } from '@feathersjs/feathers'
import { authentication } from '../src/authentication.js'
import { passwordChange } from '../src/services/password-change/password-change.js'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

async function createHarness({
  user = {
    id: 'user-1',
    email: 'member@example.com',
    display_name: 'Member User',
    account_type: 'member',
    is_admin: false,
    disabled_at: null
  },
  password = 'CurrentPassw0rd!',
  authSessions = [{
    id: 'session-1',
    user_id: 'user-1',
    revoked_at: null
  }]
} = {}) {
  const state = {
    users: [{
      ...clone(user),
      password: await bcrypt.hash(password, 10)
    }],
    auth_sessions: clone(authSessions)
  }
  const patches = []
  const app = feathers()

  app.set('authentication', {
    entity: 'user',
    entityId: 'id',
    service: 'users',
    secret: 'test-secret',
    authStrategies: ['jwt', 'local'],
    jwtOptions: {
      header: {
        typ: 'access'
      },
      audience: 'https://nebulynk.test',
      algorithm: 'HS256',
      expiresIn: '1d'
    },
    local: {
      usernameField: 'email',
      passwordField: 'password'
    }
  })

  app.use('users', {
    id: 'id',
    async find(params = {}) {
      const email = params.query?.email
      const users = state.users
        .filter((entry) => !email || entry.email === email)
        .map((entry) => clone(entry))
      return {
        total: users.length,
        limit: users.length,
        skip: 0,
        data: users
      }
    },
    async get(id) {
      const found = state.users.find((entry) => entry.id === id)
      return found ? clone(found) : null
    },
    async patch(id, data) {
      patches.push({ id, data: clone(data) })
      const found = state.users.find((entry) => entry.id === id)
      if (!found) return null

      if (Object.prototype.hasOwnProperty.call(data, 'password')) {
        found.password = await bcrypt.hash(data.password, 10)
      }

      return clone(found)
    }
  })

  app.configure(authentication)
  passwordChange(app)

  const loginResult = await app.service('authentication').create({
    strategy: 'local',
    email: user.email,
    password
  }, {})

  return {
    app,
    state,
    patches,
    accessToken: loginResult.accessToken
  }
}

async function changePasswordRequest(harness, payload, authenticationOverride = null) {
  const params = {
    provider: 'rest'
  }

  if (authenticationOverride !== false) {
    params.authentication = authenticationOverride || {
      strategy: 'jwt',
      accessToken: harness.accessToken
    }
  }

  return harness.app.service('password-change').create(payload, params)
}

test('password-change.create accepts the correct current password and keeps sessions active', async () => {
  const harness = await createHarness()

  const result = await changePasswordRequest(harness, {
    current_password: 'CurrentPassw0rd!',
    new_password: 'NextPassw0rd!'
  })

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(harness.patches, [{
    id: 'user-1',
    data: {
      password: 'NextPassw0rd!'
    }
  }])
  assert.equal(harness.state.auth_sessions[0].revoked_at, null)

  await assert.rejects(
    harness.app.service('authentication').create({
      strategy: 'local',
      email: 'member@example.com',
      password: 'CurrentPassw0rd!'
    }, {}),
    (error) => error?.className === 'not-authenticated'
  )

  const loginWithNewPassword = await harness.app.service('authentication').create({
    strategy: 'local',
    email: 'member@example.com',
    password: 'NextPassw0rd!'
  }, {})

  assert.ok(loginWithNewPassword.accessToken)
})

test('password-change.create rejects an invalid current password without patching the user', async () => {
  const harness = await createHarness()

  await assert.rejects(
    changePasswordRequest(harness, {
      current_password: 'WrongPassw0rd!',
      new_password: 'NextPassw0rd!'
    }),
    (error) => {
      assert.equal(error.error_code, 'api.password_change.invalid_current_password')
      return true
    }
  )

  assert.deepEqual(harness.patches, [])

  const loginWithCurrentPassword = await harness.app.service('authentication').create({
    strategy: 'local',
    email: 'member@example.com',
    password: 'CurrentPassw0rd!'
  }, {})

  assert.ok(loginWithCurrentPassword.accessToken)
})

test('password-change.create rejects unauthenticated external requests', async () => {
  const harness = await createHarness()

  await assert.rejects(
    changePasswordRequest(harness, {
      current_password: 'CurrentPassw0rd!',
      new_password: 'NextPassw0rd!'
    }, false),
    (error) => {
      assert.equal(error.className, 'not-authenticated')
      return true
    }
  )
})

test('password-change.create rejects guest accounts even with a valid current password', async () => {
  const harness = await createHarness({
    user: {
      id: 'guest-1',
      email: 'guest@example.com',
      display_name: 'Guest User',
      account_type: 'guest',
      is_admin: false,
      disabled_at: null
    }
  })

  await assert.rejects(
    changePasswordRequest(harness, {
      current_password: 'CurrentPassw0rd!',
      new_password: 'NextPassw0rd!'
    }),
    (error) => {
      assert.equal(error.error_code, 'api.password_change.guest_accounts_forbidden')
      return true
    }
  )

  assert.deepEqual(harness.patches, [])
})
