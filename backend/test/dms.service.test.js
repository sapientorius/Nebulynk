import test from 'node:test'
import assert from 'node:assert/strict'
import { DmsService } from '../src/services/dms/dms.js'

function createService({ userRows = [] } = {}) {
  const dbCalls = []

  const db = (table) => {
    dbCalls.push(table)

    if (table === 'users') {
      return {
        whereIn(column, values) {
          assert.equal(column, 'id')
          assert.deepEqual(values, userRows.map((row) => row.id))
          return {
            async select(...fields) {
              assert.deepEqual(fields, ['id', 'account_type'])
              return userRows
            }
          }
        }
      }
    }

    throw new Error(`Unexpected table ${table}`)
  }

  const service = new DmsService({
    Model: db,
    app: {
      get(key) {
        assert.equal(key, 'postgresqlClient')
        return db
      }
    }
  })

  return { service, dbCalls }
}

test('dms.create rejects guest accounts before looking up DM targets', async () => {
  const { service, dbCalls } = createService()

  await assert.rejects(
    service.create({
      user_ids: ['member-2']
    }, {
      user: {
        id: 'guest-1',
        account_type: 'guest'
      }
    }),
    (error) => {
      assert.equal(error?.error_code || error?.data?.error_code, 'api.dms.guest_accounts_forbidden')
      return true
    }
  )

  assert.deepEqual(dbCalls, [])
})

test('dms.create rejects guest DM targets for member accounts', async () => {
  const { service, dbCalls } = createService({
    userRows: [
      { id: 'guest-1', account_type: 'guest' }
    ]
  })

  await assert.rejects(
    service.create({
      user_ids: ['guest-1']
    }, {
      user: {
        id: 'member-1',
        account_type: 'member'
      }
    }),
    (error) => {
      assert.equal(error?.error_code || error?.data?.error_code, 'api.dms.guest_accounts_forbidden')
      return true
    }
  )

  assert.deepEqual(dbCalls, ['users'])
})

function createFindHarness({ channels = [], memberships = [], users = [], messages = [] } = {}) {
  const tables = {
    channels: [...channels],
    channel_members: [...memberships],
    users: [...users],
    messages: [...messages]
  }

  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.whereInFilters = []
      this.nullFilters = []
      this.joinedTables = new Set()
    }

    join(table) {
      this.joinedTables.add(table)
      return this
    }

    where(field, value) {
      if (field && typeof field === 'object') {
        for (const [key, entryValue] of Object.entries(field)) {
          this.filters.push({ field: key, value: entryValue })
        }
        return this
      }

      this.filters.push({ field, value })
      return this
    }

    whereIn(field, values) {
      this.whereInFilters.push({ field, values })
      return this
    }

    whereNull(field) {
      this.nullFilters.push(field)
      return this
    }

    groupBy() {
      return this
    }

    first() {
      return this.execute().then((rows) => rows[0])
    }

    select() {
      return this
    }

    max() {
      return Promise.resolve([])
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject)
    }

    insert(input) {
      const rows = Array.isArray(input) ? input : [input]
      if (this.table === 'channel_members') {
        return {
          onConflict: () => ({
            ignore: async () => {
              for (const row of rows) {
                const exists = tables.channel_members.some((entry) => (
                  entry.channel_id === row.channel_id && entry.user_id === row.user_id
                ))
                if (!exists) tables.channel_members.push(row)
              }
            }
          })
        }
      }

      tables[this.table].push(...rows)
      return Promise.resolve(rows)
    }

    async update(patch) {
      const rows = await this.execute()
      for (const row of rows) Object.assign(row, patch)
      return rows.length
    }

    async execute() {
      let rows = this.resolveRows()
      for (const filter of this.filters) {
        rows = rows.filter((row) => row[this.columnName(filter.field)] === filter.value)
      }
      for (const filter of this.whereInFilters) {
        rows = rows.filter((row) => filter.values.includes(row[this.columnName(filter.field)]))
      }
      for (const field of this.nullFilters) {
        rows = rows.filter((row) => row[this.columnName(field)] == null)
      }
      return rows
    }

    resolveRows() {
      if (this.table === 'channel_members' && this.joinedTables.has('channels')) {
        return tables.channel_members
          .map((membership) => {
            const channel = tables.channels.find((entry) => entry.id === membership.channel_id)
            if (!channel) return null
            return {
              ...channel,
              channel_id: membership.channel_id,
              user_id: membership.user_id,
              role: membership.role
            }
          })
          .filter(Boolean)
      }

      if (this.table === 'channel_members' && this.joinedTables.has('users')) {
        return tables.channel_members
          .map((membership) => {
            const user = tables.users.find((entry) => entry.id === membership.user_id)
            if (!user) return null
            return {
              channel_id: membership.channel_id,
              user_id: membership.user_id,
              role: membership.role,
              display_name: user.display_name,
              avatar_url: user.avatar_url,
              status: user.status
            }
          })
          .filter(Boolean)
      }

      return tables[this.table]
    }

    columnName(field) {
      return String(field).split('.').pop()
    }
  }

  const db = (table) => new Query(table)
  const service = new DmsService({
    Model: db,
    app: {
      channel() {
        return { connections: [], join() {} }
      },
      service() {
        return { emit() {} }
      }
    }
  })

  return { service, tables }
}

