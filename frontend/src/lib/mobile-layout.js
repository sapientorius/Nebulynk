export const MOBILE_LAYOUT_MEDIA_QUERY = '(max-width: 900px)'

export function readIsMobileLayout(win = window) {
  if (!win?.matchMedia) return false
  return win.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches
}

export function observeMobileLayout(callback, win = window) {
  if (!win?.matchMedia) {
    callback(false)
    return () => {}
  }

  const mediaQuery = win.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY)
  const handler = (event) => {
    callback(event.matches)
  }

  callback(mediaQuery.matches)

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }

  mediaQuery.addListener(handler)
  return () => mediaQuery.removeListener(handler)
}
