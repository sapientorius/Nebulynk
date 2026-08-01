<template>
  <div data-testid="design-settings-panel">
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
      <h3 style="margin: 0">{{ $t('ui.components.admin.design_settings') }}</h3>
    </n-space>

    <n-spin :show="loading">
      <n-card>
        <n-form>
          <n-form-item :label="$t('ui.components.admin.theme_default_mode')">
            <n-select
              v-model:value="themeModeDefault"
              data-testid="platform-theme-mode-default"
              :options="themeModeOptions"
            />
          </n-form-item>

          <n-form-item :label="$t('ui.components.admin.theme_font_family')">
            <n-select
              v-model:value="themeFontFamily"
              data-testid="platform-theme-font-family"
              :options="fontFamilyOptions"
            />
          </n-form-item>

          <n-divider />

          <div class="design-settings-toolbar">
            <n-button-group data-testid="design-theme-mode-toggle">
              <n-button
                :type="activeTheme === 'dark' ? 'primary' : 'default'"
                @click="activeTheme = 'dark'"
              >
                {{ $t('ui.components.admin.theme_mode_dark') }}
              </n-button>
              <n-button
                :type="activeTheme === 'light' ? 'primary' : 'default'"
                @click="activeTheme = 'light'"
              >
                {{ $t('ui.components.admin.theme_mode_light') }}
              </n-button>
            </n-button-group>
            <n-space>
              <n-button data-testid="design-theme-reset-current" @click="resetActiveThemeColors">
                {{ $t('ui.components.admin.theme_reset_current') }}
              </n-button>
              <n-button data-testid="design-theme-reset-all" @click="resetAllThemeColors">
                {{ $t('ui.components.admin.theme_reset_all') }}
              </n-button>
            </n-space>
          </div>

          <div v-if="activeTheme === 'dark'" class="platform-theme-grid">
            <n-form-item :label="$t('ui.components.admin.theme_primary_color')">
              <n-color-picker
                v-model:value="themeDarkPrimaryColor"
                data-testid="platform-theme-dark-primary-color"
                :show-alpha="false"
              />
            </n-form-item>
            <n-form-item :label="$t('ui.components.admin.theme_secondary_color')">
              <n-color-picker
                v-model:value="themeDarkSecondaryColor"
                data-testid="platform-theme-dark-secondary-color"
                :show-alpha="false"
              />
            </n-form-item>
            <n-form-item :label="$t('ui.components.admin.theme_success_color')">
              <n-color-picker
                v-model:value="themeDarkSuccessColor"
                data-testid="platform-theme-dark-success-color"
                :show-alpha="false"
              />
            </n-form-item>
            <n-form-item :label="$t('ui.components.admin.theme_warning_color')">
              <n-color-picker
                v-model:value="themeDarkWarningColor"
                data-testid="platform-theme-dark-warning-color"
                :show-alpha="false"
              />
            </n-form-item>
            <n-form-item :label="$t('ui.components.admin.theme_error_color')">
              <n-color-picker
                v-model:value="themeDarkErrorColor"
                data-testid="platform-theme-dark-error-color"
                :show-alpha="false"
              />
            </n-form-item>
          </div>

          <div v-else class="platform-theme-grid">
            <n-form-item :label="$t('ui.components.admin.theme_primary_color')">
              <n-color-picker
                v-model:value="themeLightPrimaryColor"
                data-testid="platform-theme-light-primary-color"
                :show-alpha="false"
              />
            </n-form-item>
            <n-form-item :label="$t('ui.components.admin.theme_secondary_color')">
              <n-color-picker
                v-model:value="themeLightSecondaryColor"
                data-testid="platform-theme-light-secondary-color"
                :show-alpha="false"
              />
            </n-form-item>
            <n-form-item :label="$t('ui.components.admin.theme_success_color')">
              <n-color-picker
                v-model:value="themeLightSuccessColor"
                data-testid="platform-theme-light-success-color"
                :show-alpha="false"
              />
            </n-form-item>
            <n-form-item :label="$t('ui.components.admin.theme_warning_color')">
              <n-color-picker
                v-model:value="themeLightWarningColor"
                data-testid="platform-theme-light-warning-color"
                :show-alpha="false"
              />
            </n-form-item>
            <n-form-item :label="$t('ui.components.admin.theme_error_color')">
              <n-color-picker
                v-model:value="themeLightErrorColor"
                data-testid="platform-theme-light-error-color"
                :show-alpha="false"
              />
            </n-form-item>
          </div>

          <n-divider />

          <div class="design-settings-toolbar">
            <h4 class="design-settings-subtitle">{{ $t('ui.components.admin.theme_custom_css') }}</h4>
            <n-button data-testid="design-css-reset" @click="resetCss">
              {{ $t('ui.components.admin.theme_reset_css') }}
            </n-button>
          </div>

          <n-form-item :label="$t('ui.components.admin.theme_custom_css_global')">
            <n-input
              v-model:value="themeCustomCssGlobal"
              type="textarea"
              data-testid="design-global-custom-css"
              :autosize="{ minRows: 5, maxRows: 12 }"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.components.admin.theme_custom_css_active')">
            <n-input
              v-if="activeTheme === 'dark'"
              v-model:value="themeDarkCustomCss"
              type="textarea"
              data-testid="design-theme-custom-css"
              :autosize="{ minRows: 5, maxRows: 12 }"
            />
            <n-input
              v-else
              v-model:value="themeLightCustomCss"
              type="textarea"
              data-testid="design-theme-custom-css"
              :autosize="{ minRows: 5, maxRows: 12 }"
            />
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space justify="end">
            <n-button type="primary" :loading="saving" data-testid="design-settings-save" @click="save">
              {{ $t('ui.components.admin.save') }}
            </n-button>
          </n-space>
        </template>
      </n-card>
    </n-spin>
  </div>
