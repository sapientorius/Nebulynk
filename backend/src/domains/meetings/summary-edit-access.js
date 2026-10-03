import { badRequest, notFound } from '../../lib/errors.js'
import { assertCanAccessMeetingContent } from './content-access.js'
import { assertCanManageMeeting } from './policy.js'

export async function assertCanEditMeetingSummary(db, meetingId, user, { lock = false } = {}) {
  const query = db('meetings').where('id', meetingId)
  if (lock) query.forUpdate()
  const meeting = await query.first()
  if (!meeting) throw notFound('api.meetings.meeting_not_found')
  assertCanManageMeeting({ meeting, user, code: 'api.summary_revisions.forbidden' })
  await assertCanAccessMeetingContent(db, { meetingId, meeting, user })
  if (meeting.status !== 'ended') throw badRequest('api.summary_revisions.not_ready')
  const artifactQuery = db('meeting_artifacts').where({ meeting_id: meetingId, artifact_type: 'summary' })
  if (lock) artifactQuery.forUpdate()
  const artifact = await artifactQuery.first()
  if (artifact?.status !== 'ready' || !artifact.payload) throw badRequest('api.summary_revisions.not_ready')
  return { meeting, artifact }
}
