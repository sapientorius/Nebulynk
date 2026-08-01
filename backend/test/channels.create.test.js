import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { channels } from '../src/services/channels/channels.js'

function createAppWithMembershipCapture() {
  const insertedMemberships = []

  const db = (table) => {
    if (table === 'channel_members') {
      return {
        insert(rows) {
          const entries = Array.isArray(rows) ? rows : [rows]
          return {
            onConflict() {
              return {
                async ignore() {
                  for (const entry of entries) {
                    const exists = insertedMemberships.some((row) => (
                      row.channel_id === entry.channel_id && row.user_id === entry.user_id
                    ))
                    if (!exists) {
                      insertedMemberships.push({ ...entry })
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    if (table === 'users') {
      return {
        whereIn() {
          return {
            async select() {
              return []
            }
          }
        }
      }
    }

    return {
      where() {
        return this
      },
      join() {
        return this
      },
      async first() {
        return null
      },
      async select() {
        return []
      }
    }
  }

  db.raw = (value) => value

  const app = feathers()
  app.set('postgresqlClient', db)
  app.defaultAuthentication = () => ({
    async authenticate() {
      return {}
    }
  })

  channels(app)

  return {
    app,
    insertedMemberships
  }
}

test('channels.create hook-chain: non-admin creator can read back new channel and becomes owner member', async () => {
  const { app, insertedMemberships } = createAppWithMembershipCapture()
  const service = app.service('channels')
  let createParams = null

  service._create = async (data, params) => {
    createParams = { ...params }
    return {
      id: data.id,
      name: data.name,
      type: data.type,
      description: data.description,
      created_by: data.created_by
    }
  }

  const result = await service.create(
    {
      name: 'ops',
      type: 'private',
      description: 'Operations'
    },
    {
      provider: 'rest',
      authenticated: true,
      user: { id: 'user-1', is_admin: false },
      resolvedPermissions: new Set(['create_channels'])
    }
  )

  assert.ok(result.id)
  assert.equal(result.created_by, 'user-1')
  assert.deepEqual(createParams?._accessibleChannelIds, [result.id])
  assert.deepEqual(insertedMemberships, [{
    id: insertedMemberships[0].id,
    channel_id: result.id,
    user_id: 'user-1',
    role: 'owner'
  }])
})
