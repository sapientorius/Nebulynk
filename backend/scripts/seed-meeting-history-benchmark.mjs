import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import knex from 'knex'
import { createId } from '@paralleldrive/cuid2'
import bcrypt from 'bcryptjs'

const CONFIRMATION_VALUE = 'isolated-target'
const MEMBER_COUNT = 1000
const MEETING_COUNT = 1000
const INSERT_BATCH_SIZE = 500
const PASSWORD = 'NebulynkBenchmark!2026'

function readOption(name, fallback = null) {
  const prefix = `${name}=`
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || fallback
}

function createDatabase() {
  return knex({
    client: 'pg',
    connection: {
      host: process.env.POSTGRES_HOST || '127.0.0.1',
      port: Number(process.env.POSTGRES_PORT) || 5433,
      database: process.env.POSTGRES_DB || 'nebulynk',
      user: process.env.POSTGRES_USER || 'nebulynk',
      password: process.env.POSTGRES_PASSWORD || 'nebulynk_dev_password'
    },
    pool: { min: 0, max: 4 }
  })
}

async function insertBatches(db, table, rows) {
  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    await db(table).insert(rows.slice(index, index + INSERT_BATCH_SIZE))
  }
}

function nowIso() {
  return new Date().toISOString()
}

function historicalIso(index) {
  return new Date(Date.now() - ((index + 1) * 60 * 60 * 1000)).toISOString()
}

const apply = process.argv.includes('--apply')
const fixturePrefix = readOption('--prefix', `meeting-history-benchmark-${Date.now()}`)
const manifestFile = resolve(
  readOption('--manifest-file')
    || process.env.MEETING_HISTORY_BENCHMARK_MANIFEST_FILE
    || `${tmpdir()}/nebulynk-meeting-history-benchmark.json`
)

if (apply && process.env.MEETING_HISTORY_BENCHMARK_CONFIRM !== CONFIRMATION_VALUE) {
  throw new Error(`Refusing to seed. Set MEETING_HISTORY_BENCHMARK_CONFIRM=${CONFIRMATION_VALUE} and pass --apply.`)
}
if (apply && process.env.MEETING_HISTORY_BENCHMARK_ISOLATED_DB !== 'true') {
  throw new Error('Refusing to seed. Set MEETING_HISTORY_BENCHMARK_ISOLATED_DB=true only for a dedicated benchmark database.')
}

if (!apply) {
  console.log(JSON.stringify({
    phase: 'dry-run',
    fixture: { historicalMeetings: MEETING_COUNT, channelMembers: MEMBER_COUNT, policies: 3, personas: 4 },
    hint: `Set MEETING_HISTORY_BENCHMARK_CONFIRM=${CONFIRMATION_VALUE} and MEETING_HISTORY_BENCHMARK_ISOLATED_DB=true, then pass --apply to seed an isolated database.`,
    manifestFile
  }))
  process.exit(0)
}

const db = createDatabase()

