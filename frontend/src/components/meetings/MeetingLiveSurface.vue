<template>
      <TranscriptionRecordingBanner
        v-if="showTranscriptionRecordingBanner || shouldShowCollapsedMeetingVideoBar"
        :recording="showTranscriptionRecordingBanner ? transcriptionRecording : null"
        :loading="recordingActionLoading"
        :show-video-restore="shouldShowCollapsedMeetingVideoBar"
        @pause-recording="pauseTranscriptionRecording"
        @resume-recording="resumeTranscriptionRecording"
        @show-videos="showMeetingVideos"
      />

      <div v-if="shareMaximized && shouldShowSharePanel" class="share-panel-wrap maximized">
        <MeetingScreenSharePanel
          :meeting="meeting"
          :maximized="true"
          :show-idle-state="hasActiveShare"
          :can-toggle-maximize="hasActiveShare"
          :can-open-window="hasActiveShare"
          :can-hide="hasActiveShare"
          :show-chat-toggle="true"
          :share-chat-open="shareChatOpen"
          @hide="hideActiveShare"
          @toggle-chat="toggleShareChat"
          @toggle-maximize="toggleShareMaximized"
          @open-window="openScreenShareWindow"
        />
      </div>

      <section
        v-else-if="shouldShowLiveMeetingStage"
        class="meeting-live-stage"
        :class="meetingStageMode"
        data-testid="meeting-live-stage"
      >
        <template v-if="isShareFocused">
          <div class="meeting-share-stage" data-testid="meeting-share-stage">
            <div class="share-panel-wrap stage">
              <MeetingScreenSharePanel
                :meeting="meeting"
                :maximized="false"
                :show-idle-state="hasActiveShare"
                :can-toggle-maximize="hasActiveShare"
                :can-open-window="hasActiveShare"
                :can-hide="hasActiveShare"
                :show-chat-toggle="true"
                :share-chat-open="shareChatOpen"
                @hide="hideActiveShare"
                @toggle-chat="toggleShareChat"
                @toggle-maximize="toggleShareMaximized"
                @open-window="openScreenShareWindow"
              />
            </div>
          </div>

          <MeetingVideoGrid
            v-if="shouldShowVideoGrid"
            :variant="isMobileLayout ? 'focus' : 'strip'"
            :participants="visibleMeetingParticipants"
            :channel-id="meeting.chat_channel_id"
            :video-enabled="voiceStore.meetingVideoEnabled"
            :focused-participant-id="resolvedMeetingFocusParticipantId"
            :is-mobile-layout="isMobileLayout"
            :allow-hide-videos="!isMobileLayout"
            @hide-videos="hideMeetingVideos"
          />
        </template>

        <MeetingVideoGrid
          v-else-if="shouldShowVideoGrid"
          :variant="isMobileLayout ? 'focus' : 'grid'"
          :participants="visibleMeetingParticipants"
          :channel-id="meeting.chat_channel_id"
          :video-enabled="voiceStore.meetingVideoEnabled"
          :focused-participant-id="resolvedMeetingFocusParticipantId"
          :is-mobile-layout="isMobileLayout"
          :allow-hide-videos="true"
          @hide-videos="hideMeetingVideos"
        />
      </section>

      <ScreenShareChatOverlay
        :active="canShowShareChatOverlay"
        :chat-open="shareChatOpen"
        :title="$t('ui.views.meeting_chat')"
        test-id-prefix="meeting"
        @toggle-chat="toggleShareChat"
      >
        <MessageList />
        <MessageInput />
      </ScreenShareChatOverlay>

      <n-drawer
        v-if="meeting && isMobileLayout && canManageMeetingVideo && !shareMaximized"
        v-model:show="showMeetingVideoPanel"
        placement="right"
        :width="'100%'"
        data-testid="meeting-video-mobile-drawer"
      >
        <n-drawer-content
          closable
          :title="$t('ui.views.meeting_video_controls')"
          body-content-style="padding: 0;"
        >
          <div class="meeting-video-drawer-body">
            <section class="meeting-video-drawer-section">
              <span class="meeting-video-drawer-label">{{ $t('ui.views.meeting_video_visibility') }}</span>
              <n-space :size="8" vertical>
                <n-button
                  size="small"
                  :type="voiceStore.cameraEnabled ? 'success' : 'default'"
                  data-testid="meeting-video-mobile-toggle-camera"
                  @click="toggleMeetingVideoCamera"
                >
                  <template #icon>
                    <n-icon size="16"><videocam-icon v-if="voiceStore.cameraEnabled" /><videocam-off-icon v-else /></n-icon>
                  </template>
                  {{
                    voiceStore.cameraEnabled
                      ? $t('ui.components.disable_camera')
                      : $t('ui.components.enable_camera')
                  }}
                </n-button>
                <n-button
                  size="small"
                  :type="meetingVideosVisible ? 'default' : 'primary'"
                  @click="meetingVideosVisible ? hideMeetingVideos() : showMeetingVideos()"
                >
                  <template #icon>
                    <n-icon size="16"><videocam-off-icon v-if="meetingVideosVisible" /><videocam-icon v-else /></n-icon>
                  </template>
                  {{
                    meetingVideosVisible
                      ? $t('ui.views.hide_meeting_video')
                      : $t('ui.views.show_meeting_video')
                  }}
                </n-button>
                <n-button
                  v-if="hasRemoteMeetingParticipants"
                  size="small"
                  quaternary
                  @click="toggleAllIncomingMeetingVideos"
                >
                  {{
                    allIncomingMeetingVideosEnabled
                      ? $t('ui.views.disable_incoming_video')
                      : $t('ui.views.enable_incoming_video')
                  }}
                </n-button>
              </n-space>
            </section>

            <section class="meeting-video-drawer-section">
              <span class="meeting-video-drawer-label">{{ $t('ui.views.settings_video') }}</span>
              <VideoSettingsContent :active="showMeetingVideoPanel && isMobileLayout" />
            </section>

            <section v-if="meetingVideoFocusOptions.length > 0" class="meeting-video-drawer-section">
              <span class="meeting-video-drawer-label">{{ $t('ui.views.visible_video_stream') }}</span>
              <n-select
                :value="resolvedMeetingFocusParticipantId"
                :options="meetingVideoFocusOptions"
                :placeholder="$t('ui.views.select_visible_video_stream')"
                @update:value="selectMeetingVideoParticipant"
              />
              <n-button text size="small" @click="clearMeetingVideoParticipantSelection">
                {{ $t('ui.views.follow_active_speaker') }}
              </n-button>
            </section>

            <section v-if="meetingVideoParticipantControls.length > 0" class="meeting-video-drawer-section">
              <span class="meeting-video-drawer-label">{{ $t('ui.views.incoming_video_participants') }}</span>
              <div
                v-for="participant in meetingVideoParticipantControls"
                :key="participant.participantId"
                class="meeting-video-drawer-row"
              >
                <div class="meeting-video-drawer-row-copy">
                  <span>{{ participant.name }}</span>
                  <span v-if="participant.speaking" class="meeting-video-drawer-row-hint">
                    {{ $t('ui.views.speaking') }}
                  </span>
                </div>
                <n-button
                  size="small"
                  quaternary
                  @click="toggleMeetingParticipantIncomingVideo(participant.participantId)"
                >
                  {{
                    participant.incomingVideoEnabled
                      ? $t('ui.views.disable_participant_video')
                      : $t('ui.views.enable_participant_video')
                  }}
                </n-button>
              </div>
            </section>
          </div>
        </n-drawer-content>
      </n-drawer>

