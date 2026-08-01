import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  acknowledgePlatformUpdates,
  beginPlatformUpdateSettingsPasskeyOptions,
  checkPlatformUpdates,
  getPlatformUpdates,
  updatePlatformUpdateSettings
} from '../lib/api.js'

export const usePlatformUpdatesStore = defineStore('platform-updates', () => {
  const status = ref(null)
  const loading = ref(false)
  const checking = ref(false)
  const saving = ref(false)
  const error = ref(null)
  let loadPromise = null

  const releases = computed(() => status.value?.releases || [])
  const unacknowledgedReleases = computed(() => releases.value.filter((release) => !release.acknowledged))
  const unacknowledgedCount = computed(() => unacknowledgedReleases.value.length)
  const unacknowledgedSecurityReleases = computed(() => unacknowledgedReleases.value.filter((release) => release.security_applicable))
  const unacknowledgedSecurityCount = computed(() => unacknowledgedSecurityReleases.value.length)
  const hasUnacknowledgedSecurity = computed(() => unacknowledgedSecurityCount.value > 0)
  const unacknowledgedSecuritySeverity = computed(() => {
    const order = { low: 1, medium: 2, high: 3, critical: 4 }
    return unacknowledgedSecurityReleases.value.reduce((highest, release) => (
      !highest || order[release.highest_security_severity] > order[highest]
        ? release.highest_security_severity
        : highest
    ), null)
  })

  function reset() {
    status.value = null
    loading.value = false
    checking.value = false
    saving.value = false
    error.value = null
    loadPromise = null
  }

  async function load({ force = false } = {}) {
    if (!force && status.value) return status.value
    if (loadPromise) return loadPromise
    loading.value = true
    error.value = null
    loadPromise = getPlatformUpdates()
      .then((data) => {
        status.value = data
        return data
      })
      .catch((requestError) => {
        error.value = requestError
        throw requestError
      })
      .finally(() => {
        loading.value = false
        loadPromise = null
      })
    return loadPromise
  }

  async function checkNow() {
    checking.value = true
    error.value = null
    try {
      status.value = await checkPlatformUpdates()
      return status.value
    } catch (requestError) {
      error.value = requestError
      throw requestError
    } finally {
      checking.value = false
    }
  }

  async function acknowledge(versions) {
    status.value = await acknowledgePlatformUpdates(versions)
    return status.value
  }

  function acknowledgeAll() {
    const versions = unacknowledgedReleases.value.map((release) => release.version)
    if (versions.length === 0) return Promise.resolve(status.value)
    return acknowledge(versions)
  }

  async function setChecksEnabled(payload) {
    saving.value = true
    error.value = null
    try {
      status.value = await updatePlatformUpdateSettings(payload)
      return status.value
    } catch (requestError) {
      error.value = requestError
      throw requestError
    } finally {
      saving.value = false
    }
  }

  async function beginPasskeyOptions() {
    return beginPlatformUpdateSettingsPasskeyOptions()
  }

  return {
    status,
    loading,
    checking,
    saving,
    error,
    releases,
    unacknowledgedReleases,
    unacknowledgedCount,
    unacknowledgedSecurityCount,
    hasUnacknowledgedSecurity,
    unacknowledgedSecuritySeverity,
    reset,
    load,
    checkNow,
    acknowledge,
    acknowledgeAll,
    setChecksEnabled,
    beginPasskeyOptions
  }
})
