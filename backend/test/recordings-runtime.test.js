import test from 'node:test'
import assert from 'node:assert/strict'
import { EgressStatus } from 'livekit-server-sdk'
import { applyEgressUpdate } from '../src/services/meetings/recordings-runtime.js'
import { createMemoryDb } from './helpers/memory-db.js'

function createApp(seed = {}) {
  const db = createMemoryDb({
    meeting_recordings: [{
      id: 'recording-1',
      meeting_id: 'meeting-1',
      user_id: 'user-1',
      participant_identity: 'user-1',
      participant_display_name: 'Alex',
      status: 'recording',
      livekit_egress_id: 'EG_123',
      storage_bucket: 'bucket-1',
      storage_key: 'meeting-recordings/meeting-1/user-1/recording-1.mp4',
      mime_type: 'audio/mp4',
      duration_ms: null,
      started_at: '2026-03-25T11:19:30.572Z',
      ended_at: null,
      failure_code: null,
      failure_message: null,
      created_at: '2026-03-25T11:19:29.921Z',
      updated_at: '2026-03-25T11:19:30.640Z'
    }],
    ...seed
  })

  return {
    db,
    app: {
      get(name) {
        if (name === 'postgresqlClient') return db
        return null
      }
    }
  }
}

test('applyEgressUpdate preserves the earliest observed started_at across later egress updates', async () => {
  const { app, db } = createApp()

  await applyEgressUpdate(app, {
    egressId: 'EG_123',
    status: EgressStatus.EGRESS_COMPLETE,
    fileResults: [{
      filename: 'meeting-recordings/meeting-1/user-1/recording-1.mp4',
      startedAt: '2026-03-25T11:19:30.858Z',
      endedAt: '2026-03-25T11:19:51.881Z',
      duration: '21022000000'
    }]
  })

  assert.equal(db.tables.meeting_recordings[0].started_at, '2026-03-25T11:19:30.572Z')
  assert.equal(db.tables.meeting_recordings[0].ended_at, '2026-03-25T11:19:51.881Z')
  assert.equal(db.tables.meeting_recordings[0].duration_ms, 21022)
})

test('applyEgressUpdate prefers persisted recording timing over stale passed-in state', async () => {
  const { app, db } = createApp({
    meeting_recordings: [{
      id: 'recording-stale',
      meeting_id: 'meeting-1',
      user_id: 'user-1',
      participant_identity: 'user-1',
      participant_display_name: 'Alex',
      status: 'recording',
      livekit_egress_id: 'EG_STALE',
      storage_bucket: 'bucket-1',
      storage_key: 'meeting-recordings/meeting-1/user-1/recording-stale.mp4',
      mime_type: 'audio/mp4',
      duration_ms: null,
      started_at: '2026-03-25T11:38:10.999Z',
      ended_at: null,
      failure_code: null,
      failure_message: null,
      created_at: '2026-03-25T11:38:10.985Z',
      updated_at: '2026-03-25T11:38:11.072Z'
    }]
  })

  await applyEgressUpdate(app, {
    egressId: 'EG_STALE',
    status: EgressStatus.EGRESS_COMPLETE,
    fileResults: [{
      filename: 'meeting-recordings/meeting-1/user-1/recording-stale.mp4',
      startedAt: '2026-03-25T11:38:11.417Z',
      endedAt: '2026-03-25T11:38:41.446Z',
      duration: '30029000000'
    }]
  }, {
    id: 'recording-stale',
    meeting_id: 'meeting-1',
    user_id: 'user-1',
    participant_identity: 'user-1',
    participant_display_name: 'Alex',
    status: 'ending',
    livekit_egress_id: 'EG_STALE',
    storage_bucket: 'bucket-1',
    storage_key: 'meeting-recordings/meeting-1/user-1/recording-stale.mp4',
    mime_type: 'audio/mp4',
    duration_ms: null,
    started_at: null,
    ended_at: null,
    failure_code: null,
    failure_message: null,
    created_at: '2026-03-25T11:38:10.985Z',
    updated_at: '2026-03-25T11:38:41.000Z'
  })

  assert.equal(db.tables.meeting_recordings[0].started_at, '2026-03-25T11:38:10.999Z')
  assert.equal(db.tables.meeting_recordings[0].ended_at, '2026-03-25T11:38:41.446Z')
  assert.equal(db.tables.meeting_recordings[0].duration_ms, 30029)
})