</template>

<script>
import { defineAsyncComponent } from 'vue'
import { VideocamOffOutline as VideocamOffIcon, VideocamOutline as VideocamIcon } from '@vicons/ionicons5'
import { confirmUnsupportedBlurFallback } from '../../lib/meeting-video-dialogs.js'
import { openDetachedScreenShareWindow } from '../../lib/screen-share.js'
import { useSessionStore, useUiStore, useMeetingsStore } from '../../stores/index.js'
import { useVoiceStore } from '../../stores/voice.js'


const VideoSettingsContent = defineAsyncComponent(() => import('../VideoSettingsContent.vue'))
const TranscriptionRecordingBanner = defineAsyncComponent(() => import('../TranscriptionRecordingBanner.vue'))
const ScreenShareChatOverlay = defineAsyncComponent(() => import('../ScreenShareChatOverlay.vue'))
const MessageInput = defineAsyncComponent(() => import('../MessageInput.vue'))
const MessageList = defineAsyncComponent(() => import('../MessageList.vue'))
const MeetingVideoGrid = defineAsyncComponent(() => import('../MeetingVideoGrid.vue'))
const MeetingScreenSharePanel = defineAsyncComponent(() => import('../MeetingScreenSharePanel.vue'))
export default {
  name: 'MeetingLiveSurface',
  components: { MeetingScreenSharePanel,
MeetingVideoGrid,
MessageInput,
MessageList,
ScreenShareChatOverlay,
TranscriptionRecordingBanner,
VideoSettingsContent,
VideocamIcon,
VideocamOffIcon },
  emits: ["close-actions"],
  props: { meeting: { type: Object, default: null },
isMobileLayout: Boolean },
  data() { return {
recordingActionLoading: false,
showMeetingVideoPanel: false,
meetingVideosVisible: true,
selectedMeetingVideoParticipantId: null
  } },
  computed: {
uiStore() {
      return useUiStore()
    },
voiceStore() {
      return useVoiceStore()
    },
hasActiveShare() {
      return !!this.activeShare
    },
shouldShowSharePanel() {
      if (!this.meeting) return false
      return this.uiStore.screenSharePanelVisible || (this.hasActiveShare && !this.uiStore.hideScreenSharePanel)
    },
isShareFocused() {
      return !!this.meeting
        && !this.isEndedMeetingView
        && !this.shareMaximized
        && this.hasActiveShare
        && this.shouldShowSharePanel
    },
canShowShareChatOverlay() {
      return !!this.meeting
        && this.hasActiveShare
        && this.shouldShowSharePanel
        && (this.shareMaximized || this.isShareFocused)
    },
shouldShowLiveMeetingStage() {
      return !!this.meeting
        && !this.isEndedMeetingView
        && !this.shareMaximized
        && (this.shouldShowVideoGrid || this.isShareFocused)
    },
meetingStageMode() {
      return this.isShareFocused ? 'share-focused' : 'video-focused'
    },
shareMaximized() {
      return this.uiStore.maximizeScreenShare
    },
shareChatOpen() {
      return this.uiStore.showScreenShareChat
    },
canManageMeetingVideo() {
      return !!this.meeting
        && this.meeting.status === 'active'
        && !this.shareMaximized
        && this.voiceStore.channelId === this.meeting.chat_channel_id
        && this.voiceStore.connected
        && this.voiceStore.meetingVideoEnabled
    },
shouldShowVideoGrid() {
      return this.canManageMeetingVideo
        && this.meetingVideosVisible
    },
shouldShowCollapsedMeetingVideoBar() {
      return this.canManageMeetingVideo
        && !this.meetingVideosVisible
    },
visibleMeetingParticipants() {
      const selfUserId = this.sessionStore.user?.id
      const participantsByUserId = new Map()
      const participants = Array.isArray(this.meeting?.participants)
        ? this.meeting.participants
        : []

      for (const participant of participants) {
        if (
          !participant?.user_id
          || participant?.left_at
          || (
            participant.invite_status !== 'joined'
            && !participant?.joined_at
            && !participant?.chat_last_read_at
            && participant.user_id !== selfUserId
          )
        ) {
          continue
        }
        participantsByUserId.set(participant.user_id, participant)
      }

      for (const participant of this.meetingVoiceParticipants) {
        if (!participant?.user_id) continue
        participantsByUserId.set(participant.user_id, {
          ...(participantsByUserId.get(participant.user_id) || {}),
          ...participant,
          user_id: participant.user_id,
          left_at: null
        })
      }

      return [...participantsByUserId.values()]
    },
hasRemoteMeetingParticipants() {
      return this.remoteMeetingParticipants.length > 0
    },
meetingVideoFocusOptions() {
      return this.visibleMeetingParticipants
        .filter((participant) => !!participant?.user_id)
        .map((participant) => ({
          label: participant.display_name || this.$t('ui.components.unknown'),
          value: participant.user_id
        }))
    },
resolvedMeetingFocusParticipantId() {
      const availableParticipantIds = this.meetingVideoFocusOptions.map((entry) => entry.value)
      if (!availableParticipantIds.length) return null

      if (
        this.selectedMeetingVideoParticipantId
        && availableParticipantIds.includes(this.selectedMeetingVideoParticipantId)
      ) {
        return this.selectedMeetingVideoParticipantId
      }

      const activeSpeakerId = this.voiceStore.activeSpeakers.find((participantId) => (
        availableParticipantIds.includes(participantId)
      ))
      if (activeSpeakerId) return activeSpeakerId

      const selfId = this.sessionStore.user?.id || null
      if (selfId && availableParticipantIds.includes(selfId)) {
        return selfId
      }

      return availableParticipantIds[0]
    },
meetingVideoParticipantControls() {
      return this.remoteMeetingParticipants.map((participant) => {
        const participantId = participant.user_id
        return {
          participantId,
          name: participant.display_name || this.$t('ui.components.unknown'),
          speaking: this.voiceStore.activeSpeakers.includes(participantId),
          incomingVideoEnabled: this.voiceStore.isRemoteCameraSubscriptionEnabled(participantId)
        }
      })
    },
allIncomingMeetingVideosEnabled() {
      return this.voiceStore.allRemoteCameraSubscriptionsEnabled
    },
transcriptionRecording() {
      return this.meeting?.transcription_recording && typeof this.meeting.transcription_recording === 'object'
        ? this.meeting.transcription_recording
        : {
            visible: false,
            status: 'unavailable',
            can_pause: false,
            can_resume: false,
            active_recording_count: 0
          }
    },
showTranscriptionRecordingBanner() {
      return !!this.meeting
        && this.meeting.status === 'active'
        && this.transcriptionRecording.visible
    },
sessionStore() {
      return useSessionStore()
    },
meetingsStore() {
      return useMeetingsStore()
    },
isEndedMeetingView() {
      return !!this.meeting && this.meeting.status === 'ended'
    },
activeShare() {
      return this.voiceStore.activeScreenShare
    },
meetingVoiceParticipants() {
      if (!this.meeting?.chat_channel_id) return []
      return this.voiceStore.participants[this.meeting.chat_channel_id] || []
    },
remoteMeetingParticipants() {
      const selfId = this.sessionStore.user?.id || null
      return this.visibleMeetingParticipants.filter((participant) => participant?.user_id && participant.user_id !== selfId)
    }
  },
  watch: {
hasActiveShare(value) {
      if (!value) {
        this.uiStore.resetScreenShareVisibility()
      }
    },
shareMaximized(value) { if (!value && this.shareChatOpen) this.uiStore.setScreenShareChatVisible(false); if (value) this.showMeetingVideoPanel = false; this.$emit('close-actions') },
isMobileLayout(value) { if (!value) this.showMeetingVideoPanel = false },
meeting() { this.meetingVideosVisible = true; this.selectedMeetingVideoParticipantId = null; this.showMeetingVideoPanel = false },
visibleMeetingParticipants: {
      deep: true,
      handler(participants) {
        const participantIds = (participants || []).map((participant) => participant?.user_id).filter(Boolean)
        if (
          this.selectedMeetingVideoParticipantId
          && !participantIds.includes(this.selectedMeetingVideoParticipantId)
        ) {
          this.selectedMeetingVideoParticipantId = null
        }
      }
    }
  },

  methods: {
openMeetingVideoPanel() {
      if (!this.canManageMeetingVideo || !this.isMobileLayout) return
      this.showMeetingVideoPanel = true
      this.$emit('close-actions')
    },
hideMeetingVideos() {
      this.meetingVideosVisible = false
    },
showMeetingVideos() {
      this.meetingVideosVisible = true
    },
selectMeetingVideoParticipant(participantId) {
      this.selectedMeetingVideoParticipantId = participantId || null
    },
clearMeetingVideoParticipantSelection() {
      this.selectedMeetingVideoParticipantId = null
    },
toggleAllIncomingMeetingVideos() {
      this.voiceStore.setAllRemoteCameraSubscriptions(!this.allIncomingMeetingVideosEnabled)
    },
async toggleMeetingVideoCamera() {
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
toggleMeetingParticipantIncomingVideo(participantId) {
      const nextEnabled = !this.voiceStore.isRemoteCameraSubscriptionEnabled(participantId)
      this.voiceStore.setRemoteCameraSubscription(participantId, nextEnabled)
    },
hideActiveShare() {
      this.uiStore.closeScreenSharePanel()
    },
toggleShareMaximized() {
      this.uiStore.setScreenShareMaximized(!this.shareMaximized)
    },
toggleShareChat() {
      if (!this.canShowShareChatOverlay) return
      this.uiStore.setScreenShareChatVisible(!this.shareChatOpen, {
        requireMaximized: this.shareMaximized
      })
    },
openScreenShareWindow() {
      if (!this.meeting?.id) return
      openDetachedScreenShareWindow({
        router: this.$router,
        uiStore: this.uiStore,
        type: 'meeting',
        id: this.meeting.id
      })
    },
async pauseTranscriptionRecording() {
      if (!this.meeting || !this.transcriptionRecording.can_pause) return
      this.recordingActionLoading = true
      try {
        await this.meetingsStore.pauseTranscriptionRecording(this.meeting.id)
      } catch {
        window.$message?.error(this.$t('ui.views.transcription_recording_pause_failed'))
      } finally {
        this.recordingActionLoading = false
      }
    },
async resumeTranscriptionRecording() {
      if (!this.meeting || !this.transcriptionRecording.can_resume) return
      this.recordingActionLoading = true
      try {
        await this.meetingsStore.resumeTranscriptionRecording(this.meeting.id)
      } catch {
        window.$message?.error(this.$t('ui.views.transcription_recording_resume_failed'))
      } finally {
        this.recordingActionLoading = false
      }
    }
  }
}
</script>

<style scoped>

.share-panel-wrap {
  flex-shrink: 0;
}

.meeting-live-stage {
  flex-shrink: 0;
  min-width: 0;
}

.meeting-live-stage.video-focused {
  border-bottom: 1px solid var(--app-border-soft);
}

.meeting-live-stage.share-focused {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface-muted);
}

.meeting-share-stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.share-panel-wrap.stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.share-panel-wrap.stage :deep(.screen-share-panel) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-bottom: 0;
}

.share-panel-wrap.stage :deep(.screen-share-stage) {
  flex: 1;
  min-height: 0;
}

.share-panel-wrap.stage :deep(.screen-share-video) {
  flex: 1;
  max-height: none;
  min-height: 0;
}

.share-panel-wrap.maximized {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

@media (max-width: 1100px) {
  .meeting-live-stage.share-focused {
    flex-direction: column;
  }
}

.meeting-video-drawer-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 12px 20px;
}

.meeting-video-drawer-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--app-border-soft);
  border-radius: 14px;
  background: var(--app-surface);
}

.meeting-video-drawer-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.82;
}

.meeting-video-drawer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.meeting-video-drawer-row-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meeting-video-drawer-row-hint {
  font-size: 11px;
  opacity: 0.68;
}

</style>
