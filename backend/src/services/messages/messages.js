import { KnexService } from '@feathersjs/knex'
import { authenticate } from '@feathersjs/authentication'
import { setUserId } from '../../hooks/set-user-id.js'
import { isChannelMember } from '../../hooks/is-channel-member.js'
import { isChannelReadable } from '../../hooks/is-channel-readable.js'
import { checkPermission } from '../../hooks/check-permission.js'
import { parseMentions } from '../../hooks/parse-mentions.js'
import { createNotifications } from '../../hooks/create-notifications.js'
import { validate } from '../../schemas/validators.js'
import { createSchema, patchSchema, forwardSchema } from './messages.schema.js'
import { MessagesRepository } from '../../domains/messages/repository.js'
import { MessagesDomainService } from '../../domains/messages/service.js'
import { badRequest, forbidden } from '../../lib/errors.js'
import { copyStoredFile, deleteFile } from '../../lib/storage.js'
import { sanitizeFilesForExternal } from '../../lib/file-response.js'
import { createId } from '@paralleldrive/cuid2'
import { extractInternalMessageReference } from '../../domains/messages/message-links.js'
import {
  removeMessageSearchDocuments,
  upsertFileSearchDocument,
  upsertMessageSearchDocument
} from '../../lib/search-index.js'

function asArray(payload) {
  return Array.isArray(payload) ? payload : []
}

function dedupeMessagesById(items) {
  const unique = new Map()

  for (const item of items || []) {
    if (!item?.id || unique.has(item.id)) continue
    unique.set(item.id, item)
  }

  return [...unique.values()]
}

const DEFAULT_TIMELINE_LIMIT = 50
const MAX_TIMELINE_LIMIT = 100
const ANCHORED_CONTEXT_SIDE_LIMIT = 25

function buildForwardSnapshot(sourceMessage) {
  return {
    source_message_id: sourceMessage.id,
    source_channel_id: sourceMessage.channel_id,
    source_channel_name: sourceMessage.channel_name || null,
    source_author_display_name: sourceMessage.user_display_name || null,
    source_message_snippet: (sourceMessage.content || '').slice(0, 160)
  }
}

function buildForwardContent({ comment, sourceMessage }) {
  const trimmedComment = typeof comment === 'string' ? comment.trim() : ''
  if (trimmedComment) return trimmedComment
  return ''
}

function applyTimelineCursor(query, paramsQuery = {}) {
  const beforeCreatedAt = typeof paramsQuery.before === 'string' ? paramsQuery.before.trim() : ''
  const beforeId = typeof paramsQuery.before_id === 'string' ? paramsQuery.before_id.trim() : ''

  if (!beforeCreatedAt) return

  if (beforeId) {
    query.where((builder) => {
      builder
        .where('messages.created_at', '<', beforeCreatedAt)
        .orWhere((nested) => {
          nested
            .where('messages.created_at', '=', beforeCreatedAt)
            .andWhere('messages.id', '<', beforeId)
        })
    })
    return
  }

  query.where('messages.created_at', '<', beforeCreatedAt)
}

function applyForwardTimelineCursor(query, paramsQuery = {}) {
  const afterCreatedAt = typeof paramsQuery.after === 'string' ? paramsQuery.after.trim() : ''
  const afterId = typeof paramsQuery.after_id === 'string' ? paramsQuery.after_id.trim() : ''

  if (!afterCreatedAt) return

  if (afterId) {
    query.where((builder) => {
      builder
        .where('messages.created_at', '>', afterCreatedAt)
        .orWhere((nested) => {
          nested
            .where('messages.created_at', '=', afterCreatedAt)
            .andWhere('messages.id', '>', afterId)
        })
    })
    return
  }

  query.where('messages.created_at', '>', afterCreatedAt)
}

function normalizeTimelineLimit(rawLimit, fallback = DEFAULT_TIMELINE_LIMIT) {
  const limit = Number(rawLimit || fallback)
  if (!Number.isFinite(limit) || limit <= 0) return fallback
  return Math.min(limit, MAX_TIMELINE_LIMIT)
}

