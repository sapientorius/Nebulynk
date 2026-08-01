<template>
  <div class="workspace-context" data-testid="meeting-view">
    <div class="main-area" :class="{ 'share-maximized': shareMaximized }">
      <div
        class="meeting-header"
        :class="{
          'meeting-header-compact': isCompactEndedMeetingMobileLayout,
          'meeting-header-short': isShortEndedMeetingViewport
        }"
        v-if="meeting && !shareMaximized"
      >
        <template v-if="isCompactEndedMeetingMobileLayout">
          <div class="meeting-header-compact-row" data-testid="meeting-ended-mobile-header">
            <div class="meeting-header-compact-copy">
              <div class="meeting-header-compact-title-row">
                <span class="meeting-title">{{ meetingTitle }}</span>
                <n-tag :type="meetingStatusType" size="small">
                  {{ meetingStatusLabel }}
                </n-tag>
              </div>

              <div class="meeting-header-compact-meta" data-testid="meeting-ended-mobile-meta">
                <span class="meeting-compact-meta-item meeting-compact-meta-source">
                  {{ $t('ui.views.source') }}:
                  <span v-if="meetingSourceDisplayName">{{ meetingSourceDisplayName }}</span>
                  <span v-else>{{ $t('ui.components.unknown') }}</span>
                </span>
                <span class="meeting-compact-meta-item">
                  {{ participantCount }} {{ $t('ui.views.participants') }}
                </span>
                <span class="meeting-compact-meta-item">
                  {{ meetingLanguageLabel }}
                </span>
              </div>
            </div>

            <n-popover
              v-model:show="showMobileActionMenu"
              trigger="click"
              placement="bottom-end"
              :show-arrow="false"
            >
              <template #trigger>
                <n-button
                  quaternary
                  circle
                  size="small"
                  data-testid="meeting-mobile-overflow-trigger"
                  :title="$t('ui.components.admin.actions')"
                >
                  <template #icon><n-icon size="18"><more-icon /></n-icon></template>
                </n-button>
              </template>

              <div
                class="meeting-ended-action-menu meeting-header-compact-menu"
                data-testid="meeting-mobile-overflow-menu"
              >
                <button
                  v-if="!shareMaximized"
                  type="button"
                  class="meeting-ended-menu-action"
                  data-testid="meeting-mobile-overflow-members"
                  @click="$emit('toggle-members'); showMobileActionMenu = false"
                >
                  <span class="meeting-ended-menu-action-label">
                    {{ participantCount }} {{ $t('ui.views.participants') }}
                  </span>
                  <n-icon size="20"><people-icon /></n-icon>
                </button>

                <div
                  v-if="!shareMaximized && (canEditMeetingTitle || canEditMeetingLanguage || canGoToSourceChannel)"
                  class="meeting-ended-menu-divider"
                />

                <button
                  v-if="canEditMeetingTitle"
                  type="button"
                  class="meeting-ended-menu-action"
                  data-testid="meeting-mobile-overflow-edit-title"
                  @click="openTitleModal(); showMobileActionMenu = false"
                >
                  <span class="meeting-ended-menu-action-label">{{ $t('ui.views.edit_title') }}</span>
                  <n-icon size="20"><edit-icon /></n-icon>
                </button>
                <button
                  v-if="canEditMeetingLanguage"
                  type="button"
                  class="meeting-ended-menu-action"
                  data-testid="meeting-mobile-overflow-language"
                  @click="openLanguageModal(); showMobileActionMenu = false"
                >
                  <span class="meeting-ended-menu-action-label">{{ $t('ui.views.change_meeting_language') }}</span>
                  <n-icon size="20"><language-icon /></n-icon>
                </button>
                <button
                  v-if="canGoToSourceChannel"
                  type="button"
                  class="meeting-ended-menu-action"
                  data-testid="meeting-mobile-overflow-source"
                  @click="goToSourceChannel(); showMobileActionMenu = false"
                >
                  <span class="meeting-ended-menu-action-label">{{ $t('ui.views.back_to_source_channel') }}</span>
                  <n-icon size="20"><back-icon /></n-icon>
                </button>
              </div>
            </n-popover>
          </div>
        </template>

        <template v-else>
          <n-space class="meeting-header-row" align="center" justify="space-between" style="width: 100%">
            <n-space class="meeting-header-copy" vertical :size="4">
              <n-space class="meeting-header-title-row" align="center" :size="8">
                <span class="meeting-title">{{ meetingTitle }}</span>
                <n-button v-if="canEditMeetingTitle" text size="tiny" @click="openTitleModal">
                  {{ $t('ui.views.edit_title') }}
                </n-button>
                <n-tag :type="meetingStatusType" size="small">
                  {{ meetingStatusLabel }}
                </n-tag>
              </n-space>
              <span class="meeting-context">
                {{ $t('ui.views.source') }}:
                <span v-if="meetingSourceDisplayName">{{ meetingSourceDisplayName }}</span>
                <span v-else>{{ $t('ui.components.unknown') }}</span>
              </span>
              <div v-if="meetingScheduleMeta.length > 0" class="meeting-schedule-meta">
                <span v-for="entry in meetingScheduleMeta" :key="entry.label">
                  <strong>{{ entry.label }}:</strong> {{ entry.value }}
                </span>
              </div>
            </n-space>

            <n-space class="meeting-header-actions" :size="6" align="center">
              <n-button v-if="canJoinCall" type="primary" size="small" :loading="joining" @click="joinCall">
                {{ $t('ui.components.join_call') }}
              </n-button>

              <ScreenShareControls
                :channel-id="meeting?.chat_channel_id || null"
                :can-start="canShowIdleShareControl"
                :share-hidden="isShareHidden"
                test-id-prefix="meeting"
              />

              <n-button v-if="canInviteUsers && !isMobileLayout" size="small" @click="showInviteModal = true">
                {{ $t('ui.components.admin.invite') }}
              </n-button>
              <n-button v-if="canEditMeetingLanguage && !isMobileLayout" size="small" @click="openLanguageModal">
                {{ $t('ui.views.change_meeting_language') }}
              </n-button>
              <n-button v-if="canRescheduleMeeting && !isMobileLayout" size="small" @click="openRescheduleModal">
                {{ $t('ui.views.reschedule_meeting') }}
              </n-button>
              <n-button
                v-if="canManageGuestLink && !meetingInviteLinkUrl && !isMobileLayout"
                size="small"
                :loading="creatingInviteLink"
                @click="createGuestInviteLink"
              >
                {{ $t('ui.views.create_meeting_link') }}
              </n-button>
              <n-button
                v-if="canManageGuestLink && meetingInviteLinkUrl && !isMobileLayout"
                size="small"
                :loading="creatingInviteLink"
                @click="copyGuestInviteLink"
              >
                {{ $t('ui.views.copy_meeting_link') }}
              </n-button>
              <n-button
                v-if="canManageGuestLink && meeting?.guest_invite_link && !isMobileLayout"
                size="small"
                :loading="revokingInviteLink"
                @click="revokeGuestInviteLink"
              >
                {{ $t('ui.views.revoke_meeting_link') }}
              </n-button>
              <n-button v-if="meeting?.id && meeting.status !== 'ended' && !isMobileLayout" size="small" :loading="downloadingIcs" @click="downloadMeetingIcs">
                {{ $t('ui.views.open_meeting_ics') }}
              </n-button>
              <n-button v-if="canCancelMeeting" size="small" type="warning" :loading="cancelling" @click="cancelMeeting">
                {{ $t('ui.views.cancel_meeting') }}
              </n-button>
              <n-button v-if="canEndMeeting" size="small" type="error" :loading="ending" @click="endMeeting">
                {{ $t('ui.views.end_meeting') }}
              </n-button>
              <n-button v-if="canGoToSourceChannel && !isMobileLayout" size="small" quaternary @click="goToSourceChannel">
                {{ $t('ui.views.back_to_source_channel') }}
              </n-button>
              <n-button v-if="!shareMaximized" quaternary size="small" @click="$emit('toggle-members')">
                {{ participantCount }} {{ $t('ui.views.participants') }}
              </n-button>

              <n-popover
                v-if="isMobileLayout"
                v-model:show="showMobileActionMenu"
                trigger="click"
                placement="bottom-end"
              >
                <template #trigger>
                  <n-button
                    quaternary
                    circle
                    size="small"
                    data-testid="meeting-mobile-overflow-trigger"
                    :title="$t('ui.components.admin.actions')"
                  >
                    <template #icon><n-icon size="18"><more-icon /></n-icon></template>
                  </n-button>
                </template>

                <div class="meeting-mobile-overflow-menu">
                  <n-button
                    v-if="canManageMeetingVideo"
                    text
                    size="small"
                    data-testid="meeting-mobile-video-controls"
                    class="meeting-mobile-overflow-action"
                    @click="openMeetingVideoPanel"
                  >
                    <template #icon><n-icon size="16"><videocam-icon /></n-icon></template>
                    {{ $t('ui.views.meeting_video_controls') }}
                  </n-button>
                  <n-button
                    v-if="canEditMeetingTitle"
                    text
                    size="small"
                    class="meeting-mobile-overflow-action"
                    @click="openTitleModal(); showMobileActionMenu = false"
                  >
                    {{ $t('ui.views.edit_title') }}
                  </n-button>
                  <n-button
                    v-if="canInviteUsers"
                    text
                    size="small"
                    class="meeting-mobile-overflow-action"
                    @click="showInviteModal = true; showMobileActionMenu = false"
                  >
                    {{ $t('ui.components.admin.invite') }}
                  </n-button>
                  <n-button
                    v-if="canEditMeetingLanguage"
                    text
                    size="small"
                    class="meeting-mobile-overflow-action"
                    @click="openLanguageModal(); showMobileActionMenu = false"
                  >
                    {{ $t('ui.views.change_meeting_language') }}
                  </n-button>
                  <n-button
                    v-if="canRescheduleMeeting"
                    text
                    size="small"
                    class="meeting-mobile-overflow-action"
                    @click="openRescheduleModal(); showMobileActionMenu = false"
                  >
                    {{ $t('ui.views.reschedule_meeting') }}
                  </n-button>
                  <n-button
                    v-if="canManageGuestLink && !meetingInviteLinkUrl"
                    text
                    size="small"
                    class="meeting-mobile-overflow-action"
                    @click="createGuestInviteLink(); showMobileActionMenu = false"
                  >
                    {{ $t('ui.views.create_meeting_link') }}
                  </n-button>
                  <n-button
                    v-if="canManageGuestLink && meetingInviteLinkUrl"
                    text
                    size="small"
                    class="meeting-mobile-overflow-action"
                    @click="copyGuestInviteLink(); showMobileActionMenu = false"
                  >
                    {{ $t('ui.views.copy_meeting_link') }}
                  </n-button>
                  <n-button
                    v-if="canManageGuestLink && meeting?.guest_invite_link"
                    text
                    size="small"
                    class="meeting-mobile-overflow-action"
                    @click="revokeGuestInviteLink(); showMobileActionMenu = false"
                  >
                    {{ $t('ui.views.revoke_meeting_link') }}
                  </n-button>
                  <n-button
                    v-if="meeting?.id && meeting.status !== 'ended'"
                    text
                    size="small"
                    class="meeting-mobile-overflow-action"
                    @click="downloadMeetingIcs(); showMobileActionMenu = false"
                  >
                    {{ $t('ui.views.open_meeting_ics') }}
                  </n-button>
                  <n-button
                    v-if="canGoToSourceChannel"
                    text
                    size="small"
                    class="meeting-mobile-overflow-action"
                    @click="goToSourceChannel(); showMobileActionMenu = false"
                  >
                    {{ $t('ui.views.back_to_source_channel') }}
                  </n-button>
                </div>
              </n-popover>
            </n-space>
          </n-space>
        </template>
      </div>

      <div v-if="meeting && !shareMaximized && (showMeetingInviteLinkBanner || isScheduledMeeting || isCancelledMeeting)" class="meeting-meta-banner">
        <div v-if="showMeetingInviteLinkBanner" class="meeting-meta-copy meeting-meta-copy-dismissible">
          <div class="meeting-meta-copy-header">
            <strong>{{ $t('ui.views.guest_link_ready') }}</strong>
            <n-button
              quaternary
              circle
              size="tiny"
              class="meeting-meta-dismiss"
              :aria-label="$t('common.close')"
              @click="dismissMeetingInviteLinkBanner"
            >
              <template #icon>
                <n-icon size="14"><close-outline /></n-icon>
              </template>
            </n-button>
          </div>
          <span>{{ meetingInviteLinkInfo }}</span>
        </div>
        <div v-if="isScheduledMeeting && !canJoinCall" class="meeting-meta-copy">
          <strong>{{ $t('ui.views.scheduled') }}</strong>
          <span>{{ $t('ui.views.schedule_meeting_hint') }}</span>
        </div>
        <div v-if="isCancelledMeeting" class="meeting-meta-copy">
          <strong>{{ $t('ui.views.cancelled') }}</strong>
          <span>{{ $t('ui.views.meeting_cancelled') }}</span>
        </div>
      </div>

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
    </div>

    <n-modal v-model:show="showInviteModal">
      <n-card :title="$t('ui.views.invite_users')" style="max-width: 440px; width: 100%">
        <n-form>
          <n-form-item :label="$t('ui.views.users')">
            <n-select
              v-model:value="inviteUserIds"
              multiple
              filterable
              remote
              :loading="inviteSearchLoading"
              :options="inviteOptions"
              :placeholder="$t('ui.views.select_users')"
              @search="handleInviteSearch"
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showInviteModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button type="primary" :loading="inviting" :disabled="inviteUserIds.length === 0" @click="submitInvite">
              {{ $t('ui.components.admin.invite') }}
            </n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal v-model:show="showTitleModal">
      <n-card :title="$t('ui.views.edit_meeting_title')" style="max-width: 460px; width: 100%">
        <n-form>
          <n-form-item :label="$t('ui.views.title')">
            <n-input
              v-model:value="titleForm.title"
              maxlength="120"
              :placeholder="$t('ui.views.optional_meeting_title')"
              @keyup.enter="saveMeetingTitle"
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showTitleModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button type="primary" :loading="savingTitle" @click="saveMeetingTitle">
              {{ $t('ui.components.admin.save') }}
            </n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal v-model:show="showLanguageModal">
      <n-card :title="$t('ui.views.change_meeting_language')" style="max-width: 460px; width: 100%">
        <n-form>
          <n-form-item :label="$t('ui.views.meeting_language')">
            <n-select
              v-model:value="languageForm.language"
              :options="meetingLanguageOptions"
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showLanguageModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button type="primary" :loading="savingLanguage" @click="saveMeetingLanguage">
              {{ $t('ui.components.admin.save') }}
            </n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal v-model:show="showRescheduleModal">
      <n-card :title="$t('ui.views.reschedule_meeting')" style="max-width: 520px; width: 100%">
        <n-form>
          <n-form-item :label="$t('ui.views.starts_at')">
            <n-input
              v-model:value="rescheduleForm.scheduledStartAt"
              type="datetime-local"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.views.ends_at')">
            <n-input
              v-model:value="rescheduleForm.scheduledEndAt"
              type="datetime-local"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.views.meeting_description')">
            <n-input
              v-model:value="rescheduleForm.description"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 5 }"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.views.meeting_language')">
            <n-select
              v-model:value="rescheduleForm.language"
              :options="meetingLanguageOptions"
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showRescheduleModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button
              type="primary"
              :loading="rescheduling"
              :disabled="!rescheduleForm.scheduledStartAt"
              @click="submitReschedule"
            >
              {{ $t('ui.views.reschedule_meeting') }}
            </n-button>
          </n-space>
        </template>
      </n-card>
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
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import {
  ArrowUndoOutline as BackIcon,
  ChatbubbleEllipsesOutline as ChatIcon,
  CloseOutline,
  DownloadOutline as DownloadIcon,
  DocumentTextOutline as DocumentTextIcon,
  EllipsisHorizontalOutline as MoreIcon,
  HelpCircleOutline as HelpCircleIcon,
  LanguageOutline as LanguageIcon,
  PencilOutline as EditIcon,
  PeopleOutline as PeopleIcon,
  SparklesOutline as SparklesIcon,
  VideocamOffOutline as VideocamOffIcon,
  VideocamOutline as VideocamIcon
} from '@vicons/ionicons5'
import api from '../lib/api.js'
import {
  DEFAULT_MEETING_LANGUAGE,
  getMeetingLanguageLabel,
  getMeetingLanguageOptions,
  normalizeMeetingLanguage
} from '../lib/meeting-languages.js'
import { confirmUnsupportedBlurFallback } from '../lib/meeting-video-dialogs.js'
import { observeMobileLayout, readIsMobileLayout } from '../lib/mobile-layout.js'
import { openDetachedScreenShareWindow } from '../lib/screen-share.js'
import {
  useSessionStore,
  useUiStore,
  useMeetingsStore,
  useMessagesStore
} from '../stores/index.js'
import { useChannelsStore } from '../stores/channels.js'
import { useVoiceStore } from '../stores/voice.js'
import { useDmsStore } from '../stores/dms.js'
import {
  countMeetingEngagedParticipants
} from '../lib/meeting-card.js'
import { getEffectiveMeetingStatus, isOverdueScheduledMeeting } from '../lib/meeting-lifecycle.js'

