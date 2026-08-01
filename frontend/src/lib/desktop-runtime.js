import { reactive } from 'vue'
import { createId } from '@paralleldrive/cuid2'
import { listenDesktop, loadDesktopState, saveDesktopState } from './desktop-bridge.js'
import { isDesktopRuntime, isLocalDesktopAppOrigin } from './runtime.js'
import { setActiveApiClientContext } from './api.js'
import { setActiveSocketClientContext } from './socket.js'
import { resolveDesktopApiBaseUrl } from './desktop-server-url.js'

function normalizeProfileRoute(route) {
  if (typeof route !== 'string') return '/channels'
  const trimmed = route.trim()
  if (!trimmed) return '/channels'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function normalizeBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string') return ''
  return baseUrl.trim().replace(/\/+$/, '')
}

function normalizeUserSummary(userSummary) {
  if (!userSummary || typeof userSummary !== 'object') return null
  return {
    id: userSummary.id || null,
    email: userSummary.email || null,
    display_name: userSummary.display_name || null,
    avatar_url: userSummary.avatar_url || null,
    account_type: userSummary.account_type || null,
    preferred_locale: userSummary.preferred_locale || null
  }
}

function normalizeSessionTransport(value) {
  return value === 'body' ? 'body' : 'cookie'
}

function normalizeAuthState(authState) {
  if (!authState || typeof authState !== 'object') {
    return {
      accessToken: null,
      csrfToken: null,
      refreshToken: null,
      sessionTransport: 'body',
      user: null
    }
  }

  return {
    accessToken: typeof authState.accessToken === 'string' ? authState.accessToken : null,
    csrfToken: typeof authState.csrfToken === 'string' ? authState.csrfToken : null,
    refreshToken: typeof authState.refreshToken === 'string' ? authState.refreshToken : null,
    sessionTransport: normalizeSessionTransport(authState.sessionTransport || 'body'),
    user: authState.user || null
  }
}

function normalizeNotificationState(notificationState) {
  if (!notificationState || typeof notificationState !== 'object') {
    return {
      unreadCount: 0,
      lastNotificationId: null
    }
  }

  return {
    unreadCount: Number.isFinite(Number(notificationState.unreadCount))
      ? Math.max(0, Math.trunc(Number(notificationState.unreadCount)))
      : 0,
    lastNotificationId: typeof notificationState.lastNotificationId === 'string'
      ? notificationState.lastNotificationId
      : null
  }
}

function normalizeNotificationPreferences(notificationPreferences) {
  if (!notificationPreferences || typeof notificationPreferences !== 'object') {
    return {
      enabled: true,
      permission: 'default'
    }
  }

  const permission = typeof notificationPreferences.permission === 'string'
    ? notificationPreferences.permission.trim()
    : 'default'

  return {
    enabled: notificationPreferences.enabled !== false,
    permission: permission || 'default'
  }
}

function normalizePttMode(value) {
  return value === 'ptt' || value === 'vad' ? value : 'live'
}

function normalizePttKey(value) {
  if (typeof value !== 'string') return 'Space'
  const trimmed = value.trim()
  return trimmed || 'Space'
}

function normalizePttConfig(pttConfig) {
  if (!pttConfig || typeof pttConfig !== 'object') {
    return {
      mode: 'live',
      pttKey: 'Space'
    }
  }

  return {
    mode: normalizePttMode(pttConfig.mode),
    pttKey: normalizePttKey(pttConfig.pttKey)
  }
}

function normalizeProfile(profile = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(profile.baseUrl)
  return {
    id: typeof profile.id === 'string' && profile.id.trim() ? profile.id.trim() : createId(),
    label: typeof profile.label === 'string' && profile.label.trim()
      ? profile.label.trim()
      : normalizedBaseUrl || 'Nebulynk',
    baseUrl: normalizedBaseUrl,
    userSummary: normalizeUserSummary(profile.userSummary || profile.authState?.user || null),
    lastRoute: normalizeProfileRoute(profile.lastRoute),
    authState: normalizeAuthState(profile.authState),
    notificationState: normalizeNotificationState(profile.notificationState),
    notificationPreferences: normalizeNotificationPreferences(profile.notificationPreferences),
    pttConfig: normalizePttConfig(profile.pttConfig)
  }
}

