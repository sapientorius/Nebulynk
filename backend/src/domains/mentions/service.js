import {
  isExternalNonAdmin,
  assertFindFilters,
  assertOwnMentionsFilter,
  assertMessageExists,
  assertChannelMembership,
  normalizeLimit,
  withSelfScope
} from './policy.js'

export class MentionsDomainService {
  constructor({ repository }) {
    this.repository = repository
  }

  async resolveFindAccess(params = {}) {
    const query = params.query || {}
    const user = params.user || {}

    assertFindFilters(query)
    assertOwnMentionsFilter({ user, query })

    if (query.message_id) {
      const message = await this.repository.findMessageById(query.message_id)
      assertMessageExists(message)

      if (isExternalNonAdmin({ provider: params.provider, user })) {
        const membership = await this.repository.findChannelMembership(
          message.channel_id,
          user.id
        )
        assertChannelMembership(membership)
      }
    }

    const scopedQuery = !query.message_id && !user.is_admin
      ? withSelfScope(query, user.id)
      : query

    return {
      userId: scopedQuery.user_id || null,
      messageId: scopedQuery.message_id || null,
      limit: normalizeLimit(scopedQuery.$limit),
      query: scopedQuery
    }
  }

  async listMentions({ userId, messageId, limit }) {
    return this.repository.findMentions({ userId, messageId, limit })
  }
}
