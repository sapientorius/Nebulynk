<template>
  <div data-testid="meeting-settings-panel">
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
      <h3 style="margin: 0">{{ $t('ui.views.meetings') }}</h3>
    </n-space>

    <n-spin :show="loading">
      <n-card>
        <n-form>
          <n-form-item :label="$t('ui.components.admin.default_meeting_language')">
            <n-select
              v-model:value="defaultMeetingLanguage"
              data-testid="meeting-default-meeting-language"
              :options="meetingLanguageOptions"
            />
          </n-form-item>

          <n-form-item :label="$t('ui.components.admin.meeting_video_enabled')">
            <div class="meeting-settings-field">
              <n-switch
                v-model:value="meetingVideoEnabled"
                data-testid="meeting-video-enabled"
              />
              <span class="meeting-settings-hint">{{ $t('ui.components.admin.meeting_video_enabled_help') }}</span>
            </div>
          </n-form-item>

          <n-form-item :label="$t('meetingHistoryAccess.global_label')">
            <div class="meeting-settings-field" data-testid="meeting-default-meeting-history-access">
              <MeetingHistoryAccessSelect v-model="defaultMeetingHistoryAccess" />
              <span class="meeting-settings-hint">{{ $t('meetingHistoryAccess.global_copy_help') }}</span>
            </div>
          </n-form-item>

          <n-divider />
          <h4 class="meeting-settings-subtitle">{{ $t('ui.components.admin.recording_retention_settings') }}</h4>

          <n-alert type="info" :show-icon="true" class="meeting-recording-info" data-testid="meeting-recording-retention-info">
            {{ $t('ui.components.admin.recording_retention_info') }}
          </n-alert>

          <n-form-item :label="$t('ui.components.admin.recording_retention_days')">
            <div class="meeting-settings-field">
              <n-switch
                v-model:value="recordingRetentionUnlimited"
                data-testid="meeting-recording-retention-unlimited"
              >
                <template #checked>{{ $t('ui.components.admin.unlimited') }}</template>
                <template #unchecked>{{ $t('ui.components.admin.limited') }}</template>
              </n-switch>
              <n-input-number
                v-if="!recordingRetentionUnlimited"
                v-model:value="recordingRetentionDays"
                data-testid="meeting-recording-retention-days"
                :min="1"
                :step="1"
                style="width: 180px"
              />
              <span class="meeting-settings-hint">{{ $t('ui.components.admin.recording_retention_days_help') }}</span>
            </div>
          </n-form-item>

          <n-form-item :label="$t('ui.components.admin.recording_storage_limit_gib')">
            <div class="meeting-settings-field">
              <n-switch
                v-model:value="recordingStorageUnlimited"
                data-testid="meeting-recording-storage-unlimited"
              >
                <template #checked>{{ $t('ui.components.admin.unlimited') }}</template>
                <template #unchecked>{{ $t('ui.components.admin.limited') }}</template>
              </n-switch>
              <n-input-number
                v-if="!recordingStorageUnlimited"
                v-model:value="recordingStorageLimitGiB"
                data-testid="meeting-recording-storage-limit-gib"
                :min="1"
                :max="1048576"
                :step="1"
                style="width: 180px"
              />
              <span class="meeting-settings-hint">{{ $t('ui.components.admin.recording_storage_limit_gib_help') }}</span>
            </div>
          </n-form-item>

          <n-alert type="warning" :show-icon="true" class="meeting-recording-warning" data-testid="meeting-recording-retention-warning">
            {{ $t('ui.components.admin.recording_retention_warning') }}
          </n-alert>
        </n-form>

        <template #footer>
          <n-space justify="end">
            <n-button type="primary" :loading="saving" data-testid="meeting-settings-save" @click="save">
              {{ $t('ui.components.admin.save') }}
            </n-button>
          </n-space>
        </template>
      </n-card>
    </n-spin>
  </div>
</template>

<script>
import { useAdminStore } from '../../stores/index.js'
import {
  DEFAULT_MEETING_LANGUAGE,
  getMeetingLanguageOptions
} from '../../lib/meeting-languages.js'
import { DEFAULT_MEETING_HISTORY_ACCESS } from '../../lib/meeting-history-access.js'
import MeetingHistoryAccessSelect from '../MeetingHistoryAccessSelect.vue'

