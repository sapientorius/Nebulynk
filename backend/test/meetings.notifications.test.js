import test from 'node:test'
import assert from 'node:assert/strict'
import { createMeetingsService } from './helpers/meetings-service.js'

test('meetings notifications: create stores structured meeting_invite notification rows with meeting_id', async () => {
  let insertedNotificationRows = []

  const db = (table) => {
    if (table === 'platform_settings') {
      const builder = {
        where() { return builder },
        orderBy() { return builder },
        async first() { return { value: 'en' } }
      }
      return builder
    }
    if (table === 'channel_members') {
      const builder = {
        where() { return builder },
        whereNot() { return builder },
        async select() { return [{ user_id: 'user-2' }] }
      }
      return builder
    }
    throw new Error(`Unexpected table: ${table}`)
  }

  db.transaction = async (callback) => {
    const trx = (table) => {
      if (table === 'channels') {
        const builder = {
          where() { return builder },
          forUpdate() { return builder },
          orderBy() { return builder },
          async first() { return null },
          async insert() { return undefined }
        }
        return builder
      }
      if (table === 'meetings') {
        const builder = {
          where() { return builder },
          orderBy() { return builder },
          async first() { return null },
          async insert() { return undefined }
        }
        return builder
      }
      if (table === 'channel_members') {
        const builder = {
          where() { return builder },
          async select() { return [{ user_id: 'user-1' }, { user_id: 'user-2' }] },
          async insert() { return undefined }
        }
        return builder
      }
      if (table === 'meeting_participants' || table === 'meeting_artifacts') {
        return { async insert() { return undefined } }
      }
      if (table === 'meeting_start_members') {
        const builder = {
          insert() { return builder },
          onConflict() { return builder },
          async ignore() { return undefined }
        }
        return builder
      }
      if (table === 'notifications') {
        return {
          async insert(rows) {
            insertedNotificationRows = rows
            return undefined
          }
        }
      }
      throw new Error(`Unexpected trx table: ${table}`)
    }

    return callback(trx)
  }

  const service = createMeetingsService({ db })
  service._assertCanUseSourceChannel = async () => ({
    id: 'source-1',
    name: 'General',
    topic: null,
    type: 'public'
  })
  service._assertUsersExist = async () => {}
  service._resolveSourceChannelDisplayName = async () => 'General'
  service._joinConnectionsToChannel = () => {}
  service._emitNotificationEvents = () => {}
  service._createSourceMessage = async () => {}
  service.get = async (id) => ({ id, status: 'active' })

  const result = await service.create(
    { source_channel_id: 'source-1' },
    { user: { id: 'user-1', display_name: 'Host', is_admin: false } }
  )

  assert.equal(insertedNotificationRows.length, 1)
  assert.equal(insertedNotificationRows[0].type, 'meeting_invite')
  assert.equal(insertedNotificationRows[0].meeting_id, result.id)
  assert.equal(insertedNotificationRows[0].channel_id, 'source-1')
})

test('meetings notifications: source message is created with skipNotifications flag', async () => {
  let createCall = null

  const service = createMeetingsService({
    app: {
      service(name) {
        if (name === 'messages') {
          return {
            async create(data, params) {
              createCall = { data, params }
            }
          }
        }

        return {
          emit() {}
        }
      },
      channel() {
        return {
          connections: [],
          join() {}
        }
      }
    }
  })

  await service._createSourceMessage({
    meetingId: 'meeting-1',
    sourceChannel: { id: 'source-1' },
    user: { id: 'user-1' }
  })

  assert.deepEqual(createCall, {
    data: {
      channel_id: 'source-1',
      content: '[Meeting] /meetings/meeting-1'
    },
    params: {
      user: { id: 'user-1' },
      skipNotifications: true
    }
  })
})
