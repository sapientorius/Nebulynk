import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { badRequest, forbidden, notFound } from '../../lib/errors.js'
import { validate } from '../../schemas/validators.js'
import { create as createMeeting } from '../../domains/meetings/creation.js'
import { logger } from '../../logger.js'
import { upsertMessageSearchDocument } from '../../lib/search-index.js'
import { MeetingsService } from '../meetings/meetings.js'

export const CALL_TIMEOUT_MS = 30_000
const unavailable = () => badRequest('api.meetings.call_unavailable', {}, 'Anruf nicht mehr verfügbar')

async function afterCommitSafely(work) {
  try { await work() }
  catch (error) { logger.error('Committed meeting call side effect failed', { error: error.message }) }
}

export class MeetingCallsService {
  constructor(app, { now = () => new Date() } = {}) {
    this.app = app
    this.db = app.get('postgresqlClient')
    this.now = now
  }

  async assertMember(db, channelId, userId) {
    const query = db('channel_members').where({ channel_id: channelId, user_id: userId })
    if (db.isTransaction) query.forShare()
    const member = await query.first()
    if (!member) throw forbidden('api.meetings.meeting_access_denied', {}, 'Kein Zugriff auf diesen Anruf')
  }

  async get(id, params) {
    const call = await this.db('meeting_calls').where({ id }).first()
    if (!call) throw notFound('api.meetings.call_unavailable', {}, 'Anruf nicht mehr verfügbar')
    await this.assertMember(this.db, call.source_channel_id, params.user.id)
    const recipient = await this.db('meeting_call_recipients').where({ call_id: id, user_id: params.user.id }).first()
    if (call.caller_id !== params.user.id && !recipient) throw forbidden('api.meetings.meeting_access_denied')
    const caller = await this.db('users').where('id', call.caller_id).first()
    const source = await this.db('channels').where('id', call.source_channel_id).first()
    const meeting = call.meeting_id ? await this.db('meetings').where('id', call.meeting_id).first() : null
    return { ...call, recipient_status: recipient?.status || null, caller_name: caller?.display_name || '',
      meeting_status: meeting?.status || null,
      source_name: await this.app.service('meetings')._resolveSourceChannelDisplayName({
        sourceChannelId: call.source_channel_id, sourceChannelType: source.type, sourceChannelName: source.name, viewerUserId: params.user.id
      }) }
  }

  async find(params) {
    const rows = await this.db('meeting_calls as calls')
      .join('channel_members as members', 'members.channel_id', 'calls.source_channel_id')
      .leftJoin('meeting_call_recipients as recipients', function () {
        this.on('recipients.call_id', '=', 'calls.id').andOn('recipients.user_id', '=', 'members.user_id')
      })
      .where('members.user_id', params.user.id)
      .where(builder => builder.where('calls.caller_id', params.user.id).orWhereNotNull('recipients.user_id'))
      .where(builder => builder.where('calls.status', 'ringing').orWhereExists(
        this.db('meetings').select(1).whereRaw('meetings.id = calls.meeting_id').where('meetings.status', 'active')
      ))
      .orderBy('calls.created_at', 'desc').limit(50).select('calls.id')
    const results = await Promise.all(rows.map(row => this.get(row.id, params)))
    return results
  }

  async history(trx, call, outcome, messages) {
    const labels = { expired: 'Anruf nicht angenommen', declined: 'Anruf abgelehnt', cancelled: 'Anruf abgebrochen' }
    const row = {
      id: createId(), channel_id: call.source_channel_id, user_id: call.caller_id,
      content: outcome === 'accepted' ? `[Meeting] /meetings/${call.meeting_id}` : labels[outcome],
      type: 'text', call_id: call.id, call_outcome: outcome,
      created_at: this.now().toISOString(), updated_at: this.now().toISOString()
    }
    const inserted = await trx('messages').insert(row).onConflict('call_id').ignore().returning('*')
    messages.push(...inserted)
    for (const message of inserted) {
      await upsertMessageSearchDocument(trx, message.id)
      await trx('notifications').where('call_id', call.id).update({ message_id: message.id })
    }
  }

  async expireLocked(trx, call, messages) {
    if (call.expiry_processed || !['ringing', 'accepted'].includes(call.status) || new Date(call.expires_at) > this.now()) return false
    await trx('meeting_calls').where('id', call.id).update({ expiry_processed: true })
    const changed = await trx('meeting_call_recipients').where({ call_id: call.id, status: 'invited' }).update({ status: 'expired' })
    if (call.status === 'ringing') {
      call.status = 'expired'
      call.updated_at = this.now().toISOString()
      await trx('meeting_calls').where('id', call.id).update({ status: call.status, updated_at: call.updated_at })
      await this.history(trx, call, call.status, messages)
      return true
    }
    return changed > 0
  }

