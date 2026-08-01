import test from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter, MemoryRateLimitStore } from '../src/lib/rate-limit.js'

test('memory rate limiter tracks a fixed window and reports retry-after seconds', async () => {
  let now = 1_000
  const limiter = createRateLimiter(
    new MemoryRateLimitStore({ now: () => now }),
    { now: () => now }
  )

  const first = await limiter.consume({
    bucket: 'test',
    key: 'alpha',
    limit: 2,
    windowMs: 10_000
  })
  const second = await limiter.consume({
    bucket: 'test',
    key: 'alpha',
    limit: 2,
    windowMs: 10_000
  })
  const third = await limiter.consume({
    bucket: 'test',
    key: 'alpha',
    limit: 2,
    windowMs: 10_000
  })

  assert.equal(first.allowed, true)
  assert.equal(first.remaining, 1)
  assert.equal(second.allowed, true)
  assert.equal(second.remaining, 0)
  assert.equal(third.allowed, false)
  assert.equal(third.retryAfterSeconds, 10)

  now += 10_001

  const afterExpiry = await limiter.consume({
    bucket: 'test',
    key: 'alpha',
    limit: 2,
    windowMs: 10_000
  })

  assert.equal(afterExpiry.allowed, true)
  assert.equal(afterExpiry.remaining, 1)
})
