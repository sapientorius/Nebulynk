<template>
  <div
    v-if="voiceChannelId"
    ref="root"
    class="voice-controls"
    :class="[`voice-controls-${variant}`, { 'voice-controls-dragging': isDraggingFloating }]"
    :data-variant="variant"
    :style="floatingStyle"
    data-testid="voice-controls"
  >
    <div class="voice-info">
      <div
        v-if="isFloatingVariant"
        class="voice-drag-handle"
        data-testid="voice-drag-handle"
        @pointerdown="onFloatingPointerDown"
      >
        <n-icon size="14" aria-hidden="true"><reorder-icon /></n-icon>
      </div>
      <n-icon class="voice-icon" size="14"><volume-high-icon /></n-icon>
      <button
        type="button"
        class="voice-channel-name voice-channel-link"
        :title="voiceChannelName"
        @click="onOpenVoiceChannel"
      >
        {{ voiceChannelName }}
      </button>
      <span v-if="voiceConnecting" class="voice-status connecting" data-testid="voice-status-connecting">{{ $t('ui.components.connecting') }}</span>
      <span v-else-if="!voiceConnected" class="voice-status disconnected" data-testid="voice-status-disconnected">{{ $t('ui.components.disconnected') }}</span>
      <span v-else class="voice-status connected" data-testid="voice-status-connected">{{ $t('ui.components.connected') }}</span>
    </div>

    <div v-if="screenShareStatusLabel" class="screen-share-status" data-testid="voice-screen-share-status">
      <n-icon size="13"><desktop-icon /></n-icon>
      <span>{{ screenShareStatusLabel }}</span>
    </div>

    <div
      v-if="voiceTranscriptionRecordingLabel"
      class="voice-recording-status"
      :class="{ paused: voiceTranscriptionRecordingPaused }"
      data-testid="voice-transcription-recording-status"
    >
      <span class="voice-recording-dot"></span>
      <span>{{ voiceTranscriptionRecordingLabel }}</span>
    </div>

    <div v-if="voiceConnecting" class="voice-buttons">
      <n-spin :size="16" />
      <span style="font-size: 12px; opacity: 0.6">{{ $t('ui.components.connecting') }}</span>

      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button size="small" type="error" quaternary data-testid="voice-leave" @click="onLeave">
            <n-icon size="16"><call-icon /></n-icon>
          </n-button>
        </template>
        {{ $t('ui.components.disconnect') }}
      </n-tooltip>
    </div>

    <div v-else-if="!voiceConnected" class="voice-buttons">
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button size="small" type="success" quaternary data-testid="voice-reconnect" @click="onReconnect">
            <n-icon size="16"><sync-icon /></n-icon>
          </n-button>
        </template>
        {{ $t('ui.components.reconnect') }}
      </n-tooltip>

      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button size="small" type="error" quaternary data-testid="voice-leave" @click="onLeave">
            <n-icon size="16"><call-icon /></n-icon>
          </n-button>
        </template>
        {{ $t('ui.components.leave') }}
      </n-tooltip>
    </div>

    <div v-else-if="voiceConnected" class="voice-buttons">
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button
            size="small"
            :type="voiceManualMute ? 'error' : 'default'"
            quaternary
            data-testid="voice-toggle-mute"
            @click="onToggleMute"
          >
            <n-icon size="16">
              <mic-off-icon v-if="voiceManualMute" />
              <mic-icon v-else />
            </n-icon>
          </n-button>
        </template>
        {{ voiceManualMute ? $t('ui.components.enable_microphone') : $t('ui.components.mute_microphone') }}
      </n-tooltip>

      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button
            size="small"
            :type="voiceDeafened ? 'error' : 'default'"
            quaternary
            data-testid="voice-toggle-deafen"
            @click="onToggleDeafen"
          >
            <n-icon size="16">
              <volume-mute-icon v-if="voiceDeafened" />
              <headset-icon v-else />
            </n-icon>
          </n-button>
        </template>
        {{ voiceDeafened ? $t('ui.components.enable_audio') : $t('ui.components.disable_audio') }}
      </n-tooltip>

      <n-tooltip v-if="canUseMeetingVideo" trigger="hover">
        <template #trigger>
          <n-button
            size="small"
            :type="voiceCameraEnabled ? 'success' : 'default'"
            quaternary
            data-testid="voice-toggle-camera"
            @click="onToggleCamera"
          >
            <n-icon size="16">
              <videocam-icon v-if="voiceCameraEnabled" />
              <videocam-off-icon v-else />
            </n-icon>
          </n-button>
        </template>
        {{ voiceCameraEnabled ? $t('ui.components.disable_camera') : $t('ui.components.enable_camera') }}
      </n-tooltip>

      <n-popover v-model:show="showSettingsMenu" trigger="click" placement="top">
        <template #trigger>
          <n-button
            size="small"
            quaternary
            :title="$t('ui.components.call_settings')"
            data-testid="voice-open-settings"
          >
            <n-icon size="16"><settings-icon /></n-icon>
          </n-button>
        </template>
        <div class="voice-settings-menu">
          <n-button
            size="small"
            quaternary
            data-testid="voice-open-settings-audio"
            @click="onOpenSettings('audio')"
          >
            {{ $t('ui.components.audio_settings') }}
          </n-button>
          <n-button
            size="small"
            quaternary
            data-testid="voice-open-settings-video"
            @click="onOpenSettings('video')"
          >
            {{ $t('ui.views.settings_video') }}
          </n-button>
        </div>
      </n-popover>

      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button size="small" type="error" quaternary data-testid="voice-leave" @click="onLeave">
            <n-icon size="16"><call-icon /></n-icon>
          </n-button>
        </template>
        {{ $t('ui.components.disconnect') }}
      </n-tooltip>
    </div>

  </div>
