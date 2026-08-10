<template>
  <div class="channel-header" v-if="channel">
    <n-space class="channel-header-row" align="center" :size="12" justify="space-between" style="width: 100%">
      <div class="channel-header-copy">
        <template v-if="channel.type === 'dm' && dmDisplayInfo">
          <n-badge class="channel-avatar" :color="dmStatusColor" dot :offset="[-4, -4]">
            <UserAvatar :size="28" :name="dmDisplayInfo.name" :avatar-url="dmDisplayInfo.avatarUrl" />
          </n-badge>
          <div class="channel-meta">
            <div class="channel-title-row">
              <span class="channel-name">{{ dmDisplayInfo.name }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="channel.type === 'group' && dmDisplayInfo">
          <div class="channel-meta">
            <div class="topic-container is-editable channel-title-row" @click="openRenameModal">
              <span class="channel-name">{{ dmDisplayInfo.name }}</span>
              <span class="dm-member-count">({{ dmDisplayInfo.memberCount }})</span>
              <n-icon class="edit-icon" size="14"><create-icon /></n-icon>
            </div>
            <div class="topic-container is-editable channel-subtitle-row" @click="openTopicModal">
              <span class="channel-topic" v-if="channel.topic">{{ channel.topic }}</span>
              <span class="channel-topic placeholder" v-else>{{ $t('ui.components.set_topic') }}</span>
              <n-icon class="edit-icon" size="14"><create-icon /></n-icon>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="channel-meta">
            <div class="channel-title-row">
              <span class="channel-name">
                <n-icon class="channel-prefix-icon" size="14">
                  <earth-icon v-if="channel.type === 'public'" />
                  <lock-closed-icon v-else />
                </n-icon>
                <n-icon v-if="channel.is_voice" class="channel-prefix-icon" size="15"><volume-high-icon /></n-icon>
                {{ channel.name }}
              </span>
              <n-tag v-if="channel.is_archived" size="small" type="warning">{{ $t('ui.components.archived') }}</n-tag>
            </div>
            <div class="channel-subtitle-row">
              <span class="channel-topic" v-if="channel.topic">{{ channel.topic }}</span>
              <span class="channel-topic placeholder" v-else>{{ $t('ui.components.no_topic_set') }}</span>
            </div>
          </div>
        </template>
      </div>

      <n-space v-if="!isMobileLayout" class="channel-header-actions" :size="4">
        <n-button
          v-if="canShowMeetingCallAction"
          quaternary
          size="small"
          :loading="startingMeeting || loadingActiveMeeting"
          :title="meetingCallActionTitle"
          @click="startOrJoinMeetingCall"
        >
          <template #icon><n-icon size="16"><call-icon /></n-icon></template>
          {{ meetingCallActionLabel }}
        </n-button>

        <n-popover
          v-if="canShowMeetingsMenuAction"
          v-model:show="showDesktopMeetingsMenu"
          trigger="click"
          placement="bottom-end"
        >
          <template #trigger>
            <n-button
              quaternary
              size="small"
              :loading="schedulingMeeting"
              :title="$t('ui.views.meetings')"
              :aria-label="$t('ui.views.meetings')"
              data-testid="channel-header-meetings-trigger"
            >
              <template #icon><n-icon size="16"><past-meetings-icon /></n-icon></template>
              {{ $t('ui.views.meetings') }}
            </n-button>
          </template>
          <div class="header-menu meetings-menu">
            <n-button
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-meetings-schedule"
              @click="onOpenScheduleMeetingFromMenu"
            >
              <template #icon><n-icon size="16"><past-meetings-icon /></n-icon></template>
              {{ $t('ui.views.schedule_meeting') }}
            </n-button>
            <n-button
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-past-meetings"
              :type="pastMeetingsPanelOpen ? 'primary' : 'default'"
              @click="onTogglePastMeetingsAction"
            >
              <template #icon><n-icon size="16"><past-meetings-icon /></n-icon></template>
              {{ $t('ui.views.past_meetings') }}
            </n-button>
          </div>
        </n-popover>

        <n-button
          v-if="canShowMembersAction"
          quaternary
          size="small"
          data-testid="channel-header-members"
          :aria-pressed="membersPanelOpen ? 'true' : 'false'"
          @click="$emit('toggle-members')"
        >
          <template #icon><n-icon size="16"><members-icon /></n-icon></template>
          {{ memberCount }} {{ $t('ui.components.members') }}
        </n-button>

        <n-popover
          v-if="canShowDesktopOverflowActions"
          v-model:show="showDesktopOverflowMenu"
          trigger="click"
          placement="bottom-end"
        >
          <template #trigger>
            <n-button
              quaternary
              circle
              size="small"
              data-testid="channel-header-overflow-trigger"
              :title="$t('ui.components.admin.actions')"
              :aria-label="$t('ui.components.admin.actions')"
            >
              <template #icon><n-icon size="18"><more-icon /></n-icon></template>
            </n-button>
          </template>

          <div class="header-menu desktop-overflow-menu">
            <n-button
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-pins"
              @click="onTogglePinsFromMenu"
            >
              <template #icon><n-icon size="16"><pin-icon /></n-icon></template>
              {{ pinnedCount }} {{ $t('ui.components.pinned_messages') }}
            </n-button>

            <div v-if="canShowAiSummaryAction" class="header-menu-section summary-section">
              <n-button
                text
                size="small"
                class="header-menu-action summary-toggle"
                data-testid="channel-header-summary-toggle"
                :aria-expanded="desktopSummaryActionsExpanded ? 'true' : 'false'"
                aria-controls="channel-header-summary-actions"
                @click="toggleDesktopSummaryActions"
              >
                <span class="summary-toggle-content">
                  <n-icon size="16"><sparkles-icon /></n-icon>
                  <span>{{ $t('ui.components.ai_summary') }}</span>
                </span>
                <n-icon class="summary-toggle-chevron" size="16">
                  <chevron-up-icon v-if="desktopSummaryActionsExpanded" />
                  <chevron-down-icon v-else />
                </n-icon>
              </n-button>

              <div
                v-if="desktopSummaryActionsExpanded"
                id="channel-header-summary-actions"
                class="summary-actions"
                data-testid="channel-header-summary-actions"
              >
                <div class="summary-presets">
                  <n-button text size="small" class="summary-preset" @click="onRequestPresetSummaryFromMenu('last_hour')">
                    {{ $t('ui.components.last_hour') }}
                  </n-button>
                  <n-button text size="small" class="summary-preset" @click="onRequestPresetSummaryFromMenu('last_24h')">
                    {{ $t('ui.components.last_24h') }}
                  </n-button>
                  <n-button text size="small" class="summary-preset" @click="onRequestPresetSummaryFromMenu('last_48h')">
                    {{ $t('ui.components.last_48h') }}
                  </n-button>
                  <n-button text size="small" class="summary-preset" @click="onRequestPresetSummaryFromMenu('last_7d')">
                    {{ $t('ui.components.last_7d') }}
                  </n-button>
                </div>
                <n-button text size="small" class="header-menu-action summary-select" @click="onStartMessageSelectionFromMenu">
                  {{ $t('ui.components.select_messages') }}
                </n-button>
                <div class="summary-custom">
                  <n-input-number
                    v-model:value="customSummaryRangeValue"
                    size="small"
                    :min="1"
                  />
                  <n-select
                    v-model:value="customSummaryRangeUnit"
                    size="small"
                    :options="rangeUnitOptions"
                  />
                  <n-button
                    size="small"
                    type="primary"
                    :loading="messageSummariesStore.isRequestLoading('range', channel.id)"
                    @click="onRequestCustomSummaryFromMenu"
                  >
                    {{ $t('ui.components.summarize') }}
                  </n-button>
                </div>
              </div>
            </div>

            <div v-if="myMembership" class="header-menu-section">
              <div class="header-menu-section-title">{{ $t('ui.components.notifications') }}</div>
              <n-button
                text
                size="small"
                class="header-menu-action"
                :type="notifPref === 'all' ? 'primary' : 'default'"
                data-testid="channel-header-notifications-all"
                @click="onSetNotifPrefFromMenu('all')"
              >
                <template #icon><n-icon size="16"><notif-all-icon /></n-icon></template>
                {{ $t('ui.components.all_messages') }}
              </n-button>
              <n-button
                text
                size="small"
                class="header-menu-action"
                :type="notifPref === 'mentions' ? 'primary' : 'default'"
                data-testid="channel-header-notifications-mentions"
                @click="onSetNotifPrefFromMenu('mentions')"
              >
                <template #icon><n-icon size="16"><notif-mentions-icon /></n-icon></template>
                {{ $t('ui.components.only_mentions') }}
              </n-button>
              <n-button
                text
                size="small"
                class="header-menu-action"
                :type="notifPref === 'none' ? 'primary' : 'default'"
                data-testid="channel-header-notifications-none"
                @click="onSetNotifPrefFromMenu('none')"
              >
                <template #icon><n-icon size="16"><notif-off-icon /></n-icon></template>
                {{ $t('ui.components.mute') }}
              </n-button>
            </div>

            <n-button
              v-if="canManageChannelSettings"
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-settings"
              @click="onOpenSettingsFromMenu"
            >
              <template #icon><n-icon size="16"><settings-icon /></n-icon></template>
              {{ $t('ui.components.channel_settings') }}
            </n-button>

            <div v-if="canLeaveChannel" class="header-menu-section danger-section">
              <div class="header-menu-section-title danger">{{ $t('ui.components.danger_zone') }}</div>
              <n-popconfirm
                :positive-text="$t('ui.components.leave')"
                :negative-text="$t('ui.components.admin.cancel')"
                :positive-button-props="{ 'data-testid': 'confirm-leave-channel' }"
                @positive-click="leaveCurrentChannel"
              >
                <template #trigger>
                  <n-button
                    text
                    size="small"
                    class="header-menu-action danger"
                    :loading="leavingChannel"
                    data-testid="leave-current-channel"
                  >
                    <template #icon><n-icon size="16"><exit-icon /></n-icon></template>
                    {{ $t('ui.components.leave') }}
                  </n-button>
                </template>
                <span>{{ $t('ui.components.remove_from_channel') }}</span>
              </n-popconfirm>
            </div>
          </div>
        </n-popover>
      </n-space>

      <n-space v-else class="channel-header-actions mobile-actions" :size="6">
        <n-button
          v-if="canShowMeetingCallAction"
          quaternary
          size="small"
          :loading="startingMeeting || loadingActiveMeeting"
          :title="meetingCallActionTitle"
          data-testid="channel-header-mobile-call"
          @click="startOrJoinMeetingCall"
        >
          <template #icon><n-icon size="16"><call-icon /></n-icon></template>
          {{ meetingCallActionLabel }}
        </n-button>

        <n-popover
          v-if="canShowMeetingsMenuAction"
          v-model:show="showMobileMeetingsMenu"
          trigger="click"
          placement="bottom-end"
        >
          <template #trigger>
            <n-button
              quaternary
              size="small"
              :loading="schedulingMeeting"
              :title="$t('ui.views.meetings')"
              :aria-label="$t('ui.views.meetings')"
              data-testid="channel-header-mobile-meetings-trigger"
            >
              <template #icon><n-icon size="16"><past-meetings-icon /></n-icon></template>
              {{ $t('ui.views.meetings') }}
            </n-button>
          </template>

          <div class="header-menu meetings-menu">
            <n-button
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-mobile-meetings-schedule"
              @click="onOpenScheduleMeetingFromMenu"
            >
              <template #icon><n-icon size="16"><past-meetings-icon /></n-icon></template>
              {{ $t('ui.views.schedule_meeting') }}
            </n-button>
            <n-button
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-mobile-past-meetings"
              :type="pastMeetingsPanelOpen ? 'primary' : 'default'"
              @click="onTogglePastMeetingsAction"
            >
              <template #icon><n-icon size="16"><past-meetings-icon /></n-icon></template>
              {{ $t('ui.views.past_meetings') }}
            </n-button>
          </div>
        </n-popover>

        <n-popover
          v-model:show="showMobileOverflowMenu"
          trigger="click"
          placement="bottom-end"
        >
          <template #trigger>
            <n-button
              quaternary
              circle
              size="small"
              data-testid="channel-header-mobile-overflow-trigger"
              :title="$t('ui.components.admin.actions')"
              :aria-label="$t('ui.components.admin.actions')"
            >
              <template #icon><n-icon size="18"><more-icon /></n-icon></template>
            </n-button>
          </template>

          <div class="header-menu mobile-overflow-menu">
            <n-button
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-mobile-pins"
              @click="onTogglePinsFromMenu"
            >
              <template #icon><n-icon size="16"><pin-icon /></n-icon></template>
              {{ pinnedCount }} {{ $t('ui.components.pinned_messages') }}
            </n-button>

            <div v-if="canShowMembersAction" class="header-menu-section">
              <n-button
                text
                size="small"
                class="header-menu-action"
                data-testid="channel-header-mobile-members"
                @click="onToggleMembersFromMenu"
              >
                <template #icon><n-icon size="16"><members-icon /></n-icon></template>
                {{ memberCount }} {{ $t('ui.components.members') }}
              </n-button>
            </div>

            <div v-if="canShowAiSummaryAction" class="header-menu-section mobile-summary-section">
              <n-button
                text
                size="small"
                class="header-menu-action summary-toggle"
                data-testid="channel-header-mobile-summary-toggle"
                :aria-expanded="mobileSummaryActionsExpanded ? 'true' : 'false'"
                aria-controls="channel-header-mobile-summary-actions"
                @click="toggleMobileSummaryActions"
              >
                <span class="summary-toggle-content">
                  <n-icon size="16"><sparkles-icon /></n-icon>
                  <span>{{ $t('ui.components.ai_summary') }}</span>
                </span>
                <n-icon class="summary-toggle-chevron" size="16">
                  <chevron-up-icon v-if="mobileSummaryActionsExpanded" />
                  <chevron-down-icon v-else />
                </n-icon>
              </n-button>

              <div
                v-if="mobileSummaryActionsExpanded"
                id="channel-header-mobile-summary-actions"
                class="summary-actions"
                data-testid="channel-header-mobile-summary-actions"
              >
                <div class="summary-presets">
                  <n-button text size="small" class="summary-preset" @click="onRequestPresetSummaryFromMenu('last_hour')">
                    {{ $t('ui.components.last_hour') }}
                  </n-button>
                  <n-button text size="small" class="summary-preset" @click="onRequestPresetSummaryFromMenu('last_24h')">
                    {{ $t('ui.components.last_24h') }}
                  </n-button>
                  <n-button text size="small" class="summary-preset" @click="onRequestPresetSummaryFromMenu('last_48h')">
                    {{ $t('ui.components.last_48h') }}
                  </n-button>
                  <n-button text size="small" class="summary-preset" @click="onRequestPresetSummaryFromMenu('last_7d')">
                    {{ $t('ui.components.last_7d') }}
                  </n-button>
                </div>
                <n-button text size="small" class="header-menu-action summary-select" @click="onStartMessageSelectionFromMenu">
                  {{ $t('ui.components.select_messages') }}
                </n-button>
                <div class="summary-custom">
                  <n-input-number
                    v-model:value="customSummaryRangeValue"
                    size="small"
                    :min="1"
                  />
                  <n-select
                    v-model:value="customSummaryRangeUnit"
                    size="small"
                    :options="rangeUnitOptions"
                  />
                  <n-button
                    size="small"
                    type="primary"
                    :loading="messageSummariesStore.isRequestLoading('range', channel.id)"
                    @click="onRequestCustomSummaryFromMenu"
                  >
                    {{ $t('ui.components.summarize') }}
                  </n-button>
                </div>
              </div>
            </div>

            <div v-if="myMembership" class="header-menu-section">
              <div class="header-menu-section-title">{{ $t('ui.components.notifications') }}</div>
              <n-button
                text
                size="small"
                class="header-menu-action"
                :type="notifPref === 'all' ? 'primary' : 'default'"
                data-testid="channel-header-mobile-notifications-all"
                @click="onSetNotifPrefFromMenu('all')"
              >
                <template #icon><n-icon size="16"><notif-all-icon /></n-icon></template>
                {{ $t('ui.components.all_messages') }}
              </n-button>
              <n-button
                text
                size="small"
                class="header-menu-action"
                :type="notifPref === 'mentions' ? 'primary' : 'default'"
                data-testid="channel-header-mobile-notifications-mentions"
                @click="onSetNotifPrefFromMenu('mentions')"
              >
                <template #icon><n-icon size="16"><notif-mentions-icon /></n-icon></template>
                {{ $t('ui.components.only_mentions') }}
              </n-button>
              <n-button
                text
                size="small"
                class="header-menu-action"
                :type="notifPref === 'none' ? 'primary' : 'default'"
                data-testid="channel-header-mobile-notifications-none"
                @click="onSetNotifPrefFromMenu('none')"
              >
                <template #icon><n-icon size="16"><notif-off-icon /></n-icon></template>
                {{ $t('ui.components.mute') }}
              </n-button>
            </div>

            <n-button
              v-if="canManageChannelSettings"
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-mobile-settings"
              @click="onOpenSettingsFromMenu"
            >
              <template #icon><n-icon size="16"><settings-icon /></n-icon></template>
              {{ $t('ui.components.channel_settings') }}
            </n-button>

            <div v-if="canLeaveChannel" class="header-menu-section danger-section">
              <div class="header-menu-section-title danger">{{ $t('ui.components.danger_zone') }}</div>
              <n-popconfirm
                :positive-text="$t('ui.components.leave')"
                :negative-text="$t('ui.components.admin.cancel')"
                :positive-button-props="{ 'data-testid': 'channel-header-mobile-confirm-leave' }"
                @positive-click="leaveCurrentChannel"
              >
                <template #trigger>
                  <n-button
                    text
                    size="small"
                    class="header-menu-action danger"
                    :loading="leavingChannel"
                    data-testid="channel-header-mobile-leave"
                  >
                    <template #icon><n-icon size="16"><exit-icon /></n-icon></template>
                    {{ $t('ui.components.leave') }}
                  </n-button>
                </template>
                <span>{{ $t('ui.components.remove_from_channel') }}</span>
              </n-popconfirm>
            </div>
          </div>
        </n-popover>
      </n-space>
    </n-space>

    <n-modal v-model:show="showTopicModal">
      <n-card :title="$t('ui.components.edit_group_topic')" style="max-width: 500px; width: 100%">
        <n-form>
          <n-form-item :label="$t('ui.components.topic')">
            <n-input
              v-model:value="topicForm.topic"
              type="textarea"
              :placeholder="$t('ui.components.what_is_this_channel_about')"
              :autosize="{ minRows: 2, maxRows: 5 }"
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showTopicModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button type="primary" :loading="savingTopic" @click="saveGroupTopic">{{ $t('ui.components.admin.save') }}</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal v-model:show="showRenameModal">
      <n-card :title="$t('ui.components.rename_group')" style="max-width: 400px; width: 100%">
        <n-form>
          <n-form-item :label="$t('ui.components.group_name')">
            <n-input
              v-model:value="renameForm.name"
              :placeholder="$t('ui.components.group_name')"
              maxlength="100"
              @keyup.enter="saveRename"
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showRenameModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button type="primary" :loading="savingRename" @click="saveRename">{{ $t('ui.components.admin.save') }}</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal v-model:show="showSettingsModal">
      <n-card :title="$t('ui.components.channel_settings')" style="max-width: 520px; width: 100%">
        <n-form>
          <n-form-item :label="$t('ui.components.admin.name')">
            <n-input
              v-model:value="settingsForm.name"
              :placeholder="$t('ui.components.channel_name')"
              maxlength="100"
              @keyup.enter="saveChannelSettings"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.components.topic')">
            <n-input
              v-model:value="settingsForm.topic"
              type="textarea"
              :placeholder="$t('ui.components.optional_topic')"
              :autosize="{ minRows: 2, maxRows: 5 }"
            />
          </n-form-item>
          <n-form-item :label="$t('meetingHistoryAccess.channel_label')">
            <MeetingHistoryAccessSelect
              v-model="settingsForm.meetingHistoryAccess"
              data-testid="channel-meeting-history-access"
            />
          </n-form-item>
        </n-form>

        <n-divider v-if="!isDm" />
        <div v-if="!isDm" class="danger-zone">
          <div class="danger-title">{{ $t('ui.components.danger_zone') }}</div>
          <n-button
            :type="channel?.is_archived ? 'warning' : 'error'"
            :loading="savingArchive"
            @click="toggleArchiveState"
          >
            {{ channel?.is_archived
              ? $t('ui.components.restore_channel')
              : $t('ui.components.archive_channel') }}
          </n-button>
        </div>

        <template #footer>
          <n-space justify="end">
            <n-button @click="showSettingsModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button type="primary" :loading="savingSettings" @click="saveChannelSettings">{{ $t('ui.components.admin.save') }}</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal v-model:show="showScheduleMeetingModal">
      <n-card :title="$t('ui.views.schedule_meeting')" style="max-width: 520px; width: 100%">
        <n-form>
          <n-form-item :label="$t('ui.views.title')">
            <n-input
              v-model:value="scheduleForm.title"
              maxlength="120"
              :placeholder="$t('ui.views.optional_meeting_title')"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.views.meeting_description')">
            <n-input
              v-model:value="scheduleForm.description"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 5 }"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.views.starts_at')">
            <n-input
              v-model:value="scheduleForm.scheduledStartAt"
              type="datetime-local"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.views.ends_at')">
            <n-input
              v-model:value="scheduleForm.scheduledEndAt"
              type="datetime-local"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.views.meeting_language')">
            <n-select
              v-model:value="scheduleForm.language"
              :options="meetingLanguageOptions"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.views.invite_users')">
            <n-select
              v-model:value="scheduleForm.initialUserIds"
              multiple
              filterable
              remote
              :loading="scheduleInviteSearchLoading"
              :options="scheduleInviteOptions"
              :placeholder="$t('ui.views.select_users')"
              @search="handleScheduleInviteSearch"
            />
          </n-form-item>
          <div class="channel-meeting-hint">{{ $t('ui.views.schedule_meeting_hint') }}</div>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showScheduleMeetingModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button
              type="primary"
              :loading="schedulingMeeting"
              :disabled="!scheduleForm.scheduledStartAt"
              @click="submitScheduledMeeting"
            >
              {{ $t('ui.views.schedule_meeting') }}
            </n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<script>
