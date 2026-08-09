import { SUPPORTED_LOCALES } from '../../lib/locales.js'
import { USER_THEME_PREFERENCE_VALUES } from '../../lib/theme-settings.js'

const meetingVideoPreferencesSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    background_mode: { type: 'string', enum: ['none', 'blur', 'image'] },
    preferred_camera_device_id: { type: ['string', 'null'], minLength: 1, maxLength: 255 },
    background_image_id: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
    video_mirror: { type: 'boolean' }
  }
}

export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password', 'display_name'],
  properties: {
    email: { type: 'string', format: 'email', minLength: 1 },
    password: { type: 'string', minLength: 8 },
    display_name: { type: 'string', minLength: 1, maxLength: 100 },
    preferred_locale: { type: 'string', enum: SUPPORTED_LOCALES },
    theme_preference: { type: 'string', enum: USER_THEME_PREFERENCE_VALUES },
    account_type: { type: 'string', enum: ['member', 'guest'] },
    guest_expires_at: { type: ['string', 'null'], format: 'date-time' },
    disabled_at: { type: ['string', 'null'], format: 'date-time' },
    is_primary_admin: { type: 'boolean' }
  }
}

export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    email: { type: 'string', format: 'email', minLength: 1 },
    password: { type: 'string', minLength: 8 },
    display_name: { type: 'string', minLength: 1, maxLength: 100 },
    avatar_url: { type: ['string', 'null'] },
    avatar_storage_key: { type: ['string', 'null'] },
    meeting_video_preferences: meetingVideoPreferencesSchema,
    preferred_locale: { type: 'string', enum: SUPPORTED_LOCALES },
    theme_preference: { type: 'string', enum: USER_THEME_PREFERENCE_VALUES },
    status: { type: 'string', enum: ['online', 'away', 'dnd', 'offline'] },
    custom_status: { type: ['string', 'null'], maxLength: 200 },
    custom_status_emoji: { type: ['string', 'null'], maxLength: 50 },
    status_expires_at: { type: ['string', 'null'], format: 'date-time' },
    disabled_at: { type: ['string', 'null'], format: 'date-time' }
  }
}
