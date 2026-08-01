<template>
  <section
    class="screen-share-panel"
    :class="{
      maximized: maximized,
      windowed: mode === 'windowed'
    }"
    :data-testid="testId('screen-share-panel')"
  >
    <div class="screen-share-header">
      <div>
        <div class="screen-share-title">{{ $t('ui.views.screen_share') }}</div>
        <div class="screen-share-subtitle">
          <template v-if="activeShare">
            {{ presenterLabel }}
          </template>
          <template v-else>
            {{ resolvedEmptyStateLabel }}
          </template>
        </div>
      </div>

      <n-space :size="8" align="center">
        <n-popover v-if="activeShare && !isLocalActiveShare" trigger="click" placement="bottom-end">
          <template #trigger>
            <n-button
              quaternary
              circle
              size="small"
              :data-testid="testId('screen-share-quality-trigger')"
              :title="$t('ui.views.screen_share_viewer_quality')"
            >
              <template #icon><n-icon size="16"><options-icon /></n-icon></template>
            </n-button>
          </template>
          <div class="screen-share-quality-popover">
            <div class="screen-share-quality-copy">
              <span class="screen-share-quality-label">{{ $t('ui.views.screen_share_viewer_quality') }}</span>
              <span class="screen-share-quality-hint">{{ $t('ui.views.screen_share_viewer_quality_hint') }}</span>
            </div>
            <n-select
              :value="voiceStore.screenShareViewQuality"
              :options="viewQualityOptions"
              size="small"
              class="screen-share-quality-select"
              :data-testid="testId('screen-share-view-quality')"
              @update:value="onViewQualityChange"
            />
          </div>
        </n-popover>

        <n-button
          v-if="activeShare && canHide"
          quaternary
          size="small"
          :data-testid="testId('hide-screen-share-panel')"
          @click="$emit('hide')"
        >
          <template #icon><n-icon size="16"><hide-icon /></n-icon></template>
          {{ $t('ui.views.hide_screen_share') }}
        </n-button>

        <n-button
          v-if="showChatToggle"
          quaternary
          size="small"
          :data-testid="shareChatOpen ? testId('hide-screen-share-chat') : testId('show-screen-share-chat')"
          @click="$emit('toggle-chat')"
        >
          <template #icon><n-icon size="16"><chat-icon /></n-icon></template>
          {{ shareChatOpen ? $t('ui.views.hide_screen_share_chat') : $t('ui.views.show_screen_share_chat') }}
        </n-button>

        <n-button
          v-if="activeShare && canToggleMaximize"
          quaternary
          size="small"
          :data-testid="maximized ? testId('restore-screen-share') : testId('maximize-screen-share')"
          @click="$emit('toggle-maximize')"
        >
          <template #icon><n-icon size="16"><expand-icon v-if="!maximized" /><contract-icon v-else /></n-icon></template>
          {{ maximized ? $t('ui.views.restore_screen_share') : $t('ui.views.maximize_screen_share') }}
        </n-button>

        <n-button
          v-if="activeShare && canOpenWindow"
          quaternary
          size="small"
          :data-testid="testId('open-screen-share-window')"
          @click="$emit('open-window')"
        >
          <template #icon><n-icon size="16"><open-icon /></n-icon></template>
          {{ $t('ui.views.open_screen_share_window') }}
        </n-button>

        <n-button
          v-if="isLocalActiveShare"
          type="error"
          size="small"
          :data-testid="testId('stop-screen-share')"
          @click="onStopShare"
        >
          <template #icon><n-icon size="16"><stop-icon /></n-icon></template>
          {{ $t('ui.views.stop_screen_share') }}
        </n-button>

        <n-button
          v-if="activeShare && !isPinnedActiveShare"
          quaternary
          size="small"
          :data-testid="testId('pin-screen-share')"
          @click="onPinShare"
        >
          <template #icon><n-icon size="16"><pin-icon /></n-icon></template>
          {{ $t('ui.views.pin_screen_share') }}
        </n-button>

        <n-button
          v-if="activeShare && isPinnedActiveShare"
          quaternary
          size="small"
          :data-testid="testId('unpin-screen-share')"
          @click="onClearPin"
        >
          <template #icon><n-icon size="16"><pin-off-icon /></n-icon></template>
          {{ $t('ui.views.unpin_screen_share') }}
        </n-button>
      </n-space>
    </div>

    <div v-if="activeShare" class="screen-share-stage">
      <video
        ref="screenVideo"
        class="screen-share-video"
        autoplay
        playsinline
        :muted="activeShare.isLocal"
        :data-testid="testId('screen-share-video')"
      />
      <div class="screen-share-meta">
        <span>{{ presenterLabel }}</span>
        <span v-if="activeShare.hasAudio" class="screen-share-audio-pill">
          <n-icon size="12"><volume-high-icon /></n-icon>
          {{ $t('ui.views.screen_share_includes_audio') }}
        </span>
      </div>
    </div>

    <div v-else-if="showIdleState" class="screen-share-empty-state">
      <n-icon size="20"><desktop-icon /></n-icon>
      <span>{{ resolvedEmptyStateLabel }}</span>
    </div>
  </section>