import { getPlatformStatus } from '../lib/api.js'
import {
  PinOutline as PinIcon,
  CreateOutline as CreateIcon,
  CallOutline as CallIcon,
  EllipsisHorizontalOutline as MoreIcon,
  NotificationsOutline as NotifAllIcon,
  NotificationsOffOutline as NotifOffIcon,
  AtOutline as NotifMentionsIcon,
  SettingsOutline as SettingsIcon,
  VolumeHighOutline as VolumeHighIcon,
  EarthOutline as EarthIcon,
  LockClosedOutline as LockClosedIcon,
  ExitOutline as ExitIcon,
  PeopleOutline as MembersIcon,
  TimeOutline as PastMeetingsIcon,
  SparklesOutline as SparklesIcon,
  ChevronDownOutline as ChevronDownIcon,
  ChevronUpOutline as ChevronUpIcon
} from '@vicons/ionicons5'
import {
  useSessionStore,
  useChannelsStore,
  useDmsStore,
  useMeetingsStore,
  useMessagesStore,
  useMessageSummariesStore,
  useUiStore,
  useNotificationsStore,
  useVoiceStore
} from '../stores/index.js'
import { playSfx, SFX_EVENTS } from '../lib/sfx.js'
import {
  DEFAULT_MEETING_LANGUAGE,
  getMeetingLanguageOptions,
  normalizeMeetingLanguage
} from '../lib/meeting-languages.js'
import { observeMobileLayout, readIsMobileLayout } from '../lib/mobile-layout.js'
import { getPresenceStatusColor } from '../lib/user-presence.js'
import UserAvatar from './UserAvatar.vue'
import MeetingHistoryAccessSelect from './MeetingHistoryAccessSelect.vue'
import { DEFAULT_MEETING_HISTORY_ACCESS } from '../lib/meeting-history-access.js'

