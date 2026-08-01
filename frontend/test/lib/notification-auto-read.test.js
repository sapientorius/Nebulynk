import { describe, expect, it } from 'vitest'
import { shouldRetryNotificationAutoRead } from '../../src/lib/notification-auto-read.js'

describe('shouldRetryNotificationAutoRead', () => {
  it('retries network and server errors', () => {
    expect(shouldRetryNotificationAutoRead(new Error('network failure'))).toBe(true)
    expect(shouldRetryNotificationAutoRead({ response: { status: 500 } })).toBe(true)
    expect(shouldRetryNotificationAutoRead({ response: { status: 429 } })).toBe(true)
  })

  it('does not retry client validation errors', () => {
    expect(shouldRetryNotificationAutoRead({ response: { status: 400 } })).toBe(false)
    expect(shouldRetryNotificationAutoRead({ response: { status: 404 } })).toBe(false)
  })
})
