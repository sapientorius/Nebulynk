<template>
  <section
    class="meeting-video-grid"
    :class="`variant-${variant}`"
    :data-variant="variant"
    data-testid="meeting-video-grid"
  >
    <div class="meeting-video-grid-header">
      <div class="meeting-video-heading">
        <div class="meeting-video-title">{{ $t('ui.views.meeting_video') }}</div>
        <div v-if="headerSubtitle" class="meeting-video-subtitle">{{ headerSubtitle }}</div>
      </div>

      <n-space class="meeting-video-grid-actions" :size="8" align="center">
        <n-button
          v-if="showDesktopIncomingToggle"
          size="small"
          quaternary
          :data-testid="allIncomingVideoEnabled ? 'meeting-video-disable-incoming' : 'meeting-video-enable-incoming'"
          @click="toggleAllIncomingVideo"
        >
          <template #icon>
            <n-icon size="16"><videocam-off-icon v-if="allIncomingVideoEnabled" /><videocam-icon v-else /></n-icon>
          </template>
          {{
            allIncomingVideoEnabled
              ? $t('ui.views.disable_incoming_video')
              : $t('ui.views.enable_incoming_video')
          }}
        </n-button>

        <n-button
          v-if="canToggleCamera"
          size="small"
          :type="voiceStore.cameraEnabled ? 'success' : 'default'"
          :loading="cameraBusy"
          data-testid="meeting-video-toggle-camera"
          @click="toggleCamera"
        >
          <template #icon>
            <n-icon size="16">
              <videocam-icon v-if="voiceStore.cameraEnabled" />
              <videocam-off-icon v-else />
            </n-icon>
          </template>
          {{ voiceStore.cameraEnabled ? $t('ui.components.disable_camera') : $t('ui.components.enable_camera') }}
        </n-button>

        <n-button
          v-if="allowHideVideos && !isMobileLayout"
          size="small"
          quaternary
          data-testid="meeting-video-hide"
          @click="$emit('hide-videos')"
        >
          <template #icon>
            <n-icon size="16"><hide-icon /></n-icon>
          </template>
          {{ $t('ui.views.hide_meeting_video') }}
        </n-button>
      </n-space>
    </div>

    <div class="meeting-video-tiles" :class="`count-${Math.min(displayedVideoTiles.length, 6)}`">
      <article
        v-for="tile in displayedVideoTiles"
        :key="tile.participantId"
        class="meeting-video-tile"
 :class="{
 speaking: tile.speaking,
 local: tile.isLocal,
 'camera-on': tile.hasTrack,
 'video-mirrored': tile.mirrored,
 'incoming-disabled': tile.incomingVideoEnabled === false
 }"
        data-testid="meeting-video-tile"
      >
        <video
          v-show="tile.hasTrack"
          class="meeting-video-element"
          autoplay
          playsinline
          :muted="tile.isLocal"
          :data-testid="tile.isLocal ? 'meeting-video-local-video' : 'meeting-video-remote-video'"
          :ref="(element) => setVideoRef(tile.participantId, element)"
        />

        <div v-if="!tile.hasTrack" class="meeting-video-placeholder">
          <div class="meeting-video-avatar">{{ tile.initials }}</div>
          <span>{{ tile.placeholderLabel }}</span>
        </div>

        <div class="meeting-video-label">
          <span>{{ tile.name }}</span>
          <span v-if="tile.isLocal" class="meeting-video-pill">{{ $t('ui.views.you') }}</span>
          <span v-if="tile.speaking" class="meeting-video-pill active">{{ $t('ui.views.speaking') }}</span>
          <span v-if="tile.incomingVideoEnabled === false" class="meeting-video-pill muted">
            {{ $t('ui.views.incoming_video_off') }}
          </span>
        </div>

        <n-popover v-if="showTileActions(tile)" trigger="click" placement="bottom-end">
          <template #trigger>
            <n-button
              quaternary
              circle
              size="tiny"
              class="meeting-video-tile-action-trigger"
              data-testid="meeting-video-tile-action-trigger"
            >
              <template #icon>
                <n-icon size="14"><more-icon /></n-icon>
              </template>
            </n-button>
          </template>

          <div class="meeting-video-tile-actions">
            <span class="meeting-video-tile-actions-label">{{ tile.name }}</span>
            <n-button
              text
              size="small"
              :data-testid="`meeting-video-toggle-remote-${tile.participantId}`"
              @click="toggleParticipantIncomingVideo(tile)"
            >
              {{
                tile.incomingVideoEnabled
                  ? $t('ui.views.disable_participant_video')
                  : $t('ui.views.enable_participant_video')
              }}
            </n-button>
          </div>
        </n-popover>
      </article>
    </div>
  </section>
