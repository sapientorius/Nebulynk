<template>
  <n-modal v-model:show="show">
    <n-card
      :title="$t('ui.components.forward_message')"
      style="max-width: 520px; width: 100%"
      data-testid="forward-message-modal"
    >
      <div v-if="sourceMessage" class="source-preview">
        <div class="source-label">{{ $t('ui.components.forwarding_message') }}</div>
        <div class="source-author">{{ sourceMessage.user_display_name || $t('ui.components.unknown') }}</div>
        <div class="source-content">{{ sourceSnippet }}</div>
        <div v-if="forwardedFileSummary" class="source-files" data-testid="forward-source-files">
          {{ forwardedFileSummary }}
        </div>
      </div>

      <n-select
        v-model:value="targetChannelId"
        :options="targetOptions"
        :placeholder="$t('ui.components.select_target_channel')"
        filterable
        style="margin-bottom: 12px"
      />

      <n-input
        v-model:value="comment"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 6 }"
        :placeholder="$t('ui.components.add_comment_optional')"
      />

      <template #footer>
        <n-space justify="end">
          <n-button @click="show = false">{{ $t('common.cancel') }}</n-button>
          <n-button type="primary" :disabled="!targetChannelId" :loading="submitting" @click="submit">
            {{ $t('ui.components.forward') }}
          </n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<script>
import { useChannelsStore, useDmsStore, useMessagesStore } from '../stores/index.js'
import { summarizeForwardFiles } from '../lib/forward-preview.js'
import { toPlainMessageSnippet } from '../lib/message-markdown.js'

export default {
  name: 'ForwardMessageModal',
  data() {
    return {
      targetChannelId: null,
      comment: '',
      submitting: false
    }
  },
  computed: {
    channelsStore() {
      return useChannelsStore()
    },
    dmsStore() {
      return useDmsStore()
    },
    messagesStore() {
      return useMessagesStore()
    },
    show: {
      get() {
        return Boolean(this.messagesStore.forwardContext)
      },
      set(value) {
        if (!value) this.close()
      }
    },
    sourceMessage() {
      return this.messagesStore.forwardContext
    },
    sourceSnippet() {
      return toPlainMessageSnippet(this.sourceMessage?.content || '', { maxLength: 200 })
    },
    forwardedFileSummary() {
      return summarizeForwardFiles(this.sourceMessage?.files || [], (key, params) => this.$t(key, params))
    },
    targetOptions() {
      const channelOptions = this.channelsStore.channels
        .filter((channel) => !channel.is_archived && channel.purpose !== 'meeting')
        .map((channel) => ({
          label: `# ${channel.name}`,
          value: channel.id
        }))

      const dmOptions = this.dmsStore.dmChannels.map((channel) => {
        const info = this.dmsStore.displayInfo(channel)
        return {
          label: info.name,
          value: channel.id
        }
      })

      return [...channelOptions, ...dmOptions]
    }
  },
  watch: {
    sourceMessage: {
      immediate: true,
      handler(message) {
        if (!message) {
          this.targetChannelId = null
          this.comment = ''
          this.submitting = false
          return
        }

        this.targetChannelId = this.channelsStore.activeChannelId
        this.comment = ''
        this.submitting = false
      }
    }
  },
  methods: {
    close() {
      this.messagesStore.closeForward()
      this.targetChannelId = null
      this.comment = ''
      this.submitting = false
    },
    async submit() {
      if (!this.sourceMessage?.id || !this.targetChannelId) return

      this.submitting = true
      try {
        await this.messagesStore.forward({
          sourceMessageId: this.sourceMessage.id,
          targetChannelId: this.targetChannelId,
          comment: this.comment
        })
        window.$message?.success(this.$t('ui.components.message_forwarded'))
        this.close()
      } catch (error) {
        console.error('Failed to forward message:', error)
        window.$message?.error(this.$t('ui.components.forward_failed'))
      } finally {
        this.submitting = false
      }
    }
  }
}
</script>

<style scoped>
.source-preview {
  padding: 12px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: var(--app-surface-muted);
  border: 1px solid var(--app-border-soft);
}

.source-label {
  font-size: 12px;
  opacity: 0.65;
  margin-bottom: 4px;
}

.source-author {
  font-weight: 600;
  margin-bottom: 4px;
}

.source-content {
  white-space: pre-wrap;
  opacity: 0.85;
}

.source-files {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.75;
  white-space: pre-wrap;
}
</style>