  async publishChanges(id, messages = [], notifications = []) {
    const call = await this.db('meeting_calls').where('id', id).first()
    if (!call) return
    const members = await this.db('channel_members').where('channel_id', call.source_channel_id).pluck('user_id')
    const recipients = await this.db('meeting_call_recipients').where('call_id', id).pluck('user_id')
    await afterCommitSafely(() => this.app.service('meeting-calls').emit('changed', {
      id, userIds: [call.caller_id, ...recipients].filter(userId => members.includes(userId))
    }))
    for (const message of messages) {
      const user = await this.db('users').where('id', message.user_id).first()
      await afterCommitSafely(() => this.app.service('messages').emit('created', { ...message, user_display_name: user?.display_name, user_avatar_url: user?.avatar_url }))
    }
    const dispatcher = this.app.get('notificationSideEffectsDispatcher')
    if (dispatcher) await afterCommitSafely(() => dispatcher.enqueue(notifications))
    else for (const notification of notifications) await afterCommitSafely(() => this.app.service('notifications').emit('created', notification))
  }

  async create(data, params) {
    const sourceId = data.source_channel_id
    await this.app.service('meetings')._assertCanUseSourceChannel(sourceId, params.user)
    const messages = [], notifications = []
    let id, activeMeetingId, createdNew = false
    await this.db.transaction(async trx => {
      const source = await trx('channels').where('id', sourceId).forUpdate().first()
      await this.assertMember(trx, sourceId, params.user.id)
      if (source?.is_archived) throw unavailable()
      if (!['dm', 'group'].includes(source.type)) throw badRequest('api.meetings.call_source_invalid', {}, 'Dieser Kanal startet Meetings direkt')
      const active = await trx('meetings').where({ source_channel_id: sourceId, status: 'active' }).first()
      if (active) { activeMeetingId = active.id; return }
      const existing = await trx('meeting_calls').where({ source_channel_id: sourceId, status: 'ringing' }).forUpdate().first()
      if (existing) {
        const expired = await this.expireLocked(trx, existing, messages)
        if (!expired) { id = existing.id; return }
      }
      const recipientIds = await trx('channel_members').where('channel_id', sourceId).whereNot('user_id', params.user.id).pluck('user_id')
      if (!recipientIds.length) throw badRequest('api.meetings.call_no_recipients', {}, 'Keine weiteren Teilnehmer für diesen Anruf')
      id = createId()
      createdNew = true
      const now = this.now()
      await trx('meeting_calls').insert({ id, source_channel_id: sourceId, caller_id: params.user.id,
        title: data.title?.trim() || null, status: 'ringing', expires_at: new Date(now.getTime() + CALL_TIMEOUT_MS), created_at: now, updated_at: now })
      await trx('meeting_call_recipients').insert(recipientIds.map(user_id => ({ call_id: id, user_id, status: 'invited' })))
      notifications.push(...recipientIds.map(user_id => ({ id: createId(), user_id, type: 'meeting_call', call_id: id,
        channel_id: sourceId, actor_id: params.user.id, actor_display_name: params.user.display_name,
        message_snippet: data.title?.trim() || params.user.display_name, is_read: false, created_at: now })))
      await trx('notifications').insert(notifications)
    })
    if (activeMeetingId) return { meeting_id: activeMeetingId, status: 'accepted' }
    await this.publishChanges(id, messages, notifications)
    return { ...await this.get(id, params), created_new: createdNew }
  }

