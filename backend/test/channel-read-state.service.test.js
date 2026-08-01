import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { Forbidden } from '@feathersjs/errors'
import { channelReadState } from '../src/services/channel-read-state/channel-read-state.js'

function createAuthenticatedApp(db) {
  const app = feathers()
  app.set('postgresqlClient', db)
  app.defaultAuthentication = () => ({
    async authenticate() {
      return {}
    }
  })
  return app
}

function createDb(initialMemberships) {
  const memberships = initialMemberships.map((membership) => ({ ...membership }))

  const db = (table) => {
    const filters = []
    let compoundPredicate = null

    const builder = {
      where(columnOrObject, value) {
        if (typeof columnOrObject === 'function') {
          compoundPredicate = []
          columnOrObject({
            whereNull(column) {
              compoundPredicate.push((row) => row[column] == null)
              return this
            },
            orWhere(column, operator, compareValue) {
              compoundPredicate.push((row) => {
                if (operator === '<') {
                  return row[column] != null && row[column] < compareValue
                }
                return false
              })
              return this
            }
          })
        } else if (typeof columnOrObject === 'object' && columnOrObject !== null) {
          for (const [column, entryValue] of Object.entries(columnOrObject)) {
            filters.push((row) => row[column] === entryValue)
          }
        } else {
          filters.push((row) => row[columnOrObject] === value)
        }
        return builder
      },
      async first() {
        if (table !== 'channel_members') return null
        const row = memberships.find((entry) => filters.every((check) => check(entry)))
        return row ? { ...row } : null
      },
      async update(patchData) {
        if (table !== 'channel_members') return 0
        let updated = 0
        for (const membership of memberships) {
          const matchesBase = filters.every((check) => check(membership))
          const matchesCompound = !compoundPredicate || compoundPredicate.some((check) => check(membership))
          if (!matchesBase || !matchesCompound) continue
          Object.assign(membership, patchData)
          updated++
        }
        return updated
      }
    }

    return builder
  }

  return { db, memberships }
}

function createHarness(initialMemberships) {
  const { db, memberships } = createDb(initialMemberships)
  const app = createAuthenticatedApp(db)
  channelReadState(app)

  return {
    service: app.service('channel-read-state'),
    memberships
  }
}

test('channel-read-state updates the current user membership by channel id', async () => {
  const { service, memberships } = createHarness([
    { id: 'membership-1', channel_id: 'channel-1', user_id: 'user-1', last_read_at: '2026-03-15T09:00:00.000Z' },
    { id: 'membership-2', channel_id: 'channel-1', user_id: 'user-2', last_read_at: '2026-03-15T09:00:00.000Z' }
  ])

  const result = await service.patch(null, {
    channel_id: 'channel-1',
    last_read_at: '2026-03-15T09:05:00.000Z'
  }, {
    provider: 'rest',
    authenticated: true,
    user: { id: 'user-1', is_admin: false }
  })

  assert.deepEqual(result, {
    channel_id: 'channel-1',
    last_read_at: '2026-03-15T09:05:00.001Z',
    updated: true
  })
  assert.equal(memberships[0].last_read_at, '2026-03-15T09:05:00.001Z')
  assert.equal(memberships[1].last_read_at, '2026-03-15T09:00:00.000Z')
})

test('channel-read-state rejects users without channel membership', async () => {
  const { service } = createHarness([
    { id: 'membership-1', channel_id: 'channel-1', user_id: 'user-2', last_read_at: null }
  ])

  await assert.rejects(
    service.patch(null, {
      channel_id: 'channel-1',
      last_read_at: '2026-03-15T09:05:00.000Z'
    }, {
      provider: 'rest',
      authenticated: true,
      user: { id: 'user-1', is_admin: false }
    }),
    Forbidden
  )
})

test('channel-read-state does not move last_read_at backwards', async () => {
  const { service, memberships } = createHarness([
    { id: 'membership-1', channel_id: 'channel-1', user_id: 'user-1', last_read_at: '2026-03-15T09:10:00.000Z' }
  ])

  const result = await service.patch(null, {
    channel_id: 'channel-1',
    last_read_at: '2026-03-15T09:05:00.000Z'
  }, {
    provider: 'rest',
    authenticated: true,
    user: { id: 'user-1', is_admin: false }
  })

  assert.deepEqual(result, {
    channel_id: 'channel-1',
    last_read_at: '2026-03-15T09:10:00.000Z',
    updated: false
  })
  assert.equal(memberships[0].last_read_at, '2026-03-15T09:10:00.000Z')
})

test('channel-read-state nudges read timestamps forward to avoid reload unread drift', async () => {
  const { service, memberships } = createHarness([
    { id: 'membership-1', channel_id: 'channel-1', user_id: 'user-1', last_read_at: null }
  ])

  const result = await service.patch(null, {
    channel_id: 'channel-1',
    last_read_at: '2026-03-15T09:05:00.123Z'
  }, {
    provider: 'rest',
    authenticated: true,
    user: { id: 'user-1', is_admin: false }
  })

  assert.deepEqual(result, {
    channel_id: 'channel-1',
    last_read_at: '2026-03-15T09:05:00.124Z',
    updated: true
  })
  assert.equal(memberships[0].last_read_at, '2026-03-15T09:05:00.124Z')
})
