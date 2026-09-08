import { assertCanControlTranscriptionRecording } from './policy.js'

export async function generateSummary({ reads, authorization, artifacts }, id, data, params) {
  const user = params.user
  const meeting = await reads._getNormalizedMeetingOrThrow(id)

  await authorization._assertCanAccessMeeting(id, user, meeting)
  await artifacts.generateSummary({
    meeting,
    user,
    reason: data?.reason || 'manual'
  })

  return reads.get(id, params)
}

export async function generateTranscript({ reads, authorization, artifacts }, id, data, params) {
  const user = params.user
  const meeting = await reads._getNormalizedMeetingOrThrow(id)

  await authorization._assertCanAccessMeeting(id, user, meeting)
  await artifacts.generateTranscript({
    meeting,
    user,
    reason: data?.reason || 'manual'
  })

  return reads.get(id, params)
}

export async function pauseTranscriptionRecording({ reads, authorization, recordingControl, artifactActions }, id, data, params) {
  const user = params.user
  const meeting = await reads._getNormalizedMeetingOrThrow(id)
  await authorization._assertCanAccessMeeting(id, user, meeting)
  artifactActions._assertCanControlTranscriptionRecording(meeting, user)

  await recordingControl.pause({ meeting, user })
  return reads.get(id, params)
}

export async function resumeTranscriptionRecording({ reads, authorization, recordingControl, artifactActions }, id, data, params) {
  const user = params.user
  const meeting = await reads._getNormalizedMeetingOrThrow(id)
  await authorization._assertCanAccessMeeting(id, user, meeting)
  artifactActions._assertCanControlTranscriptionRecording(meeting, user)

  await recordingControl.resume({ meeting, user })
  return reads.get(id, params)
}

export function _assertCanControlTranscriptionRecording(_dependencies, meeting, user) {
  return assertCanControlTranscriptionRecording({ meeting, user })
}

export async function _startRecordingsForConnectedMeetingParticipants({ recordingControl }, meeting) {
  return recordingControl.startRecordingsForConnectedMeetingParticipants(meeting)
}

export function _emitRecordingStateUpdated({ recordingControl }, meeting) {
  return recordingControl.emitRecordingStateUpdated(meeting)
}
