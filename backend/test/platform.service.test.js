import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { BadRequest, GeneralError } from '@feathersjs/errors'
import { platform } from '../src/services/platform/platform.js'

function createDbStub({
  initialized = 'false',
  failTransaction = false,
  initialSettings = {},
  initialSecrets = {}
} = {}) {
  const calls = {
    deletedUserIds: [],
    createdUsers: [],
    insertedChannels: [],
    insertedMembers: []
  }

  const settingsMap = new Map(Object.entries({
    initialized,
    platform_name: 'Nebulynk',
    domain: '',
    default_locale: 'en',
    default_meeting_language: 'en',
    default_meeting_history_access: 'all_channel_members',
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
    ...initialSettings
  }))
  const secretsMap = new Map(Object.entries(initialSecrets))

  function buildQuery(table, whereClauses, { inTransaction = false } = {}) {
    return {
      where(column, value) {
        whereClauses.push({ column, value })
        return this
      },
      async first() {
        const keyFilter = whereClauses.find((entry) => entry.column === 'key')
        if (!keyFilter) return null
        if (table === 'platform_secrets') {
          const encryptedValue = secretsMap.get(keyFilter.value)
          return encryptedValue
            ? { key: keyFilter.value, encrypted_value: encryptedValue }
            : null
        }
        if (table !== 'platform_settings') return null
        return {
          key: keyFilter.value,
          value: settingsMap.get(keyFilter.value)
        }
      },
      async select() {
        if (table === 'platform_secrets') {
          return [...secretsMap.entries()].map(([key, encrypted_value]) => ({ key, encrypted_value }))
        }
        if (table !== 'platform_settings') return []
        return [...settingsMap.entries()].map(([key, value]) => ({ key, value }))
      },
      async delete() {
        if (table === 'users') {
          const idFilter = whereClauses.find((entry) => entry.column === 'id')
          if (idFilter?.value) {
            calls.deletedUserIds.push(idFilter.value)
          }
        }
        if (table === 'platform_secrets') {
          const keyFilter = whereClauses.find((entry) => entry.column === 'key')
          if (keyFilter?.value) {
            secretsMap.delete(keyFilter.value)
          }
        }
        return 1
      },
      async insert(payload) {
        if (inTransaction && table === 'channels') {
          calls.insertedChannels.push(payload)
        }
        if (inTransaction && table === 'channel_members') {
          calls.insertedMembers.push(payload)
        }
        if (table === 'platform_settings') {
          settingsMap.set(payload.key, payload.value)
        }
        if (table === 'platform_secrets') {
          secretsMap.set(payload.key, payload.encrypted_value)
        }
        return 1
      },
      async update(patchData) {
        if (table === 'platform_secrets') {
          const keyFilter = whereClauses.find((entry) => entry.column === 'key')
          if (keyFilter?.value && typeof patchData?.encrypted_value === 'string') {
            secretsMap.set(keyFilter.value, patchData.encrypted_value)
          }
          return 1
        }
        if (table === 'platform_settings') {
          const keyFilter = whereClauses.find((entry) => entry.column === 'key')
          if (keyFilter?.value && typeof patchData?.value === 'string') {
            settingsMap.set(keyFilter.value, patchData.value)
          }
        }
        return 1
      }
    }
  }

  const db = (table) => buildQuery(table, [])

  db.transaction = async (runInTransaction) => {
    if (failTransaction) {
      throw new Error('transaction failed')
    }

    const trx = (table) => buildQuery(table, [], { inTransaction: true })
    await runInTransaction(trx)
  }

  return { db, calls, settingsMap, secretsMap }
}

function createHarness(dbOptions = {}) {
  const { db, calls, settingsMap, secretsMap } = createDbStub(dbOptions)
  const app = feathers()
  app.defaultAuthentication = () => ({
    async authenticate() {
      return {}
    }
  })
  app.set('postgresqlClient', db)
  app.set('authentication', { secret: 'test-auth-secret' })
  app.set('env', dbOptions.env || { KLIPY_API_KEY: '' })
  app.use('users', {
    async create(data) {
      calls.createdUsers.push(data)
      return { id: 'admin-1', email: data.email }
    }
  })
  platform(app)
  return { app, calls, settingsMap, secretsMap }
}

