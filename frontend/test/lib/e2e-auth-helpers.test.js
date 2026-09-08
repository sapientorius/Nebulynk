import { expect, it } from 'vitest'
import { readCookieValue } from '../../test/e2e/auth-helpers.js'

it('uses the latest value when a browser session has duplicate cookies', () => {
  expect(readCookieValue(
    'nebulynk_csrf_token=stale-cookie-csrf-token; nebulynk_csrf_token=current-cookie-csrf-token',
    'nebulynk_csrf_token'
  )).toBe('current-cookie-csrf-token')
})
