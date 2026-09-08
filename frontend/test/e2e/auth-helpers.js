import { resolveBackendUrl } from './test-urls.js'

export async function loginViaApi(request, { email, password, remember = false }) {
  const response = await request.post(resolveBackendUrl('/authentication'), {
    data: {
      strategy: 'local',
      email,
      password,
      remember
    }
  })

  if (!response.ok()) {
    const responseText = await response.text()
    throw new Error(`Authentication API failed (${response.status()}): ${responseText}`)
  }

  return response.json()
}

export function readCookieValue(cookieString, cookieName) {
  let matchedValue = null

  for (const entry of String(cookieString || '').split(';')) {
    const trimmed = entry.trim()
    if (!trimmed) continue

    const separatorIndex = trimmed.indexOf('=')
    const key = separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex)
    if (key !== cookieName) continue

    const rawValue = separatorIndex === -1 ? '' : trimmed.slice(separatorIndex + 1)
    matchedValue = rawValue
  }

  return matchedValue
}

export async function getAuthFromBrowserSession(page, {
  csrfCookieName = 'nebulynk_csrf_token',
  email = null,
  password = null
} = {}) {
  if (email && password) {
    return loginViaApi(page.request, { email, password })
  }

  const cookieString = await page.evaluate(() => document.cookie || '')
  const csrfToken = readCookieValue(cookieString, csrfCookieName)
  if (!csrfToken) {
    throw new Error(`Missing CSRF cookie "${csrfCookieName}" in browser session.`)
  }

  const refreshUrl = resolveBackendUrl('/auth/session/refresh')
  const response = await page.request.post(refreshUrl, {
    headers: {
      'X-CSRF-Token': decodeURIComponent(csrfToken)
    },
    data: {}
  })

  if (!response.ok()) {
    const responseText = await response.text()
    throw new Error(`Browser session refresh failed (${response.status()}): ${responseText}`)
  }

  const payload = await response.json()
  if (payload?.csrfToken) {
    await page.evaluate(({ key, value }) => {
      window.localStorage.setItem(key, value)
    }, {
      key: `${csrfCookieName}:client`,
      value: payload.csrfToken
    })
  }

  return payload
}