function buildMessagesQuery(db, channelId) {
  return db('messages')
    .join('users', 'messages.user_id', '=', 'users.id')
    .select(
      'messages.*',
      'users.display_name as user_display_name',
      'users.avatar_url as user_avatar_url'
    )
    .whereNull('messages.deleted_at')
    .where('messages.channel_id', channelId)
}

export class MessagesService extends KnexService {
  constructor(options) {
    super(options)
    this.domainService = options.domainService
    this.repository = options.repository
    this.generateId = options.generateId || createId
  }

  async find(params) {
    this.domainService.assertFindAccess(params.query)
    const channelId = params.query?.channel_id
    const db = this.options.Model
    const aroundMessageId = typeof params.query?.around_message_id === 'string'
      ? params.query.around_message_id.trim()
      : ''
    const limit = normalizeTimelineLimit(params.query?.$limit)

    if (aroundMessageId) {
      const anchorMessage = await this.repository.findMessageByIdWithAuthor(aroundMessageId)
      if (!anchorMessage || anchorMessage.deleted_at || anchorMessage.channel_id !== channelId) {
        throw badRequest('api.messages.message_not_found', {}, 'Nachricht nicht gefunden')
      }

      const beforeRows = await buildMessagesQuery(db, channelId)
        .where((builder) => {
          builder
            .where('messages.created_at', '<', anchorMessage.created_at)
            .orWhere((nested) => {
              nested
                .where('messages.created_at', '=', anchorMessage.created_at)
                .andWhere('messages.id', '<', anchorMessage.id)
            })
        })
        .orderBy('messages.created_at', 'desc')
        .orderBy('messages.id', 'desc')
        .limit(ANCHORED_CONTEXT_SIDE_LIMIT + 1)

      const afterRows = await buildMessagesQuery(db, channelId)
        .where((builder) => {
          builder
            .where('messages.created_at', '>', anchorMessage.created_at)
            .orWhere((nested) => {
              nested
                .where('messages.created_at', '=', anchorMessage.created_at)
                .andWhere('messages.id', '>', anchorMessage.id)
            })
        })
        .orderBy('messages.created_at', 'asc')
        .orderBy('messages.id', 'asc')
        .limit(ANCHORED_CONTEXT_SIDE_LIMIT + 1)

      const hasMoreBefore = beforeRows.length > ANCHORED_CONTEXT_SIDE_LIMIT
      const hasMoreAfter = afterRows.length > ANCHORED_CONTEXT_SIDE_LIMIT
      const data = dedupeMessagesById([
        ...beforeRows.slice(0, ANCHORED_CONTEXT_SIDE_LIMIT).reverse(),
        anchorMessage,
        ...afterRows.slice(0, ANCHORED_CONTEXT_SIDE_LIMIT)
      ])

      await this.attachMessageRelations(data, params)

      return {
        total: data.length,
        limit: data.length,
        has_more_before: hasMoreBefore,
        has_more_after: hasMoreAfter,
        anchor_message_id: anchorMessage.id,
        data
      }
    }

    const isForwardPagination = typeof params.query?.after === 'string' && params.query.after.trim()
    const query = buildMessagesQuery(db, channelId)

    if (isForwardPagination) {
      applyForwardTimelineCursor(query, params.query)
      query
        .orderBy('messages.created_at', 'asc')
        .orderBy('messages.id', 'asc')
        .limit(limit + 1)

      const rows = await query
      const hasMoreAfter = rows.length > limit
      const data = rows.slice(0, limit)
      await this.attachMessageRelations(data, params)

      return {
        total: data.length,
        limit,
        has_more_before: false,
        has_more_after: hasMoreAfter,
        anchor_message_id: null,
        data
      }
    }

    applyTimelineCursor(query, params.query)

    query
      .orderBy('messages.created_at', 'desc')
      .orderBy('messages.id', 'desc')
      .limit(limit + 1)

    const rows = await query
    const hasMoreBefore = rows.length > limit
    const data = rows.slice(0, limit).reverse()
    await this.attachMessageRelations(data, params)

    return {
      total: data.length,
      limit,
      has_more_before: hasMoreBefore,
      has_more_after: false,
      anchor_message_id: null,
      data
    }
  }