test('platform.find hook-chain: returns current platform settings map', async () => {
  const { app } = createHarness({
    initialSettings: {
      platform_name: 'Acme Chat',
      domain: 'chat.example.test'
    }
  })

  const result = await app.service('platform').find({ provider: 'rest' })

  assert.deepEqual(result, {
    initialized: 'false',
    platform_name: 'Acme Chat',
    domain: 'chat.example.test',
    default_locale: 'en',
    default_meeting_language: 'en',
    default_meeting_history_access: 'all_channel_members',
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
    theme_light_custom_css: '',
    klipy_configured: false
  })
})

test('platform.create hook-chain: external validation rejects invalid payload', async () => {
  const { app, calls } = createHarness()

  await assert.rejects(
    app.service('platform').create(
      { email: 'not-an-email' },
      { provider: 'rest' }
    ),
    BadRequest
  )

  assert.equal(calls.createdUsers.length, 0)
})

test('platform.create hook-chain: setup is blocked when already initialized', async () => {
  const { app, calls } = createHarness({ initialized: 'true' })

  await assert.rejects(
    app.service('platform').create({
      platformName: 'Nebulynk',
      domain: 'example.test',
      email: 'admin@example.test',
      password: 'strong-pass',
      displayName: 'Admin',
      defaultLanguage: 'de'
    }),
    BadRequest
  )

  assert.equal(calls.createdUsers.length, 0)
})

test('platform.create hook-chain: transaction failure triggers compensation delete', async () => {
  const { app, calls } = createHarness({ failTransaction: true })

  await assert.rejects(
    app.service('platform').create({
      platformName: 'Nebulynk',
      domain: 'example.test',
      email: 'admin@example.test',
      password: 'strong-pass',
      displayName: 'Admin',
      defaultLanguage: 'de'
    }),
    GeneralError
  )

  assert.equal(calls.createdUsers.length, 1)
  assert.deepEqual(calls.deletedUserIds, ['admin-1'])
})

test('platform.create hook-chain: successful setup updates baseline settings', async () => {
  const { app, calls, settingsMap } = createHarness()

  const result = await app.service('platform').create({
    platformName: 'Acme Chat',
    domain: 'chat.example.test',
    email: 'admin@example.test',
    password: 'strong-pass',
    displayName: 'Owner',
    defaultLanguage: 'de'
  })

  assert.equal(result.initialized, true)
  assert.equal(result.platformName, 'Acme Chat')
  assert.equal(result.defaultLanguage, 'de')
  assert.deepEqual(result.admin, { id: 'admin-1', email: 'admin@example.test' })
  assert.equal(calls.createdUsers[0].preferred_locale, 'de')
  assert.equal(calls.createdUsers[0].is_primary_admin, true)
  assert.equal(calls.insertedChannels.length, 1)
  assert.equal(calls.insertedMembers.length, 1)
  assert.equal(settingsMap.get('initialized'), 'true')
  assert.equal(settingsMap.get('platform_name'), 'Acme Chat')
  assert.equal(settingsMap.get('domain'), 'chat.example.test')
  assert.equal(settingsMap.get('default_locale'), 'de')
  assert.equal(settingsMap.get('default_meeting_language'), 'de')
  assert.equal(settingsMap.get('default_meeting_history_access'), 'all_channel_members')
})

test('platform.patch hook-chain: rejects invalid language payload', async () => {
  const { app } = createHarness()

  await assert.rejects(
    app.service('platform').patch(
      null,
      { defaultLanguage: 'fr' },
      {
        provider: 'rest',
        authenticated: true,
        user: { id: 'admin-1', is_admin: true },
        resolvedPermissions: new Set(['*'])
      }
    ),
    BadRequest
  )
})

