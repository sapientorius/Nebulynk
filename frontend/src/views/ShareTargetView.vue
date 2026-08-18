<template>
  <section class="share-target-view" data-testid="share-target-view">
    <n-card class="share-target-card" :title="$t('share.title')" :bordered="false">
      <div v-if="loading" class="share-target-state" data-testid="share-target-loading">
        <n-spin size="medium" />
      </div>

      <n-result
        v-else-if="errorKey"
        status="error"
        :title="$t(errorKey)"
        data-testid="share-target-error"
      >
        <template #footer>
          <n-button type="primary" @click="returnToWorkspace">
            {{ $t('share.open_workspace') }}
          </n-button>
        </template>
      </n-result>

      <template v-else>
        <p class="share-target-intro">{{ $t('share.description') }}</p>

        <section v-if="sharedText" class="share-target-preview" data-testid="share-target-text-preview">
          <div class="share-target-section-title">{{ $t('share.shared_text') }}</div>
          <p>{{ sharedText }}</p>
        </section>

        <section v-if="payloadFiles.length > 0" class="share-target-preview" data-testid="share-target-files-preview">
          <div class="share-target-section-title">
            {{ $t('share.images', { count: payloadFiles.length }) }}
          </div>
          <ul class="share-target-files">
            <li v-for="file in payloadFiles" :key="file.id">
              <span>{{ file.name }}</span>
              <span>{{ formatFileSize(file.size) }}</span>
            </li>
          </ul>
        </section>

        <label class="share-target-field" for="share-target-destination">
          <span>{{ $t('share.target_label') }}</span>
          <n-select
            id="share-target-destination"
            v-model:value="selectedTargetId"
            filterable
            :loading="targetsLoading"
            :options="targetOptions"
            :placeholder="$t('share.target_placeholder')"
            data-testid="share-target-destination"
          />
        </label>

        <n-alert v-if="handoffErrorKey" type="error" :show-icon="true" data-testid="share-target-handoff-error">
          {{ $t(handoffErrorKey, handoffErrorParams) }}
        </n-alert>

        <div class="share-target-actions">
          <n-button :disabled="preparing" @click="discard">
            {{ $t('share.discard') }}
          </n-button>
          <n-button
            type="primary"
            :disabled="!selectedTargetId"
            :loading="preparing"
            data-testid="share-target-continue"
            @click="continueToTarget"
          >
            {{ $t('share.open_chat') }}
          </n-button>
        </div>
      </template>
    </n-card>
  </section>
</template>

<script>
import api from '../lib/api.js'
import { optimizeImageForUpload } from '../lib/image-upload-optimizer.js'
import {
  buildSharedMessageText,
  claimSharePayload,
  createSharePayloadFileEntries,
  hasCompatibleShareContent,
  markShareFileUploaded,
  purgeExpiredSharePayloads,
  removeSharePayload
} from '../lib/share-target.js'
import { isOptimizableImageFile } from '../lib/upload-settings.js'
import { useChannelsStore, useDmsStore, useMeetingsStore, useMessagesStore, useSessionStore, useUploadsStore } from '../stores/index.js'

class ShareTargetFlowError extends Error {
  constructor(code, params = {}) {
    super(code)
    this.code = code
    this.params = params
  }
}

function createFlowError(code, params) {
  return new ShareTargetFlowError(code, params)
}

