const IOS_INSTALL_REGEX = /iphone|ipad|ipod/i

let deferredInstallPrompt = null
let installTrackingInitialized = false
let standaloneMediaQueryList = null
let serviceWorkerRegistrationPromise = null

const installStateListeners = new Set()

function canUseWindow() {
  return typeof window !== 'undefined'
}

function canUseNavigator() {
  return typeof navigator !== 'undefined'
}

function supportsServiceWorker() {
  return canUseNavigator() && 'serviceWorker' in navigator
}

function getStandaloneMediaQueryList() {
  if (!canUseWindow() || typeof window.matchMedia !== 'function') return null
  if (!standaloneMediaQueryList) {
    standaloneMediaQueryList = window.matchMedia('(display-mode: standalone)')
  }
  return standaloneMediaQueryList
}

function handleStandaloneChange() {
  notifyInstallStateListeners()
}

function addStandaloneChangeListener() {
  const mediaQueryList = getStandaloneMediaQueryList()
  if (!mediaQueryList) return
  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', handleStandaloneChange)
    return
  }
  if (typeof mediaQueryList.addListener === 'function') {
    mediaQueryList.addListener(handleStandaloneChange)
  }
}

function removeStandaloneChangeListener() {
  const mediaQueryList = getStandaloneMediaQueryList()
  if (!mediaQueryList) return
  if (typeof mediaQueryList.removeEventListener === 'function') {
    mediaQueryList.removeEventListener('change', handleStandaloneChange)
    return
  }
  if (typeof mediaQueryList.removeListener === 'function') {
    mediaQueryList.removeListener(handleStandaloneChange)
  }
}

function handleBeforeInstallPrompt(event) {
  event.preventDefault?.()
  deferredInstallPrompt = event
  notifyInstallStateListeners()
}

function handleAppInstalled() {
  deferredInstallPrompt = null
  notifyInstallStateListeners()
}

export function isStandaloneDisplayMode() {
  if (!canUseWindow()) return false
  if (window.navigator?.standalone === true) return true
  return Boolean(getStandaloneMediaQueryList()?.matches)
}

export function isIosInstallableDevice() {
  if (!canUseNavigator()) return false
  return IOS_INSTALL_REGEX.test(navigator.userAgent || '')
}

export function getPwaInstallState() {
  const isStandalone = isStandaloneDisplayMode()
  const hasInstallPrompt = Boolean(deferredInstallPrompt)
  const requiresManualInstall = !hasInstallPrompt && !isStandalone && isIosInstallableDevice()
  return {
    isStandalone,
    isInstalled: isStandalone,
    hasInstallPrompt,
    requiresManualInstall,
    canInstall: hasInstallPrompt || requiresManualInstall,
    isInstallSupported: canUseWindow() && (hasInstallPrompt || requiresManualInstall || Boolean(getStandaloneMediaQueryList()))
  }
}

function notifyInstallStateListeners() {
  const state = getPwaInstallState()
  for (const listener of installStateListeners) {
    listener(state)
  }
}

export function initPwaInstallTracking() {
  if (!canUseWindow() || installTrackingInitialized) return
  installTrackingInitialized = true
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleAppInstalled)
  addStandaloneChangeListener()
}

export function subscribeToPwaInstallState(listener) {
  initPwaInstallTracking()
  installStateListeners.add(listener)
  listener(getPwaInstallState())
  return () => {
    installStateListeners.delete(listener)
  }
}

export async function promptForAppInstall() {
  if (!deferredInstallPrompt) {
    return { outcome: 'unavailable' }
  }

  const promptEvent = deferredInstallPrompt
  deferredInstallPrompt = null
  notifyInstallStateListeners()

  await promptEvent.prompt?.()
  const choice = await promptEvent.userChoice?.catch?.(() => null)

  if (choice?.outcome !== 'accepted') {
    notifyInstallStateListeners()
  }

  return {
    outcome: choice?.outcome || 'dismissed'
  }
}

export async function registerAppServiceWorker() {
  if (!supportsServiceWorker()) return null
  if (serviceWorkerRegistrationPromise) return serviceWorkerRegistrationPromise

  serviceWorkerRegistrationPromise = (async () => {
    const existingRegistration = await navigator.serviceWorker.getRegistration()
    if (existingRegistration) {
      return existingRegistration
    }
    return navigator.serviceWorker.register('/sw.js')
  })().catch((error) => {
    serviceWorkerRegistrationPromise = null
    console.error('Failed to register app service worker:', error)
    return null
  })

  return serviceWorkerRegistrationPromise
}

export async function waitForAppServiceWorkerReady() {
  if (!supportsServiceWorker()) return null
  const registration = await registerAppServiceWorker()
  if (!registration) return null
  await navigator.serviceWorker.ready
  return navigator.serviceWorker.getRegistration()
}

export function initializePwaSupport() {
  initPwaInstallTracking()
  void registerAppServiceWorker()
}

export function __resetPwaStateForTests() {
  if (canUseWindow() && installTrackingInitialized) {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.removeEventListener('appinstalled', handleAppInstalled)
    removeStandaloneChangeListener()
  }
  deferredInstallPrompt = null
  installTrackingInitialized = false
  standaloneMediaQueryList = null
  serviceWorkerRegistrationPromise = null
  installStateListeners.clear()
}