</template>

<script>
import {
  EllipsisHorizontalOutline as MoreIcon,
  EyeOffOutline as HideIcon,
  VideocamOffOutline as VideocamOffIcon,
  VideocamOutline as VideocamIcon
} from '@vicons/ionicons5'
import { confirmUnsupportedBlurFallback } from '../lib/meeting-video-dialogs.js'
import { useSessionStore } from '../stores/session.js'
import { useVoiceStore } from '../stores/voice.js'

function initialsForName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

export default {
  name: 'MeetingVideoGrid',
  components: {
    HideIcon,
    MoreIcon,
    VideocamIcon,
    VideocamOffIcon
  },
  props: {
    participants: {
      type: Array,
      default: () => []
    },
    channelId: {
      type: String,
      default: null
    },
    videoEnabled: {
      type: Boolean,
      default: false
    },
    focusedParticipantId: {
      type: String,
      default: null
    },
    isMobileLayout: {
      type: Boolean,
      default: false
    },
    allowHideVideos: {
      type: Boolean,
      default: false
    },
    variant: {
      type: String,
      default: 'grid',
      validator: (value) => ['grid', 'strip', 'focus'].includes(value)
    }
  },
  emits: ['hide-videos'],
  data() {
    return {
      cameraBusy: false,
      videoElementsByParticipantId: {},
      attachedTracksByParticipantId: {}
    }
  },
  computed: {
    voiceStore() {
      return useVoiceStore()
    },
    sessionStore() {
      return useSessionStore()
    },
    canToggleCamera() {
      return this.videoEnabled
        && this.voiceStore.connected
        && this.voiceStore.channelId === this.channelId
    },
 cameraTracks() {
 if (!this.channelId) return []
 return this.voiceStore.cameraTracksByChannel[this.channelId] || []
 },
 localVideoMirrored() {
 return this.voiceStore.meetingVideoPreferences?.video_mirror === true
 },
 cameraTrackByParticipantId() {
      return new Map(this.cameraTracks.map((entry) => [entry.participantId, entry]))
    },
    videoTiles() {
      const seen = new Set()
      const selfId = this.sessionStore.user?.id || null
      const tiles = []

      for (const participant of this.participants) {
        const participantId = participant?.user_id
        if (!participantId || seen.has(participantId)) continue
        seen.add(participantId)
        const camera = this.cameraTrackByParticipantId.get(participantId) || null
        const name = participant.display_name || camera?.participantName || this.$t('ui.components.unknown')
        const incomingVideoEnabled = participantId === selfId
          ? true
          : this.voiceStore.isRemoteCameraSubscriptionEnabled(participantId)

        tiles.push({
          participantId,
          name,
          initials: initialsForName(name),
          track: camera?.track || null,
 hasTrack: !!camera?.track,
 isLocal: participantId === selfId,
 mirrored: participantId === selfId && this.localVideoMirrored,
 speaking: this.voiceStore.isParticipantSpeaking(participantId),
          incomingVideoEnabled,
          placeholderLabel: incomingVideoEnabled
            ? this.$t('ui.views.camera_off')
            : this.$t('ui.views.incoming_video_off')
        })
      }

      for (const camera of this.cameraTracks) {
        if (!camera?.participantId || seen.has(camera.participantId)) continue
        const name = camera.participantName || this.$t('ui.components.unknown')
        const incomingVideoEnabled = camera.participantId === selfId
          ? true
          : this.voiceStore.isRemoteCameraSubscriptionEnabled(camera.participantId)

        tiles.push({
          participantId: camera.participantId,
          name,
          initials: initialsForName(name),
          track: camera.track || null,
 hasTrack: !!camera.track,
 isLocal: camera.participantId === selfId,
 mirrored: camera.participantId === selfId && this.localVideoMirrored,
 speaking: this.voiceStore.isParticipantSpeaking(camera.participantId),
          incomingVideoEnabled,
          placeholderLabel: incomingVideoEnabled
            ? this.$t('ui.views.camera_off')
            : this.$t('ui.views.incoming_video_off')
        })
      }

      return tiles
    },
    focusedTile() {
      if (this.variant !== 'focus') return null
      return this.videoTiles.find((tile) => tile.participantId === this.focusedParticipantId)
        || this.videoTiles[0]
        || null
    },
    displayedVideoTiles() {
      if (this.variant === 'focus') {
        return this.focusedTile ? [this.focusedTile] : []
      }
      return this.videoTiles
    },
    hasRemoteTiles() {
      return this.videoTiles.some((tile) => !tile.isLocal)
    },
    allIncomingVideoEnabled() {
      return this.voiceStore.allRemoteCameraSubscriptionsEnabled
    },
    showDesktopIncomingToggle() {
      return this.canManageIncomingVideo && !this.isMobileLayout
    },
    canManageIncomingVideo() {
      return this.videoEnabled
        && this.voiceStore.connected
        && this.voiceStore.channelId === this.channelId
        && this.hasRemoteTiles
    },
    headerSubtitle() {
      if (!this.videoEnabled) {
        return this.$t('ui.views.meeting_video_disabled')
      }
      if (this.variant === 'focus' && this.focusedTile) {
        return this.$t('ui.views.showing_video_stream', { name: this.focusedTile.name })
      }
      if (!this.allIncomingVideoEnabled && this.hasRemoteTiles) {
        return this.$t('ui.views.incoming_video_off')
      }
      return ''
    }
  },
  watch: {
    displayedVideoTiles: {
      deep: true,
      handler() {
        this.$nextTick(() => {
          this.syncVideoElements()
        })
      }
    }
  },
  methods: {
    setVideoRef(participantId, element) {
      if (!participantId) return
      if (element) {
        this.videoElementsByParticipantId[participantId] = element
      } else {
        delete this.videoElementsByParticipantId[participantId]
      }
      this.$nextTick(() => {
        this.syncVideoElements()
      })
    },
    detachTrack(participantId) {
      const track = this.attachedTracksByParticipantId[participantId]
      if (!track) return
      const element = this.videoElementsByParticipantId[participantId]
      const detached = track.detach?.(element)
      if (Array.isArray(detached)) {
        detached.forEach((candidate) => {
          if (candidate !== element) {
            candidate?.remove?.()
          }
        })
      }
      delete this.attachedTracksByParticipantId[participantId]
    },
    syncVideoElements() {
      const activeIds = new Set(this.displayedVideoTiles.map((tile) => tile.participantId))
      for (const participantId of Object.keys(this.attachedTracksByParticipantId)) {
        if (!activeIds.has(participantId)) {
          this.detachTrack(participantId)
        }
      }

      for (const tile of this.displayedVideoTiles) {
        const element = this.videoElementsByParticipantId[tile.participantId]
        if (!element || !tile.track) {
          this.detachTrack(tile.participantId)
          continue
        }
        if (this.attachedTracksByParticipantId[tile.participantId] === tile.track) continue
        this.detachTrack(tile.participantId)
        tile.track.attach?.(element)
        this.attachedTracksByParticipantId[tile.participantId] = tile.track
      }
    },
    showTileActions(tile) {
      return !this.isMobileLayout && !tile.isLocal && this.canManageIncomingVideo
    },
    toggleAllIncomingVideo() {
      this.voiceStore.setAllRemoteCameraSubscriptions(!this.voiceStore.allRemoteCameraSubscriptionsEnabled)
    },
    toggleParticipantIncomingVideo(tile) {
      if (!tile?.participantId || tile.isLocal) return
      this.voiceStore.setRemoteCameraSubscription(tile.participantId, !tile.incomingVideoEnabled)
    },
    async toggleCamera() {
      this.cameraBusy = true
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
      } finally {
        this.cameraBusy = false
      }
    }
  },
  beforeUnmount() {
    for (const participantId of Object.keys(this.attachedTracksByParticipantId)) {
      this.detachTrack(participantId)
    }
  }
}
</script>

