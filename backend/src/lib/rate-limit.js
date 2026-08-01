import { createClient } from 'redis'

const RATE_LIMIT_DRIVERS = new Set(['memory', 'redis'])

function normalizeEnvString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDriver(value) {
  const normalized = normalizeEnvString(value).toLowerCase()
  return RATE_LIMIT_DRIVERS.has(normalized) ? normalized : ''
}

export function resolveRateLimitDriver(env = process.env) {
  const configured = normalizeDriver(env.RATE_LIMIT_DRIVER)
  const isProduction = normalizeEnvString(env.NODE_ENV).toLowerCase() === 'production'

  if (configured) {
    if (isProduction && configured !== 'redis') {
      throw new Error('RATE_LIMIT_DRIVER must be redis in production')
    }
    return configured
  }

  return isProduction ? 'redis' : 'memory'
}

export function resolveRedisConnectionOptions(env = process.env) {
  const redisUrl = normalizeEnvString(env.REDIS_URL)
  if (redisUrl) {
    return {
      url: redisUrl
    }
  }

  const host = normalizeEnvString(env.REDIS_HOST) || '127.0.0.1'
  const rawPort = normalizeEnvString(env.REDIS_PORT)
  const parsedPort = Number.parseInt(rawPort, 10)

  return {
    socket: {
      host,
      port: Number.isNaN(parsedPort) ? 6379 : parsedPort
    }
  }
}

export class MemoryRateLimitStore {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now
    this.entries = new Map()
  }

  async increment(key, windowMs) {
    const now = this.now()
    const current = this.entries.get(key)

    if (!current || current.expiresAt <= now) {
      const next = {
        count: 1,
        expiresAt: now + windowMs
      }
      this.entries.set(key, next)
      return { ...next }
    }

    current.count += 1
    this.entries.set(key, current)
    return { ...current }
  }

  async reset(key) {
    this.entries.delete(key)
  }

  async close() {}
}

export class RedisRateLimitStore {
  constructor(client, { prefix = 'rate-limit' } = {}) {
    this.client = client
    this.prefix = prefix
  }

  buildKey(key) {
    return `${this.prefix}:${key}`
  }

  async increment(key, windowMs) {
    const namespacedKey = this.buildKey(key)
    const count = await this.client.incr(namespacedKey)

    if (count === 1) {
      await this.client.pExpire(namespacedKey, windowMs)
    }

    let ttlMs = await this.client.pTTL(namespacedKey)
    if (ttlMs < 0) {
      await this.client.pExpire(namespacedKey, windowMs)
      ttlMs = windowMs
    }

    return {
      count,
      expiresAt: Date.now() + ttlMs
    }
  }

  async reset(key) {
    await this.client.del(this.buildKey(key))
  }

  async close() {
    if (this.client?.isOpen) {
      await this.client.quit()
    }
  }
}

export function createRateLimiter(store, { now = () => Date.now() } = {}) {
  return {
    async consume({ bucket, key, limit, windowMs }) {
      const result = await store.increment(`${bucket}:${key}`, windowMs)
      const remaining = Math.max(limit - result.count, 0)
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(Math.max(result.expiresAt - now(), 0) / 1000)
      )

      return {
        allowed: result.count <= limit,
        current: result.count,
        remaining,
        retryAfterSeconds
      }
    },

    async reset({ bucket, key }) {
      await store.reset(`${bucket}:${key}`)
    },

    async close() {
      await store.close()
    }
  }
}

export async function createRateLimitStore(env = process.env) {
  const driver = resolveRateLimitDriver(env)

  if (driver === 'memory') {
    return {
      driver,
      store: new MemoryRateLimitStore()
    }
  }

  const client = createClient(resolveRedisConnectionOptions(env))
  await client.connect()

  return {
    driver,
    store: new RedisRateLimitStore(client)
  }
}
