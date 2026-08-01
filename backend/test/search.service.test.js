import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest, Forbidden } from '@feathersjs/errors'
import { SearchService } from '../src/services/search/search.js'

function createService({
  membership = { channel_id: 'channel-1', user_id: 'user-1' },
  rawResponses = []
} = {}) {
  const rawCalls = []
  const membershipWhereCalls = []
  let rawCallIndex = 0

  const db = (table) => {
    assert.equal(table, 'channel_members')
    const builder = {
      where(filters) {
        membershipWhereCalls.push(filters)
        return builder
      },
      async first() {
        return membership
      }
    }
    return builder
  }

  db.raw = async (sql, bindings) => {
    rawCalls.push({ sql, bindings })
    const next = rawResponses[rawCallIndex] || []
    rawCallIndex += 1
    return { rows: next }
  }

  return {
    service: new SearchService({ Model: db }),
    rawCalls,
    membershipWhereCalls
  }
}

test('search rejects empty query without filters', async () => {
  const { service } = createService()

  await assert.rejects(
    service.find({
      user: { id: 'user-1', is_admin: false },
      query: {}
    }),
    BadRequest
  )
})

test('search rejects short q values', async () => {
  const { service } = createService()

  await assert.rejects(
    service.find({
      user: { id: 'user-1', is_admin: false },
      query: { q: 'ab' }
    }),
    BadRequest
  )
})

test('search rejects channel-scoped search for non-members', async () => {
  const { service } = createService({ membership: null })

  await assert.rejects(
    service.find({
      user: { id: 'user-1', is_admin: false },
      query: {
        q: 'alpha',
        channel_id: 'channel-2'
      }
    }),
    Forbidden
  )
})

test('search returns message results with keyword fallback metadata and cursor', async () => {
  const rows = [
    {
      id: 'message:message-2',
      document_type: 'message',
      document_id: 'message-2',
      source_channel_id: 'channel-1',
      source_message_id: 'message-2',
      source_meeting_id: null,
      owner_user_id: null,
      author_user_id: 'user-2',
      title: null,
      content_text: 'alpha two',
      file_name: null,
      file_extension: null,
      mime_type: null,
      metadata: {
        channel_name: 'General',
        channel_type: 'private',
        channel_purpose: 'default',
        author_display_name: 'Bob',
        navigation_target: '/channels/channel-1?message=stale-id'
      },
      created_at: '2026-03-16T09:02:00.000Z',
      updated_at: '2026-03-16T09:02:00.000Z',
      rank_score: 0.42
    },
    {
      id: 'message:message-1',
      document_type: 'message',
      document_id: 'message-1',
      source_channel_id: 'channel-1',
      source_message_id: 'message-1',
      source_meeting_id: null,
      owner_user_id: null,
      author_user_id: 'user-1',
      title: null,
      content_text: 'alpha one',
      file_name: null,
      file_extension: null,
      mime_type: null,
      metadata: {
        channel_name: 'General',
        channel_type: 'private',
        channel_purpose: 'default',
        author_display_name: 'Alice',
        navigation_target: '/channels/channel-1?message=message-1'
      },
      created_at: '2026-03-16T09:01:00.000Z',
      updated_at: '2026-03-16T09:01:00.000Z',
      rank_score: 0.31
    }
  ]
  const { service, rawCalls, membershipWhereCalls } = createService({
    rawResponses: [rows]
  })

  const result = await service.find({
    user: { id: 'user-1', is_admin: false },
    query: {
      q: 'alpha',
      tab: 'messages',
      channel_id: 'channel-1',
      from_user_id: 'user-2',
      before_created_at: '2026-03-16T10:00:00.000Z',
      before_id: 'message:message-9',
      $limit: 2,
      match_mode: 'hybrid'
    }
  })

  assert.deepEqual(membershipWhereCalls, [
    { channel_id: 'channel-1', user_id: 'user-1' }
  ])
  assert.equal(rawCalls.length, 1)
  assert.match(rawCalls[0].sql, /websearch_to_tsquery/)
  assert.deepEqual(rawCalls[0].bindings, [
    'alpha',
    'message',
    'channel-1',
    'user-2',
    'user-1',
    'user-1',
    'user-1',
    '2026-03-16T10:00:00.000Z',
    '2026-03-16T10:00:00.000Z',
    'message:message-9',
    'alpha',
    2
  ])
  assert.equal(result.effective_match_mode, 'keyword')
  assert.equal(result.requested_match_mode, 'hybrid')
  assert.equal(result.data[0].document_type, 'message')
  assert.equal(result.data[0].author.display_name, 'Bob')
  assert.equal(result.data[0].channel.name, 'General')
  assert.equal(result.data[0].navigation_target, '/channels/channel-1?message=message-2')
  assert.deepEqual(result.next_cursor, {
    before_created_at: '2026-03-16T09:01:00.000Z',
    before_id: 'message:message-1'
  })
})

