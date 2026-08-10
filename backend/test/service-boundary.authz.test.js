import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { Forbidden } from '@feathersjs/errors'
import { messages } from '../src/services/messages/messages.js'
import { channels } from '../src/services/channels/channels.js'
import { channelMembers } from '../src/services/channel-members/channel-members.js'
import { roles } from '../src/services/roles/roles.js'
import { permissions } from '../src/services/permissions/permissions.js'
import { rolePermissions } from '../src/services/role-permissions/role-permissions.js'
import { userRoles } from '../src/services/user-roles/user-roles.js'

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

function createMessagesDb(initialMessages) {
  const messageRows = new Map(initialMessages.map((message) => [message.id, { ...message }]))

  const db = (table) => {
    const whereClauses = []
    const isMessagesTable = typeof table === 'string' && table.startsWith('messages')
    const builder = {
      where(column, value) {
        whereClauses.push({ column, value })
        return builder
      },
      orWhere(column, value) {
        whereClauses.push({ column, value, or: true })
        return builder
      },
      leftJoin() {
        return builder
      },
      async first() {
        if (!isMessagesTable) return null
        const idFilter = whereClauses.find((entry) => entry.column === 'id' || entry.column === 'm.id')
        if (!idFilter) return null
        const message = messageRows.get(idFilter.value)
        return message ? { ...message } : null
      },
      async update(patchData) {
        if (!isMessagesTable) return 0
        const idFilter = whereClauses.find((entry) => entry.column === 'id' || entry.column === 'm.id')
        if (!idFilter || !messageRows.has(idFilter.value)) return 0
        const current = messageRows.get(idFilter.value)
        messageRows.set(idFilter.value, { ...current, ...patchData })
        return 1
      },
      join() {
        return builder
      },
      select() {
        return builder
      },
      async del() {
        return []
      },
      insert() {
        return {
          onConflict() {
            return {
              async merge() {
                return []
              }
            }
          }
        }
      }
    }
    return builder
  }

  db.raw = (value) => value
  return { db, messageRows }
}

function createMessagesHarness() {
  const { db, messageRows } = createMessagesDb([
    { id: 'message-own', channel_id: 'channel-1', user_id: 'user-1', content: 'own' },
    { id: 'message-other', channel_id: 'channel-1', user_id: 'user-2', content: 'other' }
  ])
  const app = createAuthenticatedApp(db)

  messages(app)
  const service = app.service('messages')
  const patchCalls = []
  let removeCalled = false

  service._patch = async (id, patchData, params) => {
    patchCalls.push({ id, patchData, query: params.query })
    const current = messageRows.get(id)
    const next = { ...current, ...patchData }
    messageRows.set(id, next)
    return { ...next }
  }

  service._remove = async () => {
    removeCalled = true
    return null
  }

  return {
    service,
    messageRows,
    patchCalls,
    wasRemoveCalled: () => removeCalled
  }
}

function createHydratedMessagesPatchHarness() {
  const app = createAuthenticatedApp(() => ({
    where() {
      return this
    },
    join() {
      return this
    },
    leftJoin() {
      return this
    },
    select() {
      return this
    },
    whereNull() {
      return this
    },
    orderBy() {
      return this
    },
    limit() {
      return this
    },
    async first() {
      return null
    },
    async update() {
      return 1
    },
    async del() {
      return []
    },
    insert() {
      return {
        onConflict() {
          return {
            async merge() {
              return []
            }
          }
        }
      }
    }
  }))

  messages(app)
  const service = app.service('messages')

  service.repository.findMessageById = async (messageId) => {
    assert.equal(messageId, 'message-file')
    return {
      id: 'message-file',
      channel_id: 'channel-1',
      user_id: 'user-1',
      type: 'file',
      content: 'before'
    }
  }

  service.repository.findMessageByIdWithAuthor = async (messageId) => {
    assert.equal(messageId, 'message-file')
    return {
      id: 'message-file',
      channel_id: 'channel-1',
      user_id: 'user-1',
      type: 'file',
      content: 'after',
      edited_at: '2026-03-19T10:00:00.000Z',
      user_display_name: 'User One',
      user_avatar_url: '/avatar.png'
    }
  }

  service.attachMessageRelations = async (items) => {
    items[0].files = [{
      id: 'file-1',
      original_name: 'image.png',
      mime_type: 'image/png'
    }]
    items[0].reactions = []
    items[0].mentions = []
    items[0].reply_preview = null
    items[0].forward_preview = null
  }

  service._patch = async () => ({
    id: 'message-file',
    content: 'after',
    edited_at: '2026-03-19T10:00:00.000Z'
  })

  return { service }
}