export default {
  name: 'MeetingSettings',
  components: { MeetingHistoryAccessSelect },
  data() {
    return {
      saving: false,
      defaultMeetingLanguage: DEFAULT_MEETING_LANGUAGE,
      meetingVideoEnabled: true,
      defaultMeetingHistoryAccess: DEFAULT_MEETING_HISTORY_ACCESS,
      recordingRetentionDays: 60,
      recordingRetentionUnlimited: false,
      recordingStorageLimitGiB: 10,
      recordingStorageUnlimited: true
    }
  },
  computed: {
    adminStore() {
      return useAdminStore()
    },
    loading() {
      return this.adminStore.loadingPlatformSettings
    },
    meetingLanguageOptions() {
      return getMeetingLanguageOptions(this.$t)
    }
  },
  async created() {
    await this.load()
  },
  methods: {
    async load() {
      try {
        const settings = await this.adminStore.refreshPlatformSettings()
        this.defaultMeetingLanguage = settings?.default_meeting_language || this.defaultMeetingLanguage
        this.meetingVideoEnabled = settings?.meeting_video_enabled !== 'false'
        this.defaultMeetingHistoryAccess = settings?.default_meeting_history_access || this.defaultMeetingHistoryAccess
        this.applyRecordingRetentionSettings(settings)
      } catch (error) {
        console.error('Failed to load meeting settings:', error)
      }
    },
    async save() {
      this.saving = true
      try {
        const meetingRecordingRetentionDays = this.recordingRetentionUnlimited
          ? null
          : this.normalizeInteger(this.recordingRetentionDays, 60, 1)
        const meetingRecordingStorageLimitGiB = this.recordingStorageUnlimited
          ? null
          : this.normalizeInteger(this.recordingStorageLimitGiB, 10, 1, 1048576)
        const settings = await this.adminStore.updatePlatformSettings({
          defaultMeetingLanguage: this.defaultMeetingLanguage,
          meetingVideoEnabled: this.meetingVideoEnabled,
          defaultMeetingHistoryAccess: this.defaultMeetingHistoryAccess,
          meetingRecordingRetentionDays,
          meetingRecordingStorageLimitGiB
        })
        this.defaultMeetingLanguage = settings?.default_meeting_language || this.defaultMeetingLanguage
        this.meetingVideoEnabled = settings?.meeting_video_enabled !== 'false'
        this.defaultMeetingHistoryAccess = settings?.default_meeting_history_access || this.defaultMeetingHistoryAccess
        this.applyRecordingRetentionSettings(settings)
        window.$message?.success(this.$t('ui.components.admin.platform_settings_updated'))
      } catch (error) {
        console.error('Failed to update meeting settings:', error)
        window.$message?.error(this.$t('ui.components.admin.saving_failed'))
      } finally {
        this.saving = false
      }
    },
    applyRecordingRetentionSettings(settings = {}) {
      const retentionDays = settings?.meeting_recording_retention_days
      this.recordingRetentionUnlimited = retentionDays === 'unlimited'
      if (!this.recordingRetentionUnlimited) {
        this.recordingRetentionDays = this.normalizeInteger(retentionDays, 60, 1)
      }

      const storageLimitGiB = settings?.meeting_recording_storage_limit_gib
      this.recordingStorageUnlimited = storageLimitGiB === 'unlimited'
      if (!this.recordingStorageUnlimited) {
        this.recordingStorageLimitGiB = this.normalizeInteger(storageLimitGiB, 10, 1, 1048576)
      }
    },
    normalizeInteger(value, fallback, min, max = Number.MAX_SAFE_INTEGER) {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed)) return fallback
      return Math.max(min, Math.min(max, parsed))
    }
  }
}
</script>

<style scoped>
.meeting-settings-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.meeting-settings-hint {
  font-size: 12px;
  opacity: 0.7;
}

.meeting-settings-subtitle {
  margin: 0 0 14px;
  font-size: 14px;
}

.meeting-recording-info,
.meeting-recording-warning {
  margin-bottom: 16px;
}
</style>