test('search falls back to trigram and supports file filters', async () => {
  const fileRows = [
    {
      id: 'file:file-1',
      document_type: 'file',
      document_id: 'file-1',
      source_channel_id: 'channel-1',
      source_message_id: 'message-3',
      source_meeting_id: null,
      owner_user_id: null,
      author_user_id: 'user-2',
      title: 'spec.pdf',
      content_text: 'architecture spec',
      file_name: 'spec.pdf',
      file_extension: 'pdf',
      mime_type: 'application/pdf',
      metadata: {
        channel_name: 'General',
        author_display_name: 'Bob',
        navigation_target: '/channels/channel-1?message=message-3',
        size: 1234
      },
      created_at: '2026-03-16T09:03:00.000Z',
      updated_at: '2026-03-16T09:03:00.000Z',
      rank_score: 0
    }
  ]
  const { service, rawCalls } = createService({
    rawResponses: [[], fileRows]
  })

  const result = await service.find({
    user: { id: 'user-1', is_admin: false },
    query: {
      q: 'spe',
      tab: 'files',
      file_extension: 'pdf'
    }
  })

  assert.equal(rawCalls.length, 2)
  assert.match(rawCalls[1].sql, /LIKE \? ESCAPE/)
  assert.match(rawCalls[1].sql, /ESCAPE '\\'/)
  assert.deepEqual(rawCalls[1].bindings, [
    'file',
    'pdf',
    'user-1',
    'user-1',
    'user-1',
    '%spe%',
    20
  ])
  assert.equal(result.data[0].preview.file_extension, 'pdf')
  assert.equal(result.data[0].result_mode, 'trigram')
  assert.equal(result.data[0].navigation_target, '/channels/channel-1?message=message-3')
})

test('search keeps date bindings aligned when query text contains natural language', async () => {
  const { service, rawCalls } = createService({
    rawResponses: [[]]
  })

  await service.find({
    user: { id: 'user-1', is_admin: false },
    query: {
      q: 'noch nicht',
      channel_id: 'channel-1',
      after: '2026-03-18'
    }
  })

  assert.equal(rawCalls.length, 2)
  assert.deepEqual(rawCalls[0].bindings, [
    'noch nicht',
    'message',
    'channel-1',
    '2026-03-18T00:00:00.000Z',
    'user-1',
    'user-1',
    'user-1',
    'noch nicht',
    20
  ])
})

test('search supports filter-only queries without ranking bindings', async () => {
  const rows = [
    {
      id: 'message:message-5',
      document_type: 'message',
      document_id: 'message-5',
      source_channel_id: 'channel-1',
      source_message_id: 'message-5',
      source_meeting_id: null,
      owner_user_id: null,
      author_user_id: 'user-1',
      title: null,
      content_text: 'plain filter result',
      file_name: null,
      file_extension: null,
      mime_type: null,
      metadata: {},
      created_at: '2026-03-18T09:00:00.000Z',
      updated_at: '2026-03-18T09:00:00.000Z',
      rank_score: 0
    }
  ]
  const { service, rawCalls } = createService({
    rawResponses: [rows]
  })

  const result = await service.find({
    user: { id: 'user-1', is_admin: false },
    query: {
      channel_id: 'channel-1',
      after: '2026-03-18'
    }
  })

  assert.equal(rawCalls.length, 1)
  assert.doesNotMatch(rawCalls[0].sql, /websearch_to_tsquery/)
  assert.deepEqual(rawCalls[0].bindings, [
    'message',
    'channel-1',
    '2026-03-18T00:00:00.000Z',
    'user-1',
    'user-1',
    'user-1',
    20
  ])
  assert.equal(result.data[0].id, 'message:message-5')
  assert.equal(result.data[0].result_mode, 'filter')
})

