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

function readCookieValue(cookieString, cookieName) {
  return String(cookieString || '')
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1) || null
}

export async function getAuthFromBrowserSession(page, {
  csrfCookieName = 'nebulynk_csrf_token'
} = {}) {
  const cookieString = await page.evaluate(() => document.cookie || '')
  const csrfToken = readCookieValue(cookieString, csrfCookieName)
  if (!csrfToken) {
    throw new Error(`Missing CSRF cookie "${csrfCookieName}" in browser session.`)
  }

  const response = await page.request.post(resolveBackendUrl('/auth/session/refresh'), {
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
