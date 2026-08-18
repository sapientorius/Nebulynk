import { afterEach, describe, expect, it, vi } from 'vitest'

function createMemoryIndexedDb() {
  const databases = new Map()

  function createDatabase() {
    const stores = new Map()

    return {
      objectStoreNames: {
        contains(name) {
          return stores.has(name)
        }
      },
      createObjectStore(name, options = {}) {
        const store = {
          keyPath: options.keyPath,
          records: new Map()
        }
        stores.set(name, store)
        return {
          createIndex() {}
        }
      },
      transaction(name, mode) {
        const store = stores.get(name)
        if (!store) throw new Error(`Unknown store: ${name}`)
        return createTransaction(store, mode)
      },
      close() {}
    }
  }

  function createTransaction(definition) {
    let pending = 0
    let completionQueued = false
    let completed = false
    let aborted = false
    const transaction = {
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
      objectStore() {
        return createObjectStore(definition, schedule)
      },
      abort() {
        if (aborted || completed) return
        aborted = true
        queueMicrotask(() => transaction.onabort?.({ target: transaction }))
      }
    }

    function finishWhenIdle() {
      if (aborted || completed || pending > 0 || completionQueued) return
      completionQueued = true
      queueMicrotask(() => {
        completionQueued = false
        if (aborted || completed || pending > 0) return
        completed = true
        transaction.oncomplete?.({ target: transaction })
      })
    }

    function schedule(operation) {
      pending++
      queueMicrotask(() => {
        if (!aborted) {
          try {
            operation()
          } catch (error) {
            transaction.error = error
            transaction.onerror?.({ target: transaction })
          }
        }
        pending--
        finishWhenIdle()
      })
    }

    return transaction
  }

  function createObjectStore(definition, schedule) {
    function createRequest(operation) {
      const request = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null
      }
      schedule(() => {
        try {
          operation(request)
          request.onsuccess?.({ target: request })
        } catch (error) {
          request.error = error
          request.onerror?.({ target: request })
          throw error
        }
      })
      return request
    }

    return {
      get(key) {
        return createRequest((request) => {
          request.result = definition.records.get(key)
        })
      },
      put(value) {
        return createRequest((request) => {
          const key = value?.[definition.keyPath]
          definition.records.set(key, value)
          request.result = key
        })
      },
      delete(key) {
        return createRequest((request) => {
          definition.records.delete(key)
          request.result = undefined
        })
      },
      openCursor() {
        const entries = [...definition.records.entries()]
        const request = {
          result: undefined,
          error: null,
          onsuccess: null,
          onerror: null
        }

        const visit = (index) => {
          schedule(() => {
            const entry = entries[index]
            if (!entry) {
              request.result = null
              request.onsuccess?.({ target: request })
              return
            }

            const [key, value] = entry
            request.result = {
              value,
              delete() {
                definition.records.delete(key)
              },
              continue() {
                visit(index + 1)
              }
            }
            request.onsuccess?.({ target: request })
          })
        }

        visit(0)
        return request
      }
    }
  }

  return {
    open(name, version) {
      const request = {
        result: null,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null
      }

      queueMicrotask(() => {
        const existing = databases.get(name)
        const needsUpgrade = !existing || version > existing.version
        const record = existing || { version, database: createDatabase() }
        record.version = version
        databases.set(name, record)
        request.result = record.database
        if (needsUpgrade) request.onupgradeneeded?.({ target: request })
        request.onsuccess?.({ target: request })
      })

      return request
    }
  }
}

function createFormData({ title = '', text = '', url = '', files = [] } = {}) {
  const values = {
    share_title: title,
    share_text: text,
    share_url: url
  }
  return {
    get(name) {
      return values[name] || ''
    },
    getAll(name) {
      return name === 'share_files' ? files : []
    }
  }
}

async function loadStorage() {
  let id = 0
  const workerScope = {
    crypto: {
      randomUUID: () => `share-${++id}`
    },
    indexedDB: createMemoryIndexedDb()
  }
  vi.stubGlobal('self', workerScope)
  vi.resetModules()
  await import('../../public/share-target-storage.js')
  return workerScope.NebulynkShareTargetStorage
}

describe('share target IndexedDB storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('binds payloads to the active account and supports retry, discard, logout, and expiry cleanup', async () => {
    const storage = await loadStorage()
    const image = {
      name: 'shared.png',
      type: 'image/png',
      size: 42,
      lastModified: 123,
      arrayBuffer: async () => new ArrayBuffer(42)
    }
    const pdf = {
      name: 'document.pdf',
      type: 'application/pdf',
      size: 12,
      arrayBuffer: async () => new ArrayBuffer(12)
    }
    const archive = {
      name: 'archive.zip',
      type: 'application/zip',
      size: 8,
      arrayBuffer: async () => new ArrayBuffer(8)
    }
    const unknownType = {
      name: 'untitled-file',
      type: '',
      size: 0,
      arrayBuffer: async () => new ArrayBuffer(0)
    }

    await storage.setActiveUser('user-a')
    const payload = await storage.storeFormData(createFormData({
      title: 'A title',
      text: 'A text',
      url: 'https://example.test',
      files: [image, pdf, archive, unknownType]
    }))

    expect(payload.owner_user_id).toBe('user-a')
    expect(payload.expires_at - payload.created_at).toBe(storage.PAYLOAD_TTL_MS)
    expect(payload.files).toMatchObject([
      { name: 'shared.png', type: 'image/png', size: 42 },
      { name: 'document.pdf', type: 'application/pdf', size: 12 },
      { name: 'archive.zip', type: 'application/zip', size: 8 },
      { name: 'untitled-file', type: '', size: 0 }
    ])
    await expect(storage.claimPayload(payload.id, 'user-b')).resolves.toEqual({ payload: null, reason: 'owner_mismatch' })

    const claimed = await storage.claimPayload(payload.id, 'user-a')
    expect(claimed.payload?.id).toBe(payload.id)
    const pdfEntry = payload.files.find((file) => file.name === 'document.pdf')
    const updated = await storage.markFileUploaded(payload.id, pdfEntry.id, { id: 'upload-1', name: 'document.pdf' })
    expect(updated.files.find((file) => file.id === pdfEntry.id)?.uploaded_file).toEqual({ id: 'upload-1', name: 'document.pdf' })

    expect(await storage.removePayload(payload.id)).toBe(true)
    await expect(storage.getPayload(payload.id)).resolves.toBeNull()

    const logoutPayload = await storage.storeFormData(createFormData({ text: 'remove me' }))
    expect(await storage.removePayloadsForUser('user-a')).toBe(1)
    await expect(storage.getPayload(logoutPayload.id)).resolves.toBeNull()

    await storage.setActiveUser(null)
    const expiredPayload = await storage.storeFormData(createFormData({ text: 'expires' }))
    expiredPayload.expires_at = Date.now() - 1
    expect(await storage.purgeExpiredPayloads()).toBe(1)
    await expect(storage.getPayload(expiredPayload.id)).resolves.toBeNull()
  })
})