test('search scope includes meeting participant membership for meeting artifacts', async () => {
  const { service, rawCalls } = createService({
    rawResponses: [[{
      id: 'meeting_summary:artifact-1',
      document_type: 'meeting_summary',
      document_id: 'artifact-1',
      source_channel_id: 'channel-1',
      source_message_id: null,
      source_meeting_id: 'meeting-1',
      owner_user_id: null,
      author_user_id: 'user-2',
      title: 'Meeting summary',
      content_text: 'Weekly sync summary',
      file_name: null,
      file_extension: null,
      mime_type: null,
      metadata: {
        artifact_type: 'summary',
        meeting_title: 'Weekly Sync',
        navigation_target: '/meetings/meeting-1'
      },
      created_at: '2026-03-26T09:00:00.000Z',
      updated_at: '2026-03-26T09:00:00.000Z',
      rank_score: 0.5
    }]]
  })

  const result = await service.find({
    user: { id: 'user-1', is_admin: false },
    query: {
      q: 'weekly',
      document_types: ['meeting_summary']
    }
  })

  assert.match(rawCalls[0].sql, /meeting_participants mp/)
  assert.equal(result.data[0].document_type, 'meeting_summary')
  assert.equal(result.data[0].navigation_target, '/meetings/meeting-1')
})

test('search meetings tab defaults to transcript and summary documents and matches meeting chat channel filters', async () => {
  const { service, rawCalls, membershipWhereCalls } = createService({
    rawResponses: [[{
      id: 'meeting_transcript:artifact-2',
      document_type: 'meeting_transcript',
      document_id: 'artifact-2',
      source_channel_id: 'source-2',
      source_message_id: null,
      source_meeting_id: 'meeting-2',
      owner_user_id: null,
      author_user_id: 'user-3',
      title: 'Meeting transcript: Planning',
      content_text: 'Alex: Rollout Friday',
      file_name: null,
      file_extension: null,
      mime_type: null,
      metadata: {
        artifact_type: 'transcript',
        meeting_title: 'Planning',
        meeting_chat_channel_id: 'meeting-chat-2',
        meeting_chat_channel_name: 'meeting-planning',
        channel_name: 'Ops',
        navigation_target: '/meetings/meeting-2'
      },
      created_at: '2026-03-27T10:00:00.000Z',
      updated_at: '2026-03-27T10:00:00.000Z',
      rank_score: 0.7
    }]]
  })

  const result = await service.find({
    user: { id: 'user-1', is_admin: false },
    query: {
      q: 'rollout',
      tab: 'meetings',
      channel_id: 'meeting-chat-2',
      after: '2026-03-27'
    }
  })

  assert.deepEqual(membershipWhereCalls, [
    { channel_id: 'meeting-chat-2', user_id: 'user-1' }
  ])
  assert.equal(rawCalls.length, 1)
  assert.match(rawCalls[0].sql, /sd\.document_type IN \(\?, \?\)/)
  assert.match(rawCalls[0].sql, /metadata->>'meeting_chat_channel_id'/)
  assert.deepEqual(rawCalls[0].bindings, [
    'rollout',
    'meeting_transcript',
    'meeting_summary',
    'meeting-chat-2',
    'meeting_transcript',
    'meeting_summary',
    'meeting-chat-2',
    '2026-03-27T00:00:00.000Z',
    'user-1',
    'user-1',
    'user-1',
    'rollout',
    20
  ])
  assert.equal(result.data[0].document_type, 'meeting_transcript')
  assert.equal(result.data[0].preview.meeting_chat_channel_id, 'meeting-chat-2')
  assert.equal(result.data[0].preview.meeting_chat_channel_name, 'meeting-planning')
})