test('platform.patch hook-chain: rejects invalid auto-away payload', async () => {
  const { app } = createHarness()

  await assert.rejects(
    app.service('platform').patch(
      null,
      { autoAwayMinutes: 0 },
      {
        provider: 'rest',
        authenticated: true,
        user: { id: 'admin-1', is_admin: true },
        resolvedPermissions: new Set(['*'])
      }
    ),
    BadRequest
  )
})

test('platform.patch hook-chain: rejects invalid upload setting payload', async () => {
  const { app } = createHarness()

  await assert.rejects(
    app.service('platform').patch(
      null,
      { uploadMaxFileSizeMb: 0 },
      {
        provider: 'rest',
        authenticated: true,
        user: { id: 'admin-1', is_admin: true },
        resolvedPermissions: new Set(['*'])
      }
    ),
    BadRequest
  )
})

test('platform.patch hook-chain: rejects invalid theme payload', async () => {
  const { app } = createHarness()

  await assert.rejects(
    app.service('platform').patch(
      null,
      { themeModeDefault: 'sepia' },
      {
        provider: 'rest',
        authenticated: true,
        user: { id: 'admin-1', is_admin: true },
        resolvedPermissions: new Set(['*'])
      }
    ),
    BadRequest
  )

  await assert.rejects(
    app.service('platform').patch(
      null,
      { themeDarkPrimaryColor: '63e2b7' },
      {
        provider: 'rest',
        authenticated: true,
        user: { id: 'admin-1', is_admin: true },
        resolvedPermissions: new Set(['*'])
      }
    ),
    BadRequest
  )

  await assert.rejects(
    app.service('platform').patch(
      null,
      { themeFontFamily: 'comic-sans' },
      {
        provider: 'rest',
        authenticated: true,
        user: { id: 'admin-1', is_admin: true },
        resolvedPermissions: new Set(['*'])
      }
    ),
    BadRequest
  )

  await assert.rejects(
    app.service('platform').patch(
      null,
      { themeCustomCssGlobal: 'x'.repeat(20001) },
      {
        provider: 'rest',
        authenticated: true,
        user: { id: 'admin-1', is_admin: true },
        resolvedPermissions: new Set(['*'])
      }
    ),
    BadRequest
  )
})