</template>

<script>
import {
  ChatbubbleEllipsesOutline as ChatIcon,
  ContractOutline as ContractIcon,
  DesktopOutline as DesktopIcon,
  ExpandOutline as ExpandIcon,
  EyeOffOutline as HideIcon,
  OpenOutline as OpenIcon,
  OptionsOutline as OptionsIcon,
  PinOutline as PinIcon,
  PinSharp as PinOffIcon,
  SquareOutline as StopIcon,
  VolumeHighOutline as VolumeHighIcon
} from '@vicons/ionicons5'
import { pickFeaturedScreenShare } from '../lib/screen-share.js'
import { useVoiceStore } from '../stores/voice.js'

export default {
  name: 'MeetingScreenSharePanel',
  components: {
    ChatIcon,
    ContractIcon,
    DesktopIcon,
    ExpandIcon,
    HideIcon,
    OpenIcon,
    OptionsIcon,
    PinIcon,
    PinOffIcon,
    StopIcon,
    VolumeHighIcon
  },
  props: {
    meeting: {
      type: Object,
      default: null
    },
    channelId: {
      type: String,
      default: null
    },
    shareAvailable: {
      type: Boolean,
      default: true
    },
    emptyStateMessage: {
      type: String,
      default: ''
    },
    testIdPrefix: {
      type: String,
      default: 'meeting'
    },
    mode: {
      type: String,
      default: 'embedded'
    },
    maximized: {
      type: Boolean,
      default: false
    },
    showIdleState: {
      type: Boolean,
      default: false
    },
    canToggleMaximize: {
      type: Boolean,
      default: false
    },
    canOpenWindow: {
      type: Boolean,
      default: false
    },
    canHide: {
      type: Boolean,
      default: false
    },
    showChatToggle: {
      type: Boolean,
      default: false
    },
    shareChatOpen: {
      type: Boolean,
      default: false
    }
  },
  emits: ['hide', 'toggle-chat', 'toggle-maximize', 'open-window'],
  data() {
    return {
      attachedTrack: null
    }
  },
  computed: {
    voiceStore() {
      return useVoiceStore()
    },
    shareChannelId() {
      return this.channelId || this.meeting?.chat_channel_id || null
    },
    channelShares() {
      if (!this.shareChannelId) return []
      return this.voiceStore.screenSharesByChannel[this.shareChannelId] || []
    },
    activeShare() {
      return pickFeaturedScreenShare(this.channelShares, this.voiceStore.pinnedShareParticipantId)
    },
    isLocalActiveShare() {
      return !!this.activeShare?.isLocal
    },
    isPinnedActiveShare() {
      return !!this.activeShare
        && this.voiceStore.pinnedShareParticipantId === this.activeShare.participantId
    },
    presenterLabel() {
      const name = this.activeShare?.participantName || this.$t('ui.components.unknown')
      return this.$t('ui.views.screen_share_presented_by', { name })
    },
    viewQualityOptions() {
      return [
        { label: this.$t('ui.views.screen_share_quality_auto'), value: 'auto' },
        { label: this.$t('ui.views.screen_share_quality_high'), value: 'high' },
        { label: this.$t('ui.views.screen_share_quality_medium'), value: 'medium' },
        { label: this.$t('ui.views.screen_share_quality_low'), value: 'low' }
      ]
    },
    resolvedEmptyStateLabel() {
      if (this.emptyStateMessage) {
        return this.emptyStateMessage
      }
      if (!this.shareAvailable) {
        return this.$t('ui.views.screen_share_unavailable')
      }
      if (this.voiceStore.channelId !== this.shareChannelId || !this.voiceStore.connected) {
        return this.$t('ui.views.join_call_to_share_screen')
      }
      if (this.voiceStore.screenShareError) {
        return this.voiceStore.screenShareError
      }
      return this.$t('ui.views.screen_share_empty')
    }
  },
  watch: {
    'activeShare.track': {
      immediate: true,
      handler() {
        this.$nextTick(() => {
          this.syncAttachedTrack()
        })
      }
    },
    'voiceStore.screenShareViewQuality'() {
      this.$nextTick(() => {
        this.applyViewerQuality()
      })
    }
  },
  methods: {
    testId(suffix) {
      return `${this.testIdPrefix}-${suffix}`
    },
    detachCurrentTrack() {
      if (!this.attachedTrack) return
      const elements = this.attachedTrack.detach?.(this.$refs.screenVideo)
      if (Array.isArray(elements)) {
        elements.forEach((element) => {
          if (element !== this.$refs.screenVideo) {
            element?.remove?.()
          }
        })
      }
      this.attachedTrack = null
    },
    syncAttachedTrack() {
      const videoElement = this.$refs.screenVideo
      const track = this.activeShare?.track || null

      if (!videoElement || !track) {
        this.detachCurrentTrack()
        return
      }

      if (this.attachedTrack === track) return

      this.detachCurrentTrack()
      track.attach?.(videoElement)
      this.attachedTrack = track
      this.applyViewerQuality()
    },
    applyViewerQuality() {
      if (!this.activeShare || this.activeShare.isLocal) return
      this.voiceStore.applyScreenShareViewQuality(this.activeShare, this.$refs.screenVideo || null)
    },
    async onStopShare() {
      try {
        await this.voiceStore.stopScreenShare()
      } catch {
        window.$message?.error(this.voiceStore.screenShareError || this.$t('ui.components.screen_share_stop_failed'))
      }
    },
    onPinShare() {
      if (!this.activeShare?.participantId) return
      this.voiceStore.pinScreenShare(this.activeShare.participantId)
    },
    onClearPin() {
      this.voiceStore.clearPinnedScreenShare()
    },
    onViewQualityChange(value) {
      this.voiceStore.setScreenShareViewQuality(value)
      this.applyViewerQuality()
    }
  },
  beforeUnmount() {
    this.detachCurrentTrack()
  }
}
</script>