<style scoped>
.meeting-video-grid {
  border-bottom: 1px solid var(--app-border);
  padding: 12px 16px;
  background:
    radial-gradient(circle at top left, rgba(var(--theme-primary-rgb), 0.16), transparent 34%),
    var(--app-surface-muted);
}

.meeting-video-grid.variant-grid,
.meeting-video-grid.variant-focus {
  flex-shrink: 0;
  max-height: min(42vh, 430px);
  overflow-y: auto;
}

.meeting-video-grid.variant-strip {
  width: 232px;
  flex-shrink: 0;
  overflow-y: auto;
  border-bottom: 0;
  border-left: 1px solid var(--app-border);
  padding: 10px;
}

.meeting-video-grid-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.meeting-video-grid.variant-strip .meeting-video-grid-header {
  flex-direction: column;
  margin-bottom: 10px;
}

.meeting-video-heading {
  min-width: 0;
}

.meeting-video-grid-actions {
  justify-content: flex-end;
  flex-wrap: wrap;
}

.meeting-video-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.meeting-video-subtitle {
  margin-top: 2px;
  font-size: 12px;
  opacity: 0.72;
}

.meeting-video-grid.variant-strip .meeting-video-subtitle {
  display: none;
}

.meeting-video-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.meeting-video-grid.variant-grid .meeting-video-tiles.count-1,
.meeting-video-grid.variant-focus .meeting-video-tiles.count-1 {
  width: 100%;
  max-width: 640px;
  grid-template-columns: minmax(260px, 1fr);
}

