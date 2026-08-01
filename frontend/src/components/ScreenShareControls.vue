<template>
  <n-space :size="6" align="center">
    <n-popover v-if="canStart && !hasActiveShare" trigger="click" placement="bottom-end">
      <template #trigger>
        <n-button
          quaternary
          circle
          size="small"
          :data-testid="testId('share-trigger-idle')"
          :title="$t('ui.views.start_screen_share')"
        >
          <template #icon><n-icon size="16"><desktop-icon /></n-icon></template>
        </n-button>
      </template>
      <div class="share-popover">
        <div class="share-popover-field">
          <span class="share-popover-label">{{ $t('ui.views.screen_share_sender_quality') }}</span>
          <n-select
            :value="voiceStore.screenSharePublishQuality"
            :options="sharePublishQualityOptions"
            size="small"
            :data-testid="testId('screen-share-quality-select')"
            @update:value="onScreenShareQualityChange"
          />
        </div>
        <n-checkbox v-model:checked="shareSystemAudio" size="small">
          {{ $t('ui.views.share_system_audio') }}
        </n-checkbox>
        <n-button type="primary" size="small" block :data-testid="testId('start-screen-share')" @click="startScreenShare">
          {{ $t('ui.views.start_screen_share') }}
        </n-button>
      </div>
    </n-popover>

    <n-badge
      v-else-if="hasActiveShare"
      dot
      type="success"
      :offset="[-2, 2]"
      :class="{ 'share-hidden-indicator': shareHidden }"
    >
      <n-button
        quaternary
        circle
        size="small"
        :data-testid="testId('share-trigger-active')"
        :title="$t('ui.views.show_screen_share')"
        @click="showActiveShare"
      >
        <template #icon><n-icon size="16"><desktop-icon /></n-icon></template>
      </n-button>
    </n-badge>

    <n-button
      v-if="isLocalActiveShare"
      quaternary
      circle
      size="small"
      type="error"
      :data-testid="testId('stop-screen-share-header')"
      :title="$t('ui.views.stop_screen_share')"
      @click="stopScreenShare"
    >
      <template #icon><n-icon size="16"><stop-icon /></n-icon></template>
    </n-button>
  </n-space>
</template>

<script>
import {
  DesktopOutline as DesktopIcon,
  SquareOutline as StopIcon
} from '@vicons/ionicons5'
import { pickFeaturedScreenShare } from '../lib/screen-share.js'
import { useUiStore } from '../stores/ui.js'
import { useVoiceStore } from '../stores/voice.js'

export default {
  name: 'ScreenShareControls',
  components: {
    DesktopIcon,
    StopIcon
  },
  props: {
    channelId: {
      type: String,
      default: null
    },
    canStart: {
      type: Boolean,
      default: false
    },
    shareHidden: {
      type: Boolean,
      default: false
    },
    testIdPrefix: {
      type: String,
      default: 'meeting'
    }
  },
  data() {
    return {
      shareSystemAudio: true
    }
  },
  computed: {
    uiStore() {
      return useUiStore()
    },
    voiceStore() {
      return useVoiceStore()
    },
    channelShares() {
      if (!this.channelId) return []
      return this.voiceStore.screenSharesByChannel[this.channelId] || []
    },
    activeShare() {
      return pickFeaturedScreenShare(this.channelShares, this.voiceStore.pinnedShareParticipantId)
    },
    hasActiveShare() {
      return !!this.activeShare
    },
    isLocalActiveShare() {
      return !!this.activeShare?.isLocal
    },
    sharePublishQualityOptions() {
      return [
        { label: this.$t('ui.views.screen_share_quality_performance'), value: 'performance' },
        { label: this.$t('ui.views.screen_share_quality_balanced'), value: 'balanced' },
        { label: this.$t('ui.views.screen_share_quality_sharp'), value: 'sharp' }
      ]
    }
  },
  methods: {
    testId(suffix) {
      return `${this.testIdPrefix}-${suffix}`
    },
    async startScreenShare() {
      try {
        await this.voiceStore.startScreenShare({
          audio: this.shareSystemAudio,
          qualityProfile: this.voiceStore.screenSharePublishQuality
        })
        this.uiStore.openScreenSharePanel()
      } catch {
        window.$message?.error(this.voiceStore.screenShareError || this.$t('ui.components.screen_share_start_failed'))
      }
    },
    onScreenShareQualityChange(value) {
      this.voiceStore.setScreenSharePublishQuality(value)
    },
    async stopScreenShare() {
      try {
        await this.voiceStore.stopScreenShare()
        this.uiStore.resetScreenShareVisibility()
      } catch {
        window.$message?.error(this.voiceStore.screenShareError || this.$t('ui.components.screen_share_stop_failed'))
      }
    },
    showActiveShare() {
      this.uiStore.openScreenSharePanel()
    }
  }
}
</script>

<style scoped>
.share-popover {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 220px;
}

.share-popover-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.share-popover-label {
  font-size: 12px;
  font-weight: 700;
}

.share-hidden-indicator :deep(.n-badge-sup) {
  animation: share-hidden-pulse 2.4s ease-in-out infinite;
  transform: none;
  box-shadow: 0 0 0 0 rgba(99, 226, 183, 0.45);
}

@keyframes share-hidden-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(99, 226, 183, 0.45);
    opacity: 1;
  }
  70% {
    box-shadow: 0 0 0 6px rgba(99, 226, 183, 0);
    opacity: 0.88;
  }
  100% {
    box-shadow: 0 0 0 0 rgba(99, 226, 183, 0);
    opacity: 1;
  }
}
</style>