const AskMeetingPanel = defineAsyncComponent(() => import('../components/AskMeetingPanel.vue'))
const MeetingScreenSharePanel = defineAsyncComponent(() => import('../components/MeetingScreenSharePanel.vue'))
const MeetingSummaryPanel = defineAsyncComponent(() => import('../components/MeetingSummaryPanel.vue'))
const MeetingTranscriptPanel = defineAsyncComponent(() => import('../components/MeetingTranscriptPanel.vue'))
const MeetingVideoGrid = defineAsyncComponent(() => import('../components/MeetingVideoGrid.vue'))
const MessageList = defineAsyncComponent(() => import('../components/MessageList.vue'))
const MessageInput = defineAsyncComponent(() => import('../components/MessageInput.vue'))
const MemberList = defineAsyncComponent(() => import('../components/MemberList.vue'))
const ScreenShareChatOverlay = defineAsyncComponent(() => import('../components/ScreenShareChatOverlay.vue'))
const ScreenShareControls = defineAsyncComponent(() => import('../components/ScreenShareControls.vue'))
const TranscriptionRecordingBanner = defineAsyncComponent(() => import('../components/TranscriptionRecordingBanner.vue'))
const VideoSettingsContent = defineAsyncComponent(() => import('../components/VideoSettingsContent.vue'))
const SHORT_VIEWPORT_HEIGHT = 760

