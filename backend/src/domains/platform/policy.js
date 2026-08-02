import { GeneralError } from '@feathersjs/errors'
import { badRequest } from '../../lib/errors.js'
import { DEFAULT_LOCALE, normalizeLocale } from '../../lib/locales.js'
import { DEFAULT_MEETING_LANGUAGE, normalizeMeetingLanguage } from '../../lib/meeting-languages.js'
import {
  normalizeUploadSettingsMap,
  normalizeUploadSettingsPatch
} from '../../lib/upload-settings.js'
import {
  normalizeThemeSettingsMap,
  normalizeThemeSettingsPatch
} from '../../lib/theme-settings.js'

export const DEFAULT_PLATFORM_NAME = 'Nebulynk'
export const DEFAULT_DOMAIN = ''
export const DEFAULT_ADMIN_DISPLAY_NAME = 'Admin'
export const DEFAULT_PLATFORM_LANGUAGE = DEFAULT_LOCALE
export const DEFAULT_PLATFORM_MEETING_LANGUAGE = DEFAULT_MEETING_LANGUAGE
export const DEFAULT_AUTO_AWAY_MINUTES = 15
export const DEFAULT_MEETING_VIDEO_ENABLED = true
export const DEFAULT_CHANNEL_NAME = 'General'
export const DEFAULT_CHANNEL_DESCRIPTION = 'Standard-Channel f\u00fcr alle'

export function mapSettingsRows(settingsRows) {
  const result = {}
  for (const row of settingsRows || []) {
    result[row.key] = row.value
  }
  if (!Object.prototype.hasOwnProperty.call(result, 'default_meeting_language')) {
    result.default_meeting_language = normalizeMeetingLanguage(
      result.default_locale,
      DEFAULT_PLATFORM_MEETING_LANGUAGE
    )
  }
  if (!Object.prototype.hasOwnProperty.call(result, 'meeting_video_enabled')) {
    result.meeting_video_enabled = DEFAULT_MEETING_VIDEO_ENABLED ? 'true' : 'false'
  }
  return {
    ...result,
    ...normalizeUploadSettingsMap(result),
    ...normalizeThemeSettingsMap(result)
  }
}

export function isPlatformInitialized(initializedSetting) {
  return initializedSetting?.value === 'true'
}

export function assertPlatformNotInitialized(initializedSetting) {
  if (isPlatformInitialized(initializedSetting)) {
    throw badRequest('api.platform.already_initialized', {}, 'Platform is already initialized')
  }
}

export function normalizeSetupPayload(data = {}) {
  return {
    platformName: data.platformName || DEFAULT_PLATFORM_NAME,
    domain: data.domain || DEFAULT_DOMAIN,
    email: data.email,
    password: data.password,
    displayName: data.displayName || DEFAULT_ADMIN_DISPLAY_NAME,
    defaultLanguage: normalizeLocale(data.defaultLanguage, DEFAULT_PLATFORM_LANGUAGE)
  }
}

export function normalizeSettingsPatch(data = {}) {
  const patch = {}
  if (Object.prototype.hasOwnProperty.call(data, 'defaultLanguage')) {
    patch.defaultLanguage = normalizeLocale(data.defaultLanguage, DEFAULT_PLATFORM_LANGUAGE)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'defaultMeetingLanguage')) {
    patch.defaultMeetingLanguage = normalizeMeetingLanguage(
      data.defaultMeetingLanguage,
      DEFAULT_PLATFORM_MEETING_LANGUAGE
    )
  }
  if (Object.prototype.hasOwnProperty.call(data, 'autoAwayMinutes')) {
    patch.autoAwayMinutes = Number.parseInt(data.autoAwayMinutes, 10) || DEFAULT_AUTO_AWAY_MINUTES
  }
  if (Object.prototype.hasOwnProperty.call(data, 'meetingVideoEnabled')) {
    patch.meetingVideoEnabled = data.meetingVideoEnabled === true
  }
  return {
    ...patch,
    ...normalizeUploadSettingsPatch(data),
    ...normalizeThemeSettingsPatch(data)
  }
}

export function buildSetupResult({ platformName, defaultLanguage, adminUser }) {
  return {
    initialized: true,
    platformName,
    defaultLanguage,
    admin: {
      id: adminUser.id,
      email: adminUser.email
    }
  }
}

export function platformInitializationFailedError() {
  return new GeneralError('Plattform-Initialisierung fehlgeschlagen')
}