function createChannelsDb({
  membershipsByUser = {},
  platformManageUsers = [],
  channelManageUsers = []
} = {}) {
  const platformManageSet = new Set(platformManageUsers)
  const channelManageSet = new Set(channelManageUsers)

  const db = (table) => {
    const whereClauses = []
    const builder = {
      join() {
        return builder
      },
      where(columnOrObject, value) {
        if (typeof columnOrObject === 'object' && columnOrObject !== null) {
          for (const [column, entryValue] of Object.entries(columnOrObject)) {
            whereClauses.push({ column, value: entryValue })
          }
        } else {
          whereClauses.push({ column: columnOrObject, value })
        }
        return builder
      },
      async select() {
        if (table !== 'channel_members') return []
        const userFilter = whereClauses.find((entry) => entry.column === 'user_id')
        const channelIds = membershipsByUser[userFilter?.value] || []
        return channelIds.map((channelId) => ({ channel_id: channelId }))
      },
      async first() {
        if (table === 'permissions') {
          const userFilter = whereClauses.find((entry) => entry.column === 'user_roles.user_id')
          const permFilter = whereClauses.find((entry) => entry.column === 'permissions.name')
          if (permFilter?.value === 'manage_channels' && platformManageSet.has(userFilter?.value)) {
            return { id: 'perm-manage-channels' }
          }
          return null
        }

        if (table === 'channel_members as cm') {
          const userFilter = whereClauses.find((entry) => entry.column === 'cm.user_id')
          const permFilter = whereClauses.find((entry) => entry.column === 'permissions.name')
          if (permFilter?.value === 'manage_channels' && channelManageSet.has(userFilter?.value)) {
            return { id: 'perm-manage-channels' }
          }
          return null
        }

        return null
      }
    }

    return builder
  }

  db.raw = (value) => value
  return db
}

function createChannelsHarness(dbOptions) {
  const app = createAuthenticatedApp(createChannelsDb(dbOptions))
  channels(app)
  const service = app.service('channels')
  const findCalls = []
  const getCalls = []
  const patchCalls = []
  const removeCalls = []

  service._find = async (params) => {
    findCalls.push(params)
    return []
  }

  service._get = async (id, params) => {
    getCalls.push({ id, ...params })
    return { id }
  }

  service._patch = async (id, patchData, params) => {
    patchCalls.push({
      id,
      patchData,
      query: params.query,
      includeArchived: params._includeArchived
    })
    return { id, ...patchData }
  }

  service._remove = async (id, params) => {
    removeCalls.push({
      id,
      query: params.query,
      includeArchived: params._includeArchived
    })
    return { id }
  }

  return {
    service,
    findCalls,
    getCalls,
    patchCalls,
    removeCalls
  }
}

function createChannelMembersDb(initialMemberships, channelsById = {}) {
  const membershipsById = new Map(initialMemberships.map((membership) => [membership.id, { ...membership }]))

  const db = (table) => {
    const whereClauses = []
    const builder = {
      where(column, value) {
        whereClauses.push({ column, value })
        return builder
      },
      select() {
        return builder
      },
      async first() {
        if (table === 'channel_members') {
          const idFilter = whereClauses.find((entry) => entry.column === 'id')
          if (!idFilter) return null
          const membership = membershipsById.get(idFilter.value)
          return membership ? { ...membership } : null
        }

        if (table === 'channels') {
          const idFilter = whereClauses.find((entry) => entry.column === 'id')
          if (!idFilter) return null
          const channel = channelsById[idFilter.value]
          return channel ? { ...channel } : null
        }

        return null
      }
    }
    return builder
  }

  return db
}

