import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { Forbidden } from '@feathersjs/errors'
import {
  getPendingRegistrationAlertCount,
  notifyRegistrationPending,
  PENDING_REGISTRATION_SUMMARY_EVENT
} from '../src/lib/registration-pending-alerts.js'
import { pendingRegistrationSummary } from '../src/services/pending-registration-summary/pending-registration-summary.js'
import { createMemoryDb } from './helpers/memory-db.js'

function activeMember(overrides = {}) {
  return {
    account_type: 'member',
    registration_status: 'active',
    disabled_at: null,
    preferred_locale: 'en',
    is_admin: false,
    ...overrides
  }
}

function createAlertHarness() {
  const db = createMemoryDb({
    users: [
      activeMember({ id: 'admin', is_admin: true }),
      activeMember({ id: 'manager', preferred_locale: 'de' }),
      activeMember({ id: 'member' }),
      activeMember({ id: 'disabled-manager', is_admin: true, disabled_at: '2026-08-01T00:00:00.000Z' }),
      { ...activeMember({ id: 'guest-admin', is_admin: true }), account_type: 'guest' },
      { id: 'pending-smtp', registration_status: 'pending_email_verification', registration_pending_reason: 'smtp_unavailable' },
      { id: 'pending-approval', registration_status: 'pending_admin_approval', registration_pending_reason: 'email_confirmed_admin_approval' },
      { id: 'pending-email', registration_status: 'pending_email_verification', registration_pending_reason: null }
    ],
    permissions: [{ id: 'permission-manage-users', name: 'manage_users' }],
    roles: [{ id: 'role-manager', name: 'platform:registration-manager' }],
    role_permissions: [{ role_id: 'role-manager', permission_id: 'permission-manage-users' }],
    user_roles: [{ user_id: 'manager', role_id: 'role-manager' }]
  })
  const dispatched = []
  const sent = []
  const app = {
    get(key) {
      if (key === 'postgresqlClient') return db
      if (key === 'notificationSideEffectsDispatcher') {
        return { enqueue(rows) { dispatched.push(rows) } }
      }
      throw new Error(`Unexpected app.get(${key})`)
    },
    channel(name) {
      return {
        send(payload) {
          sent.push({ name, payload })
        }
      }
    }
  }

  return { app, db, dispatched, sent }
}

test('registration pending alerts notify active admins and manage_users recipients only', async () => {
  const { app, db, dispatched, sent } = createAlertHarness()

  assert.equal(await getPendingRegistrationAlertCount(db), 2)

  const notifications = await notifyRegistrationPending(app, {
    id: 'pending-smtp',
    email: 'new@example.com',
    display_name: 'New Member'
  })

  assert.deepEqual(notifications.map((entry) => entry.user_id).sort(), ['admin', 'manager'])
  assert.equal(notifications.every((entry) => entry.type === 'registration_pending'), true)
  assert.equal(db.tables.notifications.length, 2)
  assert.equal(dispatched.length, 1)
  assert.deepEqual(dispatched[0].map((entry) => entry.user_id).sort(), ['admin', 'manager'])
  assert.deepEqual(sent.map((entry) => entry.name).sort(), ['user/admin', 'user/manager'])
  assert.equal(sent.every((entry) => entry.payload.type === PENDING_REGISTRATION_SUMMARY_EVENT), true)
  assert.equal(sent.every((entry) => entry.payload.data.count === 2), true)
})

test('pending registration summary is restricted to manage_users and excludes unclassified accounts', async () => {
  const { db } = createAlertHarness()
  const app = feathers()
  app.set('postgresqlClient', db)
  app.defaultAuthentication = () => ({
    async authenticate() {
      return {}
    }
  })
  pendingRegistrationSummary(app)

  await assert.rejects(
    app.service('pending-registration-summary').find({
      provider: 'rest',
      authenticated: true,
      user: { id: 'member', is_admin: false },
      resolvedPermissions: new Set()
    }),
    Forbidden
  )

  const summary = await app.service('pending-registration-summary').find({
    provider: 'rest',
    authenticated: true,
    user: { id: 'manager', is_admin: false },
    resolvedPermissions: new Set(['manage_users'])
  })

  assert.deepEqual(summary, { count: 2 })
})