  async get(id, params = {}) {
    const message = await this.repository.findMessageByIdWithAuthor(id)
    if (!message || message.deleted_at) {
      throw badRequest('api.messages.message_not_found', {}, 'Nachricht nicht gefunden')
    }

    await this.assertReadableChannelAccess(message.channel_id, params)
    await this.attachMessageRelations([message], params)
    return message
  }

  async forward(data, params = {}) {
    const sourceReference = data?.source_message_id
      ? { messageId: data.source_message_id }
      : extractInternalMessageReference(data?.source_url)

    if (!sourceReference?.messageId) {
      throw badRequest('api.messages.invalid_source_link', {}, 'Ungueltiger Nachrichten-Link')
    }

    const sourceMessage = await this.repository.findMessageByIdWithAuthor(sourceReference.messageId)
    if (!sourceMessage || sourceMessage.deleted_at) {
      throw badRequest('api.messages.message_not_found', {}, 'Nachricht nicht gefunden')
    }

    await this.assertReadableChannelAccess(sourceMessage.channel_id, params)

    const duplicatedFiles = await this.duplicateForwardFiles({
      sourceMessageId: sourceMessage.id,
      forwarderId: params.user?.id
    })

    const content = buildForwardContent({
      comment: data?.comment,
      sourceMessage
    })

    try {
      return await this.create(
        {
          channel_id: data.target_channel_id,
          content,
          file_ids: duplicatedFiles.map((file) => file.id),
          forward_source_message_id: sourceMessage.id,
          forward_source_channel_id: sourceMessage.channel_id,
          forward_source_snapshot: buildForwardSnapshot(sourceMessage)
        },
        {
          ...params,
          _allowForwardMetadata: true
        }
      )
    } catch (error) {
      await this.cleanupDuplicatedForwardFiles(duplicatedFiles)
      throw error
    }
  }

  async duplicateForwardFiles({ sourceMessageId, forwarderId }) {
    if (!sourceMessageId || !forwarderId) return []

    const sourceFiles = await this.repository.findFilesByMessageId(sourceMessageId)
    if (sourceFiles.length === 0) return []

    const storageClient = this.options.app?.get('storageClient')
    const duplicatedFiles = []

    try {
      for (const sourceFile of sourceFiles) {
        const duplicatedId = this.generateId()
        const duplicatedFile = {
          id: duplicatedId,
          message_id: null,
          user_id: forwarderId,
          original_name: sourceFile.original_name,
          storage_key: `${forwarderId}/${duplicatedId}/${sourceFile.original_name}`,
          mime_type: sourceFile.mime_type,
          size: sourceFile.size,
          purpose: sourceFile.purpose || 'attachment',
          duration_ms: sourceFile.duration_ms || null,
          bucket: sourceFile.bucket,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }

        await copyStoredFile(storageClient, {
          sourceKey: sourceFile.storage_key,
          sourceBucket: sourceFile.bucket,
          targetKey: duplicatedFile.storage_key,
          targetBucket: duplicatedFile.bucket
        })
        await this.repository.createFile(duplicatedFile)
        duplicatedFiles.push(duplicatedFile)
      }

      return duplicatedFiles
    } catch (error) {
      await this.cleanupDuplicatedForwardFiles(duplicatedFiles)
      throw error
    }
  }

  async cleanupDuplicatedForwardFiles(files) {
    if (!Array.isArray(files) || files.length === 0) return

    const storageClient = this.options.app?.get('storageClient')
    await this.repository.deleteFilesByIds(files.map((file) => file.id))

    for (const file of files) {
      try {
        await deleteFile(storageClient, {
          key: file.storage_key,
          bucket: file.bucket
        })
      } catch {
        // Best effort cleanup after failed forward operations.
      }
    }
  }

