<template>
  <div data-testid="platform-settings-panel">
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
      <h3 style="margin: 0">{{ $t('ui.components.admin.platform_settings') }}</h3>
    </n-space>

    <n-spin :show="loading">
      <n-card>
        <n-form>
          <n-form-item :label="$t('ui.components.admin.default_language')">
            <n-select
              data-testid="platform-default-language"
              v-model:value="defaultLanguage"
              :options="languageOptions"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.components.admin.default_meeting_language')">
            <n-select
              data-testid="platform-default-meeting-language"
              v-model:value="defaultMeetingLanguage"
              :options="meetingLanguageOptions"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.components.admin.auto_away_timeout_minutes')">
            <div class="platform-settings-field">
              <n-input-number
                v-model:value="autoAwayMinutes"
                data-testid="platform-auto-away-minutes"
                :min="1"
                :step="1"
                style="width: 180px"
              />
              <span class="platform-settings-hint">{{ $t('ui.components.admin.auto_away_timeout_help') }}</span>
            </div>
          </n-form-item>
          <n-divider />
          <h4 class="platform-settings-subtitle">{{ $t('ui.components.admin.call_settings') }}</h4>
          <n-form-item :label="$t('ui.components.admin.meeting_video_enabled')">
            <div class="platform-settings-field">
              <n-switch
                v-model:value="meetingVideoEnabled"
                data-testid="platform-meeting-video-enabled"
              />
              <span class="platform-settings-hint">{{ $t('ui.components.admin.meeting_video_enabled_help') }}</span>
            </div>
          </n-form-item>
          <n-divider />
          <h4 class="platform-settings-subtitle">{{ $t('ui.components.admin.upload_settings') }}</h4>
          <n-form-item :label="$t('ui.components.admin.upload_max_file_size_mb')">
            <div class="platform-settings-field">
              <n-input-number
                v-model:value="uploadMaxFileSizeMb"
                data-testid="platform-upload-max-file-size-mb"
                :min="1"
                :max="1024"
                :step="1"
                style="width: 180px"
              />
              <span class="platform-settings-hint">{{ $t('ui.components.admin.upload_max_file_size_help') }}</span>
            </div>
          </n-form-item>
          <n-form-item :label="$t('ui.components.admin.image_upload_max_dimension_px')">
            <div class="platform-settings-field">
              <n-input-number
                v-model:value="imageUploadMaxDimensionPx"
                data-testid="platform-image-upload-max-dimension-px"
                :min="256"
                :max="8192"
                :step="64"
                style="width: 180px"
              />
              <span class="platform-settings-hint">{{ $t('ui.components.admin.image_upload_max_dimension_help') }}</span>
            </div>
          </n-form-item>
          <n-form-item :label="$t('ui.components.admin.image_upload_quality')">
            <div class="platform-settings-field">
              <n-input-number
                v-model:value="imageUploadQuality"
                data-testid="platform-image-upload-quality"
                :min="1"
                :max="100"
                :step="1"
                style="width: 180px"
              />
              <span class="platform-settings-hint">{{ $t('ui.components.admin.image_upload_quality_help') }}</span>
            </div>
          </n-form-item>
          <template v-if="isPrimaryAdmin">
            <n-divider />
            <h4 class="platform-settings-subtitle">{{ $t('sponsorship.settings_title') }}</h4>
            <n-form-item :label="$t('sponsorship.settings_enabled_label')">
              <div class="platform-settings-field">
                <n-switch
                  :value="sponsorshipPromptsEnabled"
                  :loading="updatingSponsorshipPromptPreference"
                  data-testid="platform-sponsorship-prompts-enabled"
                  @update:value="updateSponsorshipPromptsEnabled"
                />
                <span class="platform-settings-hint">{{ $t('sponsorship.settings_enabled_help') }}</span>
                <n-button
                  size="small"
                  secondary
                  data-testid="platform-sponsorship-prompt-preview"
                  @click="showSponsorshipPromptPreview"
                >
                  {{ $t('sponsorship.settings_preview_action') }}
                </n-button>
              </div>
            </n-form-item>
          </template>
        </n-form>

        <template #footer>
          <n-space justify="end">
            <n-button type="primary" :loading="saving" data-testid="platform-settings-save" @click="save">
              {{ $t('ui.components.admin.save') }}
            </n-button>
          </n-space>
        </template>
      </n-card>
    </n-spin>
  </div>
