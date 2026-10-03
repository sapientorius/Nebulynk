import { createId } from '@paralleldrive/cuid2'
import { normalizeText } from './meeting-ai.js'
import { upsertMeetingArtifactSearchDocument } from './search-index.js'
import { logger } from '../logger.js'

export function summaryVersion(artifact) {
  return Number(artifact?.summary_version) || 0
}

export function normalizeChangeSummary(value) {
  const text = normalizeText(value)
  if (!text || text.length > 2000) throw new Error('Invalid meeting summary change description')
  return text
}

export async function notifySummaryUpdated(app, meeting, artifactId) {
  // A successful commit must not look like a failed edit if indexing is temporarily unavailable.
  try {
    const upsert = app.get('upsertMeetingArtifactSearchDocument') || upsertMeetingArtifactSearchDocument
    await upsert(app.get('postgresqlClient'), artifactId)
  } catch (error) {
    logger.error('Could not refresh meeting summary search index', { artifactId, error: error.message })
  }
  try {
    app.service('meetings').emit('artifacts-updated', {
      meetingId: meeting.id,
      chatChannelId: meeting.chat_channel_id,
      artifactTypes: ['summary']
    })
  } catch (error) {
    logger.error('Could not publish committed meeting summary update', { artifactId, error: error.message })
  }
}

export async function queueSummaryRegenerationRevision(trx, { meeting, artifact, user, publishChange, nowIso }) {
  const revision = {
    id: createId(), meeting_id: meeting.id, user_id: user.id,
    base_version: summaryVersion(artifact), status: 'generating', kind: 'regenerate',
    before_payload: artifact.payload, publish_change: publishChange,
    created_at: nowIso
  }
  await trx('meeting_summary_revisions').insert(revision)
  return revision
}