</template>

<script>
import { useAdminStore, useThemeStore } from '../../stores/index.js'
import {
  DEFAULT_THEME_SETTINGS,
  normalizeCustomCss,
  normalizeHexColor,
  normalizeFontFamily,
  normalizePlatformThemeSettings,
  normalizeThemeMode
} from '../../lib/theme-settings.js'
import { getFontFamilyOptions } from '../../lib/font-settings.js'

export default {
  name: 'DesignSettings',
  data() {
    return {
      saving: false,
      activeTheme: 'dark',
      themeModeDefault: DEFAULT_THEME_SETTINGS.theme_mode_default,
      themeFontFamily: DEFAULT_THEME_SETTINGS.theme_font_family,
      themeDarkPrimaryColor: DEFAULT_THEME_SETTINGS.theme_dark_primary_color,
      themeDarkSecondaryColor: DEFAULT_THEME_SETTINGS.theme_dark_secondary_color,
      themeDarkSuccessColor: DEFAULT_THEME_SETTINGS.theme_dark_success_color,
      themeDarkWarningColor: DEFAULT_THEME_SETTINGS.theme_dark_warning_color,
      themeDarkErrorColor: DEFAULT_THEME_SETTINGS.theme_dark_error_color,
      themeLightPrimaryColor: DEFAULT_THEME_SETTINGS.theme_light_primary_color,
      themeLightSecondaryColor: DEFAULT_THEME_SETTINGS.theme_light_secondary_color,
      themeLightSuccessColor: DEFAULT_THEME_SETTINGS.theme_light_success_color,
      themeLightWarningColor: DEFAULT_THEME_SETTINGS.theme_light_warning_color,
      themeLightErrorColor: DEFAULT_THEME_SETTINGS.theme_light_error_color,
      themeCustomCssGlobal: DEFAULT_THEME_SETTINGS.theme_custom_css_global,
      themeDarkCustomCss: DEFAULT_THEME_SETTINGS.theme_dark_custom_css,
      themeLightCustomCss: DEFAULT_THEME_SETTINGS.theme_light_custom_css
    }
  },
  computed: {
    adminStore() {
      return useAdminStore()
    },
    themeStore() {
      return useThemeStore()
    },
    loading() {
      return this.adminStore.loadingPlatformSettings
    },
    themeModeOptions() {
      return [
        { label: this.$t('ui.components.admin.theme_mode_dark'), value: 'dark' },
        { label: this.$t('ui.components.admin.theme_mode_light'), value: 'light' },
        { label: this.$t('ui.components.admin.theme_mode_system'), value: 'system' }
      ]
    },
    fontFamilyOptions() {
      return getFontFamilyOptions()
    }
  },
  async created() {
    await this.load()
  },
  methods: {
    async load() {
      try {
        const settings = await this.adminStore.refreshPlatformSettings()
        this.applyThemeSettings(settings)
      } catch (error) {
        console.error('Failed to load design settings:', error)
      }
    },
    async save() {
      this.saving = true
      try {
        const settings = await this.adminStore.updatePlatformSettings(this.buildThemePayload())
        this.applyThemeSettings(settings)
        this.themeStore.setPlatformThemeSettings(settings)
        window.$message?.success(this.$t('ui.components.admin.platform_settings_updated'))
      } catch (error) {
        console.error('Failed to update design settings:', error)
        window.$message?.error(this.$t('ui.components.admin.saving_failed'))
      } finally {
        this.saving = false
      }
    },
    applyThemeSettings(settings = {}) {
      const normalized = normalizePlatformThemeSettings(settings)
      this.themeModeDefault = normalized.theme_mode_default
      this.themeFontFamily = normalized.theme_font_family
      this.themeDarkPrimaryColor = normalized.theme_dark_primary_color
      this.themeDarkSecondaryColor = normalized.theme_dark_secondary_color
      this.themeDarkSuccessColor = normalized.theme_dark_success_color
      this.themeDarkWarningColor = normalized.theme_dark_warning_color
      this.themeDarkErrorColor = normalized.theme_dark_error_color
      this.themeLightPrimaryColor = normalized.theme_light_primary_color
      this.themeLightSecondaryColor = normalized.theme_light_secondary_color
      this.themeLightSuccessColor = normalized.theme_light_success_color
      this.themeLightWarningColor = normalized.theme_light_warning_color
      this.themeLightErrorColor = normalized.theme_light_error_color
      this.themeCustomCssGlobal = normalized.theme_custom_css_global
      this.themeDarkCustomCss = normalized.theme_dark_custom_css
      this.themeLightCustomCss = normalized.theme_light_custom_css
    },
    buildThemePayload() {
      return {
        themeModeDefault: normalizeThemeMode(this.themeModeDefault, DEFAULT_THEME_SETTINGS.theme_mode_default),
        themeFontFamily: normalizeFontFamily(this.themeFontFamily, DEFAULT_THEME_SETTINGS.theme_font_family),
        themeDarkPrimaryColor: normalizeHexColor(this.themeDarkPrimaryColor, DEFAULT_THEME_SETTINGS.theme_dark_primary_color),
        themeDarkSecondaryColor: normalizeHexColor(this.themeDarkSecondaryColor, DEFAULT_THEME_SETTINGS.theme_dark_secondary_color),
        themeDarkSuccessColor: normalizeHexColor(this.themeDarkSuccessColor, DEFAULT_THEME_SETTINGS.theme_dark_success_color),
        themeDarkWarningColor: normalizeHexColor(this.themeDarkWarningColor, DEFAULT_THEME_SETTINGS.theme_dark_warning_color),
        themeDarkErrorColor: normalizeHexColor(this.themeDarkErrorColor, DEFAULT_THEME_SETTINGS.theme_dark_error_color),
        themeLightPrimaryColor: normalizeHexColor(this.themeLightPrimaryColor, DEFAULT_THEME_SETTINGS.theme_light_primary_color),
        themeLightSecondaryColor: normalizeHexColor(this.themeLightSecondaryColor, DEFAULT_THEME_SETTINGS.theme_light_secondary_color),
        themeLightSuccessColor: normalizeHexColor(this.themeLightSuccessColor, DEFAULT_THEME_SETTINGS.theme_light_success_color),
        themeLightWarningColor: normalizeHexColor(this.themeLightWarningColor, DEFAULT_THEME_SETTINGS.theme_light_warning_color),
        themeLightErrorColor: normalizeHexColor(this.themeLightErrorColor, DEFAULT_THEME_SETTINGS.theme_light_error_color),
        themeCustomCssGlobal: normalizeCustomCss(this.themeCustomCssGlobal),
        themeDarkCustomCss: normalizeCustomCss(this.themeDarkCustomCss),
        themeLightCustomCss: normalizeCustomCss(this.themeLightCustomCss)
      }
    },
    resetActiveThemeColors() {
      if (this.activeTheme === 'light') {
        this.themeLightPrimaryColor = DEFAULT_THEME_SETTINGS.theme_light_primary_color
        this.themeLightSecondaryColor = DEFAULT_THEME_SETTINGS.theme_light_secondary_color
        this.themeLightSuccessColor = DEFAULT_THEME_SETTINGS.theme_light_success_color
        this.themeLightWarningColor = DEFAULT_THEME_SETTINGS.theme_light_warning_color
        this.themeLightErrorColor = DEFAULT_THEME_SETTINGS.theme_light_error_color
        return
      }
      this.themeDarkPrimaryColor = DEFAULT_THEME_SETTINGS.theme_dark_primary_color
      this.themeDarkSecondaryColor = DEFAULT_THEME_SETTINGS.theme_dark_secondary_color
      this.themeDarkSuccessColor = DEFAULT_THEME_SETTINGS.theme_dark_success_color
      this.themeDarkWarningColor = DEFAULT_THEME_SETTINGS.theme_dark_warning_color
      this.themeDarkErrorColor = DEFAULT_THEME_SETTINGS.theme_dark_error_color
    },
    resetAllThemeColors() {
      const previousTheme = this.activeTheme
      this.activeTheme = 'dark'
      this.resetActiveThemeColors()
      this.activeTheme = 'light'
      this.resetActiveThemeColors()
      this.activeTheme = previousTheme
    },
    resetCss() {
      this.themeCustomCssGlobal = DEFAULT_THEME_SETTINGS.theme_custom_css_global
      if (this.activeTheme === 'light') {
        this.themeLightCustomCss = DEFAULT_THEME_SETTINGS.theme_light_custom_css
        return
      }
      this.themeDarkCustomCss = DEFAULT_THEME_SETTINGS.theme_dark_custom_css
    }
  }
}
</script>

<style scoped>
.design-settings-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.design-settings-subtitle {
  margin: 0;
  font-size: 14px;
}

.platform-theme-grid {
  display: grid;
  gap: 0 16px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}
</style>
