<template>
<slot :scheduling-meeting="schedulingMeeting" />
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

</template>

<script>
import { getPlatformStatus } from '../../lib/api.js'
import { useSessionStore, useMeetingsStore } from '../../stores/index.js'
import { DEFAULT_MEETING_LANGUAGE, getMeetingLanguageOptions, normalizeMeetingLanguage } from '../../lib/meeting-languages.js'


export default {
  name: 'ChannelMeetingScheduleDialog',
  components: {  },
  emits: ["scheduled"],
  props: { channel: { type: Object, default: null } },
  data() { return {
searchGeneration: 0,
dialogGeneration: 0,
schedulingMeeting: false,
showScheduleMeetingModal: false,
scheduleInviteSearchLoading: false,
scheduleInviteSearchTimer: null,
scheduleInviteSearchTerm: '',
scheduleInviteSearchResults: [],
platformMeetingLanguageDefault: DEFAULT_MEETING_LANGUAGE,
scheduleForm: {
        title: '',
        description: '',
        scheduledStartAt: '',
        scheduledEndAt: '',
        language: DEFAULT_MEETING_LANGUAGE,
        initialUserIds: []
      }
  } },
  computed: {
sessionStore() {
      return useSessionStore()
    },
meetingsStore() {
      return useMeetingsStore()
    },
meetingLanguageOptions() {
      return getMeetingLanguageOptions(this.$t)
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
async showScheduleMeetingModal(value) {
    this.invalidateSearch()
    const generation = this.searchGeneration
    if (value) {
      await this.loadPlatformMeetingLanguageDefault()
      await this.sessionStore.ensureDirectoryUsersLoaded({ limit: 20 })
      if (generation !== this.searchGeneration || !this.showScheduleMeetingModal) return
      this.scheduleInviteSearchResults = this.sessionStore.getDefaultDirectoryUsers(20)
      if (!this.scheduleForm.language) this.scheduleForm.language = this.platformMeetingLanguageDefault
    } else {
      this.dialogGeneration++
      this.scheduleInviteSearchTerm = ''; this.scheduleInviteSearchResults = []; this.scheduleInviteSearchLoading = false
    }
  }
  },
beforeUnmount() { this.dialogGeneration++; this.invalidateSearch() },
  methods: {
async openScheduleMeetingModal() {
      if (!this.channel) return
      const generation = ++this.dialogGeneration
      await this.loadPlatformMeetingLanguageDefault()
      if (generation !== this.dialogGeneration) return
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
invalidateSearch() { this.searchGeneration++; this.clearScheduleInviteSearchTimer() },
async submitScheduledMeeting() {
      if (!this.channel || !this.scheduleForm.scheduledStartAt || this.schedulingMeeting) return

      const generation = this.dialogGeneration
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
        if (generation !== this.dialogGeneration) return
        this.showScheduleMeetingModal = false
        window.$message?.success(this.$t('ui.views.scheduled_meeting_ready'))
        this.$emit('scheduled', meeting.id)
      } catch {
        window.$message?.error(this.$t('ui.views.could_not_schedule_meeting'))
      } finally {
        this.schedulingMeeting = false
      }
    },
handleScheduleInviteSearch(term) {
    this.invalidateSearch()
    const generation = this.searchGeneration
    this.scheduleInviteSearchTerm = term || ''
    const trimmed = this.scheduleInviteSearchTerm.trim()
    if (!trimmed) { this.scheduleInviteSearchLoading = false; this.scheduleInviteSearchResults = this.sessionStore.getDefaultDirectoryUsers(20); return }
    this.scheduleInviteSearchTimer = setTimeout(async () => {
      this.scheduleInviteSearchTimer = null
      this.scheduleInviteSearchLoading = true
      try {
        const users = await this.sessionStore.searchUsers(trimmed, { limit: 20 })
        if (generation === this.searchGeneration && this.showScheduleMeetingModal) this.scheduleInviteSearchResults = users
      } catch {
        if (generation === this.searchGeneration) this.scheduleInviteSearchResults = []
      } finally { if (generation === this.searchGeneration) this.scheduleInviteSearchLoading = false }
    }, 150)
  },
clearScheduleInviteSearchTimer() {
      if (!this.scheduleInviteSearchTimer) return
      clearTimeout(this.scheduleInviteSearchTimer)
      this.scheduleInviteSearchTimer = null
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
    },
toLocalDateTimeInputValue(value) {
      const date = value instanceof Date ? value : new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      const offsetMs = date.getTimezoneOffset() * 60 * 1000
      return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
    }
  }
}
</script>

<style scoped>

.channel-topic.placeholder {
  opacity: 0.4;
}

.summary-custom .n-button {
  grid-column: 1 / -1;
}

.channel-meeting-hint {
  font-size: 12px;
  opacity: 0.68;
  line-height: 1.45;
}

</style>
