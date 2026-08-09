import test from 'node:test'
import assert from 'node:assert/strict'
import { UsersService } from '../src/services/users/users.js'
import { validate } from '../src/schemas/validators.js'
import { patchSchema } from '../src/services/users/users.schema.js'

function createBuilder(rows = []) {
  const state = {
    whereCalls: [],
    whereInCalls: [],
    whereRawCalls: [],
    orderByCalls: [],
    limitCalls: []
  }

  const builder = {
    where(...args) {
      state.whereCalls.push(args)
      return builder
    },
    whereIn(...args) {
      state.whereInCalls.push(args)
      return builder
    },
    whereRaw(...args) {
      state.whereRawCalls.push(args)
      return builder
    },
    orderBy(...args) {
      state.orderByCalls.push(args)
      return builder
    },
    limit(...args) {
      state.limitCalls.push(args)
      return Promise.resolve(rows)
    }
  }

  return { builder, state }
}

function createService(rows = [], overrides = {}) {
  const { builder, state } = createBuilder(rows)
  const channelMembersState = {
    whereCalls: [],
    whereInCalls: [],
    selectCalls: 0,
    firstCalls: 0
  }
  const channelMemberRows = overrides.channelMemberRows || []
  const hasSelfMembership = overrides.hasSelfMembership !== false

  const db = (table) => {
    if (table === 'users') {
      return builder
    }

    if (table === 'channel_members') {
      const channelMembersBuilder = {
        where(...args) {
          channelMembersState.whereCalls.push(args)
          return channelMembersBuilder
        },
        whereIn(...args) {
          channelMembersState.whereInCalls.push(args)
          return channelMembersBuilder
        },
        async first() {
          channelMembersState.firstCalls += 1
          return hasSelfMembership ? { id: 'membership-self' } : null
        },
        async select() {
          channelMembersState.selectCalls += 1
          return channelMemberRows
        }
      }

      return channelMembersBuilder
    }

    throw new Error(`Unexpected table ${table}`)
  }

  const service = new UsersService({
    Model: db,
    name: 'users',
    app: {
      get(key) {
        assert.equal(key, 'postgresqlClient')
        return db
      }
    }
  })

  const superFindCalls = []
  service._find = async (params) => {
    superFindCalls.push(params)
    return overrides.superFindResult || {
      total: rows.length,
      limit: rows.length,
      skip: 0,
      data: rows
    }
  }

  return { service, state, channelMembersState, superFindCalls }
}

test('users.find uses id hydration for ids[] queries', async () => {
  const rows = [
    { id: 'user-2', display_name: 'Bob' },
    { id: 'user-1', display_name: 'Alice' }
  ]
  const { service, state } = createService(rows)

  const result = await service.find({
    query: {
      'ids[]': ['user-1', 'user-2'],
      $limit: 10
    }
  })

  assert.deepEqual(state.whereInCalls, [
    ['id', ['user-1', 'user-2']]
  ])
  assert.deepEqual(state.orderByCalls, [['display_name', 'asc']])
  assert.deepEqual(state.limitCalls, [[2]])
  assert.deepEqual(result, {
    total: 2,
    limit: 2,
    skip: 0,
    data: rows
  })
})

test('users.find uses case-insensitive prefix search for q queries', async () => {
  const rows = [{ id: 'user-1', display_name: 'Alice' }]
  const { service, state } = createService(rows)

  const result = await service.find({
    query: {
      q: 'Al',
      $limit: 25
    }
  })

  assert.deepEqual(state.whereRawCalls, [[
    "LOWER(display_name) LIKE ? ESCAPE '\\'",
    ['al%']
  ]])
  assert.deepEqual(state.orderByCalls, [['display_name', 'asc']])
  assert.deepEqual(state.limitCalls, [[25]])
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].display_name, 'Alice')
})

test('users.find caps search limits to the lightweight directory maximum', async () => {
  const { service, state } = createService([])

  await service.find({
    query: {
      q: 'A',
      $limit: 999
    }
  })

  assert.deepEqual(state.limitCalls, [[50]])
})

