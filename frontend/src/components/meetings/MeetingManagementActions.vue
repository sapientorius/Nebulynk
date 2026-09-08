<template>
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

              <n-button v-if="canInviteUsers && !isMobileLayout" size="small" @click="$emit('invite')">
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
                    @click="$emit('invite'); showMobileActionMenu = false"
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


</template>

<script>
import { defineAsyncComponent } from 'vue'
import { ArrowUndoOutline as BackIcon, LanguageOutline as LanguageIcon, PencilOutline as EditIcon, PeopleOutline as PeopleIcon, CloseOutline, EllipsisHorizontalOutline as MoreIcon, VideocamOutline as VideocamIcon } from '@vicons/ionicons5'
import api from '../../lib/api.js'
import { DEFAULT_MEETING_LANGUAGE, getMeetingLanguageLabel, getMeetingLanguageOptions, normalizeMeetingLanguage } from '../../lib/meeting-languages.js'
import { useSessionStore, useUiStore, useMeetingsStore } from '../../stores/index.js'
import { useVoiceStore } from '../../stores/voice.js'
import { countMeetingEngagedParticipants } from '../../lib/meeting-card.js'
import { getEffectiveMeetingStatus } from '../../lib/meeting-lifecycle.js'


const ScreenShareControls = defineAsyncComponent(() => import('../ScreenShareControls.vue'))
export default {
  name: 'MeetingManagementActions',
  components: { BackIcon,
LanguageIcon,
EditIcon,
PeopleIcon,
CloseOutline,
MoreIcon,
ScreenShareControls,
VideocamIcon },
  emits: ["toggle-members","invite","open-video"],
  props: { meeting: { type: Object, default: null },
isMobileLayout: Boolean,
isShortViewport: Boolean },
  data() { return {
showTitleModal: false,
showLanguageModal: false,
joining: false,
ending: false,
cancelling: false,
rescheduling: false,
creatingInviteLink: false,
revokingInviteLink: false,
downloadingIcs: false,
savingTitle: false,
savingLanguage: false,
showRescheduleModal: false,
showMobileActionMenu: false,
meetingInviteLinkBannerDismissed: false,
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
  } },
  computed: {
isScheduledMeeting() {
      return !!this.meeting && this.effectiveMeetingStatus === 'scheduled'
    },
isCancelledMeeting() {
      return !!this.meeting && this.effectiveMeetingStatus === 'cancelled'
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
isShareHidden() {
      return this.hasActiveShare && !this.shouldShowSharePanel
    },
shareMaximized() {
      return this.uiStore.maximizeScreenShare
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
meetingTitle() {
      if (!this.meeting) return ''
      return this.meetingsStore.resolveDisplayName(this.meeting)
    },
meetingSourceDisplayName() {
      if (!this.meeting) return null
      return this.meetingsStore.resolveSourceDisplayName(this.meeting)
    },
participantCount() {
      if (!this.meeting) return 0
      if (this.meeting.status === 'ended') {
        return countMeetingEngagedParticipants(this.meeting)
      }
      return this.visibleMeetingParticipants.length
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
sessionStore() {
      return useSessionStore()
    },
uiStore() {
      return useUiStore()
    },
meetingsStore() {
      return useMeetingsStore()
    },
voiceStore() {
      return useVoiceStore()
    },
effectiveMeetingStatus() {
      return getEffectiveMeetingStatus(this.meeting)
    },
isEndedMeetingView() {
      return !!this.meeting && this.meeting.status === 'ended'
    },
hasActiveShare() {
      return !!this.activeShare
    },
shouldShowSharePanel() {
      if (!this.meeting) return false
      return this.uiStore.screenSharePanelVisible || (this.hasActiveShare && !this.uiStore.hideScreenSharePanel)
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
activeShare() {
      return this.voiceStore.activeScreenShare
    },
meetingVoiceParticipants() {
      if (!this.meeting?.chat_channel_id) return []
      return this.voiceStore.participants[this.meeting.chat_channel_id] || []
    }
  },
  watch: {
meetingInviteLinkBannerKey(newKey, oldKey) {
      if (newKey !== oldKey) {
        this.meetingInviteLinkBannerDismissed = false
      }
    },
isMobileLayout() { this.closeMenus() },
shareMaximized() { this.closeMenus() }
  },

  methods: {
openMeetingVideoPanel() { this.showMobileActionMenu = false; this.$emit('open-video') },
closeMenus() { this.showMobileActionMenu = false },
formatDateTime(value) {
      if (!value) return this.$t('ui.views.time_unspecified')
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return this.$t('ui.views.time_unspecified')
      return date.toLocaleString()
    },
dismissMeetingInviteLinkBanner() {
      this.meetingInviteLinkBannerDismissed = true
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
goToSourceChannel() {
      if (!this.meeting?.source_channel_id) {
        this.$router.push('/channels')
        return
      }
      this.$router.push(`/channels/${this.meeting.source_channel_id}`)
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
    }
  }
}
</script>

<style scoped>

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

.meeting-ended-actions-sheet .meeting-ended-action-menu {
  width: 100%;
  min-width: 0;
}

.meeting-ended-menu-divider {
  height: 1px;
  margin: 6px 0;
  background: var(--app-border-soft);
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