function readIsShortViewport(win = window) {
  if (!win || typeof win.innerHeight !== 'number') return false
  return win.innerHeight <= SHORT_VIEWPORT_HEIGHT
}

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

export default {
  name: 'MeetingView',
  components: {
    AskMeetingPanel,
    ChatIcon,
    CloseOutline,
    DownloadIcon,
    DocumentTextIcon,
    HelpCircleIcon,
    MeetingScreenSharePanel,
    MeetingSummaryPanel,
    MeetingTranscriptPanel,
    MeetingVideoGrid,
    MemberList,
    MessageInput,
    MessageList,
    MoreIcon,
    ScreenShareChatOverlay,
    ScreenShareControls,
    SparklesIcon,
    TranscriptionRecordingBanner,
    VideoSettingsContent,
    VideocamIcon,
    VideocamOffIcon
  },
  emits: ['toggle-members'],
  props: {
    showMembers: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      showInviteModal: false,
      showTitleModal: false,
      showLanguageModal: false,
      inviteUserIds: [],
      inviteSearchTerm: '',
      inviteSearchResults: [],
      inviteSearchLoading: false,
      inviteSearchTimer: null,
      joining: false,
      inviting: false,
      ending: false,
      cancelling: false,
      rescheduling: false,
      creatingInviteLink: false,
      revokingInviteLink: false,
      downloadingIcs: false,
      savingTitle: false,
      savingLanguage: false,
      loadingQuestions: false,
      askingQuestion: false,
      generatingSummary: false,
      generatingTranscript: false,
      downloadingMeetingAudio: false,
      recordingActionLoading: false,
      showShareSummaryModal: false,
      showRescheduleModal: false,
      showMeetingVideoPanel: false,
      showMobileActionMenu: false,
      showAdminArtifactMenu: false,
      showEndedMeetingCompactMenu: false,
      shareSummaryTargetChannelId: null,
      meetingQuestionInput: '',
      meetingInviteLinkBannerDismissed: false,
      highlightedTranscriptStartMs: null,
      lastLoadedQuestionsMeetingId: null,
      isMobileLayout: readIsMobileLayout(),
      isShortViewport: readIsShortViewport(),
      meetingVideosVisible: true,
      selectedMeetingVideoParticipantId: null,
      stopObservingMobileLayout: null,
      stopObservingShortViewport: null,
      endedMeetingArtifactTab: null,
      isEndedMeetingChatOpen: false,
      rescheduleForm: {
        scheduledStartAt: '',
        scheduledEndAt: '',
        description: '',
        language: DEFAULT_MEETING_LANGUAGE
      },
      titleForm: {
        title: ''
      },
      languageForm: {
        language: DEFAULT_MEETING_LANGUAGE
      }
    }
  },
  computed: {
    sessionStore() {
      return useSessionStore()
    },
    uiStore() {
      return useUiStore()
    },
    meetingsStore() {
      return useMeetingsStore()
    },
    messagesStore() {
      return useMessagesStore()
    },
    channelsStore() {
      return useChannelsStore()
    },
    dmsStore() {
      return useDmsStore()
    },
    voiceStore() {
      return useVoiceStore()
    },
    meeting() {
      return this.meetingsStore.activeMeeting
    },
    effectiveMeetingStatus() {
      return getEffectiveMeetingStatus(this.meeting)
    },
    isOverdueScheduledMeeting() {
      return isOverdueScheduledMeeting(this.meeting)
    },
    isScheduledMeeting() {
      return !!this.meeting && this.effectiveMeetingStatus === 'scheduled'
    },
    isCancelledMeeting() {
      return !!this.meeting && this.effectiveMeetingStatus === 'cancelled'
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
    meetingStatusType() {
      if (!this.meeting) return 'default'
      if (this.effectiveMeetingStatus === 'active') return 'success'
      if (this.effectiveMeetingStatus === 'scheduled') return 'info'
      if (this.effectiveMeetingStatus === 'cancelled') return 'error'
      return 'warning'
    },
    meetingStatusLabel() {
      if (!this.meeting) return ''
      if (this.effectiveMeetingStatus === 'active') return this.$t('ui.views.active')
      if (this.effectiveMeetingStatus === 'scheduled') return this.$t('ui.views.scheduled')
      if (this.effectiveMeetingStatus === 'cancelled') return this.$t('ui.views.cancelled')
      return this.$t('ui.views.ended')
    },
    activeShare() {
      return this.voiceStore.activeScreenShare
    },
    hasActiveShare() {
      return !!this.activeShare
    },
    isLocalActiveShare() {
      return !!this.activeShare?.isLocal
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
    shouldShowMeetingContentArea() {
      return !this.shareMaximized && !this.isShareFocused
    },
    isShareHidden() {
      return this.hasActiveShare && !this.shouldShowSharePanel
    },
    shareMaximized() {
      return this.uiStore.maximizeScreenShare
    },
    shareChatOpen() {
      return this.uiStore.showScreenShareChat
    },
    canShowIdleShareControl() {
      return !!this.meeting
        && this.meeting.status === 'active'
        && this.voiceStore.channelId === this.meeting.chat_channel_id
        && this.voiceStore.connected
        && !this.hasActiveShare
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
    meetingTitle() {
      if (!this.meeting) return ''
      return this.meetingsStore.resolveDisplayName(this.meeting)
    },
    meetingSourceDisplayName() {
      if (!this.meeting) return null
      return this.meetingsStore.resolveSourceDisplayName(this.meeting)
    },
    meetingVoiceParticipants() {
      if (!this.meeting?.chat_channel_id) return []
      return this.voiceStore.participants[this.meeting.chat_channel_id] || []
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
    participantCount() {
      if (!this.meeting) return 0
      if (this.meeting.status === 'ended') {
        return countMeetingEngagedParticipants(this.meeting)
      }
      return this.visibleMeetingParticipants.length
    },
    remoteMeetingParticipants() {
      const selfId = this.sessionStore.user?.id || null
      return this.visibleMeetingParticipants.filter((participant) => participant?.user_id && participant.user_id !== selfId)
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
    attendedParticipantDisplayNames() {
      return this.attendedParticipants
        .map((entry) => entry.display_name || this.$t('ui.components.unknown'))
        .filter((value, index, list) => list.indexOf(value) === index)
    },
    meetingShareLink() {
      if (!this.meeting?.id) return ''
      if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}/meetings/${this.meeting.id}`
      }
      return `/meetings/${this.meeting.id}`
    },
    canJoinCall() {
      return !!this.meeting
        && (this.effectiveMeetingStatus === 'active' || this.effectiveMeetingStatus === 'scheduled')
        && this.voiceStore.channelId !== this.meeting.chat_channel_id
    },
    canInviteUsers() {
      if (!this.meeting || (this.effectiveMeetingStatus !== 'active' && this.effectiveMeetingStatus !== 'scheduled')) return false
      return this.canManageMeeting
    },
    canManageMeeting() {
      if (!this.meeting) return false
      return this.sessionStore.user?.is_admin || this.meeting.host_user_id === this.sessionStore.user?.id
    },
    canEndMeeting() {
      if (!this.meeting || this.meeting.status !== 'active') return false
      return this.canManageMeeting
    },
    canCancelMeeting() {
      if (!this.meeting || this.effectiveMeetingStatus !== 'scheduled') return false
      return this.canManageMeeting
    },
    canRescheduleMeeting() {
      if (!this.meeting || this.effectiveMeetingStatus !== 'scheduled') return false
      return this.canManageMeeting
    },
    canEditMeetingLanguage() {
      if (!this.meeting) return false
      if (this.meeting.status === 'cancelled') return false
      if (this.meeting.status === 'ended') {
        return this.sessionStore.user?.is_admin === true
      }
      return this.canManageMeeting
    },
    canManageGuestLink() {
      if (!this.meeting) return false
      if (!this.canManageMeeting) return false
      return this.effectiveMeetingStatus === 'scheduled' || this.effectiveMeetingStatus === 'active'
    },
    canEditMeetingTitle() {
      if (!this.meeting) return false
      return this.canManageMeeting
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
    defaultEndedMeetingArtifactTab() {
      if (!this.isEndedMeetingView) return null
      if (this.shouldShowSummaryPanel) return 'summary'
      if (this.transcriptArtifact) return 'transcript'
      if (this.canAskMeeting) return 'ask'
      return 'summary'
    },
    shouldRenderEndedMeetingDesktopChatTray() {
      return this.isEndedMeetingView && !this.isMobileLayout
    },
    summaryPayload() {
      return this.summaryArtifact?.payload && typeof this.summaryArtifact.payload === 'object'
        ? this.summaryArtifact.payload
        : null
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
    canGoToSourceChannel() {
      return !!this.meeting?.source_channel_id && this.sessionStore.user?.account_type !== 'guest'
    },
    meetingInviteLinkUrl() {
      return this.meeting?.guest_invite_link?.join_url || ''
    },
    meetingInviteLinkInfo() {
      if (!this.meeting?.guest_invite_link) return ''
      const parts = [this.$t('ui.views.guest_link_help')]
      if (this.meeting.guest_invite_link.expires_at) {
        parts.push(`${this.$t('ui.views.guest_link_expires_at')}: ${this.formatDateTime(this.meeting.guest_invite_link.expires_at)}`)
      }
      return parts.join(' ')
    },
    meetingInviteLinkBannerKey() {
      if (!this.meeting?.id) return ''
      return [
        this.meeting.id,
        this.meeting?.guest_invite_link?.id || '',
        this.meeting?.guest_invite_link?.expires_at || ''
      ].join(':')
    },
    showMeetingInviteLinkBanner() {
      return !!this.meetingInviteLinkInfo && !this.meetingInviteLinkBannerDismissed
    },
    meetingScheduleMeta() {
      if (!this.meeting) return []
      const items = []
      items.push({
        label: this.$t('ui.views.meeting_language'),
        value: this.meetingLanguageLabel
      })
      if (this.meeting.scheduled_start_at) {
        items.push({
          label: this.$t('ui.views.starts_at'),
          value: this.formatDateTime(this.meeting.scheduled_start_at)
        })
      }
      if (this.meeting.scheduled_end_at) {
        items.push({
          label: this.$t('ui.views.ends_at'),
          value: this.formatDateTime(this.meeting.scheduled_end_at)
        })
      }
      if (this.meeting.join_not_before && this.effectiveMeetingStatus === 'scheduled') {
        items.push({
          label: this.$t('ui.views.join_available_from'),
          value: this.formatDateTime(this.meeting.join_not_before)
        })
      }
      return items
    },
    meetingLanguageLabel() {
      return getMeetingLanguageLabel(
        this.meeting?.language || DEFAULT_MEETING_LANGUAGE,
        this.$t
      )
    },
    meetingLanguageOptions() {
      return getMeetingLanguageOptions(this.$t)
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
    inviteOptions() {
      const participantIds = new Set((this.meeting?.participants || []).map((entry) => entry.user_id))
      const selectedUsers = this.sessionStore.getDirectoryUsersByIds(this.inviteUserIds)
      const source = this.inviteSearchTerm.trim()
        ? this.inviteSearchResults
        : this.sessionStore.getDefaultDirectoryUsers(20)
      return [...selectedUsers, ...source]
        .filter((user, index, list) => user?.id && list.findIndex((entry) => entry.id === user.id) === index)
        .filter((user) => !participantIds.has(user.id))
        .map((user) => ({ label: user.display_name, value: user.id }))
    }
  },
  async created() {
    const meetingId = this.$route.params.meetingId
    if (meetingId) {
      await this.loadMeeting(meetingId)
    }
  },
  mounted() {
    this.stopObservingMobileLayout = observeMobileLayout((matches) => {
      this.isMobileLayout = matches
    })
    this.stopObservingShortViewport = observeShortViewport((matches) => {
      this.isShortViewport = matches
    })
  },
  watch: {
    '$route.params.meetingId': {
      immediate: false,
      async handler(newMeetingId) {
        if (!newMeetingId) return
        this.uiStore.resetScreenShareVisibility()
        await this.loadMeeting(newMeetingId)
      }
    },
    '$route.query.message'() {
      this.syncRouteEvidence()
    },
    '$route.query.transcript_start_ms'() {
      this.syncRouteEvidence()
    },
    meetingInviteLinkBannerKey(newKey, oldKey) {
      if (newKey !== oldKey) {
        this.meetingInviteLinkBannerDismissed = false
      }
    },
    isMobileLayout(value) {
      this.isEndedMeetingChatOpen = false
      this.ensureEndedMeetingArtifactTab()
      if (!value) {
        this.showMeetingVideoPanel = false
        this.showMobileActionMenu = false
      }
      this.showEndedMeetingCompactMenu = false
    },
    endedMeetingArtifactTabs: {
      deep: true,
      handler() {
        this.ensureEndedMeetingArtifactTab()
      }
    },
    hasActiveShare(value) {
      if (!value) {
        this.uiStore.resetScreenShareVisibility()
      }
    },
    shareMaximized(value) {
      if (!value && this.shareChatOpen) {
        this.uiStore.setScreenShareChatVisible(false)
      }
      if (value) {
        this.showMeetingVideoPanel = false
        this.showMobileActionMenu = false
      }
      this.showEndedMeetingCompactMenu = false
    },
    async showInviteModal(val) {
      if (val) {
        await this.sessionStore.ensureDirectoryUsersLoaded({ limit: 20 })
        this.inviteSearchResults = this.sessionStore.getDefaultDirectoryUsers(20)
        return
      }

      this.clearInviteSearchTimer()
      this.inviteSearchTerm = ''
      this.inviteSearchResults = []
      this.inviteSearchLoading = false
    },
    meeting: {
      immediate: false,
      handler() {
        this.meetingVideosVisible = true
        this.selectedMeetingVideoParticipantId = null
        this.showMeetingVideoPanel = false
        this.showMobileActionMenu = false
        this.showEndedMeetingCompactMenu = false
        this.isEndedMeetingChatOpen = false
        this.ensureEndedMeetingArtifactTab()
        this.syncRouteEvidence()
        this.ensureMeetingQuestionsLoaded()
      }
    },
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
    openEndedMeetingChat() {
      this.showEndedMeetingCompactMenu = false
      this.isEndedMeetingChatOpen = true
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
    hideMeetingVideos() {
      this.meetingVideosVisible = false
    },
    showMeetingVideos() {
      this.meetingVideosVisible = true
    },
    openMeetingVideoPanel() {
      if (!this.canManageMeetingVideo || !this.isMobileLayout) return
      this.showMeetingVideoPanel = true
      this.showMobileActionMenu = false
    },
    closeMeetingVideoPanel() {
      this.showMeetingVideoPanel = false
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
    shouldPreserveMeetingContextRoute(route) {
      return route?.name === 'Meeting' || route?.name === 'MeetingScreenShare'
    },
    clearMeetingContext() {
      this.uiStore.resetScreenShareVisibility()
      this.meetingsStore.clearActive()
    },
    clearInviteSearchTimer() {
      if (!this.inviteSearchTimer) return
      clearTimeout(this.inviteSearchTimer)
      this.inviteSearchTimer = null
    },
    handleInviteSearch(term) {
      this.clearInviteSearchTimer()
      this.inviteSearchTerm = term || ''
      const trimmed = this.inviteSearchTerm.trim()
      if (!trimmed) {
        this.inviteSearchLoading = false
        this.inviteSearchResults = this.sessionStore.getDefaultDirectoryUsers(20)
        return
      }

      this.inviteSearchTimer = setTimeout(async () => {
        this.inviteSearchLoading = true
        try {
          this.inviteSearchResults = await this.sessionStore.searchUsers(trimmed, { limit: 20 })
        } finally {
          this.inviteSearchLoading = false
        }
      }, 150)
    },
    async loadMeeting(meetingId) {
      try {
        await this.meetingsStore.setActive(meetingId)
        await this.ensureMeetingQuestionsLoaded({ force: true })
        await this.syncRouteEvidence()
      } catch {
        window.$message?.error(this.$t('ui.views.meeting_could_not_be_loaded'))
      }
    },
    async ensureMeetingQuestionsLoaded({ force = false } = {}) {
      if (!this.canAskMeeting || !this.meeting?.id) return
      if (!force && this.lastLoadedQuestionsMeetingId === this.meeting.id) return

      this.loadingQuestions = true
      try {
        await this.meetingsStore.loadQuestions(this.meeting.id)
        this.lastLoadedQuestionsMeetingId = this.meeting.id
      } catch {
        window.$message?.error(this.$t('ui.views.meeting_questions_load_failed'))
      } finally {
        this.loadingQuestions = false
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
    async syncRouteEvidence() {
      if (!this.meeting?.chat_channel_id) return

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
    scrollHighlightedTranscriptIntoView() {
      const panel = this.$refs.endedTranscriptPanel || this.$refs.inlineTranscriptPanel
      panel?.scrollHighlightedIntoView?.()
    },
    formatDateTime(value) {
      if (!value) return this.$t('ui.views.time_unspecified')
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return this.$t('ui.views.time_unspecified')
      return date.toLocaleString()
    },
    toLocalDateTimeInputValue(value) {
      if (!value) return ''
      const date = value instanceof Date ? value : new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      const offsetMs = date.getTimezoneOffset() * 60 * 1000
      return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
    },
    toIsoDateTime(value) {
      if (!value) return null
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return null
      return date.toISOString()
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
    dismissMeetingInviteLinkBanner() {
      this.meetingInviteLinkBannerDismissed = true
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
    async joinCall() {
      if (!this.meeting) return
      this.joining = true
      try {
        await this.meetingsStore.join(this.meeting.id)
      } catch {
        window.$message?.error(this.$t('ui.components.could_not_join_call'))
      } finally {
        this.joining = false
      }
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
    async submitInvite() {
      if (!this.meeting || this.inviteUserIds.length === 0) return
      this.inviting = true
      try {
        await this.meetingsStore.invite(this.meeting.id, this.inviteUserIds)
        this.showInviteModal = false
        this.inviteUserIds = []
      } catch {
        window.$message?.error(this.$t('ui.views.could_not_invite_users'))
      } finally {
        this.inviting = false
      }
    },
    openTitleModal() {
      if (!this.meeting || !this.canEditMeetingTitle) return
      this.titleForm.title = this.meeting.title || ''
      this.showTitleModal = true
    },
    openLanguageModal() {
      if (!this.meeting || !this.canEditMeetingLanguage) return
      this.languageForm.language = normalizeMeetingLanguage(
        this.meeting.language,
        DEFAULT_MEETING_LANGUAGE
      )
      this.showLanguageModal = true
    },
    openRescheduleModal() {
      if (!this.meeting || !this.canRescheduleMeeting) return
      this.rescheduleForm = {
        scheduledStartAt: this.toLocalDateTimeInputValue(this.meeting.scheduled_start_at),
        scheduledEndAt: this.toLocalDateTimeInputValue(this.meeting.scheduled_end_at),
        description: this.meeting.description || '',
        language: normalizeMeetingLanguage(this.meeting.language, DEFAULT_MEETING_LANGUAGE)
      }
      this.showRescheduleModal = true
    },
    async saveMeetingTitle() {
      if (!this.meeting || !this.canEditMeetingTitle) return
      this.savingTitle = true
      try {
        await this.meetingsStore.setTitle(this.meeting.id, this.titleForm.title || null)
        this.showTitleModal = false
      } catch {
        window.$message?.error(this.$t('ui.views.could_not_update_meeting_title'))
      } finally {
        this.savingTitle = false
      }
    },
    async saveMeetingLanguage() {
      if (!this.meeting || !this.canEditMeetingLanguage) return
      this.savingLanguage = true
      try {
        await this.meetingsStore.setLanguage(this.meeting.id, this.languageForm.language)
        this.showLanguageModal = false
        window.$message?.success(
          this.meeting.status === 'ended'
            ? this.$t('ui.views.meeting_language_updated_regeneration_required')
            : this.$t('ui.views.meeting_language_updated')
        )
      } catch {
        window.$message?.error(this.$t('ui.views.could_not_update_meeting_language'))
      } finally {
        this.savingLanguage = false
      }
    },
    async submitReschedule() {
      if (!this.meeting || !this.canRescheduleMeeting) return
      this.rescheduling = true
      try {
        await this.meetingsStore.reschedule(this.meeting.id, {
          scheduled_start_at: this.toIsoDateTime(this.rescheduleForm.scheduledStartAt),
          scheduled_end_at: this.toIsoDateTime(this.rescheduleForm.scheduledEndAt),
          description: this.rescheduleForm.description,
          language: this.rescheduleForm.language
        })
        this.showRescheduleModal = false
        window.$message?.success(this.$t('ui.views.meeting_rescheduled'))
      } catch {
        window.$message?.error(this.$t('ui.views.could_not_reschedule_meeting'))
      } finally {
        this.rescheduling = false
      }
    },
    async createGuestInviteLink() {
      if (!this.meeting || !this.canManageGuestLink) return
      this.creatingInviteLink = true
      try {
        await this.meetingsStore.createInviteLink(this.meeting.id, this.meeting.scheduled_end_at || null)
        this.meetingInviteLinkBannerDismissed = false
        window.$message?.success(this.$t('ui.views.guest_link_ready'))
      } catch {
        window.$message?.error(this.$t('ui.views.could_not_create_meeting_link'))
      } finally {
        this.creatingInviteLink = false
      }
    },
    async copyGuestInviteLink() {
      if (!this.meetingInviteLinkUrl) {
        await this.createGuestInviteLink()
      }
      if (!this.meetingInviteLinkUrl) return

      try {
        await navigator.clipboard.writeText(this.meetingInviteLinkUrl)
        this.meetingInviteLinkBannerDismissed = false
        window.$message?.success(this.$t('ui.views.guest_link_copied'))
      } catch {
        window.$message?.error(this.$t('ui.views.guest_link_copy_failed'))
      }
    },
    async revokeGuestInviteLink() {
      if (!this.meeting?.guest_invite_link?.id || !this.canManageGuestLink) return
      this.revokingInviteLink = true
      try {
        await this.meetingsStore.revokeInviteLink(this.meeting.id, this.meeting.guest_invite_link.id)
        window.$message?.success(this.$t('ui.views.guest_link_revoked'))
      } catch {
        window.$message?.error(this.$t('ui.views.could_not_revoke_meeting_link'))
      } finally {
        this.revokingInviteLink = false
      }
    },
    async downloadMeetingIcs() {
      if (!this.meeting?.id) return
      this.downloadingIcs = true
      try {
        const response = await api.get(`/meetings/${this.meeting.id}/ics`, {
          responseType: 'blob'
        })
        const blob = new Blob([response.data], { type: 'text/calendar;charset=utf-8' })
        const url = window.URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `meeting-${this.meeting.id}.ics`
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        window.URL.revokeObjectURL(url)
      } catch {
        window.$message?.error(this.$t('ui.views.could_not_download_meeting_ics'))
      } finally {
        this.downloadingIcs = false
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
    async endMeeting() {
      if (!this.meeting) return
      this.ending = true
      try {
        await this.meetingsStore.end(this.meeting.id)
      } catch {
        window.$message?.error(this.$t('ui.views.could_not_end_meeting'))
      } finally {
        this.ending = false
      }
    },
    async cancelMeeting() {
      if (!this.meeting || !this.canCancelMeeting) return
      this.cancelling = true
      try {
        await this.meetingsStore.cancel(this.meeting.id)
        window.$message?.success(this.$t('ui.views.meeting_cancelled'))
      } catch {
        window.$message?.error(this.$t('ui.views.could_not_cancel_meeting'))
      } finally {
        this.cancelling = false
      }
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
    },
    goToSourceChannel() {
      if (!this.meeting?.source_channel_id) {
        this.$router.push('/channels')
        return
      }
      this.$router.push(`/channels/${this.meeting.source_channel_id}`)
    }
  },
  beforeRouteLeave(to, from, next) {
    if (!this.shouldPreserveMeetingContextRoute(to)) {
      this.clearMeetingContext()
    }
    next()
  },
  beforeUnmount() {
    this.clearInviteSearchTimer()
    this.stopObservingMobileLayout?.()
    this.stopObservingShortViewport?.()
  }
}
</script>

<style scoped>
.workspace-context,
.main-area {
  flex: 1;
  display: flex;
  min-width: 0;
  overflow: hidden;
}

.main-area {
  flex-direction: column;
  position: relative;
}

.main-area.share-maximized {
  background: transparent;
}

.meeting-header {
  border-bottom: 1px solid var(--app-border);
  padding: 12px 16px;
}

.meeting-header-compact {
  padding: 10px 12px;
}

.meeting-header-short {
  padding-top: 8px;
  padding-bottom: 8px;
}

.meeting-header-compact-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.meeting-header-compact-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meeting-header-compact-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.meeting-header-compact-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}

.meeting-compact-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--app-surface-muted);
  font-size: 11px;
  line-height: 1.3;
  color: var(--app-text-muted);
}

.meeting-compact-meta-source {
  max-width: min(100%, 300px);
}

.meeting-compact-meta-source span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meeting-title {
  font-size: 16px;
  font-weight: 600;
}

.meeting-context {
  font-size: 12px;
  opacity: 0.7;
}

.meeting-schedule-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  opacity: 0.76;
}

.meeting-header-row {
  width: 100%;
}

.meeting-header-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.meeting-mobile-overflow-menu {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 220px;
}

.meeting-mobile-overflow-action {
  justify-content: flex-start;
}

.meeting-header-compact-menu {
  min-width: 250px;
}

.meeting-meta-banner {
  display: grid;
  gap: 8px;
  padding: 10px 16px 0;
}

.meeting-meta-copy {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--app-border-soft);
  border-radius: 8px;
  background: var(--app-surface);
  font-size: 12px;
  line-height: 1.45;
}

.meeting-meta-copy-dismissible {
  gap: 8px;
}

.meeting-meta-copy-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.meeting-meta-dismiss {
  flex-shrink: 0;
  margin: -4px -4px 0 0;
}

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

.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-width: 0;
}

@media (max-width: 1100px) {
  .meeting-live-stage.share-focused {
    flex-direction: column;
  }
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

.artifact-tab-row-compact {
  width: 100%;
  justify-content: flex-start;
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

@media (max-width: 900px) {
  .meeting-header {
    padding: 12px;
  }

  .meeting-header-compact {
    padding: 10px 12px;
  }

  .meeting-header-row {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .meeting-header-copy {
    width: 100%;
    min-width: 0;
  }

  .meeting-header-title-row {
    flex-wrap: wrap;
  }

  .meeting-header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .meeting-meta-banner {
    padding: 10px 12px 0;
  }

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
