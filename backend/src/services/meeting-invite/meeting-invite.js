import { createId } from '@paralleldrive/cuid2'
import { validate } from '../../schemas/validators.js'
import { badRequest, notFound } from '../../lib/errors.js'
import { buildGuestUserEmail, createGuestPassword } from '../../lib/account-state.js'
import { hashMeetingInviteToken } from '../../lib/meeting-invites.js'
import { createSchema } from './meeting-invite.schema.js'
import { autoEndOverdueScheduledMeeting } from '../meetings/overdue-scheduled.js'
import { isOverdueScheduledMeeting } from '../../domains/meetings/lifecycle.js'
import {
  createMeetingInviteCreateRateLimitHook,
  createMeetingInviteFindRateLimitHook
} from '../../hooks/rate-limit.js'

const GUEST_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

function normalizeDisplayName(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function serializeMeetingInvite(meeting, link) {
  const now = Date.now()
  const joinNotBefore = meeting.join_not_before ? Date.parse(meeting.join_not_before) : null

  return {
    meeting_id: meeting.id,
    title: meeting.title || null,
    description: meeting.description || null,
    status: meeting.status,
    scheduled_start_at: meeting.scheduled_start_at || null,
    scheduled_end_at: meeting.scheduled_end_at || null,
    join_not_before: meeting.join_not_before || null,
    source_channel_id: meeting.source_channel_id || null,
    source_channel_name: meeting.source_channel_name || null,
    invite_expires_at: link.expires_at || null,
    can_join_now: joinNotBefore === null || joinNotBefore <= now
  }
}

function resolveGuestExpiry(meeting, now = new Date()) {
  const baseValue = meeting.scheduled_end_at || meeting.scheduled_start_at || meeting.ended_at || now.toISOString()
  const baseDate = new Date(baseValue)
  const target = Number.isNaN(baseDate.getTime()) ? now : baseDate
  return new Date(target.getTime() + GUEST_RETENTION_MS).toISOString()
}

export class MeetingInviteService {
  constructor(app, {
    normalizeOverdueScheduledMeeting = (args) => autoEndOverdueScheduledMeeting(args)
  } = {}) {
    this.app = app
    this.db = app.get('postgresqlClient')
    this.normalizeOverdueScheduledMeeting = normalizeOverdueScheduledMeeting
  }

  async find(params = {}) {
    const token = typeof params.query?.token === 'string' ? params.query.token.trim() : ''
    if (!token) {
      throw badRequest('api.meeting_invite.token_required', {}, 'Token ist erforderlich')
    }

    const lookup = await this._findLinkWithMeeting(token)
    return serializeMeetingInvite(lookup.meeting, lookup.link)
  }

  async create(data) {
    const token = typeof data?.token === 'string' ? data.token.trim() : ''
    const displayName = normalizeDisplayName(data?.display_name)
    if (!token) {
      throw badRequest('api.meeting_invite.token_required', {}, 'Token ist erforderlich')
    }
    if (!displayName) {
      throw badRequest('api.meeting_invite.display_name_required', {}, 'Anzeigename ist erforderlich')
    }

    const lookup = await this._findLinkWithMeeting(token)
    const nowIso = new Date().toISOString()
    const guestPassword = createGuestPassword()
    const guestUser = await this.app.service('users').create({
      email: buildGuestUserEmail(createId()),
      password: guestPassword,
      display_name: displayName,
      preferred_locale: await this._getDefaultLocale(),
      account_type: 'guest',
      guest_expires_at: resolveGuestExpiry(lookup.meeting)
    })

    try {
      await this.db.transaction(async (trx) => {
        const existingParticipant = await trx('meeting_participants')
          .where({
            meeting_id: lookup.meeting.id,
            user_id: guestUser.id
          })
          .first()

        if (!existingParticipant) {
          await trx('meeting_participants').insert({
            id: createId(),
            meeting_id: lookup.meeting.id,
            user_id: guestUser.id,
            role: 'participant',
            invite_status: 'joined',
            invited_at: nowIso,
            joined_at: nowIso,
            created_at: nowIso,
            updated_at: nowIso
          })
        }

        await trx('channel_members')
          .insert({
            id: createId(),
            channel_id: lookup.meeting.chat_channel_id,
            user_id: guestUser.id,
            role: 'member',
            created_at: nowIso,
            updated_at: nowIso
          })
          .onConflict(['channel_id', 'user_id'])
          .ignore()

        await trx('meeting_invite_links')
          .where('id', lookup.link.id)
          .update({
            last_used_at: nowIso,
            use_count: this.db.raw('use_count + 1'),
            updated_at: nowIso
          })
      })
    } catch (error) {
      await this.app.service('users').remove(guestUser.id, {})
      throw error
    }

    const authResult = await this.app.service('authentication').create({
      strategy: 'local',
      email: guestUser.email,
      password: guestPassword,
      session_mode: 'browser'
    }, {})

    const meeting = await this.app.service('meetings').get(lookup.meeting.id, {
      user: authResult.user
    })

    this.app.service('meetings').emit('joined', {
      meetingId: lookup.meeting.id,
      chatChannelId: lookup.meeting.chat_channel_id,
      userId: guestUser.id,
      participantUserId: guestUser.id,
      status: lookup.meeting.status
    })

    return {
      ...authResult,
      meeting
    }
  }

  async _findLinkWithMeeting(token) {
    const tokenHash = hashMeetingInviteToken(token)
    const link = await this.db('meeting_invite_links')
      .where('token_hash', tokenHash)
      .first()

    if (!link) {
      throw notFound('api.meeting_invite.not_found', {}, 'Meeting-Link nicht gefunden')
    }

    if (link.revoked_at) {
      throw badRequest('api.meeting_invite.revoked', {}, 'Meeting-Link ist nicht mehr gueltig')
    }

    if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
      throw badRequest('api.meeting_invite.expired', {}, 'Meeting-Link ist abgelaufen')
    }

    const meeting = await this.db('meetings as meeting')
      .leftJoin('channels as source_channel', 'source_channel.id', 'meeting.source_channel_id')
      .select(
        'meeting.*',
        'source_channel.name as source_channel_name'
      )
      .where('meeting.id', link.meeting_id)
      .first()

    if (!meeting) {
      throw notFound('api.meeting_invite.meeting_not_found', {}, 'Meeting nicht gefunden')
    }

    if (isOverdueScheduledMeeting(meeting)) {
      await this.normalizeOverdueScheduledMeeting({
        app: this.app,
        db: this.db,
        meeting
      })

      const refreshedMeeting = await this.db('meetings as meeting')
        .leftJoin('channels as source_channel', 'source_channel.id', 'meeting.source_channel_id')
        .select(
          'meeting.*',
          'source_channel.name as source_channel_name'
        )
        .where('meeting.id', link.meeting_id)
        .first()

      if (refreshedMeeting) {
        Object.assign(meeting, refreshedMeeting)
      }
    }

    if (meeting.status === 'cancelled') {
      throw badRequest('api.meeting_invite.cancelled', {}, 'Dieses Meeting wurde abgesagt')
    }

    if (meeting.status === 'ended') {
      throw badRequest('api.meeting_invite.ended', {}, 'Dieses Meeting ist bereits beendet')
    }

    return { link, meeting }
  }

  async _getDefaultLocale() {
    const row = await this.db('platform_settings')
      .where('key', 'default_locale')
      .first()

    return row?.value || 'en'
  }
}

export const meetingInvite = (app) => {
  app.use('meeting-invite', new MeetingInviteService(app), {
    methods: ['find', 'create'],
    events: []
  })

  app.service('meeting-invite').hooks({
    before: {
      find: [createMeetingInviteFindRateLimitHook()],
      create: [validate(createSchema), createMeetingInviteCreateRateLimitHook()]
    }
  })
}
