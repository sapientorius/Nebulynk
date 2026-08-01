<template>
  <n-drawer v-model:show="show" :width="400" placement="right">
    <n-drawer-content :title="$t('ui.components.pinned_messages')" closable>
      <div v-if="pinnedMessages.length === 0" class="empty-pins">
        <n-empty :description="$t('ui.components.no_pinned_messages_in_this_channel')" />
      </div>
      <div v-for="pin in pinnedMessages" :key="pin.id" class="pinned-item">
        <div class="pinned-header">
          <UserAvatar :size="24" :name="pin.author_display_name" :avatar-url="pin.author_avatar_url" />
          <span class="pinned-author">{{ pin.author_display_name }}</span>
          <span class="pinned-time">{{ formatTime(pin.message_created_at) }}</span>
        </div>
        <div class="pinned-content">{{ renderPinnedContent(pin.message_content) }}</div>
        <div class="pinned-footer">
          <span class="pinned-by">{{ $t('ui.components.pinned_by') }} {{ pin.pinned_by_display_name }}</span>
          <n-button
            v-if="canUnpin"
            quaternary
            size="tiny"
            type="error"
            @click="unpin(pin.id)"
          >
            {{ $t('ui.components.unpin') }}
          </n-button>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script>
import { useUiStore, useMessagesStore, useChannelsStore } from '../stores/index.js'
import { getCurrentLocale } from '../lib/i18n.js'
import { toPlainMessageSnippet } from '../lib/message-markdown.js'
import UserAvatar from './UserAvatar.vue'

export default {
  name: 'PinnedMessages',
  components: {
    UserAvatar
  },
  computed: {
    uiStore() {
      return useUiStore()
    },
    messagesStore() {
      return useMessagesStore()
    },
    channelsStore() {
      return useChannelsStore()
    },
    show: {
      get() { return this.uiStore.showPinnedPanel },
      set(val) { this.uiStore.showPinnedPanel = val }
    },
    pinnedMessages() {
      return this.messagesStore.pinnedMessages
    },
    canUnpin() {
      return this.channelsStore.can('pin_messages')
    }
  },
  methods: {
    getInitial(name) {
      return (name || '?')[0].toUpperCase()
    },
    formatTime(dateStr) {
      const date = new Date(dateStr)
      return date.toLocaleDateString(getCurrentLocale(), {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    },
    renderPinnedContent(content) {
      return toPlainMessageSnippet(content || '', { maxLength: 240 })
    },
    async unpin(pinId) {
      try {
        await this.messagesStore.unpin(pinId)
        window.$message?.success(this.$t('ui.components.message_unpinned'))
      } catch (error) {
        console.error('Failed to unpin message:', error)
        window.$message?.error(this.$t('ui.components.unpin_failed'))
      }
    }
  }
}
</script>

<style scoped>
.empty-pins {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

.pinned-item {
  padding: 12px;
  border-bottom: 1px solid var(--app-border-soft);
}

.pinned-item:last-child {
  border-bottom: none;
}

.pinned-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.pinned-author {
  font-weight: 600;
  font-size: 13px;
}

.pinned-time {
  font-size: 11px;
  opacity: 0.5;
  margin-left: auto;
}

.pinned-content {
  font-size: 14px;
  line-height: 1.5;
  padding-left: 32px;
  word-break: break-word;
  opacity: 0.9;
}

.pinned-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 32px;
  margin-top: 8px;
}

.pinned-by {
  font-size: 11px;
  opacity: 0.4;
}
</style>
