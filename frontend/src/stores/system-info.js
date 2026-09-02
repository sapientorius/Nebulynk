import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getSystemStorageUsage, refreshSystemStorageUsage } from '../lib/api.js'

export const useSystemInfoStore = defineStore('system-info', () => {
  const storageUsage = ref(null)
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref(null)
  let loadPromise = null
  let refreshPromise = null

  function reset() {
    storageUsage.value = null
    loading.value = false
    refreshing.value = false
    error.value = null
    loadPromise = null
    refreshPromise = null
  }

  async function load() {
    if (storageUsage.value) return storageUsage.value
    if (loadPromise) return loadPromise

    loading.value = true
    error.value = null
    loadPromise = getSystemStorageUsage()
      .then((data) => {
        storageUsage.value = data
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

  async function refresh() {
    if (refreshPromise) return refreshPromise

    refreshing.value = true
    error.value = null
    refreshPromise = refreshSystemStorageUsage()
      .then((data) => {
        storageUsage.value = data
        return data
      })
      .catch((requestError) => {
        error.value = requestError
        throw requestError
      })
      .finally(() => {
        refreshing.value = false
        refreshPromise = null
      })
    return refreshPromise
  }

  return {
    storageUsage,
    loading,
    refreshing,
    error,
    reset,
    load,
    refresh
  }
})