  async assertReadableChannelAccess(channelId, params = {}) {
    const user = params.user
    if (!user?.id) {
      throw forbidden('api.channels.membership_required', { channel_id: channelId }, 'You are not a member of this channel')
    }

    if (user.is_admin) return

    const membership = await this.repository.findChannelMembership(channelId, user.id)
    if (!membership) {
      throw forbidden('api.channels.membership_required', { channel_id: channelId }, 'You are not a member of this channel')
    }
  }

  async attachMessageRelations(messages, params = {}) {
    const data = asArray(messages)
    if (data.length === 0) return

    const db = this.options.Model
    const messageIds = data.map((message) => message.id)

    const allReactions = await db('reactions')
      .join('users', 'reactions.user_id', '=', 'users.id')
      .whereIn('reactions.message_id', messageIds)
      .select(
        'reactions.id',
        'reactions.message_id',
        'reactions.user_id',
        'reactions.emoji',
        'users.display_name as user_display_name'
      )
      .orderBy('reactions.created_at', 'asc')

    const reactionsByMessage = {}
    for (const reaction of allReactions) {
      if (!reactionsByMessage[reaction.message_id]) {
        reactionsByMessage[reaction.message_id] = {}
      }
      const byEmoji = reactionsByMessage[reaction.message_id]
      if (!byEmoji[reaction.emoji]) {
        byEmoji[reaction.emoji] = { emoji: reaction.emoji, count: 0, users: [] }
      }
      byEmoji[reaction.emoji].count++
      byEmoji[reaction.emoji].users.push({
        id: reaction.id,
        user_id: reaction.user_id,
        display_name: reaction.user_display_name
      })
    }

    const allMentions = await db('mentions').whereIn('message_id', messageIds).select('*')
    const mentionsByMessage = {}
    for (const mention of allMentions) {
      if (!mentionsByMessage[mention.message_id]) mentionsByMessage[mention.message_id] = []
      mentionsByMessage[mention.message_id].push(mention)
    }

    const fileMessageIds = data.filter((message) => message.type === 'file').map((message) => message.id)
    let filesByMessage = {}
    if (fileMessageIds.length > 0) {
      const allFiles = await db('files')
        .whereIn('message_id', fileMessageIds)
        .select('*')
        .orderBy('created_at', 'asc')

      const storageClient = this.options.app?.get('storageClient')
      const storagePresignClient = this.options.app?.get('storagePresignClient') || storageClient
      if (storagePresignClient) {
        const { getFileUrl } = await import('../../lib/storage.js')
        for (const file of allFiles) {
          file.url = await getFileUrl(storagePresignClient, {
            key: file.storage_key,
            bucket: file.bucket
          })
        }
      }

      const voiceFileIds = allFiles
        .filter((file) => file.purpose === 'voice_message')
        .map((file) => file.id)
      if (voiceFileIds.length > 0 && params.user?.id) {
        const voiceArtifacts = await db('voice_message_artifacts')
          .where('user_id', params.user.id)
          .whereIn('file_id', voiceFileIds)
          .select('*')
        const artifactByFileId = Object.fromEntries(
          voiceArtifacts.map((artifact) => [artifact.file_id, artifact])
        )
        for (const file of allFiles) {
          if (artifactByFileId[file.id]) {
            file.voice_artifact = artifactByFileId[file.id]
          }
        }
      }

      const responseFiles = params.provider ? sanitizeFilesForExternal(allFiles) : allFiles
      filesByMessage = {}
      for (const file of responseFiles) {
        if (!filesByMessage[file.message_id]) filesByMessage[file.message_id] = []
        filesByMessage[file.message_id].push(file)
      }
    }

    await this.attachMessagePreviews(data, params)

    for (const message of data) {
      const groupedReactions = reactionsByMessage[message.id]
      message.reactions = groupedReactions ? Object.values(groupedReactions) : []
      message.mentions = mentionsByMessage[message.id] || []
      if (message.type === 'file') {
        message.files = filesByMessage[message.id] || []
      }
    }
  }