</template>

<script>
import {
  CallOutline as CallIcon,
  DesktopOutline as DesktopIcon,
  HeadsetOutline as HeadsetIcon,
  MicOffOutline as MicOffIcon,
  MicOutline as MicIcon,
  ReorderThreeOutline as ReorderIcon,
  SettingsOutline as SettingsIcon,
  SyncOutline as SyncIcon,
  VideocamOffOutline as VideocamOffIcon,
  VideocamOutline as VideocamIcon,
  VolumeHighOutline as VolumeHighIcon,
  VolumeMuteOutline as VolumeMuteIcon
} from '@vicons/ionicons5'
import { confirmUnsupportedBlurFallback } from '../lib/meeting-video-dialogs.js'
import { useMeetingsStore, useVoiceStore } from '../stores/index.js'

const FLOATING_VOICE_POSITION_STORAGE_KEY = 'voiceFloatingDockPosition'

export default {
  name: 'VoiceControls',
  props: {
    variant: {
      type: String,
      default: 'sidebar',
      validator(value) {
        return ['sidebar', 'floating'].includes(value)
      }
    }
  },
  components: {
    CallIcon,
    DesktopIcon,
    HeadsetIcon,
    MicOffIcon,
    MicIcon,
    ReorderIcon,
    SettingsIcon,
    SyncIcon,
    VideocamIcon,
    VideocamOffIcon,
    VolumeHighIcon,
    VolumeMuteIcon
  },
  data() {
    return {
      floatingPosition: null,
      floatingDragOffset: { x: 0, y: 0 },
      activePointerId: null,
      isDraggingFloating: false,
      showSettingsMenu: false
    }
  },
  computed: {
    voiceStore() {
      return useVoiceStore()
    },
    meetingsStore() {
      return useMeetingsStore()
    },
    voiceChannelId() {
      return this.voiceStore.channelId
    },
    voiceChannelName() {
      return this.voiceStore.channelName || 'Voice'
    },
    voiceConnecting() {
      return this.voiceStore.connecting
    },
    voiceConnected() {
      return this.voiceStore.connected
    },
    voiceManualMute() {
      return this.voiceStore.manualMuted
    },
    voiceDeafened() {
      return this.voiceStore.deafened
    },
    voiceCameraEnabled() {
      return this.voiceStore.cameraEnabled
    },
    canUseMeetingVideo() {
      return !!this.activeVoiceMeeting && this.voiceStore.meetingVideoEnabled && this.voiceConnected
    },
    screenShareStatusLabel() {
      const share = this.voiceStore.activeScreenShare
      if (!share) return ''
      if (share.isLocal) {
        return this.$t('ui.views.you_are_presenting_screen')
      }
      return this.$t('ui.views.user_presenting_screen', {
        name: share.participantName || this.$t('ui.components.unknown')
      })
    },
    activeVoiceMeeting() {
      if (!this.voiceStore.channelId) return null
      return this.meetingsStore.meetings.find((meeting) => (
        meeting?.chat_channel_id === this.voiceStore.channelId && meeting.status === 'active'
      )) || null
    },
    voiceTranscriptionRecording() {
      return this.activeVoiceMeeting?.transcription_recording || null
    },
    voiceTranscriptionRecordingPaused() {
      return this.voiceTranscriptionRecording?.status === 'paused'
    },
    voiceTranscriptionRecordingLabel() {
      if (!this.voiceTranscriptionRecording?.visible) return ''
      if (this.voiceTranscriptionRecording.status === 'paused') {
        return this.$t('ui.views.transcription_recording_paused')
      }
      if (this.voiceTranscriptionRecording.status === 'recording') {
        return this.$t('ui.views.transcription_recording_active')
      }
      if (this.voiceTranscriptionRecording.status === 'starting') {
        return this.$t('ui.views.transcription_recording_starting')
      }
      return this.$t('ui.views.transcription_recording_ready')
    },
    isFloatingVariant() {
      return this.variant === 'floating'
    },
    floatingStyle() {
      if (!this.isFloatingVariant || !this.floatingPosition) return null
      return {
        left: `${this.floatingPosition.left}px`,
        top: `${this.floatingPosition.top}px`,
        right: 'auto',
        bottom: 'auto'
      }
    }
  },
  mounted() {
    window.addEventListener('resize', this.onViewportResize)
    this.restoreFloatingPosition()
    this.$nextTick(() => {
      this.clampFloatingPositionToViewport()
    })
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.onViewportResize)
    this.detachFloatingDragListeners()
  },
  methods: {
    async onOpenVoiceChannel() {
      if (!this.voiceStore.channelId) return

      try {
        const meeting = await this.meetingsStore.findMeetingByChatChannelId(this.voiceStore.channelId)
        if (meeting?.id) {
          await this.$router.push(`/meetings/${meeting.id}`)
          return
        }

        await this.$router.push(`/channels/${this.voiceStore.channelId}`)
      } catch {
        // Ignore navigation errors (e.g. duplicate route).
      }
    },
    async onToggleMute() {
      await this.voiceStore.toggleMute()
    },
    async onToggleDeafen() {
      await this.voiceStore.toggleDeafen()
    },
    async onToggleCamera() {
      try {
        await this.voiceStore.toggleCamera()
      } catch (error) {
        if (error?.code === 'MEETING_BACKGROUND_BLUR_CONFIRMATION_REQUIRED') {
          const confirmed = await confirmUnsupportedBlurFallback(this.$t.bind(this))
          if (confirmed) {
            try {
              await this.voiceStore.toggleCamera({ allowUnsupportedBlurFallback: true })
            } catch {
              window.$message?.error(this.voiceStore.cameraError || this.$t('ui.components.camera_start_failed'))
            }
          }
          return
        }
        window.$message?.error(this.voiceStore.cameraError || this.$t('ui.components.camera_start_failed'))
      }
    },
    onOpenSettings(tab = 'audio') {
      this.voiceStore.settingsTab = tab === 'video' ? 'video' : 'audio'
      this.voiceStore.showSettings = true
      this.showSettingsMenu = false
    },
    async onReconnect() {
      try {
        await this.voiceStore.join(this.voiceStore.channelId)
      } catch {
        // Error shown via window.$message
      }
    },
    async onLeave() {
      await this.voiceStore.leave()
    },
    onViewportResize() {
      this.clampFloatingPositionToViewport()
    },
    restoreFloatingPosition() {
      if (!this.isFloatingVariant || typeof localStorage === 'undefined') return
      const raw = localStorage.getItem(FLOATING_VOICE_POSITION_STORAGE_KEY)
      if (!raw) return
      try {
        const parsed = JSON.parse(raw)
        if (Number.isFinite(parsed?.left) && Number.isFinite(parsed?.top)) {
          this.floatingPosition = {
            left: parsed.left,
            top: parsed.top
          }
        }
      } catch {
        // Ignore malformed saved positions.
      }
    },
    persistFloatingPosition() {
      if (!this.isFloatingVariant || !this.floatingPosition || typeof localStorage === 'undefined') return
      localStorage.setItem(FLOATING_VOICE_POSITION_STORAGE_KEY, JSON.stringify(this.floatingPosition))
    },
    clampFloatingPosition(position, width, height) {
      const margin = 8
      const viewportWidth = window.innerWidth || width || 0
      const viewportHeight = window.innerHeight || height || 0
      const maxLeft = Math.max(margin, viewportWidth - width - margin)
      const maxTop = Math.max(margin, viewportHeight - height - margin)

      return {
        left: Math.min(Math.max(position.left, margin), maxLeft),
        top: Math.min(Math.max(position.top, margin), maxTop)
      }
    },
    clampFloatingPositionToViewport() {
      if (!this.isFloatingVariant || !this.floatingPosition) return
      const panel = this.$refs.root
      if (!panel) return
      const rect = panel.getBoundingClientRect()
      const next = this.clampFloatingPosition(this.floatingPosition, rect.width, rect.height)
      if (next.left === this.floatingPosition.left && next.top === this.floatingPosition.top) return
      this.floatingPosition = next
      this.persistFloatingPosition()
    },
    onFloatingPointerDown(event) {
      if (!this.isFloatingVariant) return
      const panel = this.$refs.root
      if (!panel) return

      const rect = panel.getBoundingClientRect()
      this.floatingPosition = {
        left: rect.left,
        top: rect.top
      }
      this.floatingDragOffset = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      }
      this.activePointerId = event.pointerId
      this.isDraggingFloating = true
      this.attachFloatingDragListeners()
      event.preventDefault()
    },
    onFloatingPointerMove(event) {
      if (!this.isDraggingFloating || event.pointerId !== this.activePointerId) return
      const panel = this.$refs.root
      if (!panel) return

      const rect = panel.getBoundingClientRect()
      const next = this.clampFloatingPosition({
        left: event.clientX - this.floatingDragOffset.x,
        top: event.clientY - this.floatingDragOffset.y
      }, rect.width, rect.height)
      this.floatingPosition = next
      event.preventDefault()
    },
    onFloatingPointerUp(event) {
      if (event.pointerId !== this.activePointerId) return
      this.persistFloatingPosition()
      this.activePointerId = null
      this.isDraggingFloating = false
      this.detachFloatingDragListeners()
    },
    attachFloatingDragListeners() {
      window.addEventListener('pointermove', this.onFloatingPointerMove)
      window.addEventListener('pointerup', this.onFloatingPointerUp)
      window.addEventListener('pointercancel', this.onFloatingPointerUp)
    },
    detachFloatingDragListeners() {
      window.removeEventListener('pointermove', this.onFloatingPointerMove)
      window.removeEventListener('pointerup', this.onFloatingPointerUp)
      window.removeEventListener('pointercancel', this.onFloatingPointerUp)
      this.activePointerId = null
      this.isDraggingFloating = false
    }
  }
}
</script>