function normalizeLabel(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function formatFileSize(value) {
  const bytes = Number(value) || 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default {
  name: 'ShareTargetView',
  data() {
    return {
      loading: true,
      targetsLoading: false,
      preparing: false,
      payload: null,
      selectedTargetId: null,
      errorKey: '',
      handoffErrorKey: '',
      handoffErrorParams: {}
    }
  },
  computed: {
    sessionStore() {
      return useSessionStore()
    },
    channelsStore() {
      return useChannelsStore()
    },
    dmsStore() {
      return useDmsStore()
    },
    meetingsStore() {
      return useMeetingsStore()
    },
    messagesStore() {
      return useMessagesStore()
    },
    uploadsStore() {
      return useUploadsStore()
    },
    shareId() {
      return typeof this.$route.params.shareId === 'string' ? this.$route.params.shareId : ''
    },
    payloadFiles() {
      return Array.isArray(this.payload?.files) ? this.payload.files : []
    },
    sharedText() {
      return buildSharedMessageText(this.payload)
    },
    targetEntries() {
      const entries = []

      for (const channel of this.dmsStore.dmChannels || []) {
        if (!channel?.id) continue
        const info = this.dmsStore.displayInfo?.(channel)
        const label = normalizeLabel(info?.name, normalizeLabel(channel.display_name, channel.name || channel.id))
        entries.push({
          id: channel.id,
          kind: channel.type === 'group' ? 'group' : 'direct',
          channelId: channel.id,
          label
        })
      }

      for (const channel of this.channelsStore.channels || []) {
        if (!channel?.id || channel.is_archived || channel.purpose === 'meeting') continue
        entries.push({
          id: channel.id,
          kind: 'channel',
          channelId: channel.id,
          label: normalizeLabel(channel.display_name, channel.name || channel.id)
        })
      }

      for (const meeting of this.meetingsStore.meetings || []) {
        if (!meeting?.id || !meeting.chat_channel_id) continue
        if (!['active', 'scheduled'].includes(meeting.status)) continue
        if (meeting.chat_channel?.is_archived) continue
        entries.push({
          id: `meeting:${meeting.id}`,
          kind: 'meeting',
          channelId: meeting.chat_channel_id,
          meetingId: meeting.id,
          label: normalizeLabel(this.meetingsStore.resolveDisplayName?.(meeting), meeting.title || meeting.chat_channel_id)
        })
      }

      return entries
    },
    targetOptions() {
      const groups = [
        { key: 'direct', label: this.$t('share.target_groups.direct'), children: [] },
        { key: 'group', label: this.$t('share.target_groups.groups'), children: [] },
        { key: 'channel', label: this.$t('share.target_groups.channels'), children: [] },
        { key: 'meeting', label: this.$t('share.target_groups.meetings'), children: [] }
      ]
      const groupByKind = Object.fromEntries(groups.map((group) => [group.key, group]))

      for (const entry of this.targetEntries) {
        const group = groupByKind[entry.kind]
        if (!group) continue
        const prefix = entry.kind === 'channel' ? '# ' : entry.kind === 'meeting' ? '◉ ' : '@ '
        group.children.push({
          label: `${prefix}${entry.label}`,
          value: entry.id
        })
      }

      return groups
        .filter((group) => group.children.length > 0)
        .map((group) => ({ ...group, type: 'group' }))
    },
    selectedTarget() {
      return this.targetEntries.find((entry) => entry.id === this.selectedTargetId) || null
    }
  },
  watch: {
    shareId() {
      this.loadShare()
    }
  },
  async created() {
    await this.loadShare()
  },
  methods: {
    formatFileSize,
    async loadShare() {
      this.loading = true
      this.payload = null
      this.selectedTargetId = null
      this.errorKey = ''
      this.handoffErrorKey = ''
      this.handoffErrorParams = {}

      if (!this.shareId) {
        this.errorKey = this.$route.query.error === 'storage'
          ? 'share.errors.storage'
          : 'share.errors.unavailable'
        this.loading = false
        return
      }

      try {
        await purgeExpiredSharePayloads()
        const claimed = await claimSharePayload(this.shareId, this.sessionStore.user?.id)
        if (!claimed?.payload) {
          this.errorKey = claimed?.reason === 'owner_mismatch'
            ? 'share.errors.account_mismatch'
            : 'share.errors.unavailable'
          return
        }
        if (!hasCompatibleShareContent(claimed.payload)) {
          await removeSharePayload(this.shareId)
          this.errorKey = 'share.errors.no_content'
          return
        }

        this.payload = claimed.payload
        await this.refreshTargets()
      } catch (error) {
        console.error('Failed to load shared content:', error)
        this.errorKey = 'share.errors.storage'
      } finally {
        this.loading = false
      }
    },
    async refreshTargets() {
      this.targetsLoading = true
      try {
        await Promise.allSettled([
          this.channelsStore.refresh({ force: true }),
          this.dmsStore.refresh({ force: true }),
          this.meetingsStore.refresh(true)
        ])
      } finally {
        this.targetsLoading = false
      }
    },
    async ensureWritableTarget(target) {
      if (!target) throw createFlowError('target_unavailable')

      if (target.kind === 'direct' || target.kind === 'group') {
        let channel = null
        try {
          channel = await this.dmsStore.refreshChannel(target.channelId)
        } catch {
          throw createFlowError('target_unavailable')
        }
        if (!channel) throw createFlowError('target_unavailable')
        return {
          channelId: channel.id,
          route: `/channels/${encodeURIComponent(channel.id)}`
        }
      }

      if (target.kind === 'meeting') {
        let meeting = null
        try {
          meeting = await this.meetingsStore.ensureMeetingLoaded(target.meetingId, { force: true })
        } catch {
          throw createFlowError('target_unavailable')
        }

        if (!meeting?.chat_channel_id || !['active', 'scheduled'].includes(meeting.status) || meeting.chat_channel?.is_archived) {
          throw createFlowError('target_unavailable')
        }

        const channel = await this.refreshWritableChannel(meeting.chat_channel_id)
        return {
          channelId: channel.id,
          route: `/meetings/${encodeURIComponent(meeting.id)}`
        }
      }

      const channel = await this.refreshWritableChannel(target.channelId)
      return {
        channelId: channel.id,
        route: `/channels/${encodeURIComponent(channel.id)}`
      }
    },
    async refreshWritableChannel(channelId) {
      let channel = null
      try {
        channel = await this.channelsStore.refreshChannel(channelId)
      } catch {
        throw createFlowError('target_unavailable')
      }

      if (!channel || channel.is_archived) {
        throw createFlowError('target_unavailable')
      }

      try {
        const { data } = await api.get('/my-permissions', {
          params: { channel_id: channelId }
        })
        if (!data?.isAdmin && !data?.permissions?.includes('send_messages')) {
          throw createFlowError('not_writable')
        }
      } catch (error) {
        if (error instanceof ShareTargetFlowError) throw error
        throw createFlowError('not_writable')
      }

      return channel
    },
    async prepareDraftFiles(payload) {
      const settings = await this.uploadsStore.loadUploadSettings()
      let currentPayload = payload
      const uploadedFiles = []

      for (const entry of createSharePayloadFileEntries(currentPayload)) {
        let uploaded = entry.uploaded_file
        if (!uploaded?.id) {
          if (!entry.file) {
            throw createFlowError('unavailable')
          }

          let fileToUpload = entry.file
          if (isOptimizableImageFile(entry.file)) {
            const optimized = await optimizeImageForUpload(entry.file, settings)
            fileToUpload = optimized.file || entry.file
          }

          if (fileToUpload.size > settings.maxFileSizeBytes) {
            throw createFlowError('file_too_large', {
              file_name: entry.file.name,
              max_size_mb: settings.maxFileSizeMb
            })
          }

          uploaded = await this.uploadsStore.upload(fileToUpload)
          currentPayload = await markShareFileUploaded(currentPayload.id, entry.id, uploaded)
          if (!currentPayload) {
            throw createFlowError('unavailable')
          }
        }
        uploadedFiles.push(uploaded)
      }

      return {
        payload: currentPayload,
        uploadedFiles
      }
    },
    async continueToTarget() {
      if (!this.selectedTarget || !this.payload || this.preparing) return

      this.preparing = true
      this.handoffErrorKey = ''
      this.handoffErrorParams = {}

      try {
        const target = await this.ensureWritableTarget(this.selectedTarget)
        const claimed = await claimSharePayload(this.shareId, this.sessionStore.user?.id)
        if (!claimed?.payload) {
          throw createFlowError(claimed?.reason === 'owner_mismatch' ? 'account_mismatch' : 'unavailable')
        }

        const prepared = await this.prepareDraftFiles(claimed.payload)
        this.messagesStore.appendDraftContent(target.channelId, {
          text: buildSharedMessageText(prepared.payload),
          files: prepared.uploadedFiles
        })
        await removeSharePayload(this.shareId)
        await this.$router.push(target.route)
      } catch (error) {
        console.error('Failed to hand off shared content:', error)
        this.handoffErrorKey = `share.errors.${error?.code || 'handoff_failed'}`
        this.handoffErrorParams = error?.params || {}
      } finally {
        this.preparing = false
      }
    },
    async discard() {
      if (this.preparing) return
      try {
        await removeSharePayload(this.shareId)
      } catch (error) {
        console.error('Failed to discard shared content:', error)
      }
      await this.returnToWorkspace()
    },
    async returnToWorkspace() {
      await this.$router.replace('/channels').catch(() => {})
    }
  }
}
</script>

<style scoped>
.share-target-view {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-width: 0;
  overflow: auto;
  padding: 20px;
  background:
    radial-gradient(circle at top, rgba(var(--theme-primary-rgb), 0.12), transparent 40%),
    var(--app-bg);
}

.share-target-card {
  width: min(100%, 620px);
}

.share-target-state {
  display: flex;
  min-height: 180px;
  align-items: center;
  justify-content: center;
}

.share-target-intro {
  margin: 0 0 16px;
  color: var(--app-text-muted);
  line-height: 1.5;
}

.share-target-preview {
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid var(--app-border-soft);
  border-radius: 10px;
  background: var(--app-surface-muted);
}

.share-target-section-title {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}

.share-target-preview p {
  max-height: 180px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.share-target-files {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.share-target-files li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  font-size: 13px;
}

.share-target-files li span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-target-files li span:last-child {
  flex: 0 0 auto;
  color: var(--app-text-muted);
}

.share-target-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 18px 0 12px;
  font-size: 13px;
  font-weight: 600;
}

.share-target-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

@media (max-width: 700px) {
  .share-target-view {
    align-items: stretch;
    padding: 12px;
  }

  .share-target-card {
    width: 100%;
    align-self: flex-start;
  }
}
</style>