</template>

<script>
import { useAdminStore, useSessionStore, useUiStore, useUploadsStore } from '../../stores/index.js'
import { getSponsorshipPromptPreference, updateSponsorshipPromptPreference } from '../../lib/api.js'
import { getLocaleOptions, setPlatformDefaultLocale } from '../../lib/i18n.js'
import {
  DEFAULT_MEETING_LANGUAGE,
  getMeetingLanguageOptions
} from '../../lib/meeting-languages.js'
import {
  DEFAULT_IMAGE_UPLOAD_MAX_DIMENSION_PX,
  DEFAULT_IMAGE_UPLOAD_QUALITY,
  DEFAULT_UPLOAD_MAX_FILE_SIZE_MB
} from '../../lib/upload-settings.js'

export default {
  name: 'PlatformSettings',
  data() {
    return {
      saving: false,
      defaultLanguage: 'en',
      defaultMeetingLanguage: DEFAULT_MEETING_LANGUAGE,
      autoAwayMinutes: 15,
      meetingVideoEnabled: true,
      uploadMaxFileSizeMb: DEFAULT_UPLOAD_MAX_FILE_SIZE_MB,
      imageUploadMaxDimensionPx: DEFAULT_IMAGE_UPLOAD_MAX_DIMENSION_PX,
      imageUploadQuality: DEFAULT_IMAGE_UPLOAD_QUALITY,
      sponsorshipPromptsEnabled: true,
      updatingSponsorshipPromptPreference: false
    }
  },
  computed: {
    adminStore() {
      return useAdminStore()
    },
    uploadsStore() {
      return useUploadsStore()
    },
    sessionStore() {
      return useSessionStore()
    },
    uiStore() {
      return useUiStore()
    },
    isPrimaryAdmin() {
      return this.sessionStore.user?.is_primary_admin === true
    },
    loading() {
      return this.adminStore.loadingPlatformSettings
    },
    languageOptions() {
      return getLocaleOptions()
    },
    meetingLanguageOptions() {
      return getMeetingLanguageOptions(this.$t)
    }
  },
  async created() {
    await this.load()
    await this.loadSponsorshipPromptPreference()
  },
  methods: {
    async load() {
      try {
        const settings = await this.adminStore.refreshPlatformSettings()
        this.defaultLanguage = settings?.default_locale || this.defaultLanguage
        this.defaultMeetingLanguage = settings?.default_meeting_language || this.defaultMeetingLanguage
        this.autoAwayMinutes = Number.parseInt(settings?.auto_away_minutes, 10) || this.autoAwayMinutes
        this.meetingVideoEnabled = settings?.meeting_video_enabled !== 'false'
        this.uploadMaxFileSizeMb = this.normalizeNumber(
          settings?.upload_max_file_size_mb,
          DEFAULT_UPLOAD_MAX_FILE_SIZE_MB,
          1,
          1024
        )
        this.imageUploadMaxDimensionPx = this.normalizeNumber(
          settings?.image_upload_max_dimension_px,
          DEFAULT_IMAGE_UPLOAD_MAX_DIMENSION_PX,
          256,
          8192
        )
        this.imageUploadQuality = this.normalizeNumber(
          settings?.image_upload_quality,
          DEFAULT_IMAGE_UPLOAD_QUALITY,
          1,
          100
        )
      } catch (error) {
        console.error('Failed to load platform settings:', error)
      }
    },
    async save() {
      this.saving = true
      try {
        const autoAwayMinutes = Math.max(1, Number.parseInt(this.autoAwayMinutes, 10) || 15)
        const uploadMaxFileSizeMb = this.normalizeNumber(this.uploadMaxFileSizeMb, DEFAULT_UPLOAD_MAX_FILE_SIZE_MB, 1, 1024)
        const imageUploadMaxDimensionPx = this.normalizeNumber(
          this.imageUploadMaxDimensionPx,
          DEFAULT_IMAGE_UPLOAD_MAX_DIMENSION_PX,
          256,
          8192
        )
        const imageUploadQuality = this.normalizeNumber(this.imageUploadQuality, DEFAULT_IMAGE_UPLOAD_QUALITY, 1, 100)
        const settings = await this.adminStore.updatePlatformSettings({
          defaultLanguage: this.defaultLanguage,
          defaultMeetingLanguage: this.defaultMeetingLanguage,
          autoAwayMinutes,
          meetingVideoEnabled: this.meetingVideoEnabled,
          uploadMaxFileSizeMb,
          imageUploadMaxDimensionPx,
          imageUploadQuality
        })
        setPlatformDefaultLocale(settings?.default_locale || this.defaultLanguage)
        this.defaultMeetingLanguage = settings?.default_meeting_language || this.defaultMeetingLanguage
        this.autoAwayMinutes = Number.parseInt(settings?.auto_away_minutes, 10) || autoAwayMinutes
        this.uploadMaxFileSizeMb = this.normalizeNumber(
          settings?.upload_max_file_size_mb,
          uploadMaxFileSizeMb,
          1,
          1024
        )
        this.imageUploadMaxDimensionPx = this.normalizeNumber(
          settings?.image_upload_max_dimension_px,
          imageUploadMaxDimensionPx,
          256,
          8192
        )
        this.imageUploadQuality = this.normalizeNumber(
          settings?.image_upload_quality,
          imageUploadQuality,
          1,
          100
        )
        await this.uploadsStore.loadUploadSettings({ refresh: true })
        window.$message?.success(this.$t('ui.components.admin.platform_settings_updated'))
      } catch (error) {
        console.error('Failed to update platform settings:', error)
        window.$message?.error(this.$t('ui.components.admin.saving_failed'))
      } finally {
        this.saving = false
      }
    },
    async loadSponsorshipPromptPreference() {
      if (!this.isPrimaryAdmin) return

      try {
        const preference = await getSponsorshipPromptPreference()
        this.sponsorshipPromptsEnabled = preference?.enabled !== false
      } catch (error) {
        console.error('Failed to load sponsorship prompt preference:', error)
      }
    },
    async updateSponsorshipPromptsEnabled(enabled) {
      if (!this.isPrimaryAdmin || this.updatingSponsorshipPromptPreference) return

      const previousValue = this.sponsorshipPromptsEnabled
      this.sponsorshipPromptsEnabled = enabled
      this.updatingSponsorshipPromptPreference = true
      try {
        const preference = await updateSponsorshipPromptPreference(enabled)
        this.sponsorshipPromptsEnabled = preference?.enabled !== false
        window.$message?.success(this.$t('sponsorship.settings_updated'))
      } catch (error) {
        this.sponsorshipPromptsEnabled = previousValue
        console.error('Failed to update sponsorship prompt preference:', error)
        window.$message?.error(this.$t('sponsorship.settings_update_failed'))
      } finally {
        this.updatingSponsorshipPromptPreference = false
      }
    },
    showSponsorshipPromptPreview() {
      if (!this.isPrimaryAdmin) return
      this.uiStore.openSponsorshipPrompt()
    },
    normalizeNumber(value, fallback, min, max) {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed)) return fallback
      return Math.max(min, Math.min(max, parsed))
    }
  }
}
</script>

<style scoped>
.platform-settings-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.platform-settings-hint {
  font-size: 12px;
  opacity: 0.7;
}

.platform-settings-subtitle {
  margin: 0 0 14px;
  font-size: 14px;
}

</style>