test('platform.patch hook-chain: updates default locale and auto-away timeout for authorized user', async () => {
  const { app, settingsMap } = createHarness()

  const result = await app.service('platform').patch(
    null,
    {
      defaultLanguage: 'de',
      defaultMeetingLanguage: 'fr',
      defaultMeetingHistoryAccess: 'active_participants',
      autoAwayMinutes: 25,
      meetingVideoEnabled: false,
      uploadMaxFileSizeMb: 64,
      imageUploadMaxDimensionPx: 2560,
      imageUploadQuality: 76,
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
    },
    {
      provider: 'rest',
      authenticated: true,
      user: { id: 'admin-1', is_admin: true },
      resolvedPermissions: new Set(['*'])
    }
  )

  assert.equal(settingsMap.get('default_locale'), 'de')
  assert.equal(settingsMap.get('default_meeting_language'), 'fr')
  assert.equal(settingsMap.get('default_meeting_history_access'), 'active_participants')
  assert.equal(settingsMap.get('auto_away_minutes'), '25')
  assert.equal(settingsMap.get('meeting_video_enabled'), 'false')
  assert.equal(settingsMap.get('upload_max_file_size_mb'), '64')
  assert.equal(settingsMap.get('image_upload_max_dimension_px'), '2560')
  assert.equal(settingsMap.get('image_upload_quality'), '76')
  assert.equal(settingsMap.get('theme_mode_default'), 'light')
  assert.equal(settingsMap.get('theme_dark_primary_color'), '#112233')
  assert.equal(settingsMap.get('theme_dark_secondary_color'), '#445566')
  assert.equal(settingsMap.get('theme_dark_success_color'), '#118855')
  assert.equal(settingsMap.get('theme_dark_warning_color'), '#cc9900')
  assert.equal(settingsMap.get('theme_dark_error_color'), '#cc3344')
  assert.equal(settingsMap.get('theme_light_primary_color'), '#223344')
  assert.equal(settingsMap.get('theme_light_secondary_color'), '#556677')
  assert.equal(settingsMap.get('theme_light_success_color'), '#229966')
  assert.equal(settingsMap.get('theme_light_warning_color'), '#ddaa11')
  assert.equal(settingsMap.get('theme_light_error_color'), '#dd4455')
  assert.equal(settingsMap.get('theme_font_family'), 'roboto')
  assert.equal(settingsMap.get('theme_custom_css_global'), ':root { --brand-test: 1; }')
  assert.equal(settingsMap.get('theme_dark_custom_css'), 'body { color: white; }')
  assert.equal(settingsMap.get('theme_light_custom_css'), 'body { color: black; }')
  assert.equal(result.default_locale, 'de')
  assert.equal(result.default_meeting_language, 'fr')
  assert.equal(result.default_meeting_history_access, 'active_participants')
  assert.equal(result.auto_away_minutes, '25')
  assert.equal(result.meeting_video_enabled, 'false')
  assert.equal(result.upload_max_file_size_mb, '64')
  assert.equal(result.image_upload_max_dimension_px, '2560')
  assert.equal(result.image_upload_quality, '76')
  assert.equal(result.theme_mode_default, 'light')
  assert.equal(result.theme_primary_color, '#112233')
  assert.equal(result.theme_dark_primary_color, '#112233')
  assert.equal(result.theme_dark_secondary_color, '#445566')
  assert.equal(result.theme_dark_success_color, '#118855')
  assert.equal(result.theme_dark_warning_color, '#cc9900')
  assert.equal(result.theme_dark_error_color, '#cc3344')
  assert.equal(result.theme_light_primary_color, '#223344')
  assert.equal(result.theme_light_secondary_color, '#556677')
  assert.equal(result.theme_light_success_color, '#229966')
  assert.equal(result.theme_light_warning_color, '#ddaa11')
  assert.equal(result.theme_light_error_color, '#dd4455')
  assert.equal(result.theme_font_family, 'roboto')
  assert.equal(result.theme_custom_css_global, ':root { --brand-test: 1; }')
  assert.equal(result.theme_dark_custom_css, 'body { color: white; }')
  assert.equal(result.theme_light_custom_css, 'body { color: black; }')
})

test('platform.patch hook-chain: stores Klipy key encrypted and returns only status', async () => {
  const { app, secretsMap } = createHarness({
    env: { KLIPY_API_KEY: 'env-key' }
  })

  const result = await app.service('platform').patch(
    null,
    { klipyApiKey: 'platform-key' },
    {
      provider: 'rest',
      authenticated: true,
      user: { id: 'admin-1', is_admin: true },
      resolvedPermissions: new Set(['*'])
    }
  )

  assert.equal(result.klipy_configured, true)
  assert.equal(result.klipyApiKey, undefined)
  assert.equal(result.klipy_api_key, undefined)
  assert.notEqual(secretsMap.get('klipy_api_key'), 'platform-key')
})

test('platform.patch hook-chain: clears the stored Klipy key', async () => {
  const { app, secretsMap } = createHarness()

  await app.service('platform').patch(
    null,
    { klipyApiKey: 'platform-key' },
    {
      provider: 'rest',
      authenticated: true,
      user: { id: 'admin-1', is_admin: true },
      resolvedPermissions: new Set(['*'])
    }
  )

  const result = await app.service('platform').patch(
    null,
    { clearKlipyApiKey: true },
    {
      provider: 'rest',
      authenticated: true,
      user: { id: 'admin-1', is_admin: true },
      resolvedPermissions: new Set(['*'])
    }
  )

  assert.equal(secretsMap.has('klipy_api_key'), false)
  assert.equal(result.klipy_configured, false)
  assert.equal(result.klipyApiKey, undefined)
  assert.equal(result.klipy_api_key, undefined)
})