  async attachMessagePreviews(messages, params = {}) {
    const data = asArray(messages)
    if (data.length === 0) return

    const replyIds = [...new Set(data.map((message) => message.reply_to_message_id).filter(Boolean))]
    const forwardIds = [...new Set(data.map((message) => message.forward_source_message_id).filter(Boolean))]

    const [replyMessages, forwardMessages] = await Promise.all([
      this.repository.findMessagesByIdsWithAuthor(replyIds),
      this.repository.findMessagesByIdsWithAuthor(forwardIds)
    ])

    const replyById = Object.fromEntries(replyMessages.map((message) => [message.id, message]))
    const forwardById = Object.fromEntries(forwardMessages.map((message) => [message.id, message]))

    const user = params.user
    const sourceChannelIds = [...new Set(
      data
        .map((message) => message.forward_source_channel_id)
        .filter(Boolean)
    )]

    const readableSourceChannelIds = new Set()
    if (user?.is_admin) {
      for (const channelId of sourceChannelIds) readableSourceChannelIds.add(channelId)
    } else if (user?.id && sourceChannelIds.length > 0) {
      const memberships = await this.options.Model('channel_members')
        .where('user_id', user.id)
        .whereIn('channel_id', sourceChannelIds)
        .select('channel_id')
      for (const membership of memberships) {
        readableSourceChannelIds.add(membership.channel_id)
      }
    }

    for (const message of data) {
      const replyMessage = message.reply_to_message_id ? replyById[message.reply_to_message_id] : null
      message.reply_preview = replyMessage
        ? {
            id: replyMessage.id,
            channel_id: replyMessage.channel_id,
            user_id: replyMessage.user_id,
            user_display_name: replyMessage.user_display_name || null,
            content: (replyMessage.content || '').slice(0, 160),
            deleted_at: replyMessage.deleted_at || null
          }
        : null

      const snapshot = message.forward_source_snapshot || {}
      const canAccessSource = Boolean(
        message.forward_source_message_id
        && message.forward_source_channel_id
        && readableSourceChannelIds.has(message.forward_source_channel_id)
      )

      if (!message.forward_source_message_id) {
        message.forward_preview = null
        continue
      }

      const liveSource = forwardById[message.forward_source_message_id]
      message.forward_preview = {
        can_access_source: canAccessSource,
        source_message_id: canAccessSource ? message.forward_source_message_id : null,
        source_channel_id: canAccessSource ? message.forward_source_channel_id : null,
        source_channel_name: canAccessSource ? (liveSource?.channel_name || snapshot.source_channel_name || null) : null,
        source_author_display_name: canAccessSource ? (liveSource?.user_display_name || snapshot.source_author_display_name || null) : null,
        source_message_snippet: ((liveSource?.content || snapshot.source_message_snippet || '').slice(0, 160) || null),
        source_url: canAccessSource
          ? `/channels/${encodeURIComponent(message.forward_source_channel_id)}?message=${encodeURIComponent(message.forward_source_message_id)}`
          : null
      }
    }
  }

  async hydrateMessage(messageId, params = {}) {
    if (!messageId) return null

    const message = await this.repository.findMessageByIdWithAuthor(messageId)
    if (!message || message.deleted_at) return null

    await this.attachMessageRelations([message], params)
    return message
  }
}

