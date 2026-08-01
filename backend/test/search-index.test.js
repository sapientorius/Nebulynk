import test from 'node:test'
import assert from 'node:assert/strict'
import { upsertMeetingArtifactSearchDocument, upsertMessageSearchDocument } from '../src/lib/search-index.js'

function createDb({ artifactRow = null, messageRow = null } = {}) {
  const tables = {
    search_documents: []
  }

  const db = (table) => {
    if (table === 'meeting_artifacts as artifact') {
      if (!artifactRow) {
        throw new Error('Unexpected artifact lookup without artifactRow')
      }
      const builder = {
        join() {
          return builder
        },
        leftJoin() {
          return builder
        },
        where(field, value) {
          assert.equal(field, 'artifact.id')
          assert.equal(value, artifactRow.id)
          return builder
        },
        select() {
          return builder
        },
        async first() {
          return artifactRow
        }
      }
      return builder
    }

    if (table === 'messages as m') {
      if (!messageRow) {
        throw new Error('Unexpected message lookup without messageRow')
      }
      const builder = {
        leftJoin() {
          return builder
        },
        where(field, value) {
          assert.equal(field, 'm.id')
          assert.equal(value, messageRow.id)
          return builder
        },
        select() {
          return builder
        },
        async first() {
          return messageRow
        }
      }
      return builder
    }

    if (table === 'search_documents') {
      const createDeleteBuilder = (predicates = []) => {
        const nextPredicates = [...predicates]
        return {
          where(filtersOrField, value) {
            if (typeof filtersOrField === 'string') {
              nextPredicates.push((row) => row[filtersOrField] === value)
            } else {
              nextPredicates.push((row) => Object.entries(filtersOrField).every(([key, expected]) => row[key] === expected))
            }
            return createDeleteBuilder(nextPredicates)
          },
          whereRaw(sql, bindings = []) {
            if (sql.includes("metadata->>'transcript_artifact_id'")) {
              const [documentType, transcriptArtifactId] = bindings
              nextPredicates.push((row) => (
                row.document_type === documentType
                && row.metadata?.transcript_artifact_id === transcriptArtifactId
              ))
            } else {
              throw new Error(`Unexpected whereRaw in search_documents mock: ${sql}`)
            }
            return createDeleteBuilder(nextPredicates)
          },
          async del() {
            tables.search_documents = tables.search_documents.filter((row) => !nextPredicates.every((predicate) => predicate(row)))
          }
        }
      }

      return {
        where(filtersOrField, value) {
          return createDeleteBuilder().where(filtersOrField, value)
        },
        whereRaw(sql, bindings) {
          return createDeleteBuilder().whereRaw(sql, bindings)
        },
        insert(payload) {
          return {
            onConflict() {
              return {
                async merge(nextPayload) {
                  const index = tables.search_documents.findIndex((row) => (
                    row.document_type === nextPayload.document_type
                    && row.document_id === nextPayload.document_id
                  ))
                  if (index === -1) {
                    tables.search_documents.push(nextPayload)
                    return
                  }
                  tables.search_documents[index] = nextPayload
                }
              }
            }
          }
        }
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  }

  db.tables = tables
  return db
}

test('search index stores meeting transcript metadata and prefers ended_at for search timestamps', async () => {
  const db = createDb({
    artifactRow: {
    id: 'artifact-1',
    meeting_id: 'meeting-1',
    artifact_type: 'transcript',
    status: 'ready',
    payload: {
      text: 'Alex: Hello team',
      segments: [
        { speaker_user_id: 'user-1', speaker_label: 'Alex', text: 'Hello team', start_ms: 1000, end_ms: 1800 },
        { speaker_user_id: 'user-2', speaker_label: 'Sam', text: 'Status update', start_ms: 2400, end_ms: 3200 },
        { speaker_user_id: 'user-1', speaker_label: 'Alex', text: 'Closing note', start_ms: 4500, end_ms: 5200 }
      ]
    },
    created_at: '2026-03-26T09:31:00.000Z',
    updated_at: '2026-03-26T09:32:00.000Z',
    meeting_title: 'Weekly Sync',
    chat_channel_id: 'chat-1',
    meeting_started_at: '2026-03-26T09:00:00.000Z',
    meeting_ended_at: '2026-03-26T09:30:00.000Z',
    meeting_scheduled_start_at: '2026-03-26T08:55:00.000Z',
    source_channel_id: 'source-1',
    host_user_id: 'user-1',
    channel_name: 'general',
    channel_type: 'private',
    channel_purpose: 'default',
    meeting_chat_channel_name: 'meeting-weekly-sync',
    author_display_name: 'Alex'
    }
  })

  await upsertMeetingArtifactSearchDocument(db, 'artifact-1')

  const transcriptDocument = db.tables.search_documents.find((row) => row.document_type === 'meeting_transcript')
  const transcriptSegments = db.tables.search_documents.filter((row) => row.document_type === 'meeting_transcript_segment')

  assert.equal(db.tables.search_documents.length, 4)
  assert.deepEqual(transcriptDocument, {
    id: 'meeting_transcript:artifact-1',
    document_type: 'meeting_transcript',
    document_id: 'artifact-1',
    source_channel_id: 'source-1',
    source_message_id: null,
    source_meeting_id: 'meeting-1',
    owner_user_id: null,
    author_user_id: 'user-1',
    title: 'Meeting transcript: Weekly Sync',
    content_text: 'Alex: Hello team',
    file_name: null,
    file_extension: null,
    mime_type: null,
    metadata: {
      artifact_type: 'transcript',
      author_display_name: 'Alex',
      channel_name: 'general',
      channel_type: 'private',
      channel_purpose: 'default',
      meeting_title: 'Weekly Sync',
      meeting_chat_channel_id: 'chat-1',
      meeting_chat_channel_name: 'meeting-weekly-sync',
      speaker_user_ids: ['user-1', 'user-2'],
      meeting_started_at: '2026-03-26T09:00:00.000Z',
      meeting_ended_at: '2026-03-26T09:30:00.000Z',
      navigation_target: '/meetings/meeting-1'
    },
    embedding_model: null,
    created_at: '2026-03-26T09:30:00.000Z',
    updated_at: '2026-03-26T09:30:00.000Z'
  })
  assert.deepEqual(transcriptSegments, [
    {
      id: 'meeting_transcript_segment:artifact-1:0',
      document_type: 'meeting_transcript_segment',
      document_id: 'artifact-1:0',
      source_channel_id: 'source-1',
      source_message_id: null,
      source_meeting_id: 'meeting-1',
      owner_user_id: null,
      author_user_id: 'user-1',
      title: 'Meeting transcript: Weekly Sync',
      content_text: 'Hello team',
      file_name: null,
      file_extension: null,
      mime_type: null,
      metadata: {
        artifact_type: 'transcript',
        author_display_name: 'Alex',
        channel_name: 'general',
        channel_type: 'private',
        channel_purpose: 'default',
        meeting_title: 'Weekly Sync',
        meeting_chat_channel_id: 'chat-1',
        meeting_chat_channel_name: 'meeting-weekly-sync',
        transcript_artifact_id: 'artifact-1',
        transcript_start_ms: 1000,
        transcript_end_ms: 1800,
        meeting_started_at: '2026-03-26T09:00:00.000Z',
        meeting_ended_at: '2026-03-26T09:30:00.000Z',
        navigation_target: '/meetings/meeting-1?transcript_start_ms=1000'
      },
      embedding_model: null,
      created_at: '2026-03-26T09:00:01.000Z',
      updated_at: '2026-03-26T09:00:01.000Z'
    },
    {
      id: 'meeting_transcript_segment:artifact-1:1',
      document_type: 'meeting_transcript_segment',
      document_id: 'artifact-1:1',
      source_channel_id: 'source-1',
      source_message_id: null,
      source_meeting_id: 'meeting-1',
      owner_user_id: null,
      author_user_id: 'user-2',
      title: 'Meeting transcript: Weekly Sync',
      content_text: 'Status update',
      file_name: null,
      file_extension: null,
      mime_type: null,
      metadata: {
        artifact_type: 'transcript',
        author_display_name: 'Sam',
        channel_name: 'general',
        channel_type: 'private',
        channel_purpose: 'default',
        meeting_title: 'Weekly Sync',
        meeting_chat_channel_id: 'chat-1',
        meeting_chat_channel_name: 'meeting-weekly-sync',
        transcript_artifact_id: 'artifact-1',
        transcript_start_ms: 2400,
        transcript_end_ms: 3200,
        meeting_started_at: '2026-03-26T09:00:00.000Z',
        meeting_ended_at: '2026-03-26T09:30:00.000Z',
        navigation_target: '/meetings/meeting-1?transcript_start_ms=2400'
      },
      embedding_model: null,
      created_at: '2026-03-26T09:00:02.400Z',
      updated_at: '2026-03-26T09:00:02.400Z'
    },
    {
      id: 'meeting_transcript_segment:artifact-1:2',
      document_type: 'meeting_transcript_segment',
      document_id: 'artifact-1:2',
      source_channel_id: 'source-1',
      source_message_id: null,
      source_meeting_id: 'meeting-1',
      owner_user_id: null,
      author_user_id: 'user-1',
      title: 'Meeting transcript: Weekly Sync',
      content_text: 'Closing note',
      file_name: null,
      file_extension: null,
      mime_type: null,
      metadata: {
        artifact_type: 'transcript',
        author_display_name: 'Alex',
        channel_name: 'general',
        channel_type: 'private',
        channel_purpose: 'default',
        meeting_title: 'Weekly Sync',
        meeting_chat_channel_id: 'chat-1',
        meeting_chat_channel_name: 'meeting-weekly-sync',
        transcript_artifact_id: 'artifact-1',
        transcript_start_ms: 4500,
        transcript_end_ms: 5200,
        meeting_started_at: '2026-03-26T09:00:00.000Z',
        meeting_ended_at: '2026-03-26T09:30:00.000Z',
        navigation_target: '/meetings/meeting-1?transcript_start_ms=4500'
      },
      embedding_model: null,
      created_at: '2026-03-26T09:00:04.500Z',
      updated_at: '2026-03-26T09:00:04.500Z'
    }
  ])
})

test('search index falls back to scheduled meeting date when no started or ended timestamp exists', async () => {
  const db = createDb({
    artifactRow: {
    id: 'artifact-2',
    meeting_id: 'meeting-2',
    artifact_type: 'summary',
    status: 'ready',
    payload: {
      markdown: '## Decisions\n- Ship on Friday'
    },
    created_at: '2026-03-27T10:30:00.000Z',
    updated_at: '2026-03-27T10:31:00.000Z',
    meeting_title: 'Planning',
    chat_channel_id: 'chat-2',
    meeting_started_at: null,
    meeting_ended_at: null,
    meeting_scheduled_start_at: '2026-03-27T10:00:00.000Z',
    source_channel_id: 'source-2',
    host_user_id: 'user-2',
    channel_name: 'ops',
    channel_type: 'private',
    channel_purpose: 'default',
    meeting_chat_channel_name: 'meeting-planning',
    author_display_name: 'Sam'
    }
  })

  await upsertMeetingArtifactSearchDocument(db, 'artifact-2')

  assert.equal(db.tables.search_documents[0].created_at, '2026-03-27T10:00:00.000Z')
  assert.equal(db.tables.search_documents[0].updated_at, '2026-03-27T10:00:00.000Z')
  assert.equal(db.tables.search_documents[0].metadata.meeting_chat_channel_id, 'chat-2')
  assert.equal(db.tables.search_documents[0].metadata.meeting_chat_channel_name, 'meeting-planning')
})

test('search index stores meeting chat messages with meeting deep links', async () => {
  const db = createDb({
    messageRow: {
      id: 'message-7',
      channel_id: 'chat-3',
      user_id: 'user-3',
      created_at: '2026-03-28T12:00:00.000Z',
      updated_at: '2026-03-28T12:01:00.000Z',
      content: 'Need a decision on rollout timing',
      type: 'message',
      deleted_at: null,
      channel_name: 'meeting-rollout',
      channel_type: 'private',
      channel_purpose: 'meeting',
      author_display_name: 'Taylor',
      meeting_id: 'meeting-3',
      meeting_title: 'Rollout',
      meeting_chat_channel_id: 'chat-3'
    }
  })

  await upsertMessageSearchDocument(db, 'message-7')

  assert.equal(db.tables.search_documents.length, 1)
  assert.deepEqual(db.tables.search_documents[0], {
    id: 'message:message-7',
    document_type: 'message',
    document_id: 'message-7',
    source_channel_id: 'chat-3',
    source_message_id: 'message-7',
    source_meeting_id: 'meeting-3',
    owner_user_id: null,
    author_user_id: 'user-3',
    title: null,
    content_text: 'Need a decision on rollout timing',
    file_name: null,
    file_extension: null,
    mime_type: null,
    metadata: {
      channel_name: 'meeting-rollout',
      channel_type: 'private',
      channel_purpose: 'meeting',
      author_display_name: 'Taylor',
      meeting_title: 'Rollout',
      meeting_chat_channel_id: 'chat-3',
      navigation_target: '/meetings/meeting-3?message=message-7'
    },
    embedding_model: null,
    created_at: '2026-03-28T12:00:00.000Z',
    updated_at: '2026-03-28T12:01:00.000Z'
  })
})

test('search index replaces stale transcript segment documents when a transcript artifact is reindexed', async () => {
  const artifactRow = {
    id: 'artifact-3',
    meeting_id: 'meeting-3',
    artifact_type: 'transcript',
    status: 'ready',
    payload: {
      text: 'Alex: Old line',
      segments: [
        { speaker_user_id: 'user-1', speaker_label: 'Alex', text: 'Old line', start_ms: 1000, end_ms: 2000 }
      ]
    },
    created_at: '2026-03-28T10:00:00.000Z',
    updated_at: '2026-03-28T10:01:00.000Z',
    meeting_title: 'Retro',
    chat_channel_id: 'chat-3',
    meeting_started_at: '2026-03-28T09:30:00.000Z',
    meeting_ended_at: '2026-03-28T10:00:00.000Z',
    meeting_scheduled_start_at: '2026-03-28T09:25:00.000Z',
    source_channel_id: 'source-3',
    host_user_id: 'user-host',
    channel_name: 'product',
    channel_type: 'private',
    channel_purpose: 'default',
    meeting_chat_channel_name: 'meeting-retro',
    author_display_name: 'Taylor'
  }
  const db = createDb({ artifactRow })

  await upsertMeetingArtifactSearchDocument(db, 'artifact-3')

  artifactRow.payload = {
    text: 'Alex: Fresh line',
    segments: [
      { speaker_user_id: 'user-1', speaker_label: 'Alex', text: 'Fresh line', start_ms: 3000, end_ms: 4200 }
    ]
  }

  await upsertMeetingArtifactSearchDocument(db, 'artifact-3')

  const transcriptSegments = db.tables.search_documents.filter((row) => row.document_type === 'meeting_transcript_segment')
  assert.equal(transcriptSegments.length, 1)
  assert.equal(transcriptSegments[0].document_id, 'artifact-3:0')
  assert.equal(transcriptSegments[0].content_text, 'Fresh line')
  assert.equal(transcriptSegments[0].metadata.transcript_start_ms, 3000)
  assert.equal(transcriptSegments[0].metadata.navigation_target, '/meetings/meeting-3?transcript_start_ms=3000')
})
