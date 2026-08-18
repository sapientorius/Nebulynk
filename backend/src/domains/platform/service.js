import { createId } from '@paralleldrive/cuid2'
import {
  mapSettingsRows,
  assertPlatformNotInitialized,
  normalizeSetupPayload,
  normalizeSettingsPatch,
  DEFAULT_AUTO_AWAY_MINUTES,
  DEFAULT_CHANNEL_NAME,
  DEFAULT_CHANNEL_DESCRIPTION,
  DEFAULT_PLATFORM_MEETING_HISTORY_ACCESS,
  buildSetupResult,
  platformInitializationFailedError
} from './policy.js'
import { UPLOAD_SETTING_KEYS } from '../../lib/upload-settings.js'
import { THEME_SETTING_KEYS } from '../../lib/theme-settings.js'

const THEME_PATCH_SETTING_MAP = {
  themePrimaryColor: THEME_SETTING_KEYS.primaryColor,
  themeSecondaryColor: THEME_SETTING_KEYS.secondaryColor,
  themeSuccessColor: THEME_SETTING_KEYS.successColor,
  themeWarningColor: THEME_SETTING_KEYS.warningColor,
  themeErrorColor: THEME_SETTING_KEYS.errorColor,
  themeDarkPrimaryColor: THEME_SETTING_KEYS.darkPrimaryColor,
  themeDarkSecondaryColor: THEME_SETTING_KEYS.darkSecondaryColor,
  themeDarkSuccessColor: THEME_SETTING_KEYS.darkSuccessColor,
  themeDarkWarningColor: THEME_SETTING_KEYS.darkWarningColor,
  themeDarkErrorColor: THEME_SETTING_KEYS.darkErrorColor,
  themeLightPrimaryColor: THEME_SETTING_KEYS.lightPrimaryColor,
  themeLightSecondaryColor: THEME_SETTING_KEYS.lightSecondaryColor,
  themeLightSuccessColor: THEME_SETTING_KEYS.lightSuccessColor,
  themeLightWarningColor: THEME_SETTING_KEYS.lightWarningColor,
  themeLightErrorColor: THEME_SETTING_KEYS.lightErrorColor,
  themeFontFamily: THEME_SETTING_KEYS.fontFamily,
  themeCustomCssGlobal: THEME_SETTING_KEYS.customCssGlobal,
  themeDarkCustomCss: THEME_SETTING_KEYS.darkCustomCss,
  themeLightCustomCss: THEME_SETTING_KEYS.lightCustomCss
}

export class PlatformDomainService {
  constructor({ repository, usersService, klipySettings, createIdFn = createId }) {
    this.repository = repository
    this.usersService = usersService
    this.klipySettings = klipySettings
    this.createIdFn = createIdFn
  }

  async findSettings() {
    const settings = await this.repository.listSettings()
    const result = mapSettingsRows(settings)
    if (this.klipySettings) {
      Object.assign(result, await this.klipySettings.getStatus())
    }
    return result
  }

  async setupPlatform(data) {
    const initializedSetting = await this.repository.findSetting('initialized')
    assertPlatformNotInitialized(initializedSetting)

    const setupData = normalizeSetupPayload(data)

    const adminUser = await this.usersService.create({
      email: setupData.email,
      password: setupData.password,
      display_name: setupData.displayName,
      preferred_locale: setupData.defaultLanguage,
      is_admin: true,
      is_primary_admin: true,
      is_verified: true
    })

    try {
      await this.repository.transaction(async (trxRepository) => {
        const defaultChannelId = this.createIdFn()
        await trxRepository.createChannel({
          id: defaultChannelId,
          name: DEFAULT_CHANNEL_NAME,
          description: DEFAULT_CHANNEL_DESCRIPTION,
          type: 'public',
          purpose: 'default',
          is_voice: false,
          is_archived: false,
          meeting_history_access: DEFAULT_PLATFORM_MEETING_HISTORY_ACCESS,
          created_by: adminUser.id
        })

        await trxRepository.createChannelMember({
          id: this.createIdFn(),
          channel_id: defaultChannelId,
          user_id: adminUser.id,
          role: 'owner'
        })

        await trxRepository.updateSetting('initialized', 'true')
        await trxRepository.updateSetting('platform_name', setupData.platformName)
        await trxRepository.updateSetting('domain', setupData.domain)
        await trxRepository.updateSetting('default_locale', setupData.defaultLanguage)
        await trxRepository.updateSetting('default_meeting_language', setupData.defaultLanguage)
        await trxRepository.updateSetting('default_meeting_history_access', 'all_channel_members')
      })
    } catch {
      await this.repository.deleteUserById(adminUser.id)
      throw platformInitializationFailedError()
    }

    return buildSetupResult({
      platformName: setupData.platformName,
      defaultLanguage: setupData.defaultLanguage,
      adminUser
    })
  }

  async updateSettings(data) {
    const patch = normalizeSettingsPatch(data)

    if (Object.prototype.hasOwnProperty.call(patch, 'defaultLanguage')) {
      await this.repository.updateSetting('default_locale', patch.defaultLanguage)
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'defaultMeetingLanguage')) {
      await this.repository.updateSetting('default_meeting_language', patch.defaultMeetingLanguage)
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'autoAwayMinutes')) {
      await this.repository.updateSetting('auto_away_minutes', String(patch.autoAwayMinutes || DEFAULT_AUTO_AWAY_MINUTES))
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'meetingVideoEnabled')) {
      await this.repository.updateSetting('meeting_video_enabled', patch.meetingVideoEnabled ? 'true' : 'false')
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'defaultMeetingHistoryAccess')) {
      await this.repository.updateSetting('default_meeting_history_access', patch.defaultMeetingHistoryAccess)
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'uploadMaxFileSizeMb')) {
      await this.repository.updateSetting(UPLOAD_SETTING_KEYS.maxFileSizeMb, String(patch.uploadMaxFileSizeMb))
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'imageUploadMaxDimensionPx')) {
      await this.repository.updateSetting(UPLOAD_SETTING_KEYS.imageMaxDimensionPx, String(patch.imageUploadMaxDimensionPx))
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'imageUploadQuality')) {
      await this.repository.updateSetting(UPLOAD_SETTING_KEYS.imageQuality, String(patch.imageUploadQuality))
    }
    if (patch.clearKlipyApiKey === true && this.klipySettings) {
      await this.klipySettings.clearApiKey()
    } else if (Object.prototype.hasOwnProperty.call(patch, 'klipyApiKey') && this.klipySettings) {
      await this.klipySettings.setApiKey(patch.klipyApiKey)
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'themeModeDefault')) {
      await this.repository.updateSetting(THEME_SETTING_KEYS.modeDefault, patch.themeModeDefault)
    }

    for (const [patchKey, settingKey] of Object.entries(THEME_PATCH_SETTING_MAP)) {
      if (Object.prototype.hasOwnProperty.call(patch, patchKey)) {
        await this.repository.updateSetting(settingKey, patch[patchKey])
      }
    }

    return this.findSettings()
  }
}
