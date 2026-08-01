import test from 'node:test'
import assert from 'node:assert/strict'
import { MessagesService } from '../src/services/messages/messages.js'

function createKnexStub() {
  const fileRows = []

  const db = (table) => {
    const clauses = []
    const builder = {
      where(column, value) {
        clauses.push({ type: 'where', column, value })
        return builder
      },
      whereIn(column, values) {
        clauses.push({ type: 'whereIn', column, values })
        return builder
      },
      orderBy() {
        return builder
      },
      select() {
        if (table !== 'files') return Promise.resolve([])
        let result = [...fileRows]
        for (const clause of clauses) {
          if (clause.type === 'where') {
            result = result.filter((entry) => entry[clause.column] === clause.value)
          }
          if (clause.type === 'whereIn') {
            result = result.filter((entry) => clause.values.includes(entry[clause.column]))
          }
        }
        return Promise.resolve(result.map((entry) => ({ ...entry })))
      },
      delete() {
        if (table !== 'files') return Promise.resolve(0)
        let remaining = [...fileRows]
        for (const clause of clauses) {
          if (clause.type === 'whereIn') {
            remaining = remaining.filter((entry) => !clause.values.includes(entry[clause.column]))
          }
        }
        fileRows.length = 0
        fileRows.push(...remaining)
        return Promise.resolve(1)
      },
      insert(fileData) {
        if (table === 'files') {
          fileRows.push({ ...fileData })
        }
        return Promise.resolve([fileData.id])
      }
    }
    return builder
  }

  return { db, fileRows }
}

function createServiceHarness({
  sourceFiles = [],
  copyImpl,
  createImpl
} = {}) {
  const { db, fileRows } = createKnexStub()
  fileRows.push(...sourceFiles.map((file) => ({ ...file })))

  const repository = {
    async findMessageByIdWithAuthor(messageId) {
      if (messageId !== 'message-source') return null
      return {
        id: 'message-source',
        channel_id: 'channel-source',
        content: 'Source message',
        deleted_at: null,
        user_display_name: 'Source User',
        channel_name: 'source'
      }
    },
    async findChannelMembership(channelId, userId) {
      if (channelId === 'channel-source' && userId === 'user-forwarder') {
        return { channel_id: channelId, user_id: userId }
      }
      return null
    },
    async findFilesByMessageId(messageId) {
      return fileRows.filter((file) => file.message_id === messageId).map((file) => ({ ...file }))
    },
    async createFile(fileData) {
      fileRows.push({ ...fileData })
    },
    async deleteFilesByIds(fileIds) {
      for (let index = fileRows.length - 1; index >= 0; index -= 1) {
        if (fileIds.includes(fileRows[index].id)) {
          fileRows.splice(index, 1)
        }
      }
    }
  }

  const copiedObjects = []
  const deletedObjects = []
  const service = new MessagesService({
    Model: db,
    name: 'messages',
    app: {
      get(name) {
        if (name === 'storageClient') {
          return {
            send(command) {
              const constructorName = command?.constructor?.name
              if (constructorName === 'CopyObjectCommand') {
                copiedObjects.push({
                  bucket: command.input.Bucket,
                  key: command.input.Key,
                  source: command.input.CopySource
                })
                if (copyImpl) return copyImpl(command)
              }
              if (constructorName === 'DeleteObjectCommand') {
                deletedObjects.push({
                  bucket: command.input.Bucket,
                  key: command.input.Key
                })
              }
              return Promise.resolve({})
            }
          }
        }
        return null
      }
    },
    repository,
    domainService: {},
    generateId: (() => {
      let nextId = 0
      return () => `forwarded-file-${++nextId}`
    })()
  })

  service.create = createImpl || (async (payload) => ({
    id: 'message-forwarded',
    channel_id: payload.channel_id,
    content: payload.content,
    type: payload.file_ids?.length ? 'file' : 'text',
    files: fileRows.filter((file) => payload.file_ids?.includes(file.id))
  }))

  return { service, fileRows, copiedObjects, deletedObjects }
}

test('messages.forward duplicates source files into the forwarded message payload', async () => {
  const sourceFiles = [{
    id: 'file-source-1',
    message_id: 'message-source',
    user_id: 'user-source',
    original_name: 'spec.pdf',
    storage_key: 'user-source/file-source-1/spec.pdf',
    mime_type: 'application/pdf',
    size: 1234,
    purpose: 'voice_message',
    duration_ms: 4200,
    bucket: 'files',
    created_at: '2026-03-14T10:00:00.000Z',
    updated_at: '2026-03-14T10:00:00.000Z'
  }]
  const { service, fileRows, copiedObjects } = createServiceHarness({ sourceFiles })

  const result = await service.forward({
    source_message_id: 'message-source',
    target_channel_id: 'channel-target',
    comment: 'FYI'
  }, {
    user: { id: 'user-forwarder', is_admin: false }
  })

  assert.equal(result.id, 'message-forwarded')
  const duplicatedFile = fileRows.find((file) => file.id === 'forwarded-file-1')
  assert.ok(duplicatedFile)
  assert.equal(duplicatedFile.user_id, 'user-forwarder')
  assert.equal(duplicatedFile.message_id, null)
  assert.equal(duplicatedFile.storage_key, 'user-forwarder/forwarded-file-1/spec.pdf')
  assert.equal(duplicatedFile.purpose, 'voice_message')
  assert.equal(duplicatedFile.duration_ms, 4200)
  assert.equal(copiedObjects.length, 1)
  assert.equal(copiedObjects[0].source, '/files/user-source/file-source-1/spec.pdf')
})

test('messages.forward keeps previous behavior when the source has no files', async () => {
  let receivedPayload = null
  const { service, copiedObjects } = createServiceHarness({
    createImpl: async (payload) => {
      receivedPayload = payload
      return { id: 'message-forwarded', channel_id: payload.channel_id, content: payload.content }
    }
  })

  await service.forward({
    source_message_id: 'message-source',
    target_channel_id: 'channel-target'
  }, {
    user: { id: 'user-forwarder', is_admin: false }
  })

  assert.deepEqual(receivedPayload.file_ids, [])
  assert.equal(copiedObjects.length, 0)
})

test('messages.forward cleans up duplicated files when create fails', async () => {
  const sourceFiles = [{
    id: 'file-source-1',
    message_id: 'message-source',
    user_id: 'user-source',
    original_name: 'spec.pdf',
    storage_key: 'user-source/file-source-1/spec.pdf',
    mime_type: 'application/pdf',
    size: 1234,
    bucket: 'files',
    created_at: '2026-03-14T10:00:00.000Z',
    updated_at: '2026-03-14T10:00:00.000Z'
  }]
  const { service, deletedObjects } = createServiceHarness({
    sourceFiles,
    createImpl: async () => {
      throw new Error('create failed')
    }
  })

  await assert.rejects(
    service.forward({
      source_message_id: 'message-source',
      target_channel_id: 'channel-target'
    }, {
      user: { id: 'user-forwarder', is_admin: false }
    }),
    /create failed/
  )

  assert.deepEqual(deletedObjects, [{
    bucket: 'files',
    key: 'user-forwarder/forwarded-file-1/spec.pdf'
  }])
})
