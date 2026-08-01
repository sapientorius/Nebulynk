import test from 'node:test'
import assert from 'node:assert/strict'
import { Forbidden } from '@feathersjs/errors'
import { isChannelMember } from '../src/hooks/is-channel-member.js'

function createDbHarness({ memberships = [], channels = [], simulateConflictOnInsert = false } = {}) {
  const state = {
    memberships: memberships.map((membership) => ({ ...membership })),
    channels: channels.map((channel) => ({ ...channel })),
    insertAttempts: [],
    insertedRows: []
  }

  const db = (table) => {
    if (table === 'channel_members') {
      return {
        where(condition) {
          return {
            async first() {
              return state.memberships.find((membership) => (
                membership.channel_id === condition.channel_id
                && membership.user_id === condition.user_id
              )) || null
            }
          }
        },
        insert(row) {
          state.insertAttempts.push({ ...row })
          return {
            onConflict() {
              return {
                async ignore() {
                  const hasExisting = state.memberships.some((membership) => (
                    membership.channel_id === row.channel_id
                    && membership.user_id === row.user_id
                  ))

                  if (hasExisting) return
                  if (simulateConflictOnInsert) {
                    state.memberships.push({
                      id: 'concurrent-membership',
                      channel_id: row.channel_id,
                      user_id: row.user_id,
                      role: 'member'
                    })
                    return
                  }

                  state.memberships.push({ ...row })
                  state.insertedRows.push({ ...row })
                }
              }
            }
          }
        }
      }
    }

    if (table === 'channels') {
      return {
        where(column, value) {
          return {
            select(...fields) {
              return {
                async first() {
                  const channel = state.channels.find((entry) => entry[column] === value)
                  if (!channel) return null

                  const selected = {}
                  for (const field of fields) {
                    selected[field] = channel[field]
                  }
                  return selected
                }
              }
            }
          }
        }
      }
    }

    throw new Error(`Unsupported table: ${table}`)
  }

  return { db, state }
}

function createContext({ db, channelId, user = { id: 'user-1', is_admin: false }, provider = 'rest' }) {
  return {
    app: {
      get(key) {
        if (key !== 'postgresqlClient') {
          throw new Error(`Unexpected app key: ${key}`)
        }
        return db
      }
    },
    params: {
      provider,
      user,
      query: { channel_id: channelId }
    },
    data: {}
  }
}

test('is-channel-member hook: rejects non-members for public active text channels', async () => {
  const { db, state } = createDbHarness({
    channels: [{ id: 'text-public', type: 'public', is_archived: false }]
  })
  const context = createContext({ db, channelId: 'text-public' })

  await assert.rejects(
    isChannelMember()(context),
    Forbidden
  )
  assert.equal(state.insertedRows.length, 0)
})

test('is-channel-member hook: does not auto-join private channels', async () => {
  const { db, state } = createDbHarness({
    channels: [{ id: 'text-private', type: 'private', is_archived: false }]
  })
  const context = createContext({ db, channelId: 'text-private' })

  await assert.rejects(
    isChannelMember()(context),
    Forbidden
  )
  assert.equal(state.insertedRows.length, 0)
})

test('is-channel-member hook: does not auto-join archived public channels', async () => {
  const { db, state } = createDbHarness({
    channels: [{ id: 'archived-public', type: 'public', is_archived: true }]
  })
  const context = createContext({ db, channelId: 'archived-public' })

  await assert.rejects(
    isChannelMember()(context),
    Forbidden
  )
  assert.equal(state.insertedRows.length, 0)
})
