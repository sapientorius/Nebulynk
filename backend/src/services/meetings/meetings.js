import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { validate } from '../../schemas/validators.js'
import { logger } from '../../logger.js'
import { deleteRoom } from '../../lib/livekit.js'
import { badRequest, forbidden, notFound } from '../../lib/errors.js'
import { DEFAULT_MEETING_LANGUAGE, normalizeMeetingLanguage } from '../../lib/meeting-languages.js'
import { buildMeetingInviteUrl, createMeetingInviteToken, hashMeetingInviteToken } from '../../lib/meeting-invites.js'
import { createSchema, patchSchema } from './meetings.schema.js'
import { stopMeetingParticipantRecordings } from './recordings-runtime.js'
import {
  assertCanAccessMeeting,
  assertCanManageMeeting,
  assertCanControlTranscriptionRecording,
  assertCanInviteToMeeting,
  assertCanReadSourceChannel,
  assertCanUseSourceChannel,
  assertUsersExist
} from '../../domains/meetings/policy.js'
import { MeetingArtifactsDomainService } from '../../domains/meetings/artifacts.js'
import { MeetingRecordingControlDomainService } from '../../domains/meetings/recording-control.js'
import { isOverdueScheduledMeeting } from '../../domains/meetings/lifecycle.js'
import {
  buildMeetingSummary,
  buildSourceChannelDisplayNameIndex,
  buildTranscriptionRecordingStateIndex,
  enrichMeetingsWithDetails,
  formatCompactGroupDisplayName,
  isTechnicalDmSourceName,
  isTechnicalGroupSourceName,
  normalizeLabel,
  resolveSourceChannelDisplayName,
  serializeMeetings,
  toUniqueSortedDisplayNames
} from '../../domains/meetings/serializer.js'
import { autoEndOverdueScheduledMeeting } from './overdue-scheduled.js'
import { resolveFrontendUrl } from '../../lib/security-config.js'

function normalizeBoolean(value) {
  return value === true || value === 'true'
}

function uniqueIds(ids = []) {
  return [...new Set((ids || []).filter((id) => typeof id === 'string' && id.length > 0))]
}

function normalizeMeetingDetailLevel(value) {
  return value === 'full' ? 'full' : 'summary'
}

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

function normalizeTimeBucket(value) {
  if (value === 'upcoming' || value === 'live' || value === 'past') {
    return value
  }
  return null
}

export class MeetingsService {
  constructor(options) {
    this.options = options
    this.artifactDomainService = options.artifactDomainService || new MeetingArtifactsDomainService({
      db: options.Model,
      app: options.app
    })
    this.recordingControlDomainService = options.recordingControlDomainService || new MeetingRecordingControlDomainService({
      db: options.Model,
      app: options.app
    })
    this.autoEndOverdueScheduledMeeting = options.autoEndOverdueScheduledMeeting || ((args) => autoEndOverdueScheduledMeeting(args))
  }

  get db() {
    return this.options.Model
  }

  get app() {
    return this.options.app
  }

  async find(params) {
    const user = params.user
    const query = params.query || {}
    const detailLevel = normalizeMeetingDetailLevel(query.detail)
    const sourceChannelId = typeof query.source_channel_id === 'string'
      ? query.source_channel_id
      : null
    const includeEnded = normalizeBoolean(query.include_ended)
    const statusFilter = typeof query.status === 'string' ? query.status.trim() : ''
    const timeBucket = normalizeTimeBucket(query.time_bucket)
    const limit = Math.min(Math.max(Number(query.$limit) || 50, 1), 100)
    const meetingQuery = this._baseMeetingQuery().limit(limit)
    const now = new Date()
    const nowIso = now.toISOString()

    await this._normalizeOverdueScheduledMeetings({
      sourceChannelId,
      meetingId: typeof query.id === 'string' ? query.id : null,
      now
    })

    const canReadActiveSourceChannelMeetings = !user.is_admin
      && sourceChannelId
      && statusFilter === 'active'

    if (sourceChannelId) {
      meetingQuery.where('meetings.source_channel_id', sourceChannelId)
    }

    if (statusFilter) {
      meetingQuery.where('meetings.status', statusFilter)
    } else if (timeBucket === 'upcoming') {
      meetingQuery.where((builder) => {
        builder
          .where((scheduled) => {
            scheduled
              .where('meetings.status', 'scheduled')
              .where((window) => {
                window
                  .whereNull('meetings.scheduled_end_at')
                  .orWhere('meetings.scheduled_end_at', '>', nowIso)
              })
          })
          .orWhere((nested) => {
            nested
              .where('meetings.status', 'active')
              .whereNotNull('meetings.scheduled_start_at')
              .where('meetings.scheduled_start_at', '>', nowIso)
          })
      })
    } else if (timeBucket === 'live') {
      meetingQuery.where('meetings.status', 'active')
    } else if (timeBucket === 'past') {
      meetingQuery.whereIn('meetings.status', ['ended', 'cancelled'])
    } else if (!includeEnded) {
      meetingQuery.whereNotIn('meetings.status', ['ended', 'cancelled'])
    }

    if (canReadActiveSourceChannelMeetings) {
      await this._assertCanReadSourceChannel(sourceChannelId, user)
    } else if (!user.is_admin) {
      meetingQuery
        .join('meeting_participants as self_participant', 'self_participant.meeting_id', 'meetings.id')
        .where('self_participant.user_id', user.id)
    }

    if (timeBucket === 'upcoming') {
      meetingQuery
        .orderBy('meetings.scheduled_start_at', 'asc')
        .orderBy('meetings.created_at', 'asc')
    } else {
      meetingQuery
        .orderByRaw('COALESCE(meetings.started_at, meetings.scheduled_start_at, meetings.created_at) DESC')
        .orderBy('meetings.id', 'desc')
    }

    const rows = await meetingQuery
    const data = await this._serializeMeetings(rows, {
      viewerUserId: user.id,
      viewerUser: user,
      detailLevel
    })

    return {
      data,
      total: data.length,
      limit
    }
  }

