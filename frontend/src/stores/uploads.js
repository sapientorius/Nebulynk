import { defineStore } from 'pinia'
import { ref } from 'vue'
import api, { getPlatformStatus } from '../lib/api.js'
import { normalizeUploadSettings } from '../lib/upload-settings.js'

export const useUploadsStore = defineStore('uploads', () => {
  const uploadSettings = ref(normalizeUploadSettings())
  const uploadSettingsLoaded = ref(false)
  let uploadSettingsPromise = null

  async function loadUploadSettings({ refresh = false } = {}) {
    if (uploadSettingsLoaded.value && !refresh) return uploadSettings.value
    if (uploadSettingsPromise && !refresh) return uploadSettingsPromise

    uploadSettingsPromise = getPlatformStatus({ refresh })
      .then((data) => {
        uploadSettings.value = normalizeUploadSettings(data || {})
        uploadSettingsLoaded.value = true
        return uploadSettings.value
      })
      .catch(() => {
        uploadSettings.value = normalizeUploadSettings()
        uploadSettingsLoaded.value = true
        return uploadSettings.value
      })
      .finally(() => {
        uploadSettingsPromise = null
      })

    return uploadSettingsPromise
  }

  async function upload(file, onProgress, options = {}) {
    const formData = new FormData()
    formData.append('file', file)
    if (options.purpose) {
      formData.append('purpose', options.purpose)
    }
    if (options.durationMs != null) {
      formData.append('duration_ms', String(options.durationMs))
    }

    const { data } = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress(event) {
        if (event.total && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      }
    })

    return data
  }

  async function transcribeVoiceDraft(file, { channelId, durationMs } = {}) {
    const formData = new FormData()
    formData.append('file', file)
    if (channelId) {
      formData.append('channel_id', channelId)
    }
    if (durationMs != null) {
      formData.append('duration_ms', String(durationMs))
    }

    const { data } = await api.post('/voice-drafts/transcribe', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    return data
  }

  return {
    uploadSettings,
    loadUploadSettings,
    upload,
    transcribeVoiceDraft
  }
})
