import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest, GeneralError } from '@feathersjs/errors'
import { PlatformDomainService } from '../src/domains/platform/service.js'

function createDomainService({
  repositoryOverrides = {},
  usersServiceOverrides = {}
} = {}) {
  let nextId = 0
  const calls = {
    usersCreate: [],
    createdChannels: [],
    createdMembers: [],
    updatedSettings: [],
    deletedUsers: []
  }

  const txRepository = {
    async createChannel(channelData) {
      calls.createdChannels.push(channelData)
    },
    async createChannelMember(memberData) {
      calls.createdMembers.push(memberData)
    },
    async updateSetting(key, value) {
      calls.updatedSettings.push({ key, value })
    }
  }

  const repository = {
    async listSettings() {
      return [
        { key: 'initialized', value: 'false' },
        { key: 'platform_name', value: 'Nebulynk' },
        { key: 'domain', value: '' },
        { key: 'default_locale', value: 'en' },
        { key: 'default_meeting_language', value: 'en' },
        { key: 'auto_away_minutes', value: '15' },
        { key: 'meeting_video_enabled', value: 'true' },
        { key: 'upload_max_file_size_mb', value: '20' },
        { key: 'image_upload_max_dimension_px', value: '1920' },
        { key: 'image_upload_quality', value: '82' },
        { key: 'theme_mode_default', value: 'dark' },
        { key: 'theme_primary_color', value: '#63e2b7' },
        { key: 'theme_secondary_color', value: '#5c75ff' },
        { key: 'theme_success_color', value: '#63e2b7' },
        { key: 'theme_warning_color', value: '#faad14' },
        { key: 'theme_error_color', value: '#ff4d4f' }
      ]
    },
    async findSetting() {
      return { key: 'initialized', value: 'false' }
    },
    async transaction(runInTransaction) {
      await runInTransaction(txRepository)
    },
    async updateSetting(key, value) {
      calls.updatedSettings.push({ key, value })
    },
    async deleteUserById(userId) {
      calls.deletedUsers.push(userId)
    },
    ...repositoryOverrides
  }

  const usersService = {
    async create(data) {
      calls.usersCreate.push(data)
      return { id: 'admin-1', email: data.email }
    },
    ...usersServiceOverrides
  }

  const service = new PlatformDomainService({
    repository,
    usersService,
    createIdFn: () => `id-${++nextId}`
  })

  return { service, calls }
}

test('platform domain: find maps settings table rows to key-value payload', async () => {
  const { service } = createDomainService()

  const result = await service.findSettings()

  assert.deepEqual(result, {
    initialized: 'false',
    platform_name: 'Nebulynk',
    domain: '',
    default_locale: 'en',
    default_meeting_language: 'en',
    auto_away_minutes: '15',
    meeting_video_enabled: 'true',
    upload_max_file_size_mb: '20',
    image_upload_max_dimension_px: '1920',
    image_upload_quality: '82',
    theme_mode_default: 'dark',
    theme_primary_color: '#63e2b7',
    theme_secondary_color: '#5c75ff',
    theme_success_color: '#63e2b7',
    theme_warning_color: '#faad14',
    theme_error_color: '#ff4d4f',
    theme_dark_primary_color: '#63e2b7',
    theme_dark_secondary_color: '#5c75ff',
    theme_dark_success_color: '#63e2b7',
    theme_dark_warning_color: '#faad14',
    theme_dark_error_color: '#ff4d4f',
    theme_light_primary_color: '#63e2b7',
    theme_light_secondary_color: '#5c75ff',
    theme_light_success_color: '#63e2b7',
    theme_light_warning_color: '#faad14',
    theme_light_error_color: '#ff4d4f',
    theme_font_family: 'lato',
    theme_custom_css_global: '',
    theme_dark_custom_css: '',
    theme_light_custom_css: ''
  })
})

test('platform domain policy: setup is blocked when platform is already initialized', async () => {
  const { service, calls } = createDomainService({
    repositoryOverrides: {
      async findSetting() {
        return { key: 'initialized', value: 'true' }
      }
    }
  })

  await assert.rejects(
    service.setupPlatform({
      email: 'admin@example.test',
      password: 'strong-pass'
    }),
    BadRequest
  )

  assert.equal(calls.usersCreate.length, 0)
})

