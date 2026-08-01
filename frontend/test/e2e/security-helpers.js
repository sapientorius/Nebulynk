import { expect } from '@playwright/test'
import { buildFrontendFrameAncestorsDirective } from '../../security-headers.config.js'

const SECURITY_CONSOLE_PATTERN = /(content security policy|securitypolicyviolation|violates the following content security policy directive|refused to (connect|load|execute|frame|apply)|blocked by csp|permissions-policy|x-frame-options|nosniff)/i

export async function createBrowserSecurityMonitor(page) {
  const consoleFindings = []
  const pageErrors = []

  page.on('console', (message) => {
    const text = message.text()
    if (!SECURITY_CONSOLE_PATTERN.test(text)) return
    consoleFindings.push({
      type: message.type(),
      text
    })
  })

  page.on('pageerror', (error) => {
    const message = error?.message || String(error)
    if (!SECURITY_CONSOLE_PATTERN.test(message)) return
    pageErrors.push(message)
  })

  await page.addInitScript(() => {
    window.__e2eSecurityViolations = []
    window.addEventListener('securitypolicyviolation', (event) => {
      window.__e2eSecurityViolations.push({
        effectiveDirective: event.effectiveDirective || '',
        violatedDirective: event.violatedDirective || '',
        blockedURI: event.blockedURI || '',
        disposition: event.disposition || '',
        sourceFile: event.sourceFile || '',
        sample: event.sample || ''
      })
    })
  })

  return {
    async getViolations() {
      return page.evaluate(() => window.__e2eSecurityViolations || [])
    },
    async assertNoUnexpectedFindings() {
      const violations = await page.evaluate(() => window.__e2eSecurityViolations || [])
      expect(violations, `Unexpected CSP violations: ${JSON.stringify(violations, null, 2)}`).toEqual([])
      expect(consoleFindings, `Unexpected browser security console findings: ${JSON.stringify(consoleFindings, null, 2)}`).toEqual([])
      expect(pageErrors, `Unexpected browser security page errors: ${JSON.stringify(pageErrors, null, 2)}`).toEqual([])
    }
  }
}

export function expectFrontendSecurityHeaders(headers = {}) {
  expect(headers['content-security-policy']).toContain("default-src 'self'")
  expect(headers['content-security-policy']).toContain(buildFrontendFrameAncestorsDirective())
  expect(headers['content-security-policy']).toContain("object-src 'none'")
  expect(headers['content-security-policy']).toContain("worker-src 'self' blob:")
  expect(headers['permissions-policy']).toBe('camera=(self), microphone=(self), geolocation=(), fullscreen=(self)')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBeUndefined()
}

export function expectApiSecurityHeaders(headers = {}) {
  expect(headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
  expect(headers['referrer-policy']).toBe('no-referrer')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('DENY')
}
