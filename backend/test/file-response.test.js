import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { S3Client } from '@aws-sdk/client-s3'
import { FilesService } from '../src/services/files/files.js'
import { MessagesService } from '../src/services/messages/messages.js'

function createPresignClient() {
  return new S3Client({
    endpoint: 'https://storage.example.test',
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key'
    },
    forcePathStyle: true
  })
}

function createFileRow(overrides = {}) {
  return {
    id: 'file-1',
    message_id: 'message-1',
    user_id: 'user-1',
    original_name: 'report.pdf',
    storage_key: 'user-1/file-1/report.pdf',
    mime_type: 'application/pdf',
    size: 1234,
    purpose: 'attachment',
    duration_ms: null,
    bucket: 'files',
    created_at: '2026-06-14T10:00:00.000Z',
    updated_at: '2026-06-14T10:00:00.000Z',
    ...overrides
  }
}

function createFilesService(file = createFileRow()) {
  const app = {
    get(name) {
      if (name === 'storagePresignClient') return createPresignClient()
      if (name === 'storageClient') return null
      return null
    }
  }
  const domainService = {
    async resolveFindAccess() {
      return {}
    },
    async listFiles() {
      return [{ ...file }]
    },
    async resolveGetAccess() {
      return { file: { ...file } }
    }
  }

  return new FilesService({
    Model: {},
    name: 'files',
    app,
    domainService
  })
}

function createQueryBuilder({ table, files }) {
  const clauses = []
  const builder = {
    join() {
      return builder
    },
    leftJoin() {
      return builder
    },
    where(field, value) {
      clauses.push({ type: 'where', field, value })
      return builder
    },
    whereIn(field, values) {
      clauses.push({ type: 'whereIn', field, values })
      return builder
    },
    select() {
      return builder
    },
    orderBy() {
      return builder
    },
    then(resolve, reject) {
      return Promise.resolve(resolveRows()).then(resolve, reject)
    }
  }

  function resolveRows() {
    let rows = table === 'files' ? files.map((file) => ({ ...file })) : []
    for (const clause of clauses) {
      const field = String(clause.field).split('.').pop()
      if (clause.type === 'where') {
        rows = rows.filter((row) => row[field] === clause.value)
      }
      if (clause.type === 'whereIn') {
        rows = rows.filter((row) => clause.values.includes(row[field]))
      }
    }
    return rows
  }

  return builder
}

test('files service external responses include signed URLs but omit storage internals', async () => {
  const service = createFilesService()

  const found = await service.find({
    provider: 'rest',
    user: { id: 'user-1', is_admin: false }
  })
  const fetched = await service.get('file-1', {
    provider: 'rest',
    user: { id: 'user-1', is_admin: false }
  })

  for (const file of [found.data[0], fetched]) {
    assert.equal(file.id, 'file-1')
    assert.equal(file.original_name, 'report.pdf')
    assert.match(file.url, /^https:\/\/storage\.example\.test\/files\//)
    assert.equal(Object.hasOwn(file, 'storage_key'), false)
    assert.equal(Object.hasOwn(file, 'bucket'), false)
  }
})

test('message relation file payloads omit storage internals for external callers', async () => {
  const file = createFileRow()
  const db = (table) => createQueryBuilder({ table, files: [file] })
  const service = new MessagesService({
    Model: db,
    name: 'messages',
    app: {
      get(name) {
        if (name === 'storagePresignClient') return createPresignClient()
        return null
      }
    },
    repository: {
      async findMessagesByIdsWithAuthor() {
        return []
      }
    },
    domainService: {}
  })
  const message = {
    id: 'message-1',
    channel_id: 'channel-1',
    user_id: 'user-1',
    type: 'file',
    content: '',
    reply_to_message_id: null,
    forward_source_message_id: null,
    forward_source_channel_id: null
  }

  await service.attachMessageRelations([message], {
    provider: 'rest',
    user: { id: 'user-1', is_admin: false }
  })

  assert.equal(message.files.length, 1)
  assert.match(message.files[0].url, /^https:\/\/storage\.example\.test\/files\//)
  assert.equal(Object.hasOwn(message.files[0], 'storage_key'), false)
  assert.equal(Object.hasOwn(message.files[0], 'bucket'), false)
})

test('message create hook sanitizes returned file attachments for external callers', async () => {
  const source = await readFile(new URL('../src/services/messages/messages.js', import.meta.url), 'utf8')

  assert.match(source, /context\.result\.files = context\.params\.provider \? sanitizeFilesForExternal\(files\) : files/)
})