test('platform domain behavior: setup uses defaults and creates baseline records', async () => {
  const { service, calls } = createDomainService()

  const result = await service.setupPlatform({
    email: 'admin@example.test',
    password: 'strong-pass'
  })

  assert.equal(calls.usersCreate.length, 1)
  assert.equal(calls.usersCreate[0].display_name, 'Admin')
  assert.equal(calls.usersCreate[0].preferred_locale, 'en')
  assert.equal(calls.usersCreate[0].is_primary_admin, true)
  assert.equal(calls.createdChannels.length, 1)
  assert.deepEqual(calls.createdChannels[0], {
    id: 'id-1',
    name: 'Allgemein',
    description: 'Standard-Channel f\u00fcr alle',
    type: 'public',
    purpose: 'default',
    is_voice: false,
    is_archived: false,
    created_by: 'admin-1'
  })
  assert.deepEqual(calls.createdMembers, [
    {
      id: 'id-2',
      channel_id: 'id-1',
      user_id: 'admin-1',
      role: 'owner'
    }
  ])
  assert.deepEqual(calls.updatedSettings, [
    { key: 'initialized', value: 'true' },
    { key: 'platform_name', value: 'Nebulynk' },
    { key: 'domain', value: '' },
    { key: 'default_locale', value: 'en' },
    { key: 'default_meeting_language', value: 'en' }
  ])
  assert.deepEqual(result, {
    initialized: true,
    platformName: 'Nebulynk',
    defaultLanguage: 'en',
    admin: {
      id: 'admin-1',
      email: 'admin@example.test'
    }
  })
})

test('platform domain behavior: transaction failure triggers user compensation delete', async () => {
  const { service, calls } = createDomainService({
    repositoryOverrides: {
      async transaction() {
        throw new Error('transaction failed')
      }
    }
  })

  await assert.rejects(
    service.setupPlatform({
      email: 'admin@example.test',
      password: 'strong-pass'
    }),
    GeneralError
  )

  assert.deepEqual(calls.deletedUsers, ['admin-1'])
})

test('platform domain behavior: setup persists selected default language', async () => {
  const { service, calls } = createDomainService()

  await service.setupPlatform({
    email: 'admin@example.test',
    password: 'strong-pass',
    defaultLanguage: 'de'
  })

  assert.equal(calls.usersCreate[0].preferred_locale, 'de')
  assert.deepEqual(calls.updatedSettings.slice(-2), [
    { key: 'default_locale', value: 'de' },
    { key: 'default_meeting_language', value: 'de' }
  ])
})

test('platform domain behavior: update settings patches default locale', async () => {
  const { service, calls } = createDomainService()

  await service.updateSettings({ defaultLanguage: 'de', defaultMeetingLanguage: 'fr', autoAwayMinutes: 20 })

  assert.deepEqual(calls.updatedSettings, [
    { key: 'default_locale', value: 'de' },
    { key: 'default_meeting_language', value: 'fr' },
    { key: 'auto_away_minutes', value: '20' }
  ])
})

test('platform domain behavior: update settings patches meeting video flag', async () => {
  const { service, calls } = createDomainService()

  await service.updateSettings({ meetingVideoEnabled: false })

  assert.deepEqual(calls.updatedSettings, [
    { key: 'meeting_video_enabled', value: 'false' }
  ])
})

test('platform domain behavior: update settings patches upload settings', async () => {
  const { service, calls } = createDomainService()

  await service.updateSettings({
    uploadMaxFileSizeMb: 64,
    imageUploadMaxDimensionPx: 2560,
    imageUploadQuality: 76
  })

  assert.deepEqual(calls.updatedSettings, [
    { key: 'upload_max_file_size_mb', value: '64' },
    { key: 'image_upload_max_dimension_px', value: '2560' },
    { key: 'image_upload_quality', value: '76' }
  ])
})

test('platform domain behavior: update settings patches theme settings', async () => {
  const { service, calls } = createDomainService()

  await service.updateSettings({
    themeModeDefault: 'light',
    themeDarkPrimaryColor: '#112233',
    themeDarkSecondaryColor: '#445566',
    themeDarkSuccessColor: '#118855',
    themeDarkWarningColor: '#cc9900',
    themeDarkErrorColor: '#cc3344',
    themeLightPrimaryColor: '#223344',
    themeLightSecondaryColor: '#556677',
    themeLightSuccessColor: '#229966',
    themeLightWarningColor: '#ddaa11',
    themeLightErrorColor: '#dd4455',
    themeFontFamily: 'roboto',
    themeCustomCssGlobal: ':root { --brand-test: 1; }',
    themeDarkCustomCss: 'body { color: white; }',
    themeLightCustomCss: 'body { color: black; }'
  })

  assert.deepEqual(calls.updatedSettings, [
    { key: 'theme_mode_default', value: 'light' },
    { key: 'theme_dark_primary_color', value: '#112233' },
    { key: 'theme_dark_secondary_color', value: '#445566' },
    { key: 'theme_dark_success_color', value: '#118855' },
    { key: 'theme_dark_warning_color', value: '#cc9900' },
    { key: 'theme_dark_error_color', value: '#cc3344' },
    { key: 'theme_light_primary_color', value: '#223344' },
    { key: 'theme_light_secondary_color', value: '#556677' },
    { key: 'theme_light_success_color', value: '#229966' },
    { key: 'theme_light_warning_color', value: '#ddaa11' },
    { key: 'theme_light_error_color', value: '#dd4455' },
    { key: 'theme_font_family', value: 'roboto' },
    { key: 'theme_custom_css_global', value: ':root { --brand-test: 1; }' },
    { key: 'theme_dark_custom_css', value: 'body { color: white; }' },
    { key: 'theme_light_custom_css', value: 'body { color: black; }' }
  ])
})