export default {
  name: 'ChannelHeader',
  components: {
    UserAvatar,
    MeetingHistoryAccessSelect,
    PinIcon,
    CreateIcon,
    CallIcon,
    MoreIcon,
    NotifAllIcon,
    NotifOffIcon,
    NotifMentionsIcon,
    SettingsIcon,
    VolumeHighIcon,
    EarthIcon,
    LockClosedIcon,
    ExitIcon,
    MembersIcon,
    PastMeetingsIcon,
    SparklesIcon,
    ChevronDownIcon,
    ChevronUpIcon
  },
  emits: ['toggle-members', 'toggle-past-meetings'],
  props: {
    rightPanelMode: {
      type: String,
      default: 'closed'
    }
  },
  data() {
    return {
      isMobileLayout: readIsMobileLayout(),
      showDesktopOverflowMenu: false,
      showMobileOverflowMenu: false,
      showDesktopMeetingsMenu: false,
      showMobileMeetingsMenu: false,
      desktopSummaryActionsExpanded: false,
      mobileSummaryActionsExpanded: false,
      showTopicModal: false,
      showRenameModal: false,
      showSettingsModal: false,
      savingRename: false,
      savingTopic: false,
      savingSettings: false,
      savingArchive: false,
      leavingChannel: false,
      startingMeeting: false,
      schedulingMeeting: false,
      loadingActiveMeeting: false,
      fetchedSourceMeeting: null,
      showScheduleMeetingModal: false,
      scheduleInviteSearchLoading: false,
      scheduleInviteSearchTimer: null,
      scheduleInviteSearchTerm: '',
      scheduleInviteSearchResults: [],
      platformMeetingLanguageDefault: DEFAULT_MEETING_LANGUAGE,
      customSummaryRangeValue: 4,
      customSummaryRangeUnit: 'hours',
      stopObservingMobileLayout: null,
      topicForm: {
        topic: ''
      },
      renameForm: {
        name: ''
      },
      scheduleForm: {
        title: '',
        description: '',
        scheduledStartAt: '',
        scheduledEndAt: '',
        language: DEFAULT_MEETING_LANGUAGE,
        initialUserIds: []
      },
      settingsForm: {
        name: '',
        topic: '',
        meetingHistoryAccess: DEFAULT_MEETING_HISTORY_ACCESS
      }
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
    messageSummariesStore() {
      return useMessageSummariesStore()
    },
    uiStore() {
      return useUiStore()
    },
    notificationsStore() {
      return useNotificationsStore()
    },
    voiceStore() {
      return useVoiceStore()
    },
    channel() {
      const activeId = this.channelsStore.activeChannelId
      return this.channelsStore.channels.find((channel) => channel.id === activeId)
        || this.dmsStore.dmChannels.find((dmChannel) => dmChannel.id === activeId)
    },
    isDm() {
      return this.channel?.type === 'dm' || this.channel?.type === 'group'
    },
    isGroupDm() {
      return this.channel?.type === 'group'
    },
    canManageChannelSettings() {
      if (this.isGroupDm) {
        const selfId = this.sessionStore.user?.id
        const membership = (this.channel?.participants || []).find((entry) => entry.user_id === selfId)
        return this.sessionStore.user?.is_admin === true || membership?.role === 'owner'
      }
      return !this.isDm && this.channelsStore.can('manage_channels')
    },
    canLeaveChannel() {
      if (!this.channel) return false
      if (this.channel.type === 'dm') return false
      return this.channel.type === 'group'
        || this.channel.type === 'public'
        || this.channel.type === 'private'
    },
    canShowMeetingCallAction() {
      return !!this.channel
        && !this.channel.is_archived
        && this.channel.purpose !== 'meeting'
    },
    canShowAiSummaryAction() {
      return !!this.channel
        && !this.channel.is_archived
        && this.channel.purpose !== 'meeting'
    },
    canShowMeetingsMenuAction() {
      return !!this.channel
        && !this.channel.is_archived
        && this.channel.purpose !== 'meeting'
    },
    canShowMembersAction() {
      return !!this.channel && this.channel.type !== 'dm'
    },
    canShowDesktopOverflowActions() {
      return !!this.channel
    },
    rangeUnitOptions() {
      return [
        { label: this.$t('ui.components.hours'), value: 'hours' },
        { label: this.$t('ui.components.days'), value: 'days' }
      ]
    },
    meetingLanguageOptions() {
      return getMeetingLanguageOptions(this.$t)
    },
    hasActiveSourceMeeting() {
      return this.activeSourceMeeting?.status === 'active'
    },
    activeSourceMeeting() {
      if (!this.channel?.id) return null
      const fromStore = this.meetingsStore.meetings.find((meeting) => (
        meeting.status === 'active' && meeting.source_channel_id === this.channel.id
      ))
      if (fromStore) return fromStore

      if (!this.fetchedSourceMeeting) return null
      const knownMeeting = this.meetingsStore.meetings.find((meeting) => meeting.id === this.fetchedSourceMeeting.id)
      if (knownMeeting) {
        return knownMeeting.status === 'active' ? knownMeeting : null
      }

      return this.fetchedSourceMeeting.status === 'active' ? this.fetchedSourceMeeting : null
    },
    membersPanelOpen() {
      return this.rightPanelMode === 'members'
    },
    pastMeetingsPanelOpen() {
      return this.rightPanelMode === 'pastMeetings'
    },
    meetingCallActionLabel() {
      if (!this.hasActiveSourceMeeting) return this.$t('ui.components.call')
      if (this.voiceStore.channelId === this.activeSourceMeeting.chat_channel_id) {
        return this.$t('ui.components.open_call')
      }
      return this.$t('ui.components.join_call')
    },
    meetingCallActionTitle() {
      if (!this.hasActiveSourceMeeting) return this.$t('ui.components.start_call')
      if (this.voiceStore.channelId === this.activeSourceMeeting.chat_channel_id) {
        return this.$t('ui.components.open_active_call')
      }
      return this.$t('ui.components.join_active_call')
    },
    dmDisplayInfo() {
      if (!this.isDm || !this.channel) return null
      return this.dmsStore.displayInfo(this.channel)
    },
    dmStatusColor() {
      if (!this.dmDisplayInfo) return '#8c8c8c'
      return getPresenceStatusColor(this.dmDisplayInfo.badgeStatus || this.dmDisplayInfo.status)
    },
    memberCount() {
      return this.channelsStore.members.length
    },
    pinnedCount() {
      return this.messagesStore.pinnedMessages.length
    },
    myMembership() {
      return this.channelsStore.myMembership
    },
    notifPref() {
      return this.channelsStore.myMembership?.notifications || 'all'
    },
    scheduleInviteOptions() {
      const selectedUsers = this.sessionStore.getDirectoryUsersByIds(this.scheduleForm.initialUserIds)
      const source = this.scheduleInviteSearchTerm.trim()
        ? this.scheduleInviteSearchResults
        : this.sessionStore.getDefaultDirectoryUsers(20)
      return [...selectedUsers, ...source]
        .filter((user, index, list) => user?.id && list.findIndex((entry) => entry.id === user.id) === index)
        .filter((user) => user.id !== this.sessionStore.user?.id)
        .map((user) => ({
          label: user.display_name,
          value: user.id
        }))
    }
  },
  watch: {
    'channel.id': {
      immediate: true,
      async handler() {
        await this.refreshActiveSourceMeeting()
      }
    },
    isMobileLayout() {
      this.closeDesktopOverflowMenu()
      this.closeMobileOverflowMenu()
      this.closeMeetingsMenus()
    },
    showDesktopOverflowMenu(value) {
      if (!value) {
        this.desktopSummaryActionsExpanded = false
      }
    },
    showMobileOverflowMenu(value) {
      if (!value) {
        this.mobileSummaryActionsExpanded = false
      }
    },
    async showScheduleMeetingModal(value) {
      if (value) {
        await this.loadPlatformMeetingLanguageDefault()
        await this.sessionStore.ensureDirectoryUsersLoaded({ limit: 20 })
        this.scheduleInviteSearchResults = this.sessionStore.getDefaultDirectoryUsers(20)
        if (!this.scheduleForm.language) {
          this.scheduleForm.language = this.platformMeetingLanguageDefault
        }
        return
      }

      if (!value) {
        this.clearScheduleInviteSearchTimer()
        this.scheduleInviteSearchTerm = ''
        this.scheduleInviteSearchResults = []
        this.scheduleInviteSearchLoading = false
      }
    }
  },
  mounted() {
    this.stopObservingMobileLayout = observeMobileLayout((matches) => {
      this.isMobileLayout = matches
    })
  },
  beforeUnmount() {
    this.clearScheduleInviteSearchTimer()
    this.stopObservingMobileLayout?.()
  },
  methods: {
    clearScheduleInviteSearchTimer() {
      if (!this.scheduleInviteSearchTimer) return
      clearTimeout(this.scheduleInviteSearchTimer)
      this.scheduleInviteSearchTimer = null
    },
    togglePins() {
      this.uiStore.showPinnedPanel = !this.uiStore.showPinnedPanel
    },
    closeDesktopOverflowMenu() {
      this.showDesktopOverflowMenu = false
      this.desktopSummaryActionsExpanded = false
    },
    closeMobileOverflowMenu() {
      this.showMobileOverflowMenu = false
      this.mobileSummaryActionsExpanded = false
    },
    closeMeetingsMenus() {
      this.showDesktopMeetingsMenu = false
      this.showMobileMeetingsMenu = false
    },
    toggleDesktopSummaryActions() {
      this.desktopSummaryActionsExpanded = !this.desktopSummaryActionsExpanded
    },
    toggleMobileSummaryActions() {
      this.mobileSummaryActionsExpanded = !this.mobileSummaryActionsExpanded
    },
    async requestPresetSummary(rangePreset) {
      await this.requestRangeSummary({ range_preset: rangePreset })
    },
    async requestCustomSummary() {
      await this.requestRangeSummary({
        range_preset: 'custom',
        range_value: this.customSummaryRangeValue,
        range_unit: this.customSummaryRangeUnit
      })
    },
    async requestRangeSummary(payload) {
      if (!this.channel?.id) return
      try {
        await this.messageSummariesStore.requestRangeSummary(this.channel.id, payload)
        this.closeDesktopOverflowMenu()
        this.closeMobileOverflowMenu()
        window.$message?.success(this.$t('ui.components.summary_generation_started'))
      } catch (error) {
        console.error('Failed to request channel summary:', error)
        window.$message?.error(this.$t('ui.components.summary_generation_failed'))
      }
    },
    startMessageSelection() {
      this.messageSummariesStore.startSelection()
      this.closeDesktopOverflowMenu()
      this.closeMobileOverflowMenu()
    },
    async onRequestPresetSummaryFromMenu(rangePreset) {
      await this.requestPresetSummary(rangePreset)
    },
    async onRequestCustomSummaryFromMenu() {
      await this.requestCustomSummary()
    },
    onStartMessageSelectionFromMenu() {
      this.startMessageSelection()
    },
    onTogglePinsFromMenu() {
      this.togglePins()
      this.closeDesktopOverflowMenu()
      this.closeMobileOverflowMenu()
    },
    onToggleMembersFromMenu() {
      this.$emit('toggle-members')
      this.closeDesktopOverflowMenu()
      this.closeMobileOverflowMenu()
    },
    onTogglePastMeetingsAction() {
      this.$emit('toggle-past-meetings')
      this.closeDesktopOverflowMenu()
      this.closeMobileOverflowMenu()
      this.closeMeetingsMenus()
    },
    onOpenScheduleMeetingFromMenu() {
      this.closeMeetingsMenus()
      this.openScheduleMeetingModal()
    },
    onOpenSettingsFromMenu() {
      this.openSettingsModal()
      this.closeDesktopOverflowMenu()
      this.closeMobileOverflowMenu()
    },
    async onSetNotifPrefFromMenu(pref) {
      await this.setNotifPref(pref)
      this.closeDesktopOverflowMenu()
      this.closeMobileOverflowMenu()
    },
    openTopicModal() {
      if (!this.isGroupDm) return
      this.topicForm.topic = this.channel.topic || ''
      this.showTopicModal = true
    },
    openRenameModal() {
      if (!this.isGroupDm) return
      this.renameForm.name = this.dmDisplayInfo?.name || ''
      this.showRenameModal = true
    },
    openSettingsModal() {
      if (!this.canManageChannelSettings || !this.channel) return
      this.settingsForm.name = this.channel.name || ''
      this.settingsForm.topic = this.channel.topic || ''
      this.settingsForm.meetingHistoryAccess = this.channel.meeting_history_access || DEFAULT_MEETING_HISTORY_ACCESS
      this.showSettingsModal = true
    },
    async saveRename() {
      if (!this.channel || !this.renameForm.name.trim()) return

      this.savingRename = true
      try {
        await this.dmsStore.update(this.channel.id, { name: this.renameForm.name.trim() })
        this.showRenameModal = false
        window.$message.success(this.$t('ui.components.group_name_updated'))
      } catch {
        window.$message.error(this.$t('ui.components.failed_to_rename_group'))
      } finally {
        this.savingRename = false
      }
    },
    async saveGroupTopic() {
      if (!this.channel) return

      this.savingTopic = true
      try {
        const topic = this.topicForm.topic || null
        await this.dmsStore.update(this.channel.id, { topic })
        this.showTopicModal = false
        window.$message.success(this.$t('ui.components.topic_updated'))
      } catch {
        window.$message.error(this.$t('ui.components.failed_to_update_topic'))
      } finally {
        this.savingTopic = false
      }
    },
    async saveChannelSettings() {
      if (!this.channel || !this.canManageChannelSettings) return
      const name = this.settingsForm.name.trim()
      if (!name) return

      this.savingSettings = true
      try {
        const historyAccessChanged = this.channel.meeting_history_access !== this.settingsForm.meetingHistoryAccess
        const payload = {
          name,
          topic: this.settingsForm.topic || null,
          meeting_history_access: this.settingsForm.meetingHistoryAccess
        }
        if (this.isGroupDm) {
          await this.dmsStore.update(this.channel.id, payload)
        } else {
          await this.channelsStore.update(this.channel.id, payload)
        }
        if (historyAccessChanged) {
          await this.meetingsStore.handleSourceHistoryAccessChanged(this.channel.id)
        }
        this.showSettingsModal = false
        window.$message.success(this.$t('ui.components.channel_updated'))
      } catch {
        window.$message.error(this.$t('ui.components.failed_to_save_settings'))
      } finally {
        this.savingSettings = false
      }
    },
    async toggleArchiveState() {
      if (!this.channel || !this.canManageChannelSettings) return

      this.savingArchive = true
      try {
        const willArchive = !this.channel.is_archived
        await this.channelsStore.update(this.channel.id, { is_archived: willArchive })
        window.$message.success(
          willArchive
            ? this.$t('ui.components.channel_archived')
            : this.$t('ui.components.channel_restored')
        )
        if (willArchive) this.showSettingsModal = false
      } catch {
        window.$message.error(this.$t('ui.components.failed_to_update_archive_status'))
      } finally {
        this.savingArchive = false
      }
    },
    async setNotifPref(pref) {
      try {
        await this.notificationsStore.updatePreference(pref)
        const labels = {
          all: this.$t('ui.components.all_messages'),
          mentions: this.$t('ui.components.only_mentions'),
          none: this.$t('ui.components.muted')
        }
        window.$message?.success(labels[pref])
      } catch {
        window.$message?.error(this.$t('ui.components.could_not_save_setting'))
      }
    },
    async leaveCurrentChannel() {
      if (!this.channel || this.leavingChannel) return

      this.leavingChannel = true
      try {
        this.closeDesktopOverflowMenu()
        this.closeMobileOverflowMenu()
        this.closeMeetingsMenus()
        if (this.channel.type === 'group') {
          await this.dmsStore.leaveGroup(this.channel.id)
        } else {
          await this.channelsStore.leaveChannel(this.channel.id)
        }

        const fallbackId = this.channelsStore.firstUnarchivedChannelId()
        if (fallbackId) {
          await this.channelsStore.select(fallbackId)
          await this.$router.push(`/channels/${fallbackId}`).catch(() => {})
        } else {
          this.channelsStore.clearActiveContext()
          await this.$router.push('/channels').catch(() => {})
        }
      } catch {
        window.$message?.error(this.$t('ui.components.action_failed'))
      } finally {
        this.leavingChannel = false
      }
    },
    async refreshActiveSourceMeeting() {
      if (!this.channel || this.channel.purpose === 'meeting' || this.channel.is_archived) {
        this.fetchedSourceMeeting = null
        return
      }

      this.loadingActiveMeeting = true
      try {
        this.fetchedSourceMeeting = await this.meetingsStore.fetchActiveBySourceChannel(this.channel.id)
      } catch {
        this.fetchedSourceMeeting = null
      } finally {
        this.loadingActiveMeeting = false
      }
    },
    toLocalDateTimeInputValue(value) {
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
    buildDefaultScheduledStart() {
      const date = new Date()
      date.setMinutes(date.getMinutes() + 30)
      date.setSeconds(0, 0)
      return this.toLocalDateTimeInputValue(date)
    },
    buildDefaultScheduledEnd(startValue) {
      const date = startValue ? new Date(startValue) : new Date()
      date.setMinutes(date.getMinutes() + 30)
      return this.toLocalDateTimeInputValue(date)
    },
    async loadPlatformMeetingLanguageDefault() {
      try {
        const data = await getPlatformStatus()
        this.platformMeetingLanguageDefault = normalizeMeetingLanguage(
          data?.default_meeting_language,
          DEFAULT_MEETING_LANGUAGE
        )
      } catch {
        this.platformMeetingLanguageDefault = DEFAULT_MEETING_LANGUAGE
      }
    },
    async openScheduleMeetingModal() {
      if (!this.channel) return
      await this.loadPlatformMeetingLanguageDefault()
      const defaultStart = this.buildDefaultScheduledStart()
      this.scheduleForm = {
        title: this.resolveMeetingStartTitle(),
        description: '',
        scheduledStartAt: defaultStart,
        scheduledEndAt: this.buildDefaultScheduledEnd(defaultStart),
        language: this.platformMeetingLanguageDefault,
        initialUserIds: []
      }
      this.showScheduleMeetingModal = true
    },
    handleScheduleInviteSearch(term) {
      this.scheduleInviteSearchTerm = term || ''
      this.clearScheduleInviteSearchTimer()
      const trimmed = this.scheduleInviteSearchTerm.trim()
      if (!trimmed) {
        this.scheduleInviteSearchLoading = false
        this.scheduleInviteSearchResults = this.sessionStore.getDefaultDirectoryUsers(20)
        return
      }

      this.scheduleInviteSearchTimer = setTimeout(async () => {
        this.scheduleInviteSearchLoading = true
        try {
          this.scheduleInviteSearchResults = await this.sessionStore.searchUsers(trimmed, { limit: 20 })
        } finally {
          this.scheduleInviteSearchLoading = false
        }
      }, 150)
    },
    async submitScheduledMeeting() {
      if (!this.channel || !this.scheduleForm.scheduledStartAt || this.schedulingMeeting) return

      this.schedulingMeeting = true
      try {
        const meeting = await this.meetingsStore.scheduleFromChannel(this.channel.id, {
          title: this.scheduleForm.title,
          description: this.scheduleForm.description,
          language: this.scheduleForm.language,
          scheduledStartAt: this.toIsoDateTime(this.scheduleForm.scheduledStartAt),
          scheduledEndAt: this.toIsoDateTime(this.scheduleForm.scheduledEndAt),
          initialUserIds: this.scheduleForm.initialUserIds
        })
        this.showScheduleMeetingModal = false
        window.$message?.success(this.$t('ui.views.scheduled_meeting_ready'))
        await this.$router.push(`/meetings/${meeting.id}`).catch(() => {})
      } catch {
        window.$message?.error(this.$t('ui.views.could_not_schedule_meeting'))
      } finally {
        this.schedulingMeeting = false
      }
    },
    async startOrJoinMeetingCall() {
      if (!this.channel || this.startingMeeting || this.loadingActiveMeeting) return

      this.startingMeeting = true
      try {
        await this.refreshActiveSourceMeeting()
        let meeting = this.activeSourceMeeting
        let startedNewMeeting = false
        const meetingStartTitle = this.resolveMeetingStartTitle()

        if (!meeting || meeting.status !== 'active') {
          meeting = await this.meetingsStore.startFromChannel(
            this.channel.id,
            [],
            meetingStartTitle
          )
          startedNewMeeting = true
        }

        if (this.voiceStore.channelId !== meeting.chat_channel_id) {
          await this.meetingsStore.join(meeting.id)
        }

        if (startedNewMeeting) {
          playSfx(SFX_EVENTS.CALL_OUTGOING)
        }

        await this.$router.push(`/meetings/${meeting.id}`).catch(() => {})
        await this.refreshActiveSourceMeeting()
      } catch {
        window.$message?.error(this.$t('ui.components.could_not_start_call'))
      } finally {
        this.startingMeeting = false
      }
    },
    resolveMeetingStartTitle() {
      if (!this.channel) return ''

      const topic = typeof this.channel.topic === 'string'
        ? this.channel.topic.trim()
        : ''
      if (topic) return topic

      if (this.channel.type === 'dm' || this.channel.type === 'group') {
        return ''
      }

      return typeof this.channel.name === 'string'
        ? this.channel.name.trim()
        : ''
    }
  }
}
</script>

<style scoped>
.channel-header {
  padding: 12px 16px;
}

.channel-header-row {
  width: 100%;
}

.channel-header-copy {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.channel-avatar {
  flex-shrink: 0;
}

.channel-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.channel-title-row,
.channel-subtitle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.channel-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  font-size: 16px;
}

.channel-prefix-icon {
  line-height: 1;
  flex-shrink: 0;
}

.dm-member-count {
  font-size: 13px;
  opacity: 0.5;
  flex-shrink: 0;
}

.topic-container {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: fit-content;
  max-width: 100%;
  padding: 2px 6px;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.topic-container.is-editable {
  cursor: pointer;
}

.topic-container.is-editable:hover {
  background-color: rgba(255, 255, 255, 0.08);
}

.channel-topic {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  opacity: 0.7;
}

.channel-topic.placeholder {
  opacity: 0.4;
}

.edit-icon {
  opacity: 0;
  flex-shrink: 0;
  transition: opacity 0.2s;
}

.topic-container.is-editable:hover .edit-icon {
  opacity: 0.6;
}

.channel-header-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.header-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 240px;
}

.meetings-menu {
  min-width: 220px;
}

.desktop-overflow-menu,
.mobile-overflow-menu {
  min-width: 240px;
}

.header-menu-action {
  width: 100%;
  justify-content: flex-start;
  padding: 6px 8px;
}

.header-menu-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.header-menu-section-title {
  padding: 4px 8px 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.7;
}

.header-menu-section-title.danger,
.header-menu-action.danger {
  color: rgb(229, 115, 115);
}

.summary-toggle {
  justify-content: space-between;
}

.summary-toggle :deep(.n-button__content) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.summary-toggle-content {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.summary-toggle-content span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-toggle-chevron {
  flex-shrink: 0;
  margin-left: auto;
  opacity: 0.75;
}

.summary-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 0 4px;
}

.summary-presets {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 4px;
  padding: 0 8px;
}

.summary-preset {
  width: 100%;
  justify-content: flex-start;
  padding: 5px 6px;
}

.summary-custom {
  display: grid;
  grid-template-columns: minmax(72px, 1fr) minmax(96px, 1fr);
  gap: 8px;
  padding: 8px;
}

.summary-custom .n-button {
  grid-column: 1 / -1;
}

.summary-select {
  padding-left: 14px;
}

.danger-zone {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.channel-meeting-hint {
  font-size: 12px;
  opacity: 0.68;
  line-height: 1.45;
}

@media (max-width: 900px) {
  .channel-header {
    padding: 12px;
  }

  .channel-header-row {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .channel-header-copy {
    width: 100%;
  }

  .channel-header-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .mobile-actions {
    margin-top: 6px;
  }

  .channel-name,
  .channel-topic {
    white-space: normal;
    word-break: break-word;
  }

  .danger-zone {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
