import { authenticateRequest } from './authenticate-request.js'
import { resolveFrontendUrl } from '../lib/security-config.js'

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function formatIcsDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function buildMeetingLocation(meetingId) {
  const baseUrl = resolveFrontendUrl(process.env).replace(/\/+$/, '')
  return `${baseUrl}/meetings/${encodeURIComponent(meetingId)}`
}

export function configureMeetingIcsRoute(app) {
  const koaApp = app

  koaApp.use(async (ctx, next) => {
    const match = ctx.path.match(/^\/meetings\/([^/]+)\/ics$/)
    if (ctx.method !== 'GET' || !match) {
      return next()
    }

    const user = await authenticateRequest(app, ctx, {
      authRequiredCode: 'api.meetings.authentication_required',
      invalidTokenCode: 'api.meetings.invalid_token'
    })
    if (!user) return

    try {
      const meetingId = decodeURIComponent(match[1])
      const meeting = await app.service('meetings').get(meetingId, { user })
      const start = formatIcsDate(meeting.scheduled_start_at || meeting.started_at || meeting.created_at)
      const end = formatIcsDate(meeting.scheduled_end_at || meeting.ended_at || meeting.started_at || meeting.created_at)

      ctx.set('Content-Type', 'text/calendar; charset=utf-8')
      ctx.set('Content-Disposition', `attachment; filename="meeting-${meeting.id}.ics"`)
      ctx.body = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Nebulynk//Meetings//EN',
        'BEGIN:VEVENT',
        `UID:${meeting.id}@nebulynk.local`,
        `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
        start ? `DTSTART:${start}` : null,
        end ? `DTEND:${end}` : null,
        `SUMMARY:${escapeIcsText(meeting.title || 'Nebulynk Meeting')}`,
        meeting.description ? `DESCRIPTION:${escapeIcsText(meeting.description)}` : null,
        `LOCATION:${escapeIcsText(buildMeetingLocation(meeting.id))}`,
        'END:VEVENT',
        'END:VCALENDAR'
      ].filter(Boolean).join('\r\n')
    } catch (error) {
      ctx.status = Number(error?.code) || Number(error?.statusCode) || 500
      ctx.body = {
        error_code: error?.data?.error_code || 'api.meetings.ics_failed',
        error_params: error?.data?.error_params || {},
        message: error?.message || 'Unexpected error'
      }
    }
  })
}
