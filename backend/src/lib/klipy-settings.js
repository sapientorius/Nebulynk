import { decryptSecret, encryptSecret } from './ai-secrets.js'
import { logger } from '../logger.js'

export const KLIPY_SECRET_KEY = 'klipy_api_key'

function normalizeApiKey(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export class KlipySettings {
  constructor({ repository, app, env = process.env, encryptFn = encryptSecret, decryptFn = decryptSecret } = {}) {
    this.repository = repository
    this.app = app
    this.env = env
    this.encryptFn = encryptFn
    this.decryptFn = decryptFn
  }

  async readStoredApiKey() {
    if (!this.repository?.findSecret) {
      return { present: false, value: '' }
    }

    let row
    try {
      row = await this.repository.findSecret(KLIPY_SECRET_KEY)
    } catch {
      return { present: false, value: '' }
    }

    if (!row?.encrypted_value) {
      return { present: false, value: '' }
    }

    try {
      return {
        present: true,
        value: normalizeApiKey(this.decryptFn(this.app, row.encrypted_value))
      }
    } catch (error) {
      logger.warn('Stored KLIPY API key could not be decrypted', { error: error.message })
      return { present: true, value: '' }
    }
  }

  async resolveApiKey() {
    const stored = await this.readStoredApiKey()
    if (stored.present) return stored.value
    return normalizeApiKey(this.env?.KLIPY_API_KEY)
  }

  async getStatus() {
    const stored = await this.readStoredApiKey()
    const apiKey = stored.present ? stored.value : normalizeApiKey(this.env?.KLIPY_API_KEY)
    return {
      klipy_configured: Boolean(apiKey)
    }
  }

  async setApiKey(apiKey) {
    const normalized = normalizeApiKey(apiKey)
    if (!normalized) return
    await this.repository.updateSecret(
      KLIPY_SECRET_KEY,
      this.encryptFn(this.app, normalized)
    )
  }

  async clearApiKey() {
    if (!this.repository?.deleteSecret) return
    await this.repository.deleteSecret(KLIPY_SECRET_KEY)
  }
}
