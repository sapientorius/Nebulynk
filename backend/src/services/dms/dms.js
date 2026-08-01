import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { validate } from '../../schemas/validators.js'
import { badRequest, forbidden, notFound } from '../../lib/errors.js'
import { createSchema, patchSchema } from './dms.schema.js'

export class DmsService {
  constructor(options) {
    this.options = options
  }

  get db() {
    return this.options.Model
  }

  get app() {
    return this.options.app
  }

  /**
   * GET /dms - List all DM/group channels for the current user,
   * enriched with participants and sorted by last activity.
   */
  async find(params) {
    const userId = params.user.id
    if (params.user?.account_type !== 'guest') {
      await this._ensureNotesDm(userId)
    }

    // Get all DM/group channels the user is a member of
    const dmChannels = await this.db('channel_members')
      .join('channels', 'channels.id', '=', 'channel_members.channel_id')
      .where('channel_members.user_id', userId)
      .whereIn('channels.type', ['dm', 'group'])
      .select(
        'channels.id',
        'channels.name',
        'channels.topic',
        'channels.type',
        'channels.created_by',
        'channels.created_at'
      )

    if (dmChannels.length === 0) {
      return { data: [] }
    }

    const channelIds = dmChannels.map((c) => c.id)

    // Load participants for all channels
    const allParticipants = await this.db('channel_members')
      .join('users', 'users.id', '=', 'channel_members.user_id')
      .whereIn('channel_members.channel_id', channelIds)
      .select(
        'channel_members.channel_id',
        'channel_members.user_id',
        'channel_members.role',
        'users.display_name',
        'users.avatar_url',
        'users.status'
      )

    // Group participants by channel
    const participantsByChannel = {}
    for (const p of allParticipants) {
      if (!participantsByChannel[p.channel_id]) participantsByChannel[p.channel_id] = []
      participantsByChannel[p.channel_id].push({
        user_id: p.user_id,
        role: p.role,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        status: p.status
      })
    }

    // Load last message timestamp per channel
    const lastMessages = await this.db('messages')
      .whereIn('channel_id', channelIds)
      .whereNull('deleted_at')
      .groupBy('channel_id')
      .select('channel_id')
      .max('created_at as last_message_at')

    const lastMessageMap = {}
    for (const lm of lastMessages) {
      lastMessageMap[lm.channel_id] = lm.last_message_at
    }

    // Enrich and sort
    const enriched = dmChannels.map((ch) => ({
      ...ch,
      participants: participantsByChannel[ch.id] || [],
      last_message_at: lastMessageMap[ch.id] || ch.created_at
    }))

    enriched.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at))

    return { data: enriched }
  }

  /**
   * POST /dms - Find-or-create a DM channel.
   * data.user_ids: array of user IDs (without self)
   * data.name: optional group name
   */
  async create(data, params) {
    const userId = params.user.id
    const { user_ids, name } = data

    if (params.user?.account_type === 'guest') {
      throw forbidden(
        'api.dms.guest_accounts_forbidden',
        {},
        'Gastkonten duerfen keine Direktnachrichten verwenden'
      )
    }

    if (user_ids.includes(userId)) {
      throw badRequest(
        'api.dms.user_ids_must_not_contain_self',
        {},
        'user_ids darf die eigene ID nicht enthalten'
      )
    }

    // Verify all target users exist
    const existingUsers = await this.db('users').whereIn('id', user_ids).select('id', 'account_type')
    if (existingUsers.length !== user_ids.length) {
      throw badRequest(
        'api.dms.one_or_more_user_ids_invalid',
        {},
        'Eine oder mehrere User-IDs sind ungueltig'
      )
    }

    if (existingUsers.some((user) => user.account_type === 'guest')) {
      throw forbidden(
        'api.dms.guest_accounts_forbidden',
        {},
        'Gastkonten duerfen keine Direktnachrichten verwenden'
      )
    }

    // 1:1 DM - find or create
    if (user_ids.length === 1) {
      return await this._findOrCreateDirectDm(userId, user_ids[0])
    }

    // Group DM - always create new
    return await this._createGroupDm(userId, user_ids, name)
  }

  /**
   * GET /dms/:id - Get a single DM channel with participants.
   */
  async get(id, params) {
    const userId = params.user.id

    const channel = await this.db('channels')
      .where('id', id)
      .whereIn('type', ['dm', 'group'])
      .first()

    if (!channel) throw notFound('api.dms.dm_not_found', {}, 'DM nicht gefunden')

    // Verify membership
    const membership = await this.db('channel_members')
      .where({ channel_id: id, user_id: userId })
      .first()

    if (!membership) throw forbidden('api.dms.conversation_access_denied', {}, 'Kein Zugriff auf diese Konversation')

    // Load participants
    const participants = await this.db('channel_members')
      .join('users', 'users.id', '=', 'channel_members.user_id')
      .where('channel_members.channel_id', id)
      .select(
        'channel_members.user_id',
        'channel_members.role',
        'users.display_name',
        'users.avatar_url',
        'users.status'
      )

    return { ...channel, participants }
  }

  /**
   * PATCH /dms/:id - Update group DM name and/or topic.
   */
  async patch(id, data, params) {
    const userId = params.user.id

    const channel = await this.db('channels').where('id', id).first()
    if (!channel) throw notFound('api.dms.dm_not_found', {}, 'DM nicht gefunden')
    if (channel.type !== 'group') throw badRequest('api.dms.only_group_dms_editable', {}, 'Nur Gruppen-DMs koennen bearbeitet werden')

    const membership = await this.db('channel_members')
      .where({ channel_id: id, user_id: userId })
      .first()

    if (!membership) throw forbidden('api.dms.conversation_access_denied', {}, 'Kein Zugriff auf diese Konversation')

    const updateData = { updated_at: new Date().toISOString() }
    if (data.name !== undefined) updateData.name = data.name
    if (data.topic !== undefined) updateData.topic = data.topic

    await this.db('channels').where('id', id).update(updateData)

    const updated = await this.get(id, params)

    // Broadcast to all group participants via channels service publish rules
    this.app.service('channels').emit('patched', updated)

    return updated
  }

  // --- Private helpers ---

  async _findOrCreateDirectDm(selfId, targetId) {
    // Use a transaction to prevent duplicate DM creation.
    // Returns only channelId - _enrichChannel is called AFTER commit so this.db can see the data.
    const channelId = await this.db.transaction(async (trx) => {
      // Check for existing 1:1 DM between these two users
      const existing = await trx('channels')
        .join('channel_members as cm1', function () {
          this.on('cm1.channel_id', '=', 'channels.id').andOn('cm1.user_id', '=', trx.raw('?', [selfId]))
        })
        .join('channel_members as cm2', function () {
          this.on('cm2.channel_id', '=', 'channels.id').andOn('cm2.user_id', '=', trx.raw('?', [targetId]))
        })
        .where('channels.type', 'dm')
        .select('channels.id')
        .first()

      if (existing) return existing.id

      // Create new DM channel
      const newId = createId()
      const now = new Date().toISOString()

      await trx('channels').insert({
        id: newId,
        name: `dm-${newId}`,
        type: 'dm',
        created_by: selfId,
        created_at: now,
        updated_at: now
      })

      await trx('channel_members').insert([
        { id: createId(), channel_id: newId, user_id: selfId, role: 'member', created_at: now, updated_at: now },
        { id: createId(), channel_id: newId, user_id: targetId, role: 'member', created_at: now, updated_at: now }
      ])

      // Join Socket.IO connections to the new channel room
      this._joinConnectionsToChannel(newId, [selfId, targetId])

      return newId
    })

    return await this._enrichChannel(channelId)
  }

  async _createGroupDm(selfId, userIds, customName) {
    const channelId = createId()
    const now = new Date().toISOString()
    const allMemberIds = [selfId, ...userIds]

    await this.db('channels').insert({
      id: channelId,
      name: customName || `group-${channelId}`,
      type: 'group',
      created_by: selfId,
      created_at: now,
      updated_at: now
    })

    const memberRows = allMemberIds.map((uid) => ({
      id: createId(),
      channel_id: channelId,
      user_id: uid,
      role: uid === selfId ? 'owner' : 'member',
      created_at: now,
      updated_at: now
    }))

    await this.db('channel_members').insert(memberRows)

    // Join Socket.IO connections to the new channel room
    this._joinConnectionsToChannel(channelId, allMemberIds)

    return await this._enrichChannel(channelId)
  }

  async _ensureNotesDm(userId) {
    const now = new Date().toISOString()
    let channel = await this.db('channels')
      .where({ type: 'dm', name: 'notes', created_by: userId })
      .first()

    if (!channel) {
      const channelId = createId()
      try {
        await this.db('channels').insert({
          id: channelId,
          name: 'notes',
          type: 'dm',
          created_by: userId,
          created_at: now,
          updated_at: now
        })
        channel = await this.db('channels').where('id', channelId).first()
      } catch (error) {
        if (error?.code !== '23505') throw error
        channel = await this.db('channels')
          .where({ type: 'dm', name: 'notes', created_by: userId })
          .first()
      }
    }

    if (!channel?.id) return null

    await this.db('channel_members')
      .insert({
        id: createId(),
        channel_id: channel.id,
        user_id: userId,
        role: 'owner',
        created_at: now,
        updated_at: now
      })
      .onConflict(['channel_id', 'user_id'])
      .ignore()

    this._joinConnectionsToChannel(channel.id, [userId])
    return channel
  }

  _joinConnectionsToChannel(channelId, memberUserIds) {
    try {
      const connections = this.app.channel('authenticated').connections
      for (const conn of connections) {
        if (memberUserIds.includes(conn.user?.id)) {
          this.app.channel(`channel/${channelId}`).join(conn)
        }
      }
    } catch {
      // Non-critical: connections will join on next login
    }
  }

  async _enrichChannel(channelId) {
    const channel = await this.db('channels').where('id', channelId).first()

    const participants = await this.db('channel_members')
      .join('users', 'users.id', '=', 'channel_members.user_id')
      .where('channel_members.channel_id', channelId)
      .select(
        'channel_members.user_id',
        'channel_members.role',
        'users.display_name',
        'users.avatar_url',
        'users.status'
      )

    const lastMsg = await this.db('messages')
      .where('channel_id', channelId)
      .whereNull('deleted_at')
      .max('created_at as last_message_at')
      .first()

    return {
      ...channel,
      participants,
      last_message_at: lastMsg?.last_message_at || channel.created_at
    }
  }
}

export const dms = (app) => {
  const options = {
    Model: app.get('postgresqlClient'),
    app
  }

  app.use('dms', new DmsService(options), {
    methods: ['find', 'get', 'create', 'patch'],
    events: []
  })

  const service = app.service('dms')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      create: [validate(createSchema)],
      patch: [validate(patchSchema)]
    }
  })
}
