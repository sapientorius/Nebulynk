import test from 'node:test'
import assert from 'node:assert/strict'
import { HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import {
  STORAGE_USAGE_CACHE_FRESH_FOR_MS,
  StorageUsageManager
} from '../src/lib/storage-usage.js'

function createDb({ databaseBytes = '100', recordings = [], databaseError = null, recordingsError = null } = {}) {
  const db = (table) => {
    assert.equal(table, 'meeting_recordings')
    const query = {
      whereNotNull() {
        return query
      },
      async select() {
        if (recordingsError) throw recordingsError
        return recordings
      }
    }
    return query
  }

  db.rawCalls = []
  db.raw = async (query) => {
    db.rawCalls.push(query)
    if (databaseError) throw databaseError
    return { rows: [{ bytes: databaseBytes }] }
  }
  return db
}

function responseKey(input) {
  return `${input.Bucket}|${input.Prefix || ''}|${input.ContinuationToken || ''}`
}

function objectKey(bucket, key) {
  return `${bucket}|${key}`
}

function createStorageClient({ listResponses = {}, headResponses = {}, beforeSend = null } = {}) {
  const calls = []
  return {
    calls,
    async send(command) {
      calls.push(command)
      await beforeSend?.(command)
      if (command instanceof ListObjectsV2Command) {
        const response = listResponses[responseKey(command.input)]
        if (response instanceof Error) throw response
        if (!response) throw new Error(`Missing list response for ${responseKey(command.input)}`)
        return response
      }
      if (command instanceof HeadObjectCommand) {
        const response = headResponses[objectKey(command.input.Bucket, command.input.Key)]
        if (response instanceof Error) throw response
        if (response == null) {
          const error = new Error('Not found')
          error.name = 'NotFound'
          error.$metadata = { httpStatusCode: 404 }
          throw error
        }
        return { ContentLength: response }
      }
      throw new Error(`Unexpected command ${command.constructor?.name}`)
    }
  }
}

function createApp({ db, storageClient, storageBucket = 'files' }) {
  const values = new Map([
    ['postgresqlClient', db],
    ['storageClient', storageClient],
    ['storageBucket', storageBucket]
  ])
  return { get: (key) => values.get(key) }
}

function createManager({
  db = createDb(),
  storageClient,
  storageBucket = 'files',
  now = () => new Date('2026-09-02T10:00:00.000Z'),
  recordingStorage = { bucket: 'files', endpoint: 'http://storage', region: 'us-east-1' },
  recordingPrefix = 'meeting-recordings',
  createStorageClientFn = () => storageClient
} = {}) {
  return new StorageUsageManager(createApp({ db, storageClient, storageBucket }), {
    now,
    log: { warn() {} },
    getEgressStorageConfigFn: () => recordingStorage,
    getMeetingRecordingBasePrefixFn: () => recordingPrefix,
    createStorageClientFn,
    resolveStorageEndpointFn: () => 'http://storage'
  })
}

test('storage usage aggregates paginated objects and classifies known recordings', async () => {
  const storageClient = createStorageClient({
    listResponses: {
      'files||': {
        Contents: [
          { Key: 'user-1/file.txt', Size: 11 },
          { Key: 'meeting-recordings/meeting-1/user-1/recording-1.mp4', Size: 17 }
        ],
        IsTruncated: true,
        NextContinuationToken: 'next-page'
      },
      'files||next-page': {
        Contents: [
          { Key: 'avatars/user-1/avatar.webp', Size: 13 },
          { Key: 'legacy-recordings/recording-2.mp4', Size: 19 }
        ],
        IsTruncated: false
      }
    }
  })
  const manager = createManager({
    db: createDb({
      recordings: [
        { storage_bucket: 'files', storage_key: 'meeting-recordings/meeting-1/user-1/recording-1.mp4' },
        { storage_bucket: 'files', storage_key: 'legacy-recordings/recording-2.mp4' }
      ]
    }),
    storageClient
  })

  const usage = await manager.getUsage()

  assert.equal(usage.state, 'fresh')
  assert.equal(usage.database.bytes, '100')
  assert.equal(usage.object_storage.bytes, '60')
  assert.equal(usage.object_storage.files.bytes, '24')
  assert.equal(usage.object_storage.files.object_count, 2)
  assert.equal(usage.object_storage.meeting_recordings.bytes, '36')
  assert.equal(usage.object_storage.meeting_recordings.object_count, 2)
  assert.equal(usage.total_bytes, '160')
  assert.deepEqual(manager.db.rawCalls, ['SELECT pg_database_size(current_database()) AS bytes'])
  assert.equal(storageClient.calls.filter((command) => command instanceof ListObjectsV2Command).length, 2)
  assert.equal(storageClient.calls.filter((command) => command instanceof HeadObjectCommand).length, 0)
})

test('storage usage includes recordings from a separate recording bucket without scanning unrelated objects', async () => {
  const storageClient = createStorageClient({
    listResponses: {
      'files||': {
        Contents: [{ Key: 'user-1/file.txt', Size: 9 }],
        IsTruncated: false
      },
      'recordings|meeting-recordings|': {
        Contents: [{ Key: 'meeting-recordings/meeting-1/user-1/recording-1.mp4', Size: 21 }],
        IsTruncated: false
      }
    }
  })
  const manager = createManager({
    db: createDb({
      recordings: [{ storage_bucket: 'recordings', storage_key: 'meeting-recordings/meeting-1/user-1/recording-1.mp4' }]
    }),
    storageClient,
    recordingStorage: { bucket: 'recordings', endpoint: 'http://storage', region: 'us-east-1' }
  })

  const usage = await manager.getUsage()

  assert.equal(usage.object_storage.files.bytes, '9')
  assert.equal(usage.object_storage.meeting_recordings.bytes, '21')
  assert.equal(usage.object_storage.bytes, '30')
  assert.equal(storageClient.calls[1].input.Prefix, 'meeting-recordings')
})

test('storage usage counts a separately configured recording endpoint even when bucket names match', async () => {
  const primaryClient = createStorageClient({
    listResponses: {
      'files||': {
        Contents: [
          { Key: 'user-1/file.txt', Size: 9 },
          { Key: 'meeting-recordings/legacy/recording-1.mp4', Size: 7 }
        ],
        IsTruncated: false
      }
    }
  })
  const recordingClient = createStorageClient({
    listResponses: {
      'files|meeting-recordings|': {
        Contents: [{ Key: 'meeting-recordings/meeting-1/user-1/recording-1.mp4', Size: 21 }],
        IsTruncated: false
      }
    }
  })
  const manager = createManager({
    storageClient: primaryClient,
    recordingStorage: { bucket: 'files', endpoint: 'http://recording-storage', region: 'us-east-1' },
    createStorageClientFn: () => recordingClient
  })

  const usage = await manager.getUsage()

  assert.equal(usage.object_storage.files.bytes, '9')
  assert.equal(usage.object_storage.meeting_recordings.bytes, '28')
  assert.equal(usage.object_storage.bytes, '37')
  assert.equal(primaryClient.calls.filter((command) => command instanceof ListObjectsV2Command).length, 1)
  assert.equal(recordingClient.calls.filter((command) => command instanceof ListObjectsV2Command).length, 1)
})

test('storage usage resolves historical recording objects outside the configured namespace with HEAD', async () => {
  const storageClient = createStorageClient({
    listResponses: {
      'files||': {
        Contents: [{ Key: 'user-1/file.txt', Size: 5 }],
        IsTruncated: false
      }
    },
    headResponses: {
      'legacy-recordings|archive/recording-1.mp4': 7
    }
  })
  const manager = createManager({
    db: createDb({
      recordings: [{ storage_bucket: 'legacy-recordings', storage_key: 'archive/recording-1.mp4' }]
    }),
    storageClient
  })

  const usage = await manager.getUsage()

  assert.equal(usage.object_storage.files.bytes, '5')
  assert.equal(usage.object_storage.meeting_recordings.bytes, '7')
  assert.equal(usage.object_storage.bytes, '12')
  assert.equal(storageClient.calls.filter((command) => command instanceof HeadObjectCommand).length, 1)
})

test('storage usage keeps the last successful snapshot, marks it stale, and coalesces manual refreshes', async () => {
  let currentTime = new Date('2026-09-02T10:00:00.000Z')
  let releaseSecondScan
  let listCalls = 0
  const storageClient = createStorageClient({
    listResponses: {
      'files||': { Contents: [{ Key: 'user-1/file.txt', Size: 9 }], IsTruncated: false }
    },
    beforeSend(command) {
      if (!(command instanceof ListObjectsV2Command)) return
      listCalls += 1
      if (listCalls !== 2) return
      return new Promise((resolve) => { releaseSecondScan = resolve })
    }
  })
  const manager = createManager({
    storageClient,
    now: () => currentTime
  })

  const first = await manager.getUsage()
  assert.equal(first.state, 'fresh')

  currentTime = new Date(currentTime.getTime() + STORAGE_USAGE_CACHE_FRESH_FOR_MS + 1000)
  const stale = await manager.getUsage()
  assert.equal(stale.state, 'stale')
  assert.equal(stale.refresh_failed, false)
  assert.equal(listCalls, 1)

  const refreshOne = manager.refresh()
  const refreshTwo = manager.refresh()
  releaseSecondScan()
  const [updatedOne, updatedTwo] = await Promise.all([refreshOne, refreshTwo])
  assert.equal(listCalls, 2)
  assert.equal(updatedOne.state, 'fresh')
  assert.equal(updatedTwo.state, 'fresh')
})

test('storage usage retains a successful snapshot after a failed refresh and reports partial data before one exists', async () => {
  let failStorage = false
  const storageClient = createStorageClient({
    listResponses: {
      'files||': { Contents: [{ Key: 'user-1/file.txt', Size: 9 }], IsTruncated: false }
    },
    beforeSend(command) {
      if (failStorage && command instanceof ListObjectsV2Command) throw new Error('storage unavailable')
    }
  })
  const manager = createManager({ storageClient })
  const initial = await manager.getUsage()
  failStorage = true
  const stale = await manager.refresh()

  assert.equal(initial.total_bytes, '109')
  assert.equal(stale.state, 'stale')
  assert.equal(stale.refresh_failed, true)
  assert.equal(stale.total_bytes, '109')

  const partialManager = createManager({
    storageClient: createStorageClient({
      listResponses: { 'files||': new Error('storage unavailable') }
    })
  })
  const partial = await partialManager.getUsage()
  assert.equal(partial.state, 'partial')
  assert.equal(partial.database.available, true)
  assert.equal(partial.object_storage.available, false)
  assert.equal(partial.total_bytes, null)
})
