export async function savePreferredLocale(sessionStore, preferredLocale) {
  return sessionStore.updateProfile({
    preferred_locale: preferredLocale
  })
}

export async function saveThemePreference(sessionStore, themePreference) {
  return sessionStore.updateProfile({
    theme_preference: themePreference
  })
}

export async function saveGeneralPreferences(sessionStore, { preferredLocale, themePreference }) {
  return sessionStore.updateProfile({
    preferred_locale: preferredLocale,
    theme_preference: themePreference
  })
}

export async function toggleNotifications(notificationsStore, enabled) {
  if (enabled) {
    await notificationsStore.enableNotifications()
    return 'enabled'
  }

  await notificationsStore.disableNotifications()
  return 'disabled'
}