  async get(id, params) {
    const meeting = await this._getNormalizedMeetingOrThrow(id)
    await this._assertCanAccessMeeting(meeting.id, params.user, meeting)

    const [enriched] = await this._serializeMeetings([meeting], {
      viewerUserId: params.user?.id || null,
      viewerUser: params.user || null,
      detailLevel: 'full'
    })
    return enriched
  }

  async create(data, params) {
    const user = params.user
    const userId = user.id
    const sourceChannelId = data.source_channel_id
    const requestedTitle = typeof data.title === 'string' ? data.title.trim() : null
    const requestedDescription = typeof data.description === 'string' ? data.description.trim() : null
    const requestedLanguage = this._normalizeMeetingLanguageInput(data.language)
    const scheduledStartAt = normalizeDateTime(data.scheduled_start_at, '/scheduled_start_at')
    const scheduledEndAt = normalizeDateTime(data.scheduled_end_at, '/scheduled_end_at')
    const isScheduledMeeting = !!scheduledStartAt
    let inviteeIds = uniqueIds(data.initial_user_ids).filter((id) => id !== userId)

    if (scheduledEndAt && scheduledStartAt && scheduledEndAt <= scheduledStartAt) {
      throw badRequest(
        'api.meetings.invalid_schedule_window',
        {},
        'Das geplante Meeting-Ende muss nach dem Start liegen'
      )
    }

    const sourceChannel = await this._assertCanUseSourceChannel(sourceChannelId, user)
    const sourceChannelTopic = this._normalizeLabel(sourceChannel.topic)
    const sourceChannelName = this._normalizeLabel(sourceChannel.name)
    const sourceNameForDefaultTitle = (sourceChannel.type === 'dm' || sourceChannel.type === 'group')
      ? null
      : sourceChannelName
    const title = requestedTitle || sourceChannelTopic || sourceNameForDefaultTitle || null
    const sourceChannelDisplayName = await this._resolveSourceChannelDisplayName({
      sourceChannelId,
      sourceChannelType: sourceChannel.type,
      sourceChannelName: sourceChannel.name,
      viewerUserId: null
    })

    if (!isScheduledMeeting) {
      const sourceMembers = await this.db('channel_members')
        .where('channel_id', sourceChannelId)
        .whereNot('user_id', userId)
        .select('user_id')

      inviteeIds = uniqueIds([
        ...inviteeIds,
        ...sourceMembers.map((member) => member.user_id)
      ])
    }

    if (inviteeIds.length > 0) {
      await this._assertUsersExist(inviteeIds)
    }

    const meetingLanguage = requestedLanguage || await this._resolveDefaultMeetingLanguage()
    const nowIso = new Date().toISOString()
    const joinNotBefore = isScheduledMeeting
      ? buildDefaultJoinWindow(scheduledStartAt)
      : nowIso
    const initialStatus = isScheduledMeeting ? 'scheduled' : 'active'
    let meetingId = null
    let chatChannelId = null
    let allParticipantIds = []
    let notificationRows = []
    let created = false
    let reusedMeetingId = null

    await this.db.transaction(async (trx) => {
      await trx('channels')
        .where('id', sourceChannelId)
        .forUpdate()
        .first()

      if (!isScheduledMeeting) {
        const existingMeeting = await trx('meetings')
          .where({
            source_channel_id: sourceChannelId,
            status: 'active'
          })
          .orderBy('started_at', 'desc')
          .first()

        if (existingMeeting) {
          reusedMeetingId = existingMeeting.id
          return
        }
      }

      created = true
      meetingId = createId()
      chatChannelId = createId()
      allParticipantIds = [userId, ...inviteeIds]

      await trx('channels').insert({
        id: chatChannelId,
        name: `meeting-${meetingId}`,
        topic: title || null,
        type: 'private',
        purpose: 'meeting',
        is_voice: true,
        created_by: userId,
        created_at: nowIso,
        updated_at: nowIso
      })

      await trx('meetings').insert({
        id: meetingId,
        title: title || null,
        description: requestedDescription || null,
        language: meetingLanguage,
        status: initialStatus,
        visibility: 'invitees',
        source_channel_id: sourceChannelId,
        chat_channel_id: chatChannelId,
        host_user_id: userId,
        scheduled_start_at: scheduledStartAt,
        scheduled_end_at: scheduledEndAt,
        join_not_before: joinNotBefore,
        started_at: isScheduledMeeting ? null : nowIso,
        created_at: nowIso,
        updated_at: nowIso
      })

      const channelMemberRows = allParticipantIds.map((participantId) => ({
        id: createId(),
        channel_id: chatChannelId,
        user_id: participantId,
        role: participantId === userId ? 'owner' : 'member',
        created_at: nowIso,
        updated_at: nowIso
      }))

      await trx('channel_members').insert(channelMemberRows)

      const participantRows = [
        {
          id: createId(),
          meeting_id: meetingId,
          user_id: userId,
          role: 'host',
          invite_status: isScheduledMeeting ? 'invited' : 'joined',
          invited_at: nowIso,
          joined_at: isScheduledMeeting ? null : nowIso,
          created_at: nowIso,
          updated_at: nowIso
        },
        ...inviteeIds.map((participantId) => ({
          id: createId(),
          meeting_id: meetingId,
          user_id: participantId,
          role: 'participant',
          invite_status: 'invited',
          invited_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso
        }))
      ]

      await trx('meeting_participants').insert(participantRows)

      if (inviteeIds.length === 0) {
        notificationRows = []
        return
      }

      const notificationText = `Meeting invite: /meetings/${meetingId}`
      notificationRows = inviteeIds.map((inviteeId) => ({
        id: createId(),
        user_id: inviteeId,
        type: 'meeting_invite',
        meeting_id: meetingId,
        message_id: null,
        channel_id: sourceChannel.id,
        actor_id: userId,
        actor_display_name: user.display_name,
        message_snippet: notificationText,
        is_read: false,
        created_at: nowIso
      }))

      await trx('notifications').insert(notificationRows)
    })

    if (!created && reusedMeetingId) {
      return this.get(reusedMeetingId, params)
    }

    this._joinConnectionsToChannel(chatChannelId, allParticipantIds)

    this._emitNotificationEvents(notificationRows)

    if (inviteeIds.length > 0) {
      this.app.service('meetings').emit('invited', {
        meetingId,
        chatChannelId,
        sourceChannelId,
        sourceChannelName: sourceChannel.name,
        sourceChannelDisplayName: sourceChannelDisplayName || null,
        meetingTitle: title,
        meetingStatus: initialStatus,
        userIds: inviteeIds,
        invitedBy: userId
      })
    }

    if (!isScheduledMeeting) {
      await this._createSourceMessage({
        meetingId,
        sourceChannel,
        user
      })
    }

    return this.get(meetingId, params)
  }

