import { upsertMeetingArtifactSearchDocument } from '../../lib/search-index.js'
import { reconcileMeetingRecordings } from './recordings-runtime.js'

export async function deliverPendingTranscriptEvents(app, { indexArtifact = upsertMeetingArtifactSearchDocument } = {}) {
  const db = app.get('postgresqlClient')
  const rows = await db('meeting_transcription_events')
    .whereNull('delivered_at')
    .orderBy('created_at', 'asc')
    .limit(50)
    .select('*')
  let delivered = 0
  for (const row of rows) {
    const artifact = await db('meeting_artifacts').where('id', row.artifact_id).first()
    if (artifact?.transcription_generation === row.generation) {
      const meeting = await db('meetings').where('id', row.meeting_id).first()
      if (meeting) {
        await indexArtifact(db, artifact.id)
        app.service('meetings').emit('artifacts-updated', {
          meetingId: meeting.id,
          chatChannelId: meeting.chat_channel_id,
          artifactTypes: ['transcript']
        })
      }
    }
    await db('meeting_transcription_events').where('id', row.id).update({ delivered_at: new Date().toISOString() })
    delivered += 1
  }
  return delivered
}

export async function reconcileQueuedMeetingRecordings(app) {
  const db = app.get('postgresqlClient')
  const rows = await db('meeting_artifacts as artifact')
    .join('meeting_recordings as recording', 'recording.meeting_id', 'artifact.meeting_id')
    .join('meetings as meeting', 'meeting.id', 'artifact.meeting_id')
    .where('artifact.artifact_type', 'transcript')
    .where('artifact.status', 'processing')
    .where('meeting.status', 'ended')
    .whereIn('recording.status', ['pending', 'recording', 'ending'])
    .distinct('artifact.meeting_id')
    .limit(10)
  for (const row of rows) {
    await reconcileMeetingRecordings(app, { meetingId: row.meeting_id })
  }
  return rows.length
}
