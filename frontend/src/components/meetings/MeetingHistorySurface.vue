<template>
<slot name="header" :is-short-viewport="isShortViewport" />
<slot name="live" />
      <div
        v-if="shouldShowMeetingContentArea"
        class="content-area"
        :class="{ 'ended-meeting-layout': isEndedMeetingView }"
      >
        <template v-if="meeting && isEndedMeetingView">
          <div class="ended-meeting-main">
            <div
              class="artifacts-panel ended-artifacts-panel"
              :class="{
                'ended-artifacts-panel-compact': isCompactEndedMeetingMobileLayout,
                'ended-artifacts-panel-short': isShortEndedMeetingViewport
              }"
            >
              <div v-if="!isCompactEndedMeetingMobileLayout" class="ended-artifacts-toolbar">
                <div class="artifacts-row">
                  <span class="artifacts-title">{{ $t('ui.views.artifacts') }}</span>
                  <div class="artifact-status-list">
                    <span
                      v-for="artifact in meeting.artifacts || []"
                      :key="artifact.artifact_type"
                      class="artifact-status-meta"
                      :class="`status-${artifact.status || 'default'}`"
                    >
                      <span class="artifact-status-dot" aria-hidden="true"></span>
                      <span class="artifact-status-text">{{ artifact.artifact_type }}: {{ artifact.status }}</span>
                    </span>
                  </div>
                </div>

              </div>

              <section class="artifact-hub" data-testid="meeting-artifact-hub">
                <div
                  class="artifact-hub-header"
                  :class="{
                    'artifact-hub-header-compact': isCompactEndedMeetingMobileLayout,
                    'artifact-hub-header-short': isShortEndedMeetingViewport
                  }"
                >
                  <template v-if="isCompactEndedMeetingMobileLayout">
                    <div data-testid="meeting-ended-compact-strip">
                      <div class="artifact-hub-compact-top">
                        <span class="summary-title" data-testid="meeting-ended-compact-active-tab">{{ activeEndedMeetingArtifactTabLabel }}</span>
                        <div class="artifact-hub-compact-actions">
                          <n-button
                            secondary
                            circle
                            size="small"
                            data-testid="meeting-ended-actions-trigger"
                            :title="$t('ui.components.admin.actions')"
                            :aria-label="$t('ui.components.admin.actions')"
                            @click="showEndedMeetingCompactMenu = true"
                          >
                            <template #icon><n-icon size="18"><more-icon /></n-icon></template>
                          </n-button>
                        </div>
                      </div>

                      <div class="artifact-status-list artifact-status-list-compact">
                        <span
                          v-for="artifact in meeting.artifacts || []"
                          :key="artifact.artifact_type"
                          class="artifact-status-meta"
                          :class="`status-${artifact.status || 'default'}`"
                        >
                          <span class="artifact-status-dot" aria-hidden="true"></span>
                          <span class="artifact-status-text">{{ artifact.artifact_type }}: {{ artifact.status }}</span>
                        </span>
                      </div>

                    </div>
                  </template>

                  <template v-else>
                    <span class="summary-title">{{ $t('ui.views.meeting_insights') }}</span>
                    <div class="artifact-hub-actions">
                      <n-space class="artifact-tab-row" :size="8">
                        <n-button
                          v-for="tab in endedMeetingArtifactTabs"
                          :key="tab.key"
                          size="small"
                          round
                          :type="endedMeetingArtifactTab === tab.key ? 'primary' : 'default'"
                          :quaternary="endedMeetingArtifactTab !== tab.key"
                          :data-testid="`meeting-artifact-tab-${tab.key}`"
                          @click="setEndedMeetingArtifactTab(tab.key)"
                        >
                          {{ tab.label }}
                        </n-button>
                      </n-space>

                      <n-popover
                        v-if="showEndedMeetingAdminMenu"
                        v-model:show="showAdminArtifactMenu"
                        trigger="click"
                        placement="bottom-end"
                      >
                        <template #trigger>
                          <n-button
                            quaternary
                            circle
                            size="small"
                            data-testid="meeting-admin-artifact-menu-trigger"
                            :title="$t('ui.views.meeting_admin_artifact_actions')"
                            :aria-label="$t('ui.views.meeting_admin_artifact_actions')"
                          >
                            <template #icon><n-icon size="18"><more-icon /></n-icon></template>
                          </n-button>
                        </template>

                        <div class="meeting-admin-artifact-menu" data-testid="meeting-admin-artifact-menu">
                          <n-button
                            text
                            size="small"
                            class="meeting-admin-artifact-action"
                            data-testid="meeting-admin-regenerate-transcript"
                            :loading="generatingTranscript"
                            :disabled="generatingTranscript || !adminArtifactMenu?.can_regenerate_transcript"
                            @click="triggerAdminTranscriptRegeneration"
                          >
                            {{ $t('ui.views.regenerate_transcript') }}
                          </n-button>
                          <n-button
                            text
                            size="small"
                            class="meeting-admin-artifact-action"
                            data-testid="meeting-admin-regenerate-summary"
                            :loading="generatingSummary"
                            :disabled="generatingSummary || !adminArtifactMenu?.can_regenerate_summary"
                            @click="triggerAdminSummaryRegeneration"
                          >
                            {{ $t('ui.views.regenerate_summary') }}
                          </n-button>
                          <n-button
                            text
                            size="small"
                            class="meeting-admin-artifact-action"
                            data-testid="meeting-admin-download-audio"
                            :loading="downloadingMeetingAudio"
                            :disabled="downloadingMeetingAudio || !adminArtifactMenu?.can_download_audio"
                            @click="downloadMeetingAudio"
                          >
                            {{ $t('ui.views.download_meeting_audio') }}
                          </n-button>
                        </div>
                      </n-popover>
                    </div>
                  </template>
                </div>

                <div
                  class="artifact-hub-body"
                  :class="{
                    'artifact-hub-body-compact': isCompactEndedMeetingMobileLayout,
                    'artifact-hub-body-short': isShortEndedMeetingViewport
                  }"
                >
                  <MeetingSummaryPanel
                    v-if="endedMeetingArtifactTab === 'summary' && shouldShowSummaryPanel"
                    :summary-artifact="summaryArtifact"
                    :summary-generation="summaryGeneration"
                    :attended-participant-display-names="attendedParticipantDisplayNames"
                    :loaded-meeting-chat-messages="loadedMeetingChatMessages"
                    :summary-share-text="summaryShareText"
                    :can-share-in-app="canShareSummaryInApp"
                    :compact-header="isCompactEndedMeetingMobileLayout"
                    :generating="generatingSummary"
                    @generate-summary="triggerSummaryGeneration"
                    @copy-summary="copySummary"
                    @export-summary="exportSummary"
                    @share-summary="openShareSummaryModal"
                    @open-evidence="openEvidence"
                  />

                  <MeetingTranscriptPanel
                    v-if="endedMeetingArtifactTab === 'transcript' && transcriptArtifact"
                    ref="endedTranscriptPanel"
                    :transcript-artifact="transcriptArtifact"
                    :transcript-generation="transcriptGeneration"
                    :compact-header="isCompactEndedMeetingMobileLayout"
                    :generating="generatingTranscript"
                    :highlighted-start-ms="highlightedTranscriptStartMs"
                    @generate-transcript="triggerTranscriptGeneration"
                    @open-evidence="openEvidence"
                  />

                  <AskMeetingPanel
                    v-if="endedMeetingArtifactTab === 'ask' && canAskMeeting"
                    :questions="meetingQuestions"
                    :loading="loadingQuestions"
                    :asking="askingQuestion"
                    :question="meetingQuestionInput"
                    :compact-header="isCompactEndedMeetingMobileLayout"
                    @update:question="meetingQuestionInput = $event"
                    @ask-question="submitMeetingQuestion"
                    @open-evidence="openEvidence"
                  />
                </div>
              </section>

              <section
                v-if="shouldRenderEndedMeetingDesktopChatTray"
                class="ended-meeting-chat-tray"
                :class="{ open: isEndedMeetingChatOpen }"
                data-testid="meeting-ended-chat-tray"
              >
                <div class="ended-meeting-chat-header">
                  <div class="ended-meeting-chat-copy">
                    <span class="summary-title">{{ $t('ui.views.meeting_chat') }}</span>
                    <span class="ended-meeting-chat-hint">{{ $t('ui.views.ended_meeting_chat_hint') }}</span>
                  </div>
                  <n-button
                    quaternary
                    size="small"
                    data-testid="meeting-ended-chat-toggle"
                    @click="toggleEndedMeetingChat"
                  >
                    {{
                      isEndedMeetingChatOpen
                        ? $t('ui.views.hide_meeting_chat')
                        : $t('ui.views.open_meeting_chat')
                    }}
                  </n-button>
                </div>

                <div v-if="isEndedMeetingChatOpen" class="ended-meeting-chat-body">
                  <MessageList />
                  <MessageInput />
                </div>
              </section>
            </div>
          </div>

          <aside class="member-panel" v-if="showMembers && meeting && !shareMaximized">
            <MemberList />
          </aside>
        </template>

        <template v-else-if="meeting">
          <div class="chat-area">
            <MessageList />
            <MessageInput />
          </div>

          <aside class="member-panel" v-if="showMembers && meeting && !shareMaximized">
            <MemberList />
          </aside>
        </template>

        <div class="no-meeting" v-else>
          <n-empty :description="$t('ui.views.meeting_not_found')" />
        </div>
      </div>

      <div class="artifacts-panel" v-if="meeting && !shareMaximized && !isShareFocused && !isEndedMeetingView">
        <div class="artifacts-row">
          <span class="artifacts-title">{{ $t('ui.views.artifacts') }}</span>
          <div class="artifact-status-list">
            <span
              v-for="artifact in meeting.artifacts || []"
              :key="artifact.artifact_type"
              class="artifact-status-meta"
              :class="`status-${artifact.status || 'default'}`"
            >
              <span class="artifact-status-dot" aria-hidden="true"></span>
              <span class="artifact-status-text">{{ artifact.artifact_type }}: {{ artifact.status }}</span>
            </span>
          </div>
        </div>

        <MeetingSummaryPanel
          v-if="shouldShowSummaryPanel"
          :summary-artifact="summaryArtifact"
          :summary-generation="summaryGeneration"
          :attended-participant-display-names="attendedParticipantDisplayNames"
          :loaded-meeting-chat-messages="loadedMeetingChatMessages"
          :summary-share-text="summaryShareText"
          :can-share-in-app="canShareSummaryInApp"
          :generating="generatingSummary"
          @generate-summary="triggerSummaryGeneration"
          @copy-summary="copySummary"
          @export-summary="exportSummary"
          @share-summary="openShareSummaryModal"
          @open-evidence="openEvidence"
        />

        <MeetingTranscriptPanel
          v-if="transcriptArtifact"
          ref="inlineTranscriptPanel"
          :transcript-artifact="transcriptArtifact"
          :transcript-generation="transcriptGeneration"
          :generating="generatingTranscript"
          :highlighted-start-ms="highlightedTranscriptStartMs"
          @generate-transcript="triggerTranscriptGeneration"
          @open-evidence="openEvidence"
        />

        <AskMeetingPanel
          v-if="canAskMeeting"
          :questions="meetingQuestions"
          :loading="loadingQuestions"
          :asking="askingQuestion"
          :question="meetingQuestionInput"
          @update:question="meetingQuestionInput = $event"
          @ask-question="submitMeetingQuestion"
          @open-evidence="openEvidence"
        />
      </div>

      <n-drawer
        v-if="meeting && isEndedMeetingView && isMobileLayout && !shareMaximized"
        v-model:show="isEndedMeetingChatOpen"
        placement="right"
        :width="'100%'"
        data-testid="meeting-ended-chat-drawer"
      >
        <n-drawer-content
          closable
          :title="$t('ui.views.meeting_chat')"
          body-content-style="padding: 0;"
        >
          <div class="ended-meeting-chat-drawer-body">
            <div class="ended-meeting-chat-drawer-header">
              <span class="ended-meeting-chat-hint">{{ $t('ui.views.ended_meeting_chat_hint') }}</span>
              <n-button quaternary size="small" @click="closeEndedMeetingChat">
                {{ $t('ui.views.hide_meeting_chat') }}
              </n-button>
            </div>
            <div class="ended-meeting-chat-drawer-content">
              <MessageList />
              <MessageInput />
            </div>
          </div>
        </n-drawer-content>
      </n-drawer>

      <n-modal
        v-if="meeting && isEndedMeetingView && isCompactEndedMeetingMobileLayout && !shareMaximized"
        v-model:show="showEndedMeetingCompactMenu"
        :mask-closable="true"
        :auto-focus="false"
        transform-origin="center"
      >
        <div class="meeting-ended-actions-sheet" data-testid="meeting-ended-actions-sheet">
          <div class="meeting-ended-actions-sheet-header">
            <span class="meeting-ended-actions-sheet-title">{{ $t('ui.components.admin.actions') }}</span>
            <button
              type="button"
              class="meeting-ended-actions-sheet-close"
              :title="$t('common.close')"
              data-testid="meeting-ended-actions-sheet-close"
              @click="showEndedMeetingCompactMenu = false"
            >
              <n-icon size="22"><close-outline /></n-icon>
            </button>
          </div>

          <div class="meeting-ended-action-menu" data-testid="meeting-ended-actions-menu">
            <button
              type="button"
              class="meeting-ended-menu-action"
              data-testid="meeting-ended-action-summary"
              @click="openEndedMeetingCompactMenuAction('summary')"
            >
              <span class="meeting-ended-menu-action-label">{{ $t('ui.views.meeting_summary') }}</span>
              <n-icon size="20"><sparkles-icon /></n-icon>
            </button>
            <button
              v-if="transcriptArtifact"
              type="button"
              class="meeting-ended-menu-action"
              data-testid="meeting-ended-action-transcript"
              @click="openEndedMeetingCompactMenuAction('transcript')"
            >
              <span class="meeting-ended-menu-action-label">{{ $t('ui.views.transcript') }}</span>
              <n-icon size="20"><document-text-icon /></n-icon>
            </button>
            <button
              v-if="canAskMeeting"
              type="button"
              class="meeting-ended-menu-action"
              data-testid="meeting-ended-action-ask"
              @click="openEndedMeetingCompactMenuAction('ask')"
            >
              <span class="meeting-ended-menu-action-label">{{ $t('ui.views.ask_the_meeting') }}</span>
              <n-icon size="20"><help-circle-icon /></n-icon>
            </button>

            <div class="meeting-ended-menu-divider" />

            <button
              type="button"
              class="meeting-ended-menu-action"
              data-testid="meeting-ended-action-chat"
              @click="openEndedMeetingCompactMenuAction('chat')"
            >
              <span class="meeting-ended-menu-action-label">{{ $t('ui.views.open_meeting_chat') }}</span>
              <n-icon size="20"><chat-icon /></n-icon>
            </button>

            <template v-if="showEndedMeetingAdminMenu">
              <div class="meeting-ended-menu-divider" />

              <button
                type="button"
                class="meeting-ended-menu-action"
                data-testid="meeting-admin-regenerate-transcript"
                :disabled="generatingTranscript || !adminArtifactMenu?.can_regenerate_transcript"
                @click="triggerCompactMenuTranscriptRegeneration"
              >
                <span class="meeting-ended-menu-action-label">{{ $t('ui.views.regenerate_transcript') }}</span>
                <n-icon size="20"><document-text-icon /></n-icon>
              </button>
              <button
                type="button"
                class="meeting-ended-menu-action"
                data-testid="meeting-admin-regenerate-summary"
                :disabled="generatingSummary || !adminArtifactMenu?.can_regenerate_summary"
                @click="triggerCompactMenuSummaryRegeneration"
              >
                <span class="meeting-ended-menu-action-label">{{ $t('ui.views.regenerate_summary') }}</span>
                <n-icon size="20"><sparkles-icon /></n-icon>
              </button>
              <button
                type="button"
                class="meeting-ended-menu-action"
                data-testid="meeting-admin-download-audio"
                :disabled="downloadingMeetingAudio || !adminArtifactMenu?.can_download_audio"
                @click="downloadMeetingAudioFromCompactMenu"
              >
                <span class="meeting-ended-menu-action-label">{{ $t('ui.views.download_meeting_audio') }}</span>
                <n-icon size="20"><download-icon /></n-icon>
              </button>
            </template>
          </div>
        </div>
      </n-modal>

    <n-modal v-model:show="showShareSummaryModal">
      <n-card :title="$t('ui.views.share_in_nebulynk')" style="max-width: 520px; width: 100%">
        <n-form>
          <n-form-item :label="$t('ui.views.share_destination')">
            <n-select
              v-model:value="shareSummaryTargetChannelId"
              filterable
              :options="shareDestinationOptions"
              :placeholder="$t('ui.views.select_share_destination')"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.views.summary_preview')">
            <n-input :value="summaryShareText" type="textarea" readonly :autosize="{ minRows: 10, maxRows: 16 }" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showShareSummaryModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button type="primary" :disabled="!shareSummaryTargetChannelId" @click="shareSummaryInApp">
              {{ $t('ui.views.share_in_nebulynk') }}
            </n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