test('search meetings tab uses author or speaker filter for meeting chat messages and transcript speakers', async () => {
  const { service, rawCalls, membershipWhereCalls } = createService({
    rawResponses: [[
      {
        id: 'message:message-8',
        document_type: 'message',
        document_id: 'message-8',
        source_channel_id: 'meeting-chat-2',
        source_message_id: 'message-8',
        source_meeting_id: 'meeting-2',
        owner_user_id: null,
        author_user_id: 'user-2',
        title: null,
        content_text: 'Alex confirmed the rollout timing',
        file_name: null,
        file_extension: null,
        mime_type: null,
        metadata: {
          channel_name: 'meeting-planning',
          channel_type: 'private',
          channel_purpose: 'meeting',
          author_display_name: 'Alex',
          meeting_title: 'Planning',
          meeting_chat_channel_id: 'meeting-chat-2',
          navigation_target: '/meetings/meeting-2?message=message-8'
        },
        created_at: '2026-03-27T10:05:00.000Z',
        updated_at: '2026-03-27T10:05:00.000Z',
        rank_score: 0.8
      },
      {
        id: 'meeting_transcript_segment:artifact-2:0',
        document_type: 'meeting_transcript_segment',
        document_id: 'artifact-2:0',
        source_channel_id: 'source-2',
        source_message_id: null,
        source_meeting_id: 'meeting-2',
        owner_user_id: null,
        author_user_id: 'user-2',
        title: 'Meeting transcript: Planning',
        content_text: 'Confirmed the rollout timing',
        file_name: null,
        file_extension: null,
        mime_type: null,
        metadata: {
          artifact_type: 'transcript',
          author_display_name: 'Alex',
          meeting_title: 'Planning',
          meeting_chat_channel_id: 'meeting-chat-2',
          meeting_chat_channel_name: 'meeting-planning',
          transcript_artifact_id: 'artifact-2',
          transcript_start_ms: 1200,
          transcript_end_ms: 2600,
          navigation_target: '/meetings/meeting-2?transcript_start_ms=1200'
        },
        created_at: '2026-03-27T10:00:01.200Z',
        updated_at: '2026-03-27T10:00:01.200Z',
        rank_score: 0.6
      }
    ]]
  })

  const result = await service.find({
    user: { id: 'user-1', is_admin: false },
    query: {
      q: 'alex',
      tab: 'meetings',
      channel_id: 'meeting-chat-2',
      from_user_id: 'user-2'
    }
  })

  assert.deepEqual(membershipWhereCalls, [
    { channel_id: 'meeting-chat-2', user_id: 'user-1' }
  ])
  assert.equal(rawCalls.length, 1)
  assert.match(rawCalls[0].sql, /sd\.document_type IN \(\?, \?\)/)
  assert.match(rawCalls[0].sql, /sd\.document_type = 'message'/)
  assert.match(rawCalls[0].sql, /sd\.source_meeting_id IS NOT NULL/)
  assert.match(rawCalls[0].sql, /sd\.document_type = 'meeting_transcript_segment'/)
  assert.match(rawCalls[0].sql, /sd\.author_user_id = \?/)
  assert.doesNotMatch(rawCalls[0].sql, /author_display_name/)
  assert.deepEqual(rawCalls[0].bindings, [
    'alex',
    'message',
    'meeting_transcript_segment',
    'meeting-chat-2',
    'meeting_transcript_segment',
    'meeting-chat-2',
    'user-2',
    'user-2',
    'user-1',
    'user-1',
    'user-1',
    'alex',
    20
  ])
  assert.equal(result.data[0].document_type, 'message')
  assert.equal(result.data[0].navigation_target, '/meetings/meeting-2?message=message-8')
  assert.equal(result.data[1].document_type, 'meeting_transcript_segment')
  assert.equal(result.data[1].author.display_name, 'Alex')
  assert.equal(result.data[1].preview.transcript_artifact_id, 'artifact-2')
  assert.equal(result.data[1].preview.transcript_start_ms, 1200)
  assert.equal(result.data[1].navigation_target, '/meetings/meeting-2?transcript_start_ms=1200')
})

test('search ignores guest author filters for external workspace queries', async () => {
  const { service, rawCalls } = createService({
    rawResponses: [[], []]
  })

  const result = await service.find({
    provider: 'rest',
    user: { id: 'user-1', is_admin: false },
    query: {
      q: 'alex',
      tab: 'meetings',
      from_user_id: 'guest-1'
    }
  })

  assert.equal(rawCalls.length, 2)
  assert.match(rawCalls[0].sql, /search_author\.account_type = 'member'/)
  assert.deepEqual(rawCalls[0].bindings, [
    'alex',
    'message',
    'meeting_transcript_segment',
    'guest-1',
    'guest-1',
    'guest-1',
    'user-1',
    'user-1',
    'user-1',
    'alex',
    20
  ])
  assert.deepEqual(result.data, [])
})