  async patch(id, data, params) {
    if (!id) {
      throw badRequest('api.meetings.meeting_id_required', {}, 'Meeting-ID ist erforderlich')
    }

    const action = data?.action
    if (action === 'invite') {
      if (!Array.isArray(data.user_ids) || data.user_ids.length === 0) {
        throw badRequest('api.meetings.invite_user_ids_required', {}, 'user_ids ist fuer invite erforderlich')
      }
      return this.invite(id, data, params)
    }

    if (action === 'join') {
      return this.join(id, data, params)
    }

    if (action === 'end') {
      return this.end(id, data, params)
    }

    if (action === 'cancel') {
      return this.cancel(id, data, params)
    }

    if (action === 'reschedule') {
      return this.reschedule(id, data, params)
    }

    if (action === 'decline') {
      return this.decline(id, data, params)
    }

    if (action === 'set_title') {
      const hasTitle = Object.prototype.hasOwnProperty.call(data || {}, 'title')
      if (!hasTitle) {
        throw badRequest('api.meetings.set_title_title_required', {}, 'title ist fuer set_title erforderlich')
      }
      return this.setTitle(id, data, params)
    }

    if (action === 'set_language') {
      const hasLanguage = Object.prototype.hasOwnProperty.call(data || {}, 'language')
      if (!hasLanguage) {
        throw badRequest('api.meetings.set_language_language_required', {}, 'language ist fuer set_language erforderlich')
      }
      return this.setLanguage(id, data, params)
    }

    if (action === 'create_invite_link') {
      return this.createInviteLink(id, data, params)
    }

    if (action === 'revoke_invite_link') {
      return this.revokeInviteLink(id, data, params)
    }

    if (action === 'generate_summary') {
      return this.generateSummary(id, data, params)
    }

    if (action === 'generate_transcript') {
      return this.generateTranscript(id, data, params)
    }

    if (action === 'pause_transcription_recording') {
      return this.pauseTranscriptionRecording(id, data, params)
    }

    if (action === 'resume_transcription_recording') {
      return this.resumeTranscriptionRecording(id, data, params)
    }

    throw badRequest(
      'api.meetings.unknown_action',
      { action: action || null },
      'Unbekannte Meeting-Action'
    )
  }

  async invite(id, data, params) {
    const user = params.user
    const userIds = uniqueIds(data.user_ids).filter((userId) => userId !== user.id)

    if (userIds.length === 0) {
      return this.get(id, params)
    }

    await this._assertUsersExist(userIds)

    const meeting = await this._getNormalizedMeetingOrThrow(id)
    await this._assertCanAccessMeeting(id, user)
    await this._assertCanInviteToMeeting(meeting, user)

    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      throw badRequest('api.meetings.meeting_already_ended', {}, 'Meeting ist bereits beendet')
    }

    const nowIso = new Date().toISOString()
    let invitedUserIds = []
    let notificationRows = []

