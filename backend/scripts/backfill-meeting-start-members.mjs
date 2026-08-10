import 'dotenv/config'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import knex from 'knex'
import { createId } from '@paralleldrive/cuid2'

const BATCH_SIZE = 500
const CONFIRMATION_VALUE = 'missing-meeting-start-snapshots'

function readOption(name) {
  const prefix = `${name}=`
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || null
}

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const apply = process.argv.includes('--apply')
const maxBatches = readPositiveInteger(readOption('--max-batches'), Number.POSITIVE_INFINITY)
const stateFile = resolve(
  readOption('--state-file')
    || process.env.MEETING_HISTORY_BACKFILL_STATE_FILE
    || `${tmpdir()}/nebulynk-meeting-history-backfill.json`
)

async function readState() {
  try {
    const raw = await readFile(stateFile, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      meetingId: typeof parsed.meetingId === 'string' ? parsed.meetingId : null,
      userId: typeof parsed.userId === 'string' ? parsed.userId : null
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { meetingId: null, userId: null }
    }
    throw error
  }
}

async function writeState(state) {
  await mkdir(dirname(stateFile), { recursive: true })
  const temporaryFile = `${stateFile}.tmp`
  await writeFile(temporaryFile, `${JSON.stringify(state)}\n`, 'utf8')
  await rename(temporaryFile, stateFile)
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
    pool: { min: 0, max: 2 }
  })
}

async function findMissingBatch(db, cursor) {
  const query = db('meeting_participants as participant')
    .join('meetings as meeting', 'meeting.id', 'participant.meeting_id')
    .join('channels as source_channel', 'source_channel.id', 'meeting.source_channel_id')
    .leftJoin('meeting_start_members as snapshot', function () {
      this.on('snapshot.meeting_id', '=', 'participant.meeting_id')
        .andOn('snapshot.user_id', '=', 'participant.user_id')
    })
    .whereIn('source_channel.type', ['public', 'private', 'group'])
    .whereNull('snapshot.id')
    .orderBy('participant.meeting_id', 'asc')
    .orderBy('participant.user_id', 'asc')
    .limit(BATCH_SIZE)
    .select('participant.meeting_id', 'participant.user_id')

  if (cursor.meetingId && cursor.userId) {
    query.andWhere((builder) => {
      builder
        .where('participant.meeting_id', '>', cursor.meetingId)
        .orWhere((sameMeeting) => {
          sameMeeting
            .where('participant.meeting_id', cursor.meetingId)
            .andWhere('participant.user_id', '>', cursor.userId)
        })
    })
  }

  return query
}

if (apply && process.env.MEETING_HISTORY_BACKFILL_CONFIRM !== CONFIRMATION_VALUE) {
  throw new Error(
    `Refusing to write. Set MEETING_HISTORY_BACKFILL_CONFIRM=${CONFIRMATION_VALUE} and pass --apply.`
  )
}

const db = createDatabase()

try {
  let cursor = await readState()
  let inserted = 0
  let processedBatches = 0

  while (processedBatches < maxBatches) {
    const rows = await findMissingBatch(db, cursor)
    if (rows.length === 0) break

    if (!apply) {
      console.log(`[meeting-history-backfill] Dry run: ${rows.length} missing snapshot rows found. Pass --apply to write them.`)
      break
    }

    await db('meeting_start_members')
      .insert(rows.map((row) => ({
        id: createId(),
        meeting_id: row.meeting_id,
        user_id: row.user_id
      })))
      .onConflict(['meeting_id', 'user_id'])
      .ignore()

    inserted += rows.length
    processedBatches += 1
    const last = rows[rows.length - 1]
    cursor = { meetingId: last.meeting_id, userId: last.user_id }
    await writeState(cursor)
    console.log(`[meeting-history-backfill] Processed ${inserted} rows; cursor ${cursor.meetingId}/${cursor.userId}`)
  }

  if (apply) {
    console.log(`[meeting-history-backfill] Completed ${processedBatches} batch(es), inserted up to ${inserted} snapshot rows.`)
  }
} finally {
  await db.destroy()
}