function createChannelMembersHarness(initialMemberships, channelsById = {}) {
  const app = createAuthenticatedApp(createChannelMembersDb(initialMemberships, channelsById))
  channelMembers(app)
  const service = app.service('channel-members')
  const patchCalls = []
  const removeCalls = []

  service._patch = async (id, patchData, params) => {
    patchCalls.push({ id, patchData, query: params.query })
    return { id, ...patchData }
  }

  service._remove = async (id, params) => {
    removeCalls.push({ id, query: params.query })
    return { id }
  }

  return {
    service,
    patchCalls,
    removeCalls
  }
}

function createRawAdminReadHarness() {
  const app = createAuthenticatedApp(() => ({
    where() {
      return this
    },
    select() {
      return this
    },
    async first() {
      return null
    }
  }))

  roles(app)
  permissions(app)
  rolePermissions(app)
  userRoles(app)

  const findCalls = []
  const getCalls = []

  for (const serviceName of ['roles', 'permissions', 'role-permissions', 'user-roles']) {
    const service = app.service(serviceName)
    service._find = async (params) => {
      findCalls.push({ serviceName, params })
      return []
    }
    service._get = async (id, params) => {
      getCalls.push({ serviceName, id, params })
      return { id }
    }
  }

  return {
    app,
    findCalls,
    getCalls
  }
}

function externalParams(permissions = []) {
  return {
    provider: 'rest',
    authenticated: true,
    user: { id: 'user-1', is_admin: false },
    resolvedPermissions: new Set(permissions)
  }
}

test('messages.patch hook-chain: own messages can be edited without manage_messages', async () => {
  const { service, patchCalls } = createMessagesHarness()

  const result = await service.patch(
    'message-own',
    { content: 'updated own' },
    {
      provider: 'rest',
      authenticated: true,
      user: { id: 'user-1', is_admin: false },
      resolvedPermissions: new Set()
    }
  )

  assert.equal(result.content, 'updated own')
  assert.ok(result.edited_at)
  assert.equal(patchCalls.length, 1)
  assert.deepEqual(patchCalls[0].query, { channel_id: 'channel-1' })
})

test('raw admin role services reject non-elevated external reads', async () => {
  const { app, findCalls, getCalls } = createRawAdminReadHarness()

  for (const serviceName of ['roles', 'permissions', 'role-permissions', 'user-roles']) {
    await assert.rejects(
      app.service(serviceName).find(externalParams()),
      Forbidden
    )
    await assert.rejects(
      app.service(serviceName).get('row-1', externalParams()),
      Forbidden
    )
  }

  assert.equal(findCalls.length, 0)
  assert.equal(getCalls.length, 0)
})

test('roles.read allows role managers, user managers, and invite issuers', async () => {
  const { app, findCalls, getCalls } = createRawAdminReadHarness()

  await app.service('roles').find(externalParams(['manage_roles']))
  await app.service('roles').find(externalParams(['manage_users']))
  await app.service('roles').find(externalParams(['create_invites']))
  await app.service('roles').get('role-1', externalParams(['create_invites']))

  assert.equal(findCalls.filter((entry) => entry.serviceName === 'roles').length, 3)
  assert.equal(getCalls.filter((entry) => entry.serviceName === 'roles').length, 1)
})