    await this.db.transaction(async (trx) => {
      const existingRows = await trx('meeting_participants')
        .where('meeting_id', id)
        .whereIn('user_id', userIds)
        .select('user_id', 'invite_status')

      const existingByUser = new Map(existingRows.map((row) => [row.user_id, row]))
      const reInvites = existingRows
        .filter((row) => row.invite_status === 'left' || row.invite_status === 'declined')
        .map((row) => row.user_id)
      const newInvites = userIds.filter((candidateId) => !existingByUser.has(candidateId))

      invitedUserIds = [...reInvites, ...newInvites]

      if (reInvites.length > 0) {
        await trx('meeting_participants')
          .where('meeting_id', id)
          .whereIn('user_id', reInvites)
          .update({
            invite_status: 'invited',
            invited_at: nowIso,
            left_at: null,
            updated_at: nowIso
          })
      }

      if (newInvites.length > 0) {
        const participantRows = newInvites.map((participantId) => ({
          id: createId(),
          meeting_id: id,
          user_id: participantId,
          role: 'participant',
          invite_status: 'invited',
          invited_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso
        }))
        await trx('meeting_participants').insert(participantRows)
      }

      if (invitedUserIds.length === 0) {
        notificationRows = []
        return
      }

      const channelMemberRows = invitedUserIds.map((participantId) => ({
        id: createId(),
        channel_id: meeting.chat_channel_id,
        user_id: participantId,
        role: 'member',
        created_at: nowIso,
        updated_at: nowIso
      }))

      await trx('channel_members')
        .insert(channelMemberRows)
        .onConflict(['channel_id', 'user_id'])
        .ignore()

      const notificationText = `Meeting invite: /meetings/${id}`
      notificationRows = invitedUserIds.map((inviteeId) => ({
        id: createId(),
        user_id: inviteeId,
        type: 'meeting_invite',
        meeting_id: id,
        message_id: null,
        channel_id: meeting.source_channel_id,
        actor_id: user.id,
        actor_display_name: user.display_name,
        message_snippet: notificationText,
        is_read: false,
        created_at: nowIso
      }))

      await trx('notifications').insert(notificationRows)
    })

    if (invitedUserIds.length > 0) {
      const sourceChannelDisplayName = await this._resolveSourceChannelDisplayName({
        sourceChannelId: meeting.source_channel_id,
        sourceChannelType: meeting.source_channel_type,
        sourceChannelName: meeting.source_channel_name,
        viewerUserId: null
      })

      this._joinConnectionsToChannel(meeting.chat_channel_id, invitedUserIds)
      this._emitNotificationEvents(notificationRows)
      this.app.service('meetings').emit('invited', {
        meetingId: id,
        chatChannelId: meeting.chat_channel_id,
        sourceChannelId: meeting.source_channel_id,
        sourceChannelName: meeting.source_channel_name || null,
        sourceChannelDisplayName: sourceChannelDisplayName || null,
        meetingTitle: meeting.title || null,
        meetingStatus: meeting.status,
        userIds: invitedUserIds,
        invitedBy: user.id
      })
    }

