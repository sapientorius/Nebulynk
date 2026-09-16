import test from 'node:test'
import assert from 'node:assert/strict'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { MeetingRecordingRetentionManager } from '../src/lib/meeting-recording-retention.js'

const GIB = 1024 * 1024 * 1024

function createHarness({ settings = {}, rows = [], sizes = {}, deleteError = null } = {}) {
  const deletedMeetingIds = []
  const deletedObjects = []
  const sizeUpdates = []
  let invalidated = 0
  const currentRows = rows.map((row) => ({ ...row }))

  function query(table) {
    const clauses = []
    const chain = {
      whereIn() {
        return chain
      },
      join() {
        return chain
      },
      where(column, value) {
        clauses.push({ column, value })
        return chain
      },
      async select() {
        if (table === 'platform_settings') {
          return Object.entries(settings).map(([key, value]) => ({ key, value }))
        }
        if (table === 'meeting_recordings') return currentRows.map((row) => ({ ...row }))
        return []
      },
      async update(patch) {
        const id = clauses.find((clause) => clause.column === 'id')?.value
        const row = currentRows.find((entry) => entry.id === id)
        if (!row) return 0
        Object.assign(row, patch)
        sizeUpdates.push({ id, ...patch })
        return 1
      },
      async delete() {
        const meetingId = clauses.find((clause) => clause.column === 'meeting_id')?.value
        const before = currentRows.length
        for (let index = currentRows.length - 1; index >= 0; index -= 1) {
          if (currentRows[index].meeting_id === meetingId) currentRows.splice(index, 1)
        }
        if (before !== currentRows.length) deletedMeetingIds.push(meetingId)
        return before - currentRows.length
      }
    }
    return chain
  }

  const db = (table) => query(table)
  db.transaction = async (work) => work((table) => query(table))

  const storageClient = {
    async send(command) {
      assert.ok(command instanceof HeadObjectCommand)
      const size = sizes[command.input.Key]
      if (size === undefined) {
        const error = new Error('Not found')
        error.name = 'NotFound'
        error.$metadata = { httpStatusCode: 404 }
        throw error
      }
      return { ContentLength: size }
    }
  }
  const values = new Map([
    ['postgresqlClient', db],
    ['storageClient', storageClient],
    ['storageBucket', 'recordings'],
    ['storageUsageManager', { invalidate() { invalidated += 1 } }]
  ])
  const manager = new MeetingRecordingRetentionManager({ get: (key) => values.get(key) }, {
    now: () => new Date('2026-09-15T12:00:00.000Z'),
    log: { warn() {} },
    getEgressStorageConfigFn: () => ({
      bucket: 'recordings',
      endpoint: 'http://storage',
      region: 'us-east-1'
    }),
    resolveStorageEndpointFn: () => 'http://storage',
    async deleteFileFn(_client, object) {
      deletedObjects.push(object)
      if (deleteError?.(object)) throw new Error('delete failed')
    }
  })

  return { manager, currentRows, deletedMeetingIds, deletedObjects, sizeUpdates, get invalidated() { return invalidated } }
}

function recording(id, meetingId, meetingEndedAt, options = {}) {
  return {
    id,
    meeting_id: meetingId,
    meeting_status: options.meetingStatus || 'ended',
    meeting_ended_at: meetingEndedAt,
    status: options.status || 'ready',
    storage_bucket: options.bucket === false ? null : 'recordings',
    storage_key: options.key === false ? null : `${id}.mp4`,
    storage_size_bytes: options.size ?? null
  }
}

test('retention deletes every recording of expired completed meetings and keeps transcript artifacts untouched', async () => {
  const harness = createHarness({
    settings: {
      meeting_recording_retention_days: '7',
      meeting_recording_storage_limit_gib: 'unlimited'
    },
    rows: [
      recording('old-a', 'old-meeting', '2026-09-07T12:00:00.000Z'),
      recording('old-b', 'old-meeting', '2026-09-07T12:00:00.000Z'),
      recording('current', 'current-meeting', '2026-09-14T12:00:00.000Z')
    ],
    sizes: { 'old-a.mp4': 10, 'old-b.mp4': 20, 'current.mp4': 30 }
  })

  const result = await harness.manager.run()

  assert.deepEqual(result, { state: 'completed', deletedMeetingCount: 1 })
  assert.deepEqual(harness.deletedMeetingIds, ['old-meeting'])
  assert.deepEqual(harness.deletedObjects.map((entry) => entry.key), ['old-a.mp4', 'old-b.mp4'])
  assert.deepEqual(harness.currentRows.map((row) => row.id), ['current'])
  assert.equal(harness.invalidated, 1)
})

test('storage limit deletes oldest whole meetings while active recordings remain protected', async () => {
  const harness = createHarness({
    settings: {
      meeting_recording_retention_days: 'unlimited',
      meeting_recording_storage_limit_gib: '1'
    },
    rows: [
      recording('old-a', 'old-meeting', '2026-09-01T12:00:00.000Z', { size: String(GIB * 0.75) }),
      recording('old-b', 'old-meeting', '2026-09-01T12:00:00.000Z', { size: String(GIB * 0.25) }),
      recording('new', 'new-meeting', '2026-09-14T12:00:00.000Z', { size: String(GIB * 0.5) }),
      recording('active', 'active-meeting', null, {
        meetingStatus: 'active',
        status: 'recording',
        size: String(GIB * 0.25)
      })
    ]
  })

  const result = await harness.manager.run()

  assert.deepEqual(result, { state: 'completed', deletedMeetingCount: 1 })
  assert.deepEqual(harness.deletedMeetingIds, ['old-meeting'])
  assert.deepEqual(harness.currentRows.map((row) => row.id), ['new', 'active'])
  assert.equal(harness.deletedObjects.length, 2)
})

test('a failed object deletion preserves all recording metadata for retry', async () => {
  const harness = createHarness({
    settings: {
      meeting_recording_retention_days: '1',
      meeting_recording_storage_limit_gib: 'unlimited'
    },
    rows: [
      recording('old-a', 'old-meeting', '2026-09-01T12:00:00.000Z'),
      recording('old-b', 'old-meeting', '2026-09-01T12:00:00.000Z')
    ],
    sizes: { 'old-a.mp4': 10, 'old-b.mp4': 20 },
    deleteError: (object) => object.key === 'old-b.mp4'
  })

  const result = await harness.manager.run()

  assert.deepEqual(result, { state: 'failed', deletedMeetingCount: 0 })
  assert.equal(harness.currentRows.length, 2)
  assert.deepEqual(harness.deletedMeetingIds, [])
  assert.equal(harness.invalidated, 0)
})

test('unlimited settings retain recordings and hydrate unknown object sizes', async () => {
  const harness = createHarness({
    settings: {
      meeting_recording_retention_days: 'unlimited',
      meeting_recording_storage_limit_gib: 'unlimited'
    },
    rows: [recording('recording', 'meeting', '2026-09-01T12:00:00.000Z')],
    sizes: { 'recording.mp4': 42 }
  })

  const result = await harness.manager.run()

  assert.deepEqual(result, { state: 'completed', deletedMeetingCount: 0 })
  assert.deepEqual(harness.sizeUpdates, [{ id: 'recording', storage_size_bytes: '42' }])
  assert.equal(harness.currentRows.length, 1)
})
