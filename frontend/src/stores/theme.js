import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getPlatformStatus } from '../lib/api.js'
import {
  DEFAULT_THEME_SETTINGS,
  buildNaiveThemeOverrides,
  buildThemeCssVariables,
  getThemeFontFaceCss,
  getThemeCustomCss,
  normalizePlatformThemeSettings,
  resolveEffectiveThemeMode
} from '../lib/theme-settings.js'
import { useSessionStore } from './session.js'

function readSystemThemeMode() {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark'
}

function applyCssVariables(variables = {}) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const [key, value] of Object.entries(variables)) {
    root.style.setProperty(key, value)
  }
}

function applyManagedStyleElement(id, cssText = '') {
  if (typeof document === 'undefined') return
  let styleElement = document.getElementById(id)
  if (!cssText) {
    styleElement?.remove()
    return
  }
  if (!styleElement) {
    styleElement = document.createElement('style')
    styleElement.id = id
    styleElement.dataset.nebulynkManaged = 'theme-custom-css'
    document.head.appendChild(styleElement)
  }
  styleElement.textContent = cssText
}

export const useThemeStore = defineStore('theme', () => {
  const platformThemeSettings = ref(normalizePlatformThemeSettings(DEFAULT_THEME_SETTINGS))
  const systemMode = ref(readSystemThemeMode())
  const loading = ref(false)

  const effectiveMode = computed(() => {
    const sessionStore = useSessionStore()
    return resolveEffectiveThemeMode({
      platformMode: platformThemeSettings.value.theme_mode_default,
      userPreference: sessionStore.user?.theme_preference || 'platform',
      systemMode: systemMode.value
    })
  })

  const naiveThemeOverrides = computed(() => buildNaiveThemeOverrides(platformThemeSettings.value, effectiveMode.value))
  const cssVariables = computed(() => buildThemeCssVariables(platformThemeSettings.value, effectiveMode.value))
  const customCss = computed(() => getThemeCustomCss(platformThemeSettings.value, effectiveMode.value))
  const fontFaceCss = computed(() => getThemeFontFaceCss(platformThemeSettings.value))

  function setSystemMode(mode) {
    systemMode.value = mode === 'light' ? 'light' : 'dark'
    applyCurrentTheme()
  }

  function setPlatformThemeSettings(settings = {}) {
    platformThemeSettings.value = normalizePlatformThemeSettings({
      ...platformThemeSettings.value,
      ...settings
    })
    applyCurrentTheme()
  }

  function applyCurrentTheme() {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.theme = effectiveMode.value
    applyCssVariables(cssVariables.value)
    applyManagedStyleElement('nebulynk-font-face-css', fontFaceCss.value)
    applyManagedStyleElement('nebulynk-custom-css-global', customCss.value.globalCss)
    applyManagedStyleElement('nebulynk-custom-css-theme', customCss.value.themeCss)
  }

  function watchSystemTheme() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return () => {}
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setSystemMode(mediaQuery.matches ? 'light' : 'dark')
    mediaQuery.addEventListener?.('change', onChange)
    mediaQuery.addListener?.(onChange)
    setSystemMode(mediaQuery.matches ? 'light' : 'dark')
    return () => {
      mediaQuery.removeEventListener?.('change', onChange)
      mediaQuery.removeListener?.(onChange)
    }
  }

  async function loadPlatformThemeSettings({ refresh = false } = {}) {
    loading.value = true
    try {
      const settings = await getPlatformStatus({ refresh })
      setPlatformThemeSettings(settings)
      return platformThemeSettings.value
    } finally {
      loading.value = false
    }
  }

  return {
    platformThemeSettings,
    systemMode,
    loading,
    effectiveMode,
    naiveThemeOverrides,
    cssVariables,
    customCss,
    fontFaceCss,
    setSystemMode,
    setPlatformThemeSettings,
    applyCurrentTheme,
    watchSystemTheme,
    loadPlatformThemeSettings
  }
})