test('permission mapping reads require manage_roles while user-role reads require manage_users', async () => {
  const { app, findCalls, getCalls } = createRawAdminReadHarness()

  await app.service('permissions').find(externalParams(['manage_roles']))
  await app.service('permissions').get('permission-1', externalParams(['manage_roles']))
  await app.service('role-permissions').find(externalParams(['manage_roles']))
  await app.service('role-permissions').get('role-permission-1', externalParams(['manage_roles']))
  await app.service('user-roles').find(externalParams(['manage_users']))
  await app.service('user-roles').get('user-role-1', externalParams(['manage_users']))

  await assert.rejects(
    app.service('permissions').find(externalParams(['manage_users'])),
    Forbidden
  )
  await assert.rejects(
    app.service('role-permissions').find(externalParams(['manage_users'])),
    Forbidden
  )
  await assert.rejects(
    app.service('user-roles').find(externalParams(['manage_roles'])),
    Forbidden
  )

  assert.equal(findCalls.length, 3)
  assert.equal(getCalls.length, 3)
})

test('messages.patch hook-chain: editing foreign messages requires manage_messages', async () => {
  const { service } = createMessagesHarness()

  await assert.rejects(
    service.patch(
      'message-other',
      { content: 'blocked edit' },
      {
        provider: 'rest',
        authenticated: true,
        user: { id: 'user-1', is_admin: false },
        resolvedPermissions: new Set()
      }
    ),
    Forbidden
  )
})

test('messages.patch hook-chain: patch result is rehydrated with author and files', async () => {
  const { service } = createHydratedMessagesPatchHarness()

  const result = await service.patch(
    'message-file',
    { content: 'after' },
    {
      provider: 'rest',
      authenticated: true,
      user: { id: 'user-1', is_admin: false },
      resolvedPermissions: new Set()
    }
  )

  assert.equal(result.user_display_name, 'User One')
  assert.equal(result.user_avatar_url, '/avatar.png')
  assert.deepEqual(result.files, [{
    id: 'file-1',
    original_name: 'image.png',
    mime_type: 'image/png'
  }])
  assert.deepEqual(result.reactions, [])
  assert.deepEqual(result.mentions, [])
  assert.equal(result.reply_preview, null)
  assert.equal(result.forward_preview, null)
})

test('messages.remove hook-chain: own messages are soft-deleted without manage_messages', async () => {
  const { service, messageRows, wasRemoveCalled } = createMessagesHarness()

  const result = await service.remove('message-own', {
    provider: 'rest',
    authenticated: true,
    user: { id: 'user-1', is_admin: false },
    resolvedPermissions: new Set()
  })

  assert.ok(result.deleted_at)
  assert.equal(messageRows.get('message-own').deleted_at, result.deleted_at)
  assert.equal(wasRemoveCalled(), false)
})

test('messages.remove hook-chain: deleting foreign messages requires manage_messages', async () => {
  const { service, messageRows } = createMessagesHarness()

  await assert.rejects(
    service.remove('message-other', {
      provider: 'rest',
      authenticated: true,
      user: { id: 'user-1', is_admin: false },
      resolvedPermissions: new Set()
    }),
    Forbidden
  )

  assert.equal(messageRows.get('message-other').deleted_at, undefined)
})

test('channels.find hook-chain: include_archived is forced off without manage_channels', async () => {
  const { service, findCalls } = createChannelsHarness({
    membershipsByUser: {
      'user-1': ['private-1', 'private-2']
    }
  })

  await service.find({
    provider: 'rest',
    authenticated: true,
    user: { id: 'user-1', is_admin: false },
    query: { include_archived: true }
  })

  assert.equal(findCalls.length, 1)
  assert.equal(findCalls[0].query.include_archived, false)
  assert.deepEqual(findCalls[0]._accessibleChannelIds, ['private-1', 'private-2'])
})

test('channels.find hook-chain: include_archived stays enabled with manage_channels', async () => {
  const { service, findCalls } = createChannelsHarness({
    membershipsByUser: {
      'user-2': ['private-3']
    },
    platformManageUsers: ['user-2']
  })

  await service.find({
    provider: 'rest',
    authenticated: true,
    user: { id: 'user-2', is_admin: false },
    query: { include_archived: 'true' }
  })

  assert.equal(findCalls.length, 1)
  assert.equal(findCalls[0].query.include_archived, true)
  assert.deepEqual(findCalls[0]._accessibleChannelIds, ['private-3'])
})