function canAccessLocalDesktopState() {
  return desktopState.isDesktop && isLocalDesktopAppOrigin()
}

function serializeState() {
  return {
    activeProfileId: desktopState.activeProfileId,
    profiles: desktopState.profiles.map((profile) => ({
      id: profile.id,
      label: profile.label,
      baseUrl: profile.baseUrl,
      userSummary: profile.userSummary,
      lastRoute: profile.lastRoute,
      authState: profile.authState,
      notificationState: profile.notificationState,
      notificationPreferences: profile.notificationPreferences,
      pttConfig: profile.pttConfig
    }))
  }
}

function findProfileIndex(profileId) {
  return desktopState.profiles.findIndex((profile) => profile.id === profileId)
}

function upsertProfile(profile) {
  const normalized = normalizeProfile(profile)
  const index = findProfileIndex(normalized.id)
  if (index === -1) {
    desktopState.profiles.push(normalized)
    return normalized
  }

  desktopState.profiles.splice(index, 1, {
    ...desktopState.profiles[index],
    ...normalized
  })
  return desktopState.profiles[index]
}

function applyActiveProfileContext() {
  if (!desktopState.isDesktop) {
    setActiveApiClientContext({
      persistCsrfToStorage: true
    })
    setActiveSocketClientContext({})
    return null
  }

  const profile = getActiveDesktopProfile()
  if (!profile) {
    setActiveApiClientContext({
      persistCsrfToStorage: false
    })
    setActiveSocketClientContext({})
    return null
  }

  const apiClient = setActiveApiClientContext({
    baseUrl: resolveDesktopApiBaseUrl(profile.baseUrl),
    defaultSessionTransport: 'body',
    initialAuthState: profile.authState,
    persistCsrfToStorage: false,
    onPersistAuthState: async (authState) => {
      await updateDesktopProfileSession(profile.id, authState)
    }
  })

  setActiveSocketClientContext({
    apiClient
  })

  return profile
}

async function persistDesktopRuntimeState() {
  if (!canAccessLocalDesktopState()) return
  await saveDesktopState(serializeState())
}

function applyLoadedDesktopState(storedState = {}) {
  desktopState.profiles = (storedState.profiles || [])
    .map((profile) => normalizeProfile(profile))
    .filter((profile) => !!profile.baseUrl)
  desktopState.activeProfileId = typeof storedState.activeProfileId === 'string'
    ? storedState.activeProfileId
    : desktopState.profiles[0]?.id || null

  if (!getActiveDesktopProfile() && desktopState.profiles.length > 0) {
    desktopState.activeProfileId = desktopState.profiles[0].id
  }

  applyActiveProfileContext()
}

let desktopStateListenerPromise = null

async function ensureDesktopStateListener() {
  if (!canAccessLocalDesktopState() || desktopStateListenerPromise) {
    return desktopStateListenerPromise
  }
  desktopStateListenerPromise = listenDesktop('desktop:state-changed', async () => {
    await refreshDesktopRuntimeState().catch(() => {})
  })
  return desktopStateListenerPromise
}

export const desktopState = reactive({
  isDesktop: isDesktopRuntime(),
  ready: false,
  profiles: [],
  activeProfileId: null,
  relayStarted: false
})

export function getDesktopProfiles() {
  return desktopState.profiles
}

export function getDesktopProfileById(profileId) {
  if (!profileId) return null
  return desktopState.profiles.find((profile) => profile.id === profileId) || null
}

export function getActiveDesktopProfile() {
  return getDesktopProfileById(desktopState.activeProfileId)
}

export function getActiveDesktopProfileRoute() {
  return getActiveDesktopProfile()?.lastRoute || '/channels'
}

export function hasAnyDesktopProfiles() {
  return desktopState.profiles.length > 0
}

export async function refreshDesktopRuntimeState() {
  if (!canAccessLocalDesktopState()) return
  const storedState = await loadDesktopState()
  applyLoadedDesktopState(storedState)
}

export async function initializeDesktopRuntime() {
  if (!desktopState.isDesktop) {
    desktopState.ready = true
    return
  }

  if (!canAccessLocalDesktopState()) {
    desktopState.ready = true
    return
  }

  await refreshDesktopRuntimeState()
  await ensureDesktopStateListener()
  desktopState.ready = true
}

