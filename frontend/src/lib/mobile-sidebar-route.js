export const MOBILE_SIDEBAR_QUERY_KEY = 'mobileNav'
export const MOBILE_SIDEBAR_QUERY_VALUE = 'sidebar'
export const MOBILE_SIDEBAR_HISTORY_STATE_KEY = 'nebulynkMobileSidebar'

function cloneQuery(query = {}) {
  return { ...(query || {}) }
}

export function isMobileSidebarRouteOpen(route) {
  const value = route?.query?.[MOBILE_SIDEBAR_QUERY_KEY]
  if (Array.isArray(value)) {
    return value.includes(MOBILE_SIDEBAR_QUERY_VALUE)
  }
  return value === MOBILE_SIDEBAR_QUERY_VALUE
}

export function buildMobileSidebarOpenLocation(route) {
  return {
    path: route?.path || '/',
    query: {
      ...cloneQuery(route?.query),
      [MOBILE_SIDEBAR_QUERY_KEY]: MOBILE_SIDEBAR_QUERY_VALUE
    },
    hash: route?.hash || '',
    state: {
      [MOBILE_SIDEBAR_HISTORY_STATE_KEY]: true
    }
  }
}

export function buildMobileSidebarClosedLocation(route) {
  const nextQuery = cloneQuery(route?.query)
  delete nextQuery[MOBILE_SIDEBAR_QUERY_KEY]

  return {
    path: route?.path || '/',
    query: nextQuery,
    hash: route?.hash || ''
  }
}

export function hasMobileSidebarHistoryState(historyState) {
  return historyState?.[MOBILE_SIDEBAR_HISTORY_STATE_KEY] === true
}

export function resolveMobileSidebarSelectionAction(
  currentRoute,
  targetRoute,
  { isMobileLayout = false, historyState = null } = {}
) {
  if (
    isMobileLayout
    && isMobileSidebarRouteOpen(currentRoute)
    && hasMobileSidebarHistoryState(historyState)
  ) {
    return {
      mode: 'transfer',
      openTo: buildMobileSidebarOpenLocation(targetRoute),
      closedTo: buildMobileSidebarClosedLocation(targetRoute)
    }
  }

  return {
    mode: 'push',
    to: buildMobileSidebarClosedLocation(targetRoute)
  }
}

export function resolveMobileSidebarCloseAction(route, { historyState = null } = {}) {
  if (!isMobileSidebarRouteOpen(route)) {
    return null
  }

  if (hasMobileSidebarHistoryState(historyState)) {
    return { mode: 'back' }
  }

  return {
    mode: 'replace',
    to: buildMobileSidebarClosedLocation(route)
  }
}