test('channels.get hook-chain: member access scopes targeted channel reads', async () => {
  const { service, getCalls } = createChannelsHarness({
    membershipsByUser: {
      'user-1': ['private-1', 'private-2']
    }
  })

  await service.get('private-1', externalParams())

  assert.equal(getCalls.length, 1)
  assert.equal(getCalls[0].id, 'private-1')
  assert.deepEqual(getCalls[0]._accessibleChannelIds, ['private-1', 'private-2'])
  assert.equal(getCalls[0]._includeArchived, true)
  assert.equal(getCalls[0]._includeMeeting, true)
})

test('channels.get hook-chain: non-members retain an empty access scope', async () => {
  const { service, getCalls } = createChannelsHarness({
    membershipsByUser: {
      'user-1': []
    }
  })

  await service.get('private-1', externalParams())

  assert.equal(getCalls.length, 1)
  assert.deepEqual(getCalls[0]._accessibleChannelIds, [])
})

test('channels.patch hook-chain: patching channels requires manage_channels', async () => {
  const { service, patchCalls } = createChannelsHarness({})

  await assert.rejects(
    service.patch(
      'channel-1',
      { topic: 'blocked' },
      {
        provider: 'rest',
        authenticated: true,
        user: { id: 'user-1', is_admin: false },
        resolvedPermissions: new Set()
      }
    ),
    Forbidden
  )

  assert.equal(patchCalls.length, 0)
})

test('channels.remove hook-chain: removing channels requires manage_channels', async () => {
  const { service, removeCalls } = createChannelsHarness({})

  await assert.rejects(
    service.remove('channel-1', {
      provider: 'rest',
      authenticated: true,
      user: { id: 'user-1', is_admin: false },
      resolvedPermissions: new Set()
    }),
    Forbidden
  )

  assert.equal(removeCalls.length, 0)
})

test('channel-members.patch hook-chain: self notification update is query-scoped to channel', async () => {
  const { service, patchCalls } = createChannelMembersHarness([
    { id: 'membership-1', channel_id: 'channel-1', user_id: 'user-1', role: 'member' }
  ])

  await service.patch(
    'membership-1',
    { notifications: 'mentions' },
    {
      provider: 'rest',
      authenticated: true,
      user: { id: 'user-1', is_admin: false },
      resolvedPermissions: new Set(),
      query: { $limit: 1 }
    }
  )

  assert.equal(patchCalls.length, 1)
  assert.equal(patchCalls[0].query.channel_id, 'channel-1')
})

test('channel-members.patch hook-chain: self role escalation requires manage_channel_members', async () => {
  const { service, patchCalls } = createChannelMembersHarness([
    { id: 'membership-1', channel_id: 'channel-1', user_id: 'user-1', role: 'member' }
  ])

  await assert.rejects(
    service.patch(
      'membership-1',
      { role: 'owner' },
      {
        provider: 'rest',
        authenticated: true,
        user: { id: 'user-1', is_admin: false },
        resolvedPermissions: new Set(),
        query: {}
      }
    ),
    Forbidden
  )

  assert.equal(patchCalls.length, 0)
})

test('channel-members.remove hook-chain: removing another dm participant is forbidden for admins', async () => {
  const { service, removeCalls } = createChannelMembersHarness(
    [{ id: 'membership-dm', channel_id: 'dm-1', user_id: 'user-2', role: 'member' }],
    {
      'dm-1': { id: 'dm-1', type: 'dm', is_archived: false, purpose: 'default' }
    }
  )

  await assert.rejects(
    service.remove('membership-dm', {
      provider: 'rest',
      authenticated: true,
      user: { id: 'admin-1', is_admin: true },
      resolvedPermissions: new Set(['*']),
      query: {}
    }),
    (error) => {
      assert.equal(error instanceof Forbidden, true)
      assert.equal(error.data?.error_code, 'api.channels.dm_member_removal_not_supported')
      return true
    }
  )

  assert.equal(removeCalls.length, 0)
})
