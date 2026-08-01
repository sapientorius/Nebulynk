import { ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../lib/api.js'

function artifactKey(fileId) {
  return String(fileId || '')
}

export const useVoiceMessageArtifactsStore = defineStore('voiceMessageArtifacts', () => {
  const artifactsByFileId = ref({})
  const loadingByFileId = ref({})

  function ingestArtifact(artifact) {
    if (!artifact?.file_id) return
    artifactsByFileId.value = {
      ...artifactsByFileId.value,
      [artifactKey(artifact.file_id)]: artifact
    }
  }

  function ingestMessage(message) {
    for (const file of message?.files || []) {
      if (file?.voice_artifact) {
        ingestArtifact(file.voice_artifact)
      }
    }
  }

  function ingestMessages(messages = []) {
    for (const message of messages || []) {
      ingestMessage(message)
    }
  }

  function getArtifact(fileId) {
    return artifactsByFileId.value[artifactKey(fileId)] || null
  }

  function isLoading(fileId) {
    return Boolean(loadingByFileId.value[artifactKey(fileId)])
  }

  async function requestArtifact({ messageId, fileId, retry = false }) {
    if (!messageId || !fileId) return null
    const key = artifactKey(fileId)
    loadingByFileId.value = {
      ...loadingByFileId.value,
      [key]: true
    }

    try {
      const { data } = await api.post('/voice-message-artifacts', {
        message_id: messageId,
        file_id: fileId,
        retry
      })
      ingestArtifact(data)
      return data
    } finally {
      const next = { ...loadingByFileId.value }
      delete next[key]
      loadingByFileId.value = next
    }
  }

  function applyRealtimeArtifact(artifact) {
    ingestArtifact(artifact)
  }

  function reset() {
    artifactsByFileId.value = {}
    loadingByFileId.value = {}
  }

  return {
    artifactsByFileId,
    loadingByFileId,
    ingestArtifact,
    ingestMessage,
    ingestMessages,
    getArtifact,
    isLoading,
    requestArtifact,
    applyRealtimeArtifact,
    reset
  }
})