</template>

<script>
import { defineAsyncComponent } from 'vue'
import { ChatbubbleEllipsesOutline as ChatIcon, CloseOutline, DownloadOutline as DownloadIcon, DocumentTextOutline as DocumentTextIcon, EllipsisHorizontalOutline as MoreIcon, HelpCircleOutline as HelpCircleIcon, SparklesOutline as SparklesIcon } from '@vicons/ionicons5'
import api from '../../lib/api.js'
import { useSessionStore, useUiStore, useMeetingsStore, useMessagesStore } from '../../stores/index.js'
import { useChannelsStore } from '../../stores/channels.js'
import { useVoiceStore } from '../../stores/voice.js'
import { useDmsStore } from '../../stores/dms.js'


const SHORT_VIEWPORT_HEIGHT = 760
function observeShortViewport(callback, win = window) {
  if (!win?.addEventListener) {
    callback(false)
    return () => {}
  }

  const handler = () => {
    callback(readIsShortViewport(win))
  }

  handler()
  win.addEventListener('resize', handler)
  return () => win.removeEventListener('resize', handler)
}
function readIsShortViewport(win = window) {
  if (!win || typeof win.innerHeight !== 'number') return false
  return win.innerHeight <= SHORT_VIEWPORT_HEIGHT
}
const MemberList = defineAsyncComponent(() => import('../MemberList.vue'))
const MessageInput = defineAsyncComponent(() => import('../MessageInput.vue'))
const MessageList = defineAsyncComponent(() => import('../MessageList.vue'))
const MeetingTranscriptPanel = defineAsyncComponent(() => import('../MeetingTranscriptPanel.vue'))
const MeetingSummaryPanel = defineAsyncComponent(() => import('../MeetingSummaryPanel.vue'))
const AskMeetingPanel = defineAsyncComponent(() => import('../AskMeetingPanel.vue'))
export default {
  name: 'MeetingHistorySurface',
  components: { AskMeetingPanel,
ChatIcon,
CloseOutline,
DownloadIcon,
DocumentTextIcon,
HelpCircleIcon,
MeetingSummaryPanel,
MeetingTranscriptPanel,
MemberList,
MessageInput,
MessageList,
MoreIcon,
SparklesIcon },
  emits: [],
  props: { meeting: { type: Object, default: null },
isMobileLayout: Boolean,
showMembers: Boolean },
  data() { return {
viewGeneration: 0,
evidenceGeneration: 0,
loadingQuestions: false,
askingQuestion: false,
generatingSummary: false,
generatingTranscript: false,
downloadingMeetingAudio: false,
showShareSummaryModal: false,
showAdminArtifactMenu: false,
showEndedMeetingCompactMenu: false,
shareSummaryTargetChannelId: null,
meetingQuestionInput: '',
highlightedTranscriptStartMs: null,
lastLoadedQuestionsMeetingId: null,
isShortViewport: readIsShortViewport(),
stopObservingShortViewport: null,
endedMeetingArtifactTab: null,
isEndedMeetingChatOpen: false
  } },
  computed: {
meetingsStore() {
      return useMeetingsStore()
    },
messagesStore() {
      return useMessagesStore()
    },
isEndedMeetingView() {
      return !!this.meeting && this.meeting.status === 'ended'
    },
isCompactEndedMeetingMobileLayout() {
      return this.isEndedMeetingView && this.isMobileLayout
    },
isShortEndedMeetingViewport() {
      return this.isCompactEndedMeetingMobileLayout && this.isShortViewport
    },
isShareFocused() {
      return !!this.meeting
        && !this.isEndedMeetingView
        && !this.shareMaximized
        && this.hasActiveShare
        && this.shouldShowSharePanel
    },
shouldShowMeetingContentArea() {
      return !this.shareMaximized && !this.isShareFocused
    },
shareMaximized() {
      return this.uiStore.maximizeScreenShare
    },
attendedParticipantDisplayNames() {
      return this.attendedParticipants
        .map((entry) => entry.display_name || this.$t('ui.components.unknown'))
        .filter((value, index, list) => list.indexOf(value) === index)
    },
transcriptArtifact() {
      if (!Array.isArray(this.meeting?.artifacts)) return null
      return this.meeting.artifacts.find((artifact) => artifact.artifact_type === 'transcript') || null
    },
summaryArtifact() {
      if (!Array.isArray(this.meeting?.artifacts)) return null
      return this.meeting.artifacts.find((artifact) => artifact.artifact_type === 'summary') || null
    },
summaryGeneration() {
      return this.meeting?.summary_generation && typeof this.meeting.summary_generation === 'object'
        ? this.meeting.summary_generation
        : null
    },
transcriptGeneration() {
      return this.meeting?.transcript_generation && typeof this.meeting.transcript_generation === 'object'
        ? this.meeting.transcript_generation
        : null
    },
adminArtifactMenu() {
      return this.meeting?.admin_artifact_menu && typeof this.meeting.admin_artifact_menu === 'object'
        ? this.meeting.admin_artifact_menu
        : null
    },
showEndedMeetingAdminMenu() {
      return this.adminArtifactMenu?.visible === true
    },
shouldShowSummaryPanel() {
      return !!this.meeting && this.meeting.status === 'ended'
    },
endedMeetingArtifactTabs() {
      if (!this.isEndedMeetingView) return []

      const tabs = [
        { key: 'summary', label: this.$t('ui.views.meeting_summary') }
      ]

      if (this.transcriptArtifact) {
        tabs.push({ key: 'transcript', label: this.$t('ui.views.transcript') })
      }

      if (this.canAskMeeting) {
        tabs.push({ key: 'ask', label: this.$t('ui.views.ask_the_meeting') })
      }

      return tabs
    },
activeEndedMeetingArtifactTabLabel() {
      return this.endedMeetingArtifactTabs.find((tab) => tab.key === this.endedMeetingArtifactTab)?.label
        || this.$t('ui.views.meeting_insights')
    },
shouldRenderEndedMeetingDesktopChatTray() {
      return this.isEndedMeetingView && !this.isMobileLayout
    },
loadedMeetingChatMessages() {
      if (!this.meeting?.chat_channel_id) return []
      if (this.channelsStore.activeChannelId !== this.meeting.chat_channel_id) return []
      return (this.messagesStore.messages || []).filter((message) => (
        message?.type !== 'system' && typeof message?.content === 'string' && message.content.trim().length > 0
      ))
    },
meetingQuestions() {
      return this.meeting?.id ? this.meetingsStore.getQuestions(this.meeting.id) : []
    },
canAskMeeting() {
      return !!this.meeting && this.meeting.status === 'ended'
    },
canShareSummaryInApp() {
      return this.sessionStore.user?.account_type !== 'guest'
    },
summaryShareText() {
      if (this.summaryArtifact?.status !== 'ready' || !this.summaryPayload?.markdown) return ''
      const meetingLinkHeader = this.meetingShareLink
        ? `Meeting: ${this.meetingShareLink}`
        : ''
      return [meetingLinkHeader, this.summaryPayload.markdown]
        .filter((value) => typeof value === 'string' && value.trim().length > 0)
        .join('\n\n')
        .trim()
    },
shareDestinationOptions() {
      const channels = (this.channelsStore.channels || [])
        .filter((channel) => !channel?.is_archived)
        .map((channel) => ({
          label: `# ${channel.name}`,
          value: channel.id
        }))
      const dms = (this.dmsStore.dmChannels || [])
        .filter((channel) => !channel?.is_archived)
        .map((channel) => ({
          label: channel.display_name || channel.name,
          value: channel.id
        }))

      return [...channels, ...dms]
        .filter((entry, index, list) => list.findIndex((item) => item.value === entry.value) === index)
    },
sessionStore() {
      return useSessionStore()
    },
uiStore() {
      return useUiStore()
    },
channelsStore() {
      return useChannelsStore()
    },
dmsStore() {
      return useDmsStore()
    },
hasActiveShare() {
      return !!this.activeShare
    },
shouldShowSharePanel() {
      if (!this.meeting) return false
      return this.uiStore.screenSharePanelVisible || (this.hasActiveShare && !this.uiStore.hideScreenSharePanel)
    },
attendedParticipants() {
      const participants = Array.isArray(this.meeting?.participants)
        ? this.meeting.participants
        : []
      const seenUserIds = new Set()

      return participants
        .filter((entry) => !!entry?.joined_at && !!entry?.user_id)
        .sort((left, right) => {
          const leftTime = new Date(left.joined_at || 0).getTime()
          const rightTime = new Date(right.joined_at || 0).getTime()
          if (leftTime !== rightTime) return leftTime - rightTime
          return String(left.display_name || '').localeCompare(String(right.display_name || ''))
        })
        .filter((entry) => {
          if (seenUserIds.has(entry.user_id)) return false
          seenUserIds.add(entry.user_id)
          return true
        })
    },
meetingShareLink() {
      if (!this.meeting?.id) return ''
      if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}/meetings/${this.meeting.id}`
      }
      return `/meetings/${this.meeting.id}`
    },
defaultEndedMeetingArtifactTab() {
      if (!this.isEndedMeetingView) return null
      if (this.shouldShowSummaryPanel) return 'summary'
      if (this.transcriptArtifact) return 'transcript'
      if (this.canAskMeeting) return 'ask'
      return 'summary'
    },
summaryPayload() {
      return this.summaryArtifact?.payload && typeof this.summaryArtifact.payload === 'object'
        ? this.summaryArtifact.payload
        : null
    },
activeShare() {
      return this.voiceStore.activeScreenShare
    },
voiceStore() {
      return useVoiceStore()
    }
  },
  watch: {
'$route.query.message'() {
      this.syncRouteEvidence()
    },
'$route.query.transcript_start_ms'() {
      this.syncRouteEvidence()
    },
isMobileLayout() { this.isEndedMeetingChatOpen = false; this.ensureEndedMeetingArtifactTab(); this.showEndedMeetingCompactMenu = false },
endedMeetingArtifactTabs: {
      deep: true,
      handler() {
        this.ensureEndedMeetingArtifactTab()
      }
    },
shareMaximized() { this.showEndedMeetingCompactMenu = false },
meeting: { immediate: true, handler() { this.isEndedMeetingChatOpen = false; this.showEndedMeetingCompactMenu = false; this.ensureEndedMeetingArtifactTab(); this.syncRouteEvidence(); this.ensureMeetingQuestionsLoaded() } }
  },
  mounted() { this.stopObservingShortViewport = observeShortViewport(matches => { this.isShortViewport = matches }) },
  beforeUnmount() { this.viewGeneration++; this.evidenceGeneration++; this.stopObservingShortViewport?.() },
  methods: {
async ensureMeetingQuestionsLoaded({ force = false } = {}) {
      if (!this.canAskMeeting || !this.meeting?.id) return
      if (!force && this.lastLoadedQuestionsMeetingId === this.meeting.id) return

      const generation = this.viewGeneration
      const meetingId = this.meeting.id
      this.loadingQuestions = true
      try {
        await this.meetingsStore.loadQuestions(meetingId)
        if (generation !== this.viewGeneration) return
        this.lastLoadedQuestionsMeetingId = this.meeting.id
      } catch {
        if (generation === this.viewGeneration) window.$message?.error(this.$t('ui.views.meeting_questions_load_failed'))
      } finally {
        if (generation === this.viewGeneration) this.loadingQuestions = false
      }
    },
async syncRouteEvidence() {
      if (!this.meeting?.chat_channel_id) return
      const generation = ++this.evidenceGeneration
      const viewGeneration = this.viewGeneration

      const messageId = typeof this.$route.query.message === 'string'
        ? this.$route.query.message
        : null
      const transcriptStartMs = Number(this.$route.query.transcript_start_ms)

      if (messageId) {
        this.focusEvidenceSurface({ type: 'chat', message_id: messageId })
        this.messagesStore.setHighlightedMessage(messageId)
        await this.messagesStore.loadAroundMessage(messageId, {
          channelId: this.meeting.chat_channel_id
        }).catch(() => {})
      } else {
        this.messagesStore.clearHighlightedMessage()
      }

      if (generation !== this.evidenceGeneration || viewGeneration !== this.viewGeneration) return
      this.highlightedTranscriptStartMs = Number.isFinite(transcriptStartMs)
        ? transcriptStartMs
        : null

      if (Number.isFinite(transcriptStartMs)) {
        this.focusEvidenceSurface({ type: 'transcript', start_ms: transcriptStartMs })
      }

      this.$nextTick(() => {
        this.scrollHighlightedTranscriptIntoView()
      })
    },
ensureEndedMeetingArtifactTab(preferredKey = null) {
      if (!this.isEndedMeetingView) {
        this.endedMeetingArtifactTab = null
        return
      }

      const availableKeys = this.endedMeetingArtifactTabs.map((tab) => tab.key)
      if (!availableKeys.length) {
        this.endedMeetingArtifactTab = null
        return
      }

      if (preferredKey && availableKeys.includes(preferredKey)) {
        this.endedMeetingArtifactTab = preferredKey
        return
      }

      if (availableKeys.includes(this.endedMeetingArtifactTab)) {
        return
      }

      this.endedMeetingArtifactTab = availableKeys.includes(this.defaultEndedMeetingArtifactTab)
        ? this.defaultEndedMeetingArtifactTab
        : availableKeys[0]
    },
setEndedMeetingArtifactTab(tabKey) {
      this.ensureEndedMeetingArtifactTab(tabKey)
      this.showEndedMeetingCompactMenu = false
      if (this.isMobileLayout) {
        this.isEndedMeetingChatOpen = false
      }
      this.$nextTick(() => {
        this.scrollHighlightedTranscriptIntoView()
      })
    },
toggleEndedMeetingChat() {
      this.isEndedMeetingChatOpen = !this.isEndedMeetingChatOpen
    },
closeEndedMeetingChat() {
      this.isEndedMeetingChatOpen = false
    },
openEndedMeetingCompactMenuAction(action) {
      if (action === 'chat') {
        this.openEndedMeetingChat()
        return
      }

      this.setEndedMeetingArtifactTab(action)
    },
async triggerCompactMenuSummaryRegeneration() {
      this.showEndedMeetingCompactMenu = false
      await this.triggerAdminSummaryRegeneration()
    },
async triggerCompactMenuTranscriptRegeneration() {
      this.showEndedMeetingCompactMenu = false
      await this.triggerAdminTranscriptRegeneration()
    },
async downloadMeetingAudioFromCompactMenu() {
      this.showEndedMeetingCompactMenu = false
      await this.downloadMeetingAudio()
    },
focusEvidenceSurface(evidence) {
      if (!this.isEndedMeetingView || !evidence) return

      if (evidence.type === 'chat' && evidence.message_id) {
        this.openEndedMeetingChat()
        return
      }

      if (
        (evidence.type === 'transcript' || Number.isFinite(Number(evidence.start_ms)))
        && this.transcriptArtifact
      ) {
        this.ensureEndedMeetingArtifactTab('transcript')
        if (this.isMobileLayout) {
          this.closeEndedMeetingChat()
        }
      }
    },
async submitMeetingQuestion() {
      if (!this.canAskMeeting || !this.meeting?.id || !this.meetingQuestionInput.trim()) return

      this.askingQuestion = true
      try {
        await this.meetingsStore.askQuestion(this.meeting.id, this.meetingQuestionInput.trim())
        this.meetingQuestionInput = ''
      } catch {
        window.$message?.error(this.$t('ui.views.ask_meeting_failed'))
      } finally {
        this.askingQuestion = false
      }
    },
scrollHighlightedTranscriptIntoView() {
      const panel = this.$refs.endedTranscriptPanel || this.$refs.inlineTranscriptPanel
      panel?.scrollHighlightedIntoView?.()
    },
async openEvidence(evidence) {
      if (!this.meeting?.id || !evidence) return

      this.focusEvidenceSurface(evidence)

      const query = { ...this.$route.query }
      delete query.message
      delete query.transcript_start_ms

      if (evidence.type === 'chat' && evidence.message_id) {
        query.message = evidence.message_id
      } else if ((evidence.type === 'transcript' || Number.isFinite(Number(evidence.start_ms))) && Number.isFinite(Number(evidence.start_ms))) {
        query.transcript_start_ms = String(evidence.start_ms)
      } else {
        return
      }

      await this.$router.replace({
        path: `/meetings/${this.meeting.id}`,
        query
      }).catch(() => {})
    },
async triggerSummaryGeneration(options = {}) {
      const force = options.force === true
      if (!this.meeting?.id || this.generatingSummary) return
      if (!force && !this.summaryGeneration?.allowed) return

      this.generatingSummary = true
      try {
        await this.meetingsStore.generateSummary(this.meeting.id, {
          reason: options.reason || undefined
        })
        window.$message?.success(this.$t(options.successMessageKey || (
          this.summaryGeneration?.action === 'retry'
            ? 'ui.views.summary_retry_queued'
            : 'ui.views.summary_generation_queued'
        )))
      } catch {
        window.$message?.error(this.$t('ui.views.summary_generation_failed'))
      } finally {
        this.generatingSummary = false
      }
    },
async triggerTranscriptGeneration(options = {}) {
      const force = options.force === true
      if (!this.meeting?.id || this.generatingTranscript) return
      if (!force && !this.transcriptGeneration?.allowed) return

      this.generatingTranscript = true
      try {
        await this.meetingsStore.generateTranscript(this.meeting.id, {
          reason: options.reason || undefined
        })
        window.$message?.success(this.$t(options.successMessageKey || 'ui.views.transcript_retry_queued'))
      } catch {
        window.$message?.error(this.$t('ui.views.transcript_generation_failed'))
      } finally {
        this.generatingTranscript = false
      }
    },
async triggerAdminSummaryRegeneration() {
      this.showAdminArtifactMenu = false
      await this.triggerSummaryGeneration({
        force: true,
        reason: 'admin_regenerate',
        successMessageKey: 'ui.views.summary_regeneration_queued'
      })
    },
async triggerAdminTranscriptRegeneration() {
      this.showAdminArtifactMenu = false
      await this.triggerTranscriptGeneration({
        force: true,
        reason: 'admin_regenerate',
        successMessageKey: 'ui.views.transcript_regeneration_queued'
      })
    },
openShareSummaryModal() {
      if (!this.summaryShareText || !this.canShareSummaryInApp) return
      this.showShareSummaryModal = true
    },
async copySummary() {
      if (!this.summaryShareText) return
      try {
        await navigator.clipboard.writeText(this.summaryShareText)
        window.$message?.success(this.$t('ui.views.summary_copied'))
      } catch {
        window.$message?.error(this.$t('ui.views.summary_copy_failed'))
      }
    },
exportSummary() {
      if (!this.summaryShareText || !this.meeting?.id) return
      const blob = new Blob([this.summaryShareText], { type: 'text/markdown;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `meeting-summary-${this.meeting.id}.md`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.URL.revokeObjectURL(url)
    },
async shareSummaryInApp() {
      if (!this.canShareSummaryInApp || !this.shareSummaryTargetChannelId || !this.summaryShareText) return

      try {
        await this.messagesStore.sendToChannel(this.shareSummaryTargetChannelId, this.summaryShareText)
        this.showShareSummaryModal = false
        this.shareSummaryTargetChannelId = null
        window.$message?.success(this.$t('ui.views.summary_shared'))
      } catch {
        window.$message?.error(this.$t('ui.views.summary_share_failed'))
      }
    },
async downloadMeetingAudio() {
      if (!this.meeting?.id || this.downloadingMeetingAudio || !this.adminArtifactMenu?.can_download_audio) return

      this.showAdminArtifactMenu = false
      this.downloadingMeetingAudio = true
      try {
        const response = await api.get(`/meetings/${this.meeting.id}/audio`, {
          responseType: 'blob'
        })
        const blob = new Blob([response.data], { type: 'application/zip' })
        const url = window.URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `meeting-${this.meeting.id}-audio.zip`
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        window.URL.revokeObjectURL(url)
      } catch {
        window.$message?.error(this.$t('ui.views.could_not_download_meeting_audio'))
      } finally {
        this.downloadingMeetingAudio = false
      }
    },
openEndedMeetingChat() {
      this.showEndedMeetingCompactMenu = false
      this.isEndedMeetingChatOpen = true
    }
  }
}
</script>

<style scoped>

.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-width: 0;
}

.content-area.ended-meeting-layout {
  align-items: stretch;
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.ended-meeting-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.no-meeting {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.member-panel {
  width: 240px;
  flex-shrink: 0;
  border-left: 1px solid var(--app-border);
  overflow-y: auto;
}

.artifacts-panel {
  border-top: 1px solid var(--app-border);
  padding: 10px 16px;
  background: var(--app-surface);
  overflow-y: auto;
}

.ended-artifacts-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  border-top: none;
  padding: 12px 16px 16px;
}

.ended-artifacts-panel-compact {
  gap: 0;
  padding-top: 8px;
}

.ended-artifacts-panel-short {
  padding-top: 6px;
  padding-bottom: 12px;
}

.ended-artifacts-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.artifacts-title {
  font-size: 11px;
  opacity: 0.62;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.artifacts-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}

.artifact-status-list {
  display: inline-flex;
  align-items: center;
  gap: 8px 12px;
  min-width: 0;
  flex-wrap: wrap;
}

.artifact-status-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11px;
  line-height: 1.3;
  color: var(--app-text-muted);
}

.artifact-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-surface-muted);
  flex-shrink: 0;
}

.artifact-status-meta.status-ready .artifact-status-dot {
  background: var(--theme-success);
}

.artifact-status-meta.status-processing .artifact-status-dot {
  background: var(--theme-warning);
}

.artifact-status-meta.status-failed .artifact-status-dot {
  background: var(--theme-error);
}

.artifact-status-text {
  white-space: nowrap;
}

.summary-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  opacity: 0.82;
  text-transform: uppercase;
}

.artifact-hub {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border-soft);
  border-radius: 18px;
  background: var(--app-surface);
  overflow: hidden;
}

.artifact-hub-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--app-border-soft);
  flex-shrink: 0;
}

.artifact-hub-header-compact {
  position: sticky;
  top: 0;
  z-index: 1;
  align-items: stretch;
  flex-direction: column;
  padding: 10px 12px;
  gap: 10px;
  background: var(--app-surface);
}

.artifact-hub-header-short {
  padding-top: 8px;
  padding-bottom: 8px;
  gap: 8px;
}

.artifact-hub-compact-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.artifact-hub-compact-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.meeting-ended-action-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 270px;
  padding: 4px;
  color: var(--app-text);
}

.meeting-ended-menu-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  width: 100%;
  min-height: 35px;
  padding: 0 10px 0 14px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
}

.meeting-ended-menu-action:hover {
  background: var(--app-hover);
  color: var(--app-text-strong);
}

.meeting-ended-menu-action:focus-visible {
  outline: 2px solid var(--app-focus);
  outline-offset: 2px;
}

.meeting-ended-menu-action:disabled {
  cursor: wait;
  opacity: 0.55;
}

.meeting-ended-menu-action-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 400;
}

.meeting-ended-actions-sheet {
  position: fixed;
  bottom: 0;
  box-sizing: border-box;
  width: min(100vw, 420px);
  max-height: calc(100dvh - 16px);
  margin: 0 auto;
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));
  border: 1px solid var(--app-border-strong);
  border-bottom: 0;
  border-radius: 16px 16px 0 0;
  background: var(--app-surface-raised);
  box-shadow: 0 -16px 40px rgba(0, 0, 0, 0.38);
  color: var(--app-text);
  overflow-y: auto;
}

.meeting-ended-actions-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 2px 10px;
}

.meeting-ended-actions-sheet-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
}

.meeting-ended-actions-sheet-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: none;
  border-radius: 8px;
  background: var(--app-surface-muted);
  color: var(--app-text-muted);
  cursor: pointer;
}

.meeting-ended-actions-sheet-close:hover {
  background: var(--app-hover);
  color: var(--app-text-strong);
}

.meeting-ended-actions-sheet-close:focus-visible {
  outline: 2px solid var(--app-focus);
  outline-offset: 2px;
}

.meeting-ended-actions-sheet .meeting-ended-action-menu {
  width: 100%;
  min-width: 0;
}

.meeting-ended-menu-divider {
  height: 1px;
  margin: 6px 0;
  background: var(--app-border-soft);
}

.artifact-hub-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.artifact-tab-row {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.artifact-status-list-compact {
  gap: 6px 8px;
}

.meeting-admin-artifact-menu {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 220px;
}

.meeting-admin-artifact-action {
  justify-content: flex-start;
}

.artifact-hub-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 16px 16px;
}

.artifact-hub-body-compact {
  padding: 10px 12px 12px;
}

.artifact-hub-body-short {
  padding-top: 8px;
  padding-bottom: 10px;
}

.ended-meeting-chat-tray {
  flex-shrink: 0;
  border: 1px solid var(--app-border-soft);
  border-radius: 18px;
  background: var(--app-surface);
  overflow: hidden;
}

.ended-meeting-chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
}

.ended-meeting-chat-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ended-meeting-chat-hint {
  font-size: 12px;
  opacity: 0.68;
  line-height: 1.4;
}

.ended-meeting-chat-body {
  height: min(34vh, 320px);
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--app-border-soft);
}

.ended-meeting-chat-drawer-body {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ended-meeting-chat-drawer-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ended-meeting-chat-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--app-border-soft);
  flex-shrink: 0;
}

@media (max-width: 900px) {

  .artifacts-panel {
    padding: 10px 12px;
  }

  .ended-artifacts-panel {
    padding: 12px;
  }

  .ended-artifacts-panel-compact {
    padding: 8px 12px 12px;
  }

  .ended-artifacts-toolbar,
  .artifact-hub-header,
  .ended-meeting-chat-header,
  .ended-meeting-chat-drawer-header {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .artifact-tab-row {
    width: 100%;
    justify-content: flex-start;
  }

  .artifact-hub-actions {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .artifact-hub-body {
    padding: 0 12px 12px;
  }

  .artifact-hub-header-compact {
    padding: 10px 12px;
  }

  .artifact-hub-body-compact {
    padding: 10px 12px 12px;
  }

  .artifacts-row {
    align-items: flex-start;
  }

  .member-panel {
    display: none;
  }
}

@media (max-width: 420px) {
  .meeting-ended-menu-action {
    min-height: 40px;
    padding-top: 8px;
    padding-bottom: 8px;
  }

  .meeting-ended-menu-action-label {
    white-space: normal;
  }
}

</style>