test('users.find allows guest id hydration inside the active channel scope', async () => {
  const rows = [
    { id: 'guest-1', display_name: 'Guest User' },
    { id: 'member-1', display_name: 'Member User' }
  ]
  const { service, state, channelMembersState } = createService(rows, {
    channelMemberRows: [
      { user_id: 'guest-1' },
      { user_id: 'member-1' }
    ]
  })

  const result = await service.find({
    provider: 'rest',
    user: {
      id: 'guest-1',
      account_type: 'guest',
      is_admin: false
    },
    query: {
      ids: ['guest-1', 'member-1'],
      channel_id: 'meeting-channel-1',
      $limit: 10
    }
  })

  assert.deepEqual(channelMembersState.whereCalls[0], [{
    channel_id: 'meeting-channel-1',
    user_id: 'guest-1'
  }])
  assert.deepEqual(channelMembersState.whereCalls[1], ['channel_id', 'meeting-channel-1'])
  assert.deepEqual(channelMembersState.whereInCalls, [['user_id', ['guest-1', 'member-1']]])
  assert.deepEqual(state.whereInCalls, [
    ['id', ['guest-1', 'member-1']],
    ['id', ['guest-1', 'member-1']]
  ])
  assert.deepEqual(result.data.map((entry) => entry.id), ['guest-1', 'member-1'])
})

test('users.find keeps guest hydration empty outside the scoped channel membership', async () => {
  const { service, channelMembersState } = createService([], {
    hasSelfMembership: false
  })

  const result = await service.find({
    provider: 'rest',
    user: {
      id: 'guest-1',
      account_type: 'guest',
      is_admin: false
    },
    query: {
      ids: ['member-1'],
      channel_id: 'meeting-channel-1',
      $limit: 10
    }
  })

  assert.equal(channelMembersState.firstCalls, 1)
  assert.equal(channelMembersState.selectCalls, 0)
  assert.deepEqual(result, {
    total: 0,
    limit: 1,
    skip: 0,
    data: []
  })
})

test('users.find scopes and sorts external admin directory reads to member accounts', async () => {
  const rows = [{ id: 'member-1', display_name: 'Member User' }]
  const { service, superFindCalls } = createService(rows, {
    superFindResult: {
      total: 1,
      limit: 50,
      skip: 0,
      data: rows
    }
  })

  const result = await service.find({
    provider: 'rest',
    user: {
      id: 'admin-1',
      account_type: 'member',
      is_admin: true
    },
    query: {
      $limit: 200
    }
  })

  assert.equal(superFindCalls.length, 1)
  assert.equal(superFindCalls[0].query.account_type, 'member')
  assert.equal(superFindCalls[0].query.registration_status, 'active')
  assert.equal(superFindCalls[0].query.$limit, 50)
  assert.deepEqual(superFindCalls[0].query.$sort, {
    display_name: 1
  })
  assert.deepEqual(result, {
    total: 1,
    limit: 50,
    skip: 0,
    data: rows
  })
})

test('users.find scopes external non-admin directory reads to member accounts', async () => {
  const rows = [{ id: 'member-2', display_name: 'Member Two' }]
  const { service, superFindCalls } = createService(rows, {
    superFindResult: {
      total: 1,
      limit: 50,
      skip: 0,
      data: rows
    }
  })

  const result = await service.find({
    provider: 'rest',
    user: {
      id: 'member-self',
      account_type: 'member',
      is_admin: false
    },
    query: {
      $limit: 50
    }
  })

  assert.equal(superFindCalls.length, 1)
  assert.equal(superFindCalls[0].query.account_type, 'member')
  assert.equal(superFindCalls[0].query.registration_status, 'active')
  assert.equal(superFindCalls[0].query.$limit, 50)
  assert.deepEqual(superFindCalls[0].query.$sort, {
    display_name: 1
  })
  assert.deepEqual(result.data, rows)
})

test('users patch validation accepts theme preference values', async () => {
  const hook = validate(patchSchema)
  const context = {
    params: {
      provider: 'rest'
    },
    data: {
      theme_preference: 'light'
    }
  }

  await hook(context)

  assert.deepEqual(context.data, {
    theme_preference: 'light'
  })
})

test('users patch validation rejects invalid theme preference values', async () => {
  const hook = validate(patchSchema)

  await assert.rejects(
    hook({
      params: {
        provider: 'rest'
      },
      data: {
        theme_preference: 'sepia'
      }
    }),
    (error) => {
      assert.equal(error.error_code, 'api.validation.failed')
      return true
    }
  )
})
