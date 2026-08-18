;(function initializeShareTargetStorage(scope) {
  const DB_NAME = 'nebulynk-share-targets'
  const DB_VERSION = 2
  const STORE_NAME = 'payloads'
  const METADATA_STORE_NAME = 'metadata'
  const ACTIVE_USER_KEY = 'active_user'
  const PAYLOAD_TTL_MS = 24 * 60 * 60 * 1000

  function createOpaqueId() {
    if (typeof scope.crypto?.randomUUID === 'function') {
      return scope.crypto.randomUUID()
    }

    const bytes = new Uint8Array(16)
    if (typeof scope.crypto?.getRandomValues === 'function') {
      scope.crypto.getRandomValues(bytes)
      return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!scope.indexedDB) {
        reject(new Error('IndexedDB is unavailable'))
        return
      }

      const request = scope.indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('expires_at', 'expires_at', { unique: false })
          store.createIndex('owner_user_id', 'owner_user_id', { unique: false })
        }
        if (!database.objectStoreNames.contains(METADATA_STORE_NAME)) {
          database.createObjectStore(METADATA_STORE_NAME, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('Could not open share storage'))
    })
  }

  function withObjectStore(storeName, mode, run) {
    return openDatabase().then((database) => new Promise((resolve, reject) => {
      let result
      let settled = false
      let transaction

      try {
        transaction = database.transaction(storeName, mode)
      } catch (error) {
        database.close()
        reject(error)
        return
      }

      const finish = (value) => {
        result = value
      }

      transaction.oncomplete = () => {
        database.close()
        if (!settled) {
          settled = true
          resolve(result)
        }
      }
      transaction.onerror = () => {
        database.close()
        if (!settled) {
          settled = true
          reject(transaction.error || new Error('Share storage transaction failed'))
        }
      }
      transaction.onabort = () => {
        database.close()
        if (!settled) {
          settled = true
          reject(transaction.error || new Error('Share storage transaction was aborted'))
        }
      }

      try {
        run(transaction.objectStore(storeName), finish)
      } catch (error) {
        try {
          transaction.abort()
        } catch {
          // The transaction may have already completed.
        }
        if (!settled) {
          settled = true
          database.close()
          reject(error)
        }
      }
    }))
  }

  function withStore(mode, run) {
    return withObjectStore(STORE_NAME, mode, run)
  }

  function withMetadataStore(mode, run) {
    return withObjectStore(METADATA_STORE_NAME, mode, run)
  }

  function isExpired(record, now = Date.now()) {
    return !record || !Number.isFinite(Number(record.expires_at)) || Number(record.expires_at) <= now
  }

  function normalizeText(value) {
    return typeof value === 'string' ? value : ''
  }

  function isFileLike(value) {
    return value
      && typeof value === 'object'
      && Number.isFinite(Number(value.size))
      && typeof value.arrayBuffer === 'function'
  }

  function isImageFile(value) {
    return isFileLike(value) && typeof value.type === 'string' && value.type.toLowerCase().startsWith('image/')
  }

  function toStoredFile(value) {
    if (!isImageFile(value)) return null
    return {
      id: createOpaqueId(),
      name: typeof value.name === 'string' && value.name.trim() ? value.name : 'shared-image',
      type: typeof value.type === 'string' ? value.type : '',
      size: Number(value.size) || 0,
      last_modified: Number.isFinite(Number(value.lastModified)) ? Number(value.lastModified) : null,
      blob: value,
      uploaded_file: null
    }
  }

  async function purgeExpiredPayloads() {
    const now = Date.now()
    return withStore('readwrite', (store, finish) => {
      let removed = 0
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          finish(removed)
          return
        }
        if (isExpired(cursor.value, now)) {
          cursor.delete()
          removed++
        }
        cursor.continue()
      }
    })
  }

  async function storeFormData(formData) {
    const now = Date.now()
    const ownerUserId = await getActiveUser()
    const files = typeof formData?.getAll === 'function'
      ? formData.getAll('share_files').map(toStoredFile).filter(Boolean)
      : []
    const readValue = (name) => {
      const value = typeof formData?.get === 'function' ? formData.get(name) : ''
      return typeof value === 'string' ? value : ''
    }
    const payload = {
      id: createOpaqueId(),
      created_at: now,
      expires_at: now + PAYLOAD_TTL_MS,
      owner_user_id: ownerUserId,
      title: normalizeText(readValue('share_title')),
      text: normalizeText(readValue('share_text')),
      url: normalizeText(readValue('share_url')),
      files
    }

    await withStore('readwrite', (store, finish) => {
      const request = store.put(payload)
      request.onsuccess = () => finish(payload)
    })

    return payload
  }

  async function getPayload(id) {
    if (!id) return null
    const now = Date.now()
    return withStore('readwrite', (store, finish) => {
      const request = store.get(id)
      request.onsuccess = () => {
        const payload = request.result || null
        if (isExpired(payload, now)) {
          if (payload) store.delete(id)
          finish(null)
          return
        }
        finish(payload)
      }
    })
  }

  async function getActiveUser() {
    return withMetadataStore('readonly', (store, finish) => {
      const request = store.get(ACTIVE_USER_KEY)
      request.onsuccess = () => {
        const userId = request.result?.user_id
        finish(typeof userId === 'string' && userId ? userId : null)
      }
    })
  }

  async function setActiveUser(userId) {
    const normalizedUserId = typeof userId === 'string' && userId ? userId : null
    return withMetadataStore('readwrite', (store, finish) => {
      if (normalizedUserId) {
        store.put({ key: ACTIVE_USER_KEY, user_id: normalizedUserId })
      } else {
        store.delete(ACTIVE_USER_KEY)
      }
      finish(normalizedUserId)
    })
  }

  async function claimPayload(id, userId) {
    if (!id || !userId) return { payload: null, reason: 'missing' }
    const now = Date.now()
    return withStore('readwrite', (store, finish) => {
      const request = store.get(id)
      request.onsuccess = () => {
        const payload = request.result || null
        if (isExpired(payload, now)) {
          if (payload) store.delete(id)
          finish({ payload: null, reason: 'expired' })
          return
        }
        if (payload.owner_user_id && payload.owner_user_id !== userId) {
          finish({ payload: null, reason: 'owner_mismatch' })
          return
        }
        if (!payload.owner_user_id) {
          payload.owner_user_id = userId
          store.put(payload)
        }
        finish({ payload, reason: null })
      }
    })
  }

  async function markFileUploaded(payloadId, fileId, uploadedFile) {
    if (!payloadId || !fileId || !uploadedFile?.id) return null
    const now = Date.now()
    return withStore('readwrite', (store, finish) => {
      const request = store.get(payloadId)
      request.onsuccess = () => {
        const payload = request.result || null
        if (isExpired(payload, now)) {
          if (payload) store.delete(payloadId)
          finish(null)
          return
        }
        const files = Array.isArray(payload.files) ? payload.files : []
        const file = files.find((entry) => entry?.id === fileId)
        if (!file) {
          finish(payload)
          return
        }
        file.uploaded_file = uploadedFile
        store.put(payload)
        finish(payload)
      }
    })
  }

  async function removePayload(id) {
    if (!id) return false
    return withStore('readwrite', (store, finish) => {
      store.delete(id)
      finish(true)
    })
  }

  async function removePayloadsForUser(userId) {
    if (!userId) return 0
    return withStore('readwrite', (store, finish) => {
      let removed = 0
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          finish(removed)
          return
        }
        if (cursor.value?.owner_user_id === userId) {
          cursor.delete()
          removed++
        }
        cursor.continue()
      }
    })
  }

  scope.NebulynkShareTargetStorage = {
    DB_NAME,
    STORE_NAME,
    PAYLOAD_TTL_MS,
    setActiveUser,
    purgeExpiredPayloads,
    storeFormData,
    getPayload,
    claimPayload,
    markFileUploaded,
    removePayload,
    removePayloadsForUser
  }
})(typeof self !== 'undefined' ? self : globalThis)