    return this.get(id, params)
  }

  async join(id, data, params) {
    const user = params.user
    const nowIso = new Date().toISOString()

    const meeting = await this._getNormalizedMeetingOrThrow(id)
    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      throw badRequest('api.meetings.meeting_already_ended', {}, 'Meeting ist bereits beendet')
    }

    let participant = await this._getMeetingParticipant(id, user.id)
    if (!participant && !user.is_admin) {
      const canJoinFromSourceChannel = meeting.status === 'active' && meeting.source_channel_id
      if (!canJoinFromSourceChannel) {
        throw forbidden('api.meetings.meeting_access_denied', {}, 'Kein Zugriff auf dieses Meeting')
      }

      await this._assertCanUseSourceChannel(meeting.source_channel_id, user)
    }

    const isHostOrAdmin = user.is_admin || meeting.host_user_id === user.id
    if (meeting.status === 'scheduled' && !isHostOrAdmin) {
      const joinNotBefore = meeting.join_not_before ? new Date(meeting.join_not_before) : null
      if (joinNotBefore && !Number.isNaN(joinNotBefore.getTime()) && joinNotBefore.toISOString() > nowIso) {
        throw badRequest(
          'api.meetings.join_not_open_yet',
          { join_not_before: meeting.join_not_before },
          'Dieses Meeting ist noch nicht zum Beitritt freigegeben'
        )
      }
    }

    await this.db.transaction(async (trx) => {
      if (!participant) {
        participant = {
          id: createId(),
          meeting_id: id,
          user_id: user.id,
          role: 'participant',
          invite_status: 'joined',
          invited_at: nowIso,
          joined_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso
        }
        await trx('meeting_participants').insert(participant)
      } else {
        await trx('meeting_participants')
          .where('id', participant.id)
          .update({
            invite_status: 'joined',
            joined_at: participant.joined_at || nowIso,
            left_at: null,
            updated_at: nowIso
          })
      }

      if (meeting.status === 'scheduled') {
        await trx('meetings')
          .where('id', id)
          .update({
            status: 'active',
            started_at: meeting.started_at || nowIso,
            updated_at: nowIso
          })
      }

      await trx('channel_members')
        .insert({
          id: createId(),
          channel_id: meeting.chat_channel_id,
          user_id: user.id,
          role: 'member',
          created_at: nowIso,
          updated_at: nowIso
        })
        .onConflict(['channel_id', 'user_id'])
        .ignore()
    })

    this._joinConnectionsToChannel(meeting.chat_channel_id, [user.id])

    const voice = await this.app.service('voice').create(
      { channel_id: meeting.chat_channel_id },
      {
        ...params,
        user,
        provider: params.provider
      }
    )

    if (data?.muted || data?.deafened) {
      await this.app.service('voice').patch(
        meeting.chat_channel_id,
        {
          ...(data?.muted ? { is_muted: true } : {}),
          ...(data?.deafened ? { is_deafened: true } : {})
        },
        {
          ...params,
          user,
          provider: params.provider
        }
      )
    }

    this.app.service('meetings').emit('joined', {
      meetingId: id,
      chatChannelId: meeting.chat_channel_id,
      userId: user.id,
      participantUserId: user.id,
      status: 'active'
    })

    return {
      meeting: await this.get(id, params),
      voice
    }
  }

  async decline(id, data, params) {
    const user = params.user
    const meeting = await this._getNormalizedMeetingOrThrow(id)
    await this._assertCanAccessMeeting(id, user, meeting)

    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      return this.get(id, params)
    }

    const participant = await this._getMeetingParticipant(id, user.id)
    if (!participant) {
      throw forbidden(
        'api.meetings.decline_only_invited_allowed',
        {},
        'Nur eingeladene Teilnehmer koennen den Anruf ablehnen'
      )
    }

    if (participant.invite_status === 'joined') {
      throw badRequest('api.meetings.participant_already_joined', {}, 'Teilnehmer ist bereits beigetreten')
    }

    const nowIso = new Date().toISOString()
    await this.db('meeting_participants')
      .where('id', participant.id)
      .update({
        invite_status: 'declined',
        left_at: nowIso,
        updated_at: nowIso
      })

    return this.get(id, params)
  }

  async setTitle(id, data, params) {
    const user = params.user
    const meeting = await this._getNormalizedMeetingOrThrow(id)

    await this._assertCanAccessMeeting(id, user, meeting)
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
    const nowIso = new Date().toISOString()
    await this.db.transaction(async (trx) => {
      await trx('meetings')
        .where('id', id)
        .update({
          title: nextTitle,
          updated_at: nowIso
        })

      await trx('channels')
        .where('id', meeting.chat_channel_id)
        .update({
          topic: nextTitle,
          updated_at: nowIso
        })
    })

    const updatedChannel = await this.db('channels').where('id', meeting.chat_channel_id).first()
    if (updatedChannel) {
      this.app.service('channels').emit('patched', updatedChannel)
    }

    return this.get(id, params)
  }

  async generateSummary(id, data, params) {
    const user = params.user
    const meeting = await this._getNormalizedMeetingOrThrow(id)

    await this._assertCanAccessMeeting(id, user, meeting)
    await this.artifactDomainService.generateSummary({
      meeting,
      user,
      reason: data?.reason || 'manual'
    })

    return this.get(id, params)
  }

  async reschedule(id, data, params) {
    const user = params.user
    const meeting = await this._getNormalizedMeetingOrThrow(id)
    await this._assertCanAccessMeeting(id, user, meeting)
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
    const language = this._normalizeMeetingLanguageInput(data?.language) || meeting.language

    if (!scheduledStartAt) {
      throw badRequest('api.meetings.scheduled_start_required', {}, 'scheduled_start_at ist erforderlich')
    }

    if (scheduledEndAt && scheduledEndAt <= scheduledStartAt) {
      throw badRequest('api.meetings.invalid_schedule_window', {}, 'Das geplante Meeting-Ende muss nach dem Start liegen')
    }

    await this.db('meetings')
      .where('id', id)
      .update({
        scheduled_start_at: scheduledStartAt,
        scheduled_end_at: scheduledEndAt,
        join_not_before: buildDefaultJoinWindow(scheduledStartAt),
        description: description || null,
        language,
        updated_at: new Date().toISOString()
      })

    return this.get(id, params)
  }

  async setLanguage(id, data, params) {
    const user = params.user
    const meeting = await this._getNormalizedMeetingOrThrow(id)
    await this._assertCanAccessMeeting(id, user, meeting)

    const nextLanguage = this._normalizeMeetingLanguageInput(data?.language)
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

    await this.db('meetings')
      .where('id', id)
      .update({
        language: nextLanguage,
        updated_at: new Date().toISOString()
      })

    return this.get(id, params)
  }

  async createInviteLink(id, data, params) {
    const user = params.user
    const meeting = await this._getNormalizedMeetingOrThrow(id)
    await this._assertCanAccessMeeting(id, user, meeting)
    assertCanManageMeeting({
      meeting,
      user,
      code: 'api.meetings.invite_link_forbidden',
      message: 'Nur Host oder Admin kann Gast-Links verwalten'
    })

    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      throw badRequest('api.meetings.meeting_already_ended', {}, 'Meeting ist bereits beendet')
    }

    const nowIso = new Date().toISOString()
    const expiresAt = normalizeDateTime(data?.expires_at, '/expires_at')
      || meeting.scheduled_end_at
      || null
    const token = createMeetingInviteToken()
    const tokenHash = hashMeetingInviteToken(token)
    const linkId = createId()

    await this.db.transaction(async (trx) => {
      await trx('meeting_invite_links')
        .where('meeting_id', id)
        .whereNull('revoked_at')
        .update({
          revoked_at: nowIso,
          updated_at: nowIso
        })

      await trx('meeting_invite_links').insert({
        id: linkId,
        meeting_id: id,
        token_hash: tokenHash,
        created_by: user.id,
        expires_at: expiresAt,
        created_at: nowIso,
        updated_at: nowIso
      })
    })

    const result = await this.get(id, params)
    result.guest_invite_link = {
      ...(result.guest_invite_link || {}),
      id: linkId,
        expires_at: expiresAt,
        created_at: nowIso,
        join_url: buildMeetingInviteUrl({
          frontendUrl: resolveFrontendUrl(process.env),
          token
        })
      }
    return result
  }

  async revokeInviteLink(id, data, params) {
    const user = params.user
    const meeting = await this._getNormalizedMeetingOrThrow(id)
    await this._assertCanAccessMeeting(id, user, meeting)
    assertCanManageMeeting({
      meeting,
      user,
      code: 'api.meetings.invite_link_forbidden',
      message: 'Nur Host oder Admin kann Gast-Links verwalten'
    })

    const linkId = typeof data?.link_id === 'string' ? data.link_id.trim() : null
    const nowIso = new Date().toISOString()
    const query = this.db('meeting_invite_links')
      .where('meeting_id', id)
      .whereNull('revoked_at')

    if (linkId) {
      query.where('id', linkId)
    }

    await query.update({
      revoked_at: nowIso,
      updated_at: nowIso
    })

    return this.get(id, params)
  }

  async generateTranscript(id, data, params) {
    const user = params.user
    const meeting = await this._getNormalizedMeetingOrThrow(id)

    await this._assertCanAccessMeeting(id, user, meeting)
    await this.artifactDomainService.generateTranscript({
      meeting,
      user,
      reason: data?.reason || 'manual'
    })

    return this.get(id, params)
  }

  async pauseTranscriptionRecording(id, data, params) {
    const user = params.user
    const meeting = await this._getNormalizedMeetingOrThrow(id)
    await this._assertCanAccessMeeting(id, user, meeting)
    this._assertCanControlTranscriptionRecording(meeting, user)

    await this.recordingControlDomainService.pause({ meeting, user })
    return this.get(id, params)
  }

  async resumeTranscriptionRecording(id, data, params) {
    const user = params.user
    const meeting = await this._getNormalizedMeetingOrThrow(id)
    await this._assertCanAccessMeeting(id, user, meeting)
    this._assertCanControlTranscriptionRecording(meeting, user)

    await this.recordingControlDomainService.resume({ meeting, user })
    return this.get(id, params)
  }

  async end(id, data, params) {
    const user = params.user
    const meeting = await this._getNormalizedMeetingOrThrow(id)

    await this._assertCanAccessMeeting(id, user)
    assertCanManageMeeting({
      meeting,
      user,
      code: 'api.meetings.end_forbidden',
      message: 'Nur Host oder Admin kann dieses Meeting beenden'
    })

    if (meeting.status === 'scheduled') {
      throw badRequest('api.meetings.end_only_active', {}, 'Geplante Meetings muessen abgesagt statt beendet werden')
    }

    if (meeting.status === 'ended') {
      return this.get(id, params)
    }

    const nowIso = new Date().toISOString()
    const queuedArtifactTypesForEvent = await this.artifactDomainService.resolveEndedMeetingArtifactTypes(id)

    await this.db.transaction(async (trx) => {
      await trx('meetings')
        .where('id', id)
        .update({
          status: 'ended',
          ended_at: nowIso,
          ended_by: user.id,
          updated_at: nowIso
        })

      await trx('channels')
        .where('id', meeting.chat_channel_id)
        .update({
          is_archived: true,
          archived_at: nowIso,
          archived_by: user.id,
          updated_at: nowIso
        })

      await trx('meeting_participants')
        .where('meeting_id', id)
        .where('invite_status', 'joined')
        .update({
          invite_status: 'left',
          left_at: nowIso,
          updated_at: nowIso
        })

      await trx('meeting_recording_pauses')
        .where({
          meeting_id: id,
          resumed_at: null
        })
        .update({
          resumed_by: user.id,
          resumed_at: nowIso,
          updated_at: nowIso
        })

      if (queuedArtifactTypesForEvent.length > 0) {
        await this.artifactDomainService.queueProcessingArtifacts(trx, {
          meetingId: id,
          artifactTypes: queuedArtifactTypesForEvent,
          nowIso,
          resetPayload: true
        })
      }
    })

    await stopMeetingParticipantRecordings(this.app, { meetingId: id })
    await this.db('voice_participants').where('channel_id', meeting.chat_channel_id).del()

    try {
      await deleteRoom(meeting.chat_channel_id)
    } catch (error) {
      logger.warn('Meeting room cleanup failed', {
        meetingId: id,
        channelId: meeting.chat_channel_id,
        error: error.message
      })
    }

    const updatedChannel = await this.db('channels').where('id', meeting.chat_channel_id).first()
    if (updatedChannel) {
      this.app.service('channels').emit('patched', updatedChannel)
    }

    this.app.service('meetings').emit('ended', {
      meetingId: id,
      chatChannelId: meeting.chat_channel_id,
      endedAt: nowIso,
      endedBy: user.id,
      status: 'ended',
      chatChannelArchived: true
    })

    this.artifactDomainService.emitArtifactsQueued(meeting, {
      artifactTypes: queuedArtifactTypesForEvent,
      reason: data?.reason || null
    })

    return this.get(id, params)
  }

  async cancel(id, data, params) {
    const user = params.user
    const meeting = await this._getNormalizedMeetingOrThrow(id)
    await this._assertCanAccessMeeting(id, user, meeting)
    assertCanManageMeeting({
      meeting,
      user,
      code: 'api.meetings.cancel_forbidden',
      message: 'Nur Host oder Admin kann dieses Meeting absagen'
    })

    if (meeting.status !== 'scheduled') {
      throw badRequest('api.meetings.cancel_only_scheduled', {}, 'Nur geplante Meetings koennen abgesagt werden')
    }

    const nowIso = new Date().toISOString()
    await this.db.transaction(async (trx) => {
      await trx('meetings')
        .where('id', id)
        .update({
          status: 'cancelled',
          cancelled_at: nowIso,
          updated_at: nowIso
        })

      await trx('channels')
        .where('id', meeting.chat_channel_id)
        .update({
          is_archived: true,
          archived_at: nowIso,
          archived_by: user.id,
          updated_at: nowIso
        })

      await trx('meeting_invite_links')
        .where('meeting_id', id)
        .whereNull('revoked_at')
        .update({
          revoked_at: nowIso,
          updated_at: nowIso
        })
    })

    const updatedChannel = await this.db('channels').where('id', meeting.chat_channel_id).first()
    if (updatedChannel) {
      this.app.service('channels').emit('patched', updatedChannel)
    }

    this.app.service('meetings').emit('ended', {
      meetingId: id,
      chatChannelId: meeting.chat_channel_id,
      endedBy: user.id,
      status: 'cancelled',
      chatChannelArchived: true
    })

    return this.get(id, params)
  }

  _baseMeetingQuery() {
    return this.db('meetings')
      .leftJoin('channels as source_channel', 'source_channel.id', 'meetings.source_channel_id')
      .leftJoin('channels as chat_channel', 'chat_channel.id', 'meetings.chat_channel_id')
      .select(
        'meetings.*',
        'source_channel.name as source_channel_name',
        'source_channel.type as source_channel_type',
        'chat_channel.name as chat_channel_name',
        'chat_channel.purpose as chat_channel_purpose',
        'chat_channel.is_voice as chat_channel_is_voice',
        'chat_channel.is_archived as chat_channel_is_archived'
      )
  }

  async _getMeetingOrThrow(meetingId) {
    const meeting = await this._baseMeetingQuery().where('meetings.id', meetingId).first()
    if (!meeting) {
      throw notFound('api.meetings.meeting_not_found', {}, 'Meeting nicht gefunden')
    }
    return meeting
  }

  async _getNormalizedMeetingOrThrow(meetingId, { now = new Date() } = {}) {
    const meeting = await this._getMeetingOrThrow(meetingId)
    return this._maybeNormalizeOverdueScheduledMeeting(meeting, { now })
  }

  async _maybeNormalizeOverdueScheduledMeeting(meeting, { now = new Date() } = {}) {
    if (!isOverdueScheduledMeeting(meeting, now)) {
      return meeting
    }

    await this.autoEndOverdueScheduledMeeting({
      app: this.app,
      db: this.db,
      meeting,
      now,
      artifactDomainService: this.artifactDomainService
    })

    return this._getMeetingOrThrow(meeting.id)
  }

  async _normalizeOverdueScheduledMeetings({
    sourceChannelId = null,
    meetingId = null,
    now = new Date()
  } = {}) {
    const nowIso = (now instanceof Date ? now : new Date(now)).toISOString()
    const query = this.db('meetings')
      .where({ status: 'scheduled' })
      .whereNotNull('scheduled_end_at')
      .where('scheduled_end_at', '<=', nowIso)

    if (sourceChannelId) {
      query.where('source_channel_id', sourceChannelId)
    }

    if (meetingId) {
      query.where('id', meetingId)
    }

    const overdueMeetings = await query.select('id', 'status', 'scheduled_end_at', 'chat_channel_id', 'source_channel_id')

    for (const overdueMeeting of overdueMeetings) {
      await this.autoEndOverdueScheduledMeeting({
        app: this.app,
        db: this.db,
        meeting: overdueMeeting,
        now,
        artifactDomainService: this.artifactDomainService
      })
    }
  }

  async _assertCanAccessMeeting(meetingId, user, preloadedMeeting = null) {
    return assertCanAccessMeeting({
      meetingId,
      user,
      preloadedMeeting,
      findMeetingParticipant: (targetMeetingId, userId) => this._getMeetingParticipant(targetMeetingId, userId),
      loadMeetingById: (targetMeetingId) => this._getMeetingOrThrow(targetMeetingId)
    })
  }

  async _getMeetingParticipant(meetingId, userId) {
    return this.db('meeting_participants')
      .where({
        meeting_id: meetingId,
        user_id: userId
      })
      .first()
  }

  async _findChannelById(channelId) {
    return this.db('channels').where('id', channelId).first()
  }

  async _findChannelMembership(channelId, userId) {
    return this.db('channel_members')
      .where({
        channel_id: channelId,
        user_id: userId
      })
      .first()
  }

  async _findExistingUserIds(userIds) {
    const users = await this.db('users')
      .whereIn('id', userIds)
      .select('id')

    return users.map((user) => user.id)
  }

  async _assertCanUseSourceChannel(sourceChannelId, user) {
    return assertCanUseSourceChannel({
      sourceChannelId,
      user,
      findChannelById: (channelId) => this._findChannelById(channelId),
      findChannelMembership: (channelId, userId) => this._findChannelMembership(channelId, userId)
    })
  }

  async _assertCanReadSourceChannel(sourceChannelId, user) {
    return assertCanReadSourceChannel({
      sourceChannelId,
      user,
      findChannelById: (channelId) => this._findChannelById(channelId),
      findChannelMembership: (channelId, userId) => this._findChannelMembership(channelId, userId)
    })
  }

  async _assertCanInviteToMeeting(meeting, user) {
    return assertCanInviteToMeeting({
      meeting,
      user,
      findChannelById: (channelId) => this._findChannelById(channelId)
    })
  }

  async _assertUsersExist(userIds) {
    return assertUsersExist({
      userIds,
      findExistingUserIds: (targetUserIds) => this._findExistingUserIds(targetUserIds)
    })
  }

  _normalizeMeetingLanguageInput(language) {
    if (typeof language !== 'string') return null
    return normalizeMeetingLanguage(language, DEFAULT_MEETING_LANGUAGE)
  }

  async _resolveDefaultMeetingLanguage() {
    const row = await this.db('platform_settings')
      .where('key', 'default_meeting_language')
      .first()

    if (row?.value) {
      return normalizeMeetingLanguage(row.value, DEFAULT_MEETING_LANGUAGE)
    }

    const localeRow = await this.db('platform_settings')
      .where('key', 'default_locale')
      .first()

    return normalizeMeetingLanguage(localeRow?.value, DEFAULT_MEETING_LANGUAGE)
  }

  _normalizeLabel(value) {
    return normalizeLabel(value)
  }

  _isTechnicalDmSourceName(name, channelId = null) {
    return isTechnicalDmSourceName(name, channelId)
  }

  _isTechnicalGroupSourceName(name, channelId = null) {
    return isTechnicalGroupSourceName(name, channelId)
  }

  _toUniqueSortedDisplayNames(memberRows) {
    return toUniqueSortedDisplayNames(memberRows)
  }

  _formatCompactGroupDisplayName(names) {
    return formatCompactGroupDisplayName(names)
  }

  async _resolveSourceChannelDisplayName({
    sourceChannelId,
    sourceChannelType,
    sourceChannelName,
    viewerUserId = null
  }) {
    return resolveSourceChannelDisplayName({
      db: this.db,
      sourceChannelId,
      sourceChannelType,
      sourceChannelName,
      viewerUserId
    })
  }

  async _buildSourceChannelDisplayNameIndex(rows, { viewerUserId = null } = {}) {
    return buildSourceChannelDisplayNameIndex(this.db, rows, { viewerUserId })
  }

  _buildMeetingSummary(row, {
    sourceChannelDisplayNameByChannelId = {},
    engagedParticipantCountByMeetingId = {},
    summaryGenerationByMeetingId = {},
    transcriptGenerationByMeetingId = {},
    transcriptionRecordingByMeetingId = {}
  } = {}) {
    return buildMeetingSummary(row, {
      sourceChannelDisplayNameByChannelId,
      engagedParticipantCountByMeetingId,
      summaryGenerationByMeetingId,
      transcriptGenerationByMeetingId,
      transcriptionRecordingByMeetingId
    })
  }

  async _serializeMeetings(rows, { viewerUserId = null, viewerUser = null, detailLevel = 'summary' } = {}) {
    return serializeMeetings({
      db: this.db,
      app: this.app,
      rows,
      viewerUserId,
      viewerUser,
      detailLevel,
      buildSourceDisplayNameIndex: (targetRows, options) => this._buildSourceChannelDisplayNameIndex(targetRows, options),
      buildTranscriptionStateIndex: (targetRows, options) => this._buildTranscriptionRecordingStateIndex(targetRows, options),
      enrichMeetingDetails: (targetRows, options) => this._enrichMeetingsWithDetails(targetRows, options)
    })
  }

  async _enrichMeetingsWithDetails(rows, {
    viewerUserId = null,
    viewerUser = null,
    sourceChannelDisplayNameByChannelId = {},
    messageAuthorIdsByChannelId = {},
    transcriptionRecordingByMeetingId = {}
  } = {}) {
    return enrichMeetingsWithDetails({
      db: this.db,
      app: this.app,
      rows,
      viewerUserId,
      viewerUser,
      sourceChannelDisplayNameByChannelId,
      messageAuthorIdsByChannelId,
      transcriptionRecordingByMeetingId
    })
  }

  async _buildTranscriptionRecordingStateIndex(rows, { viewerUser = null } = {}) {
    return buildTranscriptionRecordingStateIndex({
      db: this.db,
      app: this.app,
      rows,
      viewerUser
    })
  }

  _assertCanControlTranscriptionRecording(meeting, user) {
    return assertCanControlTranscriptionRecording({ meeting, user })
  }

  async _startRecordingsForConnectedMeetingParticipants(meeting) {
    return this.recordingControlDomainService.startRecordingsForConnectedMeetingParticipants(meeting)
  }

  _emitRecordingStateUpdated(meeting) {
    return this.recordingControlDomainService.emitRecordingStateUpdated(meeting)
  }

  async _createSourceMessage({ meetingId, sourceChannel, user }) {
    try {
      await this.app.service('messages').create(
        {
          channel_id: sourceChannel.id,
          content: `[Meeting] /meetings/${meetingId}`
        },
        {
          user,
          skipNotifications: true
        }
      )
    } catch (error) {
      logger.warn('Failed to create meeting source message', {
        meetingId,
        sourceChannelId: sourceChannel.id,
        error: error.message
      })
    }
  }

  _joinConnectionsToChannel(channelId, memberUserIds) {
    if (!memberUserIds.length) return

    try {
      const room = this.app.channel('authenticated')
      const connections = room?.connections || []
      for (const connection of connections) {
        if (memberUserIds.includes(connection.user?.id)) {
          this.app.channel(`channel/${channelId}`).join(connection)
        }
      }
    } catch {
      // Non-critical: users rejoin channel rooms on next login.
    }
  }

  _emitNotificationEvents(rows) {
    if (!rows || rows.length === 0) return

    for (const row of rows) {
      try {
        this.app.service('notifications').emit('created', row)
      } catch (error) {
        logger.warn('Failed to emit meeting notification', {
          notificationId: row.id,
          userId: row.user_id,
          error: error.message
        })
      }
    }
  }
}

export const meetings = (app) => {
  const options = {
    Model: app.get('postgresqlClient'),
    app
  }

  app.use('meetings', new MeetingsService(options), {
    methods: ['find', 'get', 'create', 'patch'],
    events: ['invited', 'joined', 'ended', 'artifacts-queued', 'artifacts-updated', 'recording-state-updated']
  })

  app.service('meetings').hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      create: [validate(createSchema)],
      patch: [validate(patchSchema)]
    }
  })
}
