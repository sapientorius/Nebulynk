import {
  isExternalNonAdmin,
  assertOwnUserScope,
  assertFileExists,
  assertMessageExists,
  requiresMessageReadAccess,
  resolveRemovePermission,
  normalizeLimit,
  withChannelQuery
} from './policy.js'

export class FilesDomainService {
  constructor({ repository }) {
    this.repository = repository
  }

  async resolveFindAccess(params = {}) {
    const query = params.query || {}
    assertOwnUserScope({ provider: params.provider, user: params.user, query })

    if (query.message_id) {
      await this.assertMessageReadable(query.message_id, params)
    }

    return {
      messageId: query.message_id || null,
      userId: query.user_id || null,
      limit: normalizeLimit(query.$limit),
      currentUserId: params.user?.id || null,
      restrictToAccessibleScope: !query.message_id && isExternalNonAdmin({
        provider: params.provider,
        user: params.user
      })
    }
  }

  async listFiles(access) {
    return this.repository.findFiles(access)
  }

  async resolveGetAccess(fileId, params = {}) {
    const file = await this.repository.findFileById(fileId)
    assertFileExists(file)

    if (isExternalNonAdmin({ provider: params.provider, user: params.user })) {
      const needsMessageScope = requiresMessageReadAccess({
        file,
        currentUserId: params.user.id
      })

      if (needsMessageScope) {
        await this.assertMessageReadable(file.message_id, params)
      }
    }

    return { file }
  }

  async resolveRemoveAccess(fileId, params = {}) {
    const file = await this.repository.findFileById(fileId)
    assertFileExists(file)

    if (!isExternalNonAdmin({ provider: params.provider, user: params.user })) {
      return {
        file,
        requiresManagePermission: false,
        permissionQuery: params.query || {}
      }
    }

    const permission = resolveRemovePermission({
      file,
      currentUserId: params.user.id
    })

    if (!permission.requiresManagePermission) {
      return {
        file,
        requiresManagePermission: false,
        permissionQuery: params.query || {}
      }
    }

    const message = await this.assertMessageReadable(file.message_id, params)

    return {
      file,
      requiresManagePermission: true,
      permissionQuery: withChannelQuery(params.query, message.channel_id)
    }
  }

  async deleteFile(fileId) {
    await this.repository.deleteFileById(fileId)
  }

  async assertMessageReadable(messageId, params = {}) {
    const message = await this.repository.findMessageById(messageId)
    assertMessageExists(message)

    if (!isExternalNonAdmin({ provider: params.provider, user: params.user })) {
      return message
    }

    await this.repository.assertCanReadChannel(message.channel_id, params.user)
    return message
  }
}