test('dms.find creates a personal notes DM for member accounts', async () => {
  const { service, tables } = createFindHarness({
    users: [{ id: 'member-1', display_name: 'Member One', status: 'online' }]
  })

  const result = await service.find({
    user: { id: 'member-1', account_type: 'member' }
  })

  const notesChannel = result.data.find((channel) => channel.name === 'notes')
  assert.equal(notesChannel?.type, 'dm')
  assert.equal(notesChannel?.created_by, 'member-1')
  assert.deepEqual(notesChannel.participants.map((entry) => entry.user_id), ['member-1'])
  assert.equal(tables.channels.length, 1)
  assert.equal(tables.channel_members.length, 1)
})

test('dms.find keeps notes DM creation idempotent', async () => {
  const { service, tables } = createFindHarness({
    users: [{ id: 'member-1', display_name: 'Member One', status: 'online' }]
  })

  await service.find({ user: { id: 'member-1', account_type: 'member' } })
  await service.find({ user: { id: 'member-1', account_type: 'member' } })

  assert.equal(tables.channels.filter((channel) => channel.name === 'notes').length, 1)
  assert.equal(tables.channel_members.filter((membership) => membership.user_id === 'member-1').length, 1)
})

test('dms.find repairs missing notes DM membership', async () => {
  const { service, tables } = createFindHarness({
    channels: [{
      id: 'notes-1',
      name: 'notes',
      type: 'dm',
      created_by: 'member-1',
      created_at: '2026-06-20T00:00:00.000Z'
    }],
    users: [{ id: 'member-1', display_name: 'Member One', status: 'online' }]
  })

  const result = await service.find({
    user: { id: 'member-1', account_type: 'member' }
  })

  assert.equal(tables.channels.length, 1)
  assert.equal(tables.channel_members.length, 1)
  assert.equal(tables.channel_members[0].channel_id, 'notes-1')
  assert.equal(result.data[0].id, 'notes-1')
})

test('dms.find does not create notes DMs for guests', async () => {
  const { service, tables } = createFindHarness({
    users: [{ id: 'guest-1', display_name: 'Guest One', status: 'online' }]
  })

  const result = await service.find({
    user: { id: 'guest-1', account_type: 'guest' }
  })

  assert.deepEqual(result.data, [])
  assert.equal(tables.channels.length, 0)
  assert.equal(tables.channel_members.length, 0)
})

test('dms.patch restricts meeting history policy changes to group owners and admins', async () => {
  const seed = {
    channels: [{
      id: 'group-1',
      name: 'Project',
      type: 'group',
      meeting_history_access: 'all_channel_members'
    }],
    memberships: [
      { channel_id: 'group-1', user_id: 'owner-1', role: 'owner' },
      { channel_id: 'group-1', user_id: 'member-1', role: 'member' }
    ],
    users: [
      { id: 'owner-1', display_name: 'Owner' },
      { id: 'member-1', display_name: 'Member' }
    ]
  }

  const { service, tables } = createFindHarness(seed)

  await assert.rejects(
    service.patch('group-1', { meeting_history_access: 'active_participants' }, {
      user: { id: 'member-1', is_admin: false }
    }),
    (error) => error?.error_code === 'api.dms.meeting_history_access_forbidden'
  )

  await service.patch('group-1', { meeting_history_access: 'meeting_start_members' }, {
    user: { id: 'owner-1', is_admin: false }
  })
  assert.equal(tables.channels[0].meeting_history_access, 'meeting_start_members')

  await service.patch('group-1', { meeting_history_access: 'active_participants' }, {
    user: { id: 'admin-1', is_admin: true }
  })
  assert.equal(tables.channels[0].meeting_history_access, 'active_participants')
})
