import { badRequest, forbidden } from '../../lib/errors.js'
import { assertCanManageMeeting } from './policy.js'

function normalizeDateTime(value, fieldName) {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw badRequest('api.validation.failed', {
      errors: [{ field: fieldName, message: 'must be date-time' }]
    }, 'Validierungsfehler')
  }
  return date.toISOString()
}

function buildDefaultJoinWindow(scheduledStartAt) {
  if (!scheduledStartAt) return null
  const date = new Date(scheduledStartAt)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getTime() - (10 * 60 * 1000)).toISOString()
}

export async function setTitle({ repository, reads, authorization, effects, getNow }, id, data, params) {
  const user = params.user
  const meeting = await reads._getNormalizedMeetingOrThrow(id)

  await authorization._assertCanAccessMeeting(id, user, meeting)
  assertCanManageMeeting({
    meeting,
    user,
    code: 'api.meetings.set_title_forbidden',
    message: 'Nur Host oder Admin kann den Meeting-Titel aendern'
  })

  const normalizedTitle = typeof data?.title === 'string'
    ? data.title.trim()
    : null

  const nextTitle = normalizedTitle || null
  const nowIso = getNow().toISOString()
  await repository.transaction(async (trx) => {
    await repository.setTitleUpdateMeetings({ trx, id, nextTitle, nowIso })

    await repository.setTitleUpdateChannels({ trx, meeting, nextTitle, nowIso })
  })

  const updatedChannel = await repository.setTitleFindChannels({ meeting })
  if (updatedChannel) {
    effects.emitChannel('patched', updatedChannel)
  }

  return reads.get(id, params)
}

export async function reschedule({ repository, reads, authorization, getNow }, id, data, params) {
  const user = params.user
  const meeting = await reads._getNormalizedMeetingOrThrow(id)
  await authorization._assertCanAccessMeeting(id, user, meeting)
  assertCanManageMeeting({
    meeting,
    user,
    code: 'api.meetings.reschedule_forbidden',
    message: 'Nur Host oder Admin kann dieses Meeting verschieben'
  })

  if (meeting.status !== 'scheduled') {
    throw badRequest('api.meetings.reschedule_only_scheduled', {}, 'Nur geplante Meetings koennen verschoben werden')
  }

  const scheduledStartAt = normalizeDateTime(data?.scheduled_start_at, '/scheduled_start_at')
  const scheduledEndAt = normalizeDateTime(data?.scheduled_end_at, '/scheduled_end_at')
  const description = typeof data?.description === 'string'
    ? data.description.trim()
    : meeting.description || null
  const language = reads._normalizeMeetingLanguageInput(data?.language) || meeting.language

  if (!scheduledStartAt) {
    throw badRequest('api.meetings.scheduled_start_required', {}, 'scheduled_start_at ist erforderlich')
  }

  if (scheduledEndAt && scheduledEndAt <= scheduledStartAt) {
    throw badRequest('api.meetings.invalid_schedule_window', {}, 'Das geplante Meeting-Ende muss nach dem Start liegen')
  }

  await repository.rescheduleUpdateMeetings({ id, scheduledStartAt, scheduledEndAt, buildDefaultJoinWindow, description, language, getNow })

  return reads.get(id, params)
}

export async function setLanguage({ repository, reads, authorization, getNow }, id, data, params) {
  const user = params.user
  const meeting = await reads._getNormalizedMeetingOrThrow(id)
  await authorization._assertCanAccessMeeting(id, user, meeting)

  const nextLanguage = reads._normalizeMeetingLanguageInput(data?.language)
  if (!nextLanguage) {
    throw badRequest('api.meetings.set_language_language_required', {}, 'language ist fuer set_language erforderlich')
  }

  if (meeting.status === 'cancelled') {
    throw badRequest('api.meetings.language_update_cancelled', {}, 'Abgesagte Meetings koennen keine Sprache mehr aendern')
  }

  if (meeting.status === 'ended') {
    if (user?.is_admin !== true) {
      throw forbidden('api.meetings.language_update_forbidden', {}, 'Nur Admin kann die Sprache eines beendeten Meetings aendern')
    }
  } else {
    assertCanManageMeeting({
      meeting,
      user,
      code: 'api.meetings.language_update_forbidden',
      message: 'Nur Host oder Admin kann die Meeting-Sprache aendern'
    })
  }

  await repository.setLanguageUpdateMeetings({ id, nextLanguage, getNow })

  return reads.get(id, params)
}