try {
  const createdAt = nowIso()
  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  const personas = [
    { role: 'late_member', id: createId(), email: `${fixturePrefix}-late@example.invalid`, is_admin: false },
    { role: 'start_member', id: createId(), email: `${fixturePrefix}-start@example.invalid`, is_admin: false },
    { role: 'active_participant', id: createId(), email: `${fixturePrefix}-active@example.invalid`, is_admin: false },
    { role: 'platform_admin', id: createId(), email: `${fixturePrefix}-admin@example.invalid`, is_admin: true }
  ]
  const additionalMembers = Array.from({ length: MEMBER_COUNT - personas.length + 1 }, (_, index) => ({
    role: 'member',
    id: createId(),
    email: `${fixturePrefix}-member-${index}@example.invalid`,
    is_admin: false
  }))
  const allUsers = [...personas, ...additionalMembers]
  const users = allUsers.map((user) => ({
    id: user.id,
    email: user.email,
    password: passwordHash,
    display_name: `Benchmark ${user.role}`,
    status: 'offline',
    is_admin: user.is_admin,
    is_verified: true,
    account_type: 'member',
    webauthn_user_id: `benchmark-${user.id}`,
    theme_preference: 'platform',
    created_at: createdAt,
    updated_at: createdAt
  }))
  await insertBatches(db, 'users', users)

  const admin = personas.find((persona) => persona.role === 'platform_admin')
  const sources = [
    { key: 'all', policy: 'all_channel_members', id: createId() },
    { key: 'start', policy: 'meeting_start_members', id: createId() },
    { key: 'active', policy: 'active_participants', id: createId() }
  ]
  await insertBatches(db, 'channels', sources.map((source) => ({
    id: source.id,
    name: `${fixturePrefix}-${source.key}`,
    type: 'private',
    purpose: 'default',
    created_by: admin.id,
    meeting_history_access: source.policy,
    created_at: createdAt,
    updated_at: createdAt
  })))

  const activeParticipant = personas.find((persona) => persona.role === 'active_participant')
  const memberIds = allUsers.slice(0, MEMBER_COUNT).map((member) => member.id)
  const memberships = []
  for (const source of sources) {
    const sourceMemberIds = source.key === 'active'
      ? memberIds.filter((memberId) => memberId !== activeParticipant.id)
      : memberIds
    if (source.key === 'active') {
      sourceMemberIds.push(additionalMembers[additionalMembers.length - 1].id)
    }
    for (const userId of sourceMemberIds) {
      memberships.push({
        id: createId(),
        channel_id: source.id,
        user_id: userId,
        role: userId === admin.id ? 'owner' : 'member',
        created_at: createdAt,
        updated_at: createdAt
      })
    }
  }
  await insertBatches(db, 'channel_members', memberships)

  const chats = []
  const meetings = []
  const participants = []
  const snapshots = []
  const messages = []
  const searchDocuments = []
  const chatMemberships = []
  const startMember = personas.find((persona) => persona.role === 'start_member')
  const sourceByKey = new Map(sources.map((source) => [source.key, source]))

  for (let index = 0; index < MEETING_COUNT; index += 1) {
    const sourceKey = index % 3 === 0 ? 'all' : (index % 3 === 1 ? 'start' : 'active')
    const source = sourceByKey.get(sourceKey)
    const chatId = createId()
    const meetingId = createId()
    const messageId = createId()
    const timestamp = historicalIso(index)
    chats.push({
      id: chatId,
      name: `${fixturePrefix}-meeting-${index}`,
      type: 'private',
      purpose: 'meeting',
      created_by: admin.id,
      is_archived: true,
      archived_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp
    })
    meetings.push({
      id: meetingId,
      title: `Benchmark meeting ${index}`,
      status: 'ended',
      source_channel_id: source.id,
      chat_channel_id: chatId,
      host_user_id: admin.id,
      started_at: timestamp,
      ended_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp
    })
    participants.push({
      id: createId(),
      meeting_id: meetingId,
      user_id: admin.id,
      role: 'host',
      invite_status: 'joined',
      invited_at: timestamp,
      joined_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp
    })
    if (sourceKey === 'active') {
      participants.push({
        id: createId(),
        meeting_id: meetingId,
        user_id: activeParticipant.id,
        role: 'participant',
        invite_status: 'joined',
        invited_at: timestamp,
        joined_at: timestamp,
        left_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      })
    }
    if (sourceKey === 'start') {
      snapshots.push({
        id: createId(),
        meeting_id: meetingId,
        user_id: startMember.id,
        created_at: timestamp
      })
    }
    chatMemberships.push({
      id: createId(),
      channel_id: chatId,
      user_id: admin.id,
      role: 'owner',
      created_at: timestamp,
      updated_at: timestamp
    })
    messages.push({
      id: messageId,
      channel_id: chatId,
      user_id: admin.id,
      content: `benchmark meeting content ${index}`,
      type: 'text',
      created_at: timestamp,
      updated_at: timestamp
    })
    searchDocuments.push({
      id: createId(),
      document_type: 'meeting_summary',
      document_id: `benchmark-summary-${meetingId}`,
      source_channel_id: source.id,
      source_meeting_id: meetingId,
      author_user_id: admin.id,
      title: `Benchmark meeting ${index}`,
      content_text: `benchmark meeting summary ${index}`,
      metadata: { meeting_chat_channel_id: chatId },
      created_at: timestamp,
      updated_at: timestamp
    })
  }

  await insertBatches(db, 'channels', chats)
  await insertBatches(db, 'meetings', meetings)
  await insertBatches(db, 'meeting_participants', participants)
  await insertBatches(db, 'meeting_start_members', snapshots)
  await insertBatches(db, 'channel_members', chatMemberships)
  await insertBatches(db, 'messages', messages)
  await insertBatches(db, 'search_documents', searchDocuments)

  const manifest = {
    fixture: { historicalMeetings: MEETING_COUNT, channelMembers: MEMBER_COUNT, policies: sources.map((source) => source.policy) },
    sourceChannelIds: Object.fromEntries(sources.map((source) => [source.key, source.id])),
    chatChannelIds: Object.fromEntries(sources.map((source) => {
      const meeting = meetings.find((entry) => entry.source_channel_id === source.id)
      return [source.key, meeting.chat_channel_id]
    })),
    personas: personas.map((persona) => ({
      role: persona.role,
      email: persona.email,
      password: PASSWORD
    }))
  }
  await mkdir(dirname(manifestFile), { recursive: true })
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ phase: 'seeded', manifestFile, ...manifest.fixture }))
} finally {
  await db.destroy()
}
