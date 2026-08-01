import { describe, expect, it, vi } from 'vitest'
import { saveGeneralPreferences, savePreferredLocale, saveThemePreference, toggleNotifications } from '../../src/lib/settings-actions.js'

describe('settings action helpers', () => {
  it('saves the preferred locale via the session store', async () => {
    const updateProfile = vi.fn(() => Promise.resolve())

    await savePreferredLocale({ updateProfile }, 'de')

    expect(updateProfile).toHaveBeenCalledWith({
      preferred_locale: 'de'
    })
  })

  it('saves theme preference via the session store', async () => {
    const updateProfile = vi.fn(() => Promise.resolve())

    await saveThemePreference({ updateProfile }, 'system')

    expect(updateProfile).toHaveBeenCalledWith({
      theme_preference: 'system'
    })
  })

  it('saves general preferences in one profile patch', async () => {
    const updateProfile = vi.fn(() => Promise.resolve())

    await saveGeneralPreferences({ updateProfile }, {
      preferredLocale: 'de',
      themePreference: 'light'
    })

    expect(updateProfile).toHaveBeenCalledWith({
      preferred_locale: 'de',
      theme_preference: 'light'
    })
  })

  it('enables and disables notifications via the shared notifications store API', async () => {
    const enableNotifications = vi.fn(() => Promise.resolve())
    const disableNotifications = vi.fn(() => Promise.resolve())

    await expect(toggleNotifications({ enableNotifications, disableNotifications }, true)).resolves.toBe('enabled')
    await expect(toggleNotifications({ enableNotifications, disableNotifications }, false)).resolves.toBe('disabled')

    expect(enableNotifications).toHaveBeenCalledTimes(1)
    expect(disableNotifications).toHaveBeenCalledTimes(1)
  })
})
