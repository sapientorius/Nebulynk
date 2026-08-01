import { SUPPORTED_LOCALES } from '../../lib/locales.js'
import { SUPPORTED_MEETING_LANGUAGES } from '../../lib/meeting-languages.js'
import {
  THEME_CUSTOM_CSS_MAX_LENGTH,
  THEME_FONT_FAMILY_VALUES,
  THEME_MODE_VALUES
} from '../../lib/theme-settings.js'

const hexColorSchema = {
  type: 'string',
  pattern: '^#[0-9a-fA-F]{6}$'
}

const customCssSchema = {
  type: 'string',
  maxLength: THEME_CUSTOM_CSS_MAX_LENGTH
}

export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password'],
  properties: {
    platformName: { type: 'string', maxLength: 100 },
    domain: { type: 'string' },
    email: { type: 'string', format: 'email', minLength: 1 },
    password: { type: 'string', minLength: 8 },
    displayName: { type: 'string', minLength: 1, maxLength: 100 },
    defaultLanguage: { type: 'string', enum: SUPPORTED_LOCALES }
  }
}

export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    defaultLanguage: { type: 'string', enum: SUPPORTED_LOCALES },
    defaultMeetingLanguage: { type: 'string', enum: SUPPORTED_MEETING_LANGUAGES },
    autoAwayMinutes: { type: 'integer', minimum: 1 },
    meetingVideoEnabled: { type: 'boolean' },
    uploadMaxFileSizeMb: { type: 'integer', minimum: 1, maximum: 1024 },
    imageUploadMaxDimensionPx: { type: 'integer', minimum: 256, maximum: 8192 },
    imageUploadQuality: { type: 'integer', minimum: 1, maximum: 100 },
    themeModeDefault: { type: 'string', enum: THEME_MODE_VALUES },
    themePrimaryColor: hexColorSchema,
    themeSecondaryColor: hexColorSchema,
    themeSuccessColor: hexColorSchema,
    themeWarningColor: hexColorSchema,
    themeErrorColor: hexColorSchema,
    themeDarkPrimaryColor: hexColorSchema,
    themeDarkSecondaryColor: hexColorSchema,
    themeDarkSuccessColor: hexColorSchema,
    themeDarkWarningColor: hexColorSchema,
    themeDarkErrorColor: hexColorSchema,
    themeLightPrimaryColor: hexColorSchema,
    themeLightSecondaryColor: hexColorSchema,
    themeLightSuccessColor: hexColorSchema,
    themeLightWarningColor: hexColorSchema,
    themeLightErrorColor: hexColorSchema,
    themeFontFamily: { type: 'string', enum: THEME_FONT_FAMILY_VALUES },
    themeCustomCssGlobal: customCssSchema,
    themeDarkCustomCss: customCssSchema,
    themeLightCustomCss: customCssSchema
  }
}
