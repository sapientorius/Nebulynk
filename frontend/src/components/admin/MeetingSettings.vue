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
      defaultMeetingHistoryAccess: DEFAULT_MEETING_HISTORY_ACCESS
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
      } catch (error) {
        console.error('Failed to load meeting settings:', error)
      }
    },
    async save() {
      this.saving = true
      try {
        const settings = await this.adminStore.updatePlatformSettings({
          defaultMeetingLanguage: this.defaultMeetingLanguage,
          meetingVideoEnabled: this.meetingVideoEnabled,
          defaultMeetingHistoryAccess: this.defaultMeetingHistoryAccess
        })
        this.defaultMeetingLanguage = settings?.default_meeting_language || this.defaultMeetingLanguage
        this.meetingVideoEnabled = settings?.meeting_video_enabled !== 'false'
        this.defaultMeetingHistoryAccess = settings?.default_meeting_history_access || this.defaultMeetingHistoryAccess
        window.$message?.success(this.$t('ui.components.admin.platform_settings_updated'))
      } catch (error) {
        console.error('Failed to update meeting settings:', error)
        window.$message?.error(this.$t('ui.components.admin.saving_failed'))
      } finally {
        this.saving = false
      }
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
</style>