export async function addDesktopProfile({ label, baseUrl }) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) {
    throw new Error('Server URL is required')
  }

  const existing = desktopState.profiles.find((profile) => profile.baseUrl === normalizedBaseUrl)
  const nextProfile = upsertProfile({
    id: existing?.id,
    label: label || existing?.label || normalizedBaseUrl,
    baseUrl: normalizedBaseUrl,
    userSummary: existing?.userSummary || null,
    lastRoute: existing?.lastRoute || '/channels',
    authState: existing?.authState || null,
    notificationState: existing?.notificationState || null,
    notificationPreferences: existing?.notificationPreferences || null,
    pttConfig: existing?.pttConfig || null
  })

  if (!desktopState.activeProfileId) {
    desktopState.activeProfileId = nextProfile.id
    applyActiveProfileContext()
  }

  await persistDesktopRuntimeState()
  return nextProfile
}

export async function updateDesktopProfile(profileId, updates = {}) {
  const existing = getDesktopProfileById(profileId)
  if (!existing) return null

  const nextProfile = upsertProfile({
    ...existing,
    ...updates,
    id: existing.id,
    baseUrl: updates.baseUrl !== undefined ? updates.baseUrl : existing.baseUrl,
    lastRoute: updates.lastRoute !== undefined ? updates.lastRoute : existing.lastRoute
  })

  if (desktopState.activeProfileId === nextProfile.id) {
    applyActiveProfileContext()
  }

  await persistDesktopRuntimeState()
  return nextProfile
}

export async function removeDesktopProfile(profileId) {
  const index = findProfileIndex(profileId)
  if (index === -1) return

  desktopState.profiles.splice(index, 1)
  if (desktopState.activeProfileId === profileId) {
    desktopState.activeProfileId = desktopState.profiles[0]?.id || null
    applyActiveProfileContext()
  }

  await persistDesktopRuntimeState()
}

export async function setActiveDesktopProfile(profileId) {
  if (!profileId || desktopState.activeProfileId === profileId) {
    return getActiveDesktopProfile()
  }

  const nextProfile = getDesktopProfileById(profileId)
  if (!nextProfile) return null

  desktopState.activeProfileId = nextProfile.id
  applyActiveProfileContext()
  await persistDesktopRuntimeState()
  return nextProfile
}

export async function setDesktopProfileLastRoute(profileId, route) {
  const profile = getDesktopProfileById(profileId)
  if (!profile) return

  profile.lastRoute = normalizeProfileRoute(route)
  await persistDesktopRuntimeState()
}

export async function updateDesktopProfileSession(profileId, authState = {}) {
  const profile = getDesktopProfileById(profileId)
  if (!profile) return

  profile.authState = normalizeAuthState(authState)
  profile.userSummary = normalizeUserSummary(authState.user || profile.userSummary)
  await persistDesktopRuntimeState()
}

export async function clearDesktopProfileSession(profileId) {
  const profile = getDesktopProfileById(profileId)
  if (!profile) return

  profile.authState = normalizeAuthState(null)
  profile.userSummary = normalizeUserSummary(null)
  profile.notificationState = normalizeNotificationState(null)
  await persistDesktopRuntimeState()
}

export async function updateDesktopProfileNotificationPreferences(profileId, patch = {}) {
  const profile = getDesktopProfileById(profileId)
  if (!profile) return

  profile.notificationPreferences = normalizeNotificationPreferences({
    ...profile.notificationPreferences,
    ...patch
  })
  await persistDesktopRuntimeState()
}

export async function updateDesktopProfileNotificationState(profileId, patch = {}) {
  const profile = getDesktopProfileById(profileId)
  if (!profile) return

  profile.notificationState = normalizeNotificationState({
    ...profile.notificationState,
    ...patch
  })
  await persistDesktopRuntimeState()
}

export async function updateDesktopProfilePttConfig(profileId, patch = {}) {
  const profile = getDesktopProfileById(profileId)
  if (!profile) return

  profile.pttConfig = normalizePttConfig({
    ...profile.pttConfig,
    ...patch
  })
  await persistDesktopRuntimeState()
}

export function buildDesktopProfileClientContext(profileId) {
  const profile = getDesktopProfileById(profileId)
  if (!profile) return null
  return {
    profileId: profile.id,
    baseUrl: profile.baseUrl,
    authState: profile.authState,
    userSummary: profile.userSummary
  }
}