<style scoped>
.voice-controls {
  padding: 8px 12px;
  background: var(--app-primary-soft);
  border-top: 1px solid rgba(var(--theme-primary-rgb), 0.2);
}

.voice-controls-floating {
  position: fixed;
  right: 16px;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
  width: min(360px, calc(100vw - 32px));
  border: 1px solid rgba(var(--theme-primary-rgb), 0.24);
  border-radius: 16px;
  border-top-color: rgba(var(--theme-primary-rgb), 0.24);
  background:
    var(--app-surface-raised);
  box-shadow: 0 18px 48px var(--app-shadow);
  backdrop-filter: blur(14px);
  z-index: 1250;
}

.voice-controls-dragging {
  user-select: none;
}

.voice-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--theme-primary);
  font-weight: 600;
}

.voice-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--theme-primary);
  cursor: grab;
  touch-action: none;
  flex-shrink: 0;
}

.voice-controls-dragging .voice-drag-handle {
  cursor: grabbing;
}

.voice-icon {
  line-height: 1;
}

.voice-channel-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.voice-channel-link {
  color: inherit;
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
  max-width: 170px;
}

.voice-channel-link:hover {
  text-decoration: underline;
}

.voice-status {
  margin-left: auto;
  font-size: 10px;
  font-weight: 400;
  flex-shrink: 0;
}

.voice-status.connected {
  color: #52c41a;
}

.voice-status.connecting {
  color: #faad14;
}

.voice-status.disconnected {
  color: #ff4d4f;
}

.voice-buttons {
  display: flex;
  gap: 4px;
  align-items: center;
}

.voice-controls-floating .voice-buttons {
  justify-content: flex-end;
  flex-wrap: wrap;
}

.voice-controls-floating .voice-channel-link {
  max-width: none;
}

.screen-share-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 11px;
  color: var(--theme-primary);
}

.voice-recording-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 11px;
  color: var(--theme-primary);
}

.voice-recording-status.paused {
  color: rgba(250, 173, 20, 0.95);
}

.voice-recording-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex: 0 0 auto;
}

.voice-settings-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
}

@media (max-width: 900px) {
  .voice-controls-floating {
    right: 12px;
    left: 12px;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
    width: auto;
    border-radius: 14px;
  }
}
</style>