<style scoped>
.screen-share-panel {
  border-bottom: 1px solid var(--app-border);
  padding: 12px 16px;
  background:
    linear-gradient(135deg, var(--app-primary-soft), var(--app-primary-softer)),
    var(--app-surface);
}

.screen-share-panel.maximized {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 10px 12px 12px;
}

.screen-share-panel.windowed {
  min-height: 100vh;
  border-bottom: 0;
}

.screen-share-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.screen-share-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.screen-share-subtitle {
  font-size: 12px;
  opacity: 0.75;
  margin-top: 2px;
}

.screen-share-stage {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.screen-share-quality-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.screen-share-quality-popover {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 220px;
}

.screen-share-quality-label {
  font-size: 12px;
  font-weight: 700;
}

.screen-share-quality-hint {
  font-size: 11px;
  opacity: 0.68;
}

.screen-share-quality-select {
  width: min(220px, 48vw);
  flex-shrink: 0;
}

.screen-share-panel.maximized .screen-share-stage,
.screen-share-panel.windowed .screen-share-stage {
  flex: 1;
  min-height: 0;
}

.screen-share-video {
  width: 100%;
  max-height: 320px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.35);
  object-fit: contain;
}

.screen-share-panel.maximized .screen-share-video,
.screen-share-panel.windowed .screen-share-video {
  flex: 1;
  max-height: none;
  min-height: 0;
}

.screen-share-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  opacity: 0.82;
}

.screen-share-audio-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(var(--theme-primary-rgb), 0.14);
  color: var(--theme-primary);
}

.screen-share-empty-state {
  min-height: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px dashed var(--app-border-strong);
  border-radius: 12px;
  opacity: 0.72;
  text-align: center;
  padding: 12px;
}

@media (max-width: 900px) {
  .screen-share-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .screen-share-quality-select {
    width: 100%;
  }
}
</style>