  async patch(id, data, params) {
    const preliminary = await this.get(id, params)
    const messages = [], afterCommit = []
    let expired = false, acceptedNow = false
    await this.db.transaction(async trx => {
      // All paths lock the source before the attempt, including meeting creation.
      const source = await trx('channels').where('id', preliminary.source_channel_id).forUpdate().first()
      if (source?.is_archived && data.action === 'accept') throw unavailable()
      const call = await trx('meeting_calls').where('id', id).forUpdate().first()
      if (!call) throw unavailable()
      await this.assertMember(trx, call.source_channel_id, params.user.id)
      const recipient = await trx('meeting_call_recipients').where({ call_id: id, user_id: params.user.id }).first()
      await this.expireLocked(trx, call, messages)
      if (data.action === 'accept' && recipient?.status === 'accepted' && call.meeting_id) return
      if (!['ringing', 'accepted'].includes(call.status) || (data.action !== 'cancel' && new Date(call.expires_at) <= this.now())) {
        expired = true
        return
      }
      if (data.action === 'cancel') {
        if (call.caller_id !== params.user.id) throw forbidden('api.meetings.meeting_access_denied')
        if (call.status === 'accepted') throw unavailable()
        call.status = 'cancelled'
        await trx('meeting_call_recipients').where({ call_id: id, status: 'invited' }).update({ status: 'cancelled' })
      } else {
        if (!recipient) throw forbidden('api.meetings.meeting_access_denied')
        if (recipient.status !== 'invited') { expired = true; return }
        await trx('meeting_call_recipients').where({ call_id: id, user_id: params.user.id }).update({ status: data.action === 'accept' ? 'accepted' : 'declined' })
        await trx('notifications').where({ call_id: id, user_id: params.user.id }).update({ is_read: true })
        if (data.action === 'accept') {
          acceptedNow = true
          await this.assertMember(trx, call.source_channel_id, call.caller_id)
          if (!call.meeting_id) {
            const caller = await trx('users').where('id', call.caller_id).first()
            // Keep every creation read on this connection, even when the pool is full.
            const creationService = new MeetingsService({ Model: trx, app: this.app, now: this.now })
            const meeting = await createMeeting(creationService.dependencies,
              { source_channel_id: call.source_channel_id, title: call.title }, { user: caller }, { trx, afterCommit })
            call.meeting_id = meeting.id
            call.status = 'accepted'
            if (meeting.created_new) afterCommit.push(async () => {
              const service = this.app.service('meetings')
              service.emit('created', await service.get(meeting.id, { user: caller }))
            })
            const declinedIds = await trx('meeting_call_recipients').where({ call_id: id, status: 'declined' }).pluck('user_id')
            if (declinedIds.length) await trx('meeting_participants').where('meeting_id', meeting.id).whereIn('user_id', declinedIds).update({ invite_status: 'declined' })
            await this.history(trx, call, 'accepted', messages)
          } else {
            const meeting = await trx('meetings').where({ id: call.meeting_id, status: 'active' }).first()
            if (!meeting) throw unavailable()
          }
        } else if (call.status === 'ringing') {
          const pending = await trx('meeting_call_recipients').where({ call_id: id, status: 'invited' }).first()
          if (!pending) call.status = 'declined'
        }
      }
      const pending = await trx('meeting_call_recipients').where({ call_id: id, status: 'invited' }).first()
      await trx('meeting_calls').where('id', id).update({ status: call.status, meeting_id: call.meeting_id, expiry_processed: !pending, updated_at: this.now() })
      if (['declined', 'cancelled'].includes(call.status)) await this.history(trx, call, call.status, messages)
    })
    for (const effect of afterCommit) await afterCommitSafely(effect)
    await this.publishChanges(id, messages)
    if (expired) throw unavailable()
    return { ...await this.get(id, params), accepted_now: acceptedNow }
  }

  async expire() {
    const candidates = await this.db('meeting_calls as calls')
      .where('calls.expires_at', '<=', this.now()).whereIn('calls.status', ['ringing', 'accepted'])
      .where('calls.expiry_processed', false).select('calls.id', 'calls.source_channel_id')
    for (const candidate of candidates) {
      const messages = []
      let changed = false
      await this.db.transaction(async trx => {
        await trx('channels').where('id', candidate.source_channel_id).forUpdate().first()
        const call = await trx('meeting_calls').where('id', candidate.id).forUpdate().first()
        if (call) changed = await this.expireLocked(trx, call, messages)
      })
      if (changed) await this.publishChanges(candidate.id, messages)
    }
  }

  async recordJoin(meetingId, userId) {
    const rows = await this.db('meeting_calls').where({ meeting_id: meetingId, status: 'accepted' }).select('id')
    for (const { id } of rows) {
      const changed = await this.db('meeting_call_recipients').where({ call_id: id, user_id: userId, status: 'invited' }).update({ status: 'accepted' })
      if (changed) await this.publishChanges(id)
    }
  }
}

export function meetingCalls(app) {
  app.use('meeting-calls', new MeetingCallsService(app), { methods: ['find', 'get', 'create', 'patch'], events: ['changed'] })
  app.service('meeting-calls').hooks({
    around: { all: [authenticate('jwt')] },
    before: {
      create: [validate({ type: 'object', additionalProperties: false, required: ['source_channel_id'], properties: {
        source_channel_id: { type: 'string', minLength: 1 }, title: { type: 'string', maxLength: 120 }
      } })],
      patch: [validate({ type: 'object', additionalProperties: false, required: ['action'], properties: {
        action: { enum: ['accept', 'decline', 'cancel'] }
      } })]
    }
  })
}

export async function expireMeetingCalls(app) {
  try { await app.service('meeting-calls').expire() }
  catch (error) { logger.error('Meeting call expiry failed', { error: error.message }) }
}
