const STORAGE_MODULE_URL = '/share-target-storage.js'

let storagePromise = null

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function getStorageFromGlobal() {
  return globalThis.NebulynkShareTargetStorage || null
}

async function getStorage() {
  const existing = getStorageFromGlobal()
  if (existing) return existing

  if (!storagePromise) {
    storagePromise = import(/* @vite-ignore */ STORAGE_MODULE_URL)
      .then(() => {
        const storage = getStorageFromGlobal()
        if (!storage) {
          throw new Error('Share target storage failed to initialize')
        }
        return storage
      })
      .catch((error) => {
        storagePromise = null
        throw error
      })
  }

  return storagePromise
}

function appendUniquePart(parts, value) {
  const normalized = normalizeText(value)
  if (!normalized || parts.includes(normalized)) return
  parts.push(normalized)
}

export function buildSharedMessageText(payload) {
  const parts = []
  appendUniquePart(parts, payload?.title)
  appendUniquePart(parts, payload?.text)
  appendUniquePart(parts, payload?.url)
  return parts.join('\n\n')
}

export function createSharePayloadFileEntries(payload) {
  return (payload?.files || [])
    .filter((entry) => entry?.blob || entry?.uploaded_file?.id)
    .map((entry) => ({
      ...entry,
      file: entry.blob
        ? new File([entry.blob], entry.name || 'shared-image', {
          type: entry.type || entry.blob.type || '',
          lastModified: entry.last_modified || Date.now()
        })
        : null
    }))
}

export function hasCompatibleShareContent(payload) {
  return Boolean(buildSharedMessageText(payload) || (payload?.files || []).length > 0)
}

export async function purgeExpiredSharePayloads() {
  return (await getStorage()).purgeExpiredPayloads()
}

export async function claimSharePayload(id, userId) {
  return (await getStorage()).claimPayload(id, userId)
}

export async function setActiveShareTargetUser(userId) {
  return (await getStorage()).setActiveUser(userId)
}

export async function markShareFileUploaded(payloadId, fileId, uploadedFile) {
  return (await getStorage()).markFileUploaded(payloadId, fileId, uploadedFile)
}

export async function removeSharePayload(id) {
  return (await getStorage()).removePayload(id)
}

export async function removeSharePayloadsForUser(userId) {
  return (await getStorage()).removePayloadsForUser(userId)
}

export function __resetShareTargetStateForTests() {
  storagePromise = null
}