.meeting-video-grid.variant-grid .meeting-video-tiles.count-2 {
  width: 100%;
  max-width: 1050px;
  grid-template-columns: repeat(2, minmax(260px, 1fr));
}

.meeting-video-grid.variant-strip .meeting-video-tiles {
  grid-template-columns: 1fr;
  gap: 8px;
}

.meeting-video-grid.variant-focus .meeting-video-tiles {
  grid-template-columns: minmax(260px, 1fr);
  max-width: 720px;
}

.meeting-video-tile {
  position: relative;
  aspect-ratio: 16 / 9;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--app-border-strong);
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.3);
}

.meeting-video-grid.variant-grid .meeting-video-tile,
.meeting-video-grid.variant-focus .meeting-video-tile {
  max-height: 300px;
}

.meeting-video-grid.variant-strip .meeting-video-tile {
  aspect-ratio: 16 / 10;
  border-radius: 12px;
}

.meeting-video-tile.speaking {
  border-color: rgba(var(--theme-success-rgb), 0.72);
  box-shadow: 0 0 0 1px rgba(var(--theme-success-rgb), 0.28);
}

.meeting-video-tile.incoming-disabled {
  border-style: dashed;
}

.meeting-video-element {
 width: 100%;
 height: 100%;
 min-height: 0;
 display: block;
 object-fit: cover;
 background: #020508;
}

.meeting-video-tile.video-mirrored .meeting-video-element {
 transform: scaleX(-1);
}

.meeting-video-placeholder {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--app-text-muted);
  font-size: 12px;
  padding: 12px;
  text-align: center;
}

.meeting-video-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(var(--theme-primary-rgb), 0.16);
  color: var(--theme-primary);
  font-weight: 800;
}

.meeting-video-grid.variant-strip .meeting-video-avatar {
  width: 40px;
  height: 40px;
}

.meeting-video-label {
  position: absolute;
  left: 8px;
  right: 44px;
  bottom: 8px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.48);
  color: white;
  font-size: 12px;
}

.meeting-video-grid.variant-strip .meeting-video-label {
  left: 6px;
  right: 38px;
  bottom: 6px;
  padding: 5px 7px;
  font-size: 11px;
}

.meeting-video-pill {
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  font-size: 10px;
}

.meeting-video-pill.active {
  background: rgba(var(--theme-primary-rgb), 0.22);
  color: var(--theme-primary);
}

.meeting-video-pill.muted {
  background: rgba(255, 255, 255, 0.18);
}

.meeting-video-tile-action-trigger {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.42);
}

.meeting-video-tile-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
}

.meeting-video-tile-actions-label {
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 900px) {
  .meeting-video-grid {
    padding: 12px;
  }

  .meeting-video-grid-header {
    flex-direction: column;
  }

  .meeting-video-tiles {
    grid-template-columns: 1fr;
  }

  .meeting-video-grid.variant-grid .meeting-video-tiles.count-1,
  .meeting-video-grid.variant-grid .meeting-video-tiles.count-2,
  .meeting-video-grid.variant-focus .meeting-video-tiles {
    grid-template-columns: 1fr;
    max-width: none;
  }
}

@media (max-width: 1100px) {
  .meeting-video-grid.variant-strip {
    width: 100%;
    max-height: 170px;
    border-left: 0;
    border-top: 1px solid var(--app-border);
  }

  .meeting-video-grid.variant-strip .meeting-video-grid-header {
    flex-direction: row;
    align-items: center;
  }

  .meeting-video-grid.variant-strip .meeting-video-tiles {
    display: flex;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .meeting-video-grid.variant-strip .meeting-video-tile {
    width: 180px;
    min-width: 180px;
  }
}
</style>