export const messages = (app) => {
  const db = app.get('postgresqlClient')
  const repository = new MessagesRepository(db)
  const domainService = new MessagesDomainService({ repository })

  const options = {
    Model: db,
    name: 'messages',
    paginate: false,
    app,
    repository,
    domainService
  }

  app.use('messages', new MessagesService(options), {
    methods: ['find', 'get', 'create', 'patch', 'remove', 'forward'],
    events: []
  })

  const service = app.service('messages')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      create: [
        validate(createSchema),
        isChannelMember(),
        async (context) => {
          const access = await domainService.resolveCreateAccess(context.data?.channel_id)
          if (!access.skipSendPermissionCheck) {
            await checkPermission('send_messages')(context)
          }
          return context
        },
        async (context) => {
          if ((context.data?.forward_source_message_id || context.data?.forward_source_channel_id || context.data?.forward_source_snapshot)
            && !context.params._allowForwardMetadata) {
            throw badRequest('api.messages.forward_metadata_forbidden', {}, 'Forward-Metadaten sind nur ueber den Forward-Pfad erlaubt')
          }

          await domainService.resolveReplyAccess({
            channelId: context.data?.channel_id,
            replyToMessageId: context.data?.reply_to_message_id
          })

          return context
        },
        setUserId(),
        async (context) => {
          const prepared = domainService.prepareCreateData(context.data)
          context.data = prepared.data
          context.params._fileIds = prepared.fileIds
          return context
        }
      ],
      find: [
        async (context) => {
          domainService.assertFindAccess(context.params.query)
          return context
        },
        isChannelReadable()
      ],
      get: [
        async (context) => {
          const message = await repository.findMessageById(context.id)
          if (!message || message.deleted_at) {
            throw badRequest('api.messages.message_not_found', {}, 'Nachricht nicht gefunden')
          }

          context.params.query = {
            ...(context.params.query || {}),
            channel_id: message.channel_id
          }
          return isChannelReadable()(context)
        }
      ],
      patch: [
        validate(patchSchema),
        async (context) => {
          const access = await domainService.resolveMutationAccess({
            messageId: context.id,
            currentUserId: context.params.user.id,
            currentQuery: context.params.query
          })

          context.params.query = access.query

          if (access.requiresManagePermission) {
            await checkPermission('manage_messages')(context)
          }

          context.data = domainService.addEditedAt(context.data)
          return context
        }
      ],
      remove: [
        async (context) => {
          const access = await domainService.resolveMutationAccess({
            messageId: context.id,
            currentUserId: context.params.user.id,
            currentQuery: context.params.query
          })

          context.params.query = access.query

          if (access.requiresManagePermission) {
            await checkPermission('manage_messages')(context)
          }

          const deletedAtIso = new Date().toISOString()
          await domainService.softDelete(context.id, deletedAtIso)
          context.result = domainService.buildSoftDeleteResult(access.message, deletedAtIso)
          return context
        }
      ],
      forward: [
        validate(forwardSchema)
      ]
    },
    after: {
      create: [
        async (context) => {
          const user = context.params.user
          context.result.user_display_name = user.display_name
          context.result.user_avatar_url = user.avatar_url
          return context
        },
        async (context) => {
          const fileIds = context.params._fileIds
          if (!fileIds || fileIds.length === 0) return context

          const messageId = context.result.id
          await db('files')
            .whereIn('id', fileIds)
            .where('user_id', context.params.user.id)
            .whereNull('message_id')
            .update({ message_id: messageId, updated_at: new Date().toISOString() })

          const files = await db('files').whereIn('id', fileIds).select('*')
          const storageClient = context.app.get('storageClient')
          const storagePresignClient = context.app.get('storagePresignClient') || storageClient
          if (storagePresignClient) {
            const { getFileUrl } = await import('../../lib/storage.js')
            for (const file of files) {
              file.url = await getFileUrl(storagePresignClient, {
                key: file.storage_key,
                bucket: file.bucket
              })
            }
          }
          context.result.files = context.params.provider ? sanitizeFilesForExternal(files) : files
          return context
        },
        async (context) => {
          await upsertMessageSearchDocument(db, context.result.id)

          const fileIds = context.params._fileIds || []
          for (const fileId of fileIds) {
            await upsertFileSearchDocument(db, fileId)
          }
          return context
        },
        parseMentions,
        createNotifications,
        async (context) => {
          await db('channel_members')
            .where({ channel_id: context.result.channel_id, user_id: context.params.user.id })
            .update({ last_read_at: new Date().toISOString() })
          return context
        },
        async (context) => {
          await service.attachMessagePreviews([context.result], context.params)
          return context
        }
      ],
      patch: [
        async (context) => {
          await upsertMessageSearchDocument(db, context.result.id)
          const hydratedMessage = await service.hydrateMessage(context.result.id, context.params)
          if (hydratedMessage) {
            context.result = hydratedMessage
          }
          return context
        }
      ],
      remove: [
        async (context) => {
          await removeMessageSearchDocuments(db, context.result.id)
          await service.attachMessagePreviews([context.result], context.params)
          return context
        }
      ],
      forward: []
    },
    error: {}
  })
}
