const invoke = (command, payload = {}) => window.__TAURI__.core.invoke(command, payload)

const nodes = {
  refreshButton: document.getElementById('refresh-button'),
  statusPill: document.getElementById('status-pill'),
  statusGrid: document.getElementById('status-grid'),
  pendingCount: document.getElementById('pending-count'),
  pendingRequests: document.getElementById('pending-requests'),
  trustedCount: document.getElementById('trusted-count'),
  trustedOrigins: document.getElementById('trusted-origins'),
  sessionCount: document.getElementById('session-count'),
  activeSessions: document.getElementById('active-sessions'),
  pauseToggle: document.getElementById('pause-toggle'),
  autostartToggle: document.getElementById('autostart-toggle')
}

let currentSnapshot = null

function displayValue(value, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback
  return String(value)
}

function createElement(tag, { className, text, type, dataset } = {}, children = []) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (type) node.type = type
  if (text !== undefined) node.textContent = text
  if (dataset) {
    Object.entries(dataset).forEach(([key, value]) => {
      node.dataset[key] = String(value)
    })
  }
  children.forEach((child) => node.appendChild(child))
  return node
}

function renderEmptyState(node, message) {
  node.className = 'stack empty-state'
  node.replaceChildren()
  node.textContent = message
}

function statusPillClass(snapshot) {
  if (!snapshot) return 'pill pill-muted'
  if (snapshot.paused) return 'pill pill-warn'
  if (snapshot.bindingStatus?.mode === 'global-raw-input') return 'pill pill-ok'
  if (snapshot.bindingStatus?.mode === 'unsupported') return 'pill pill-danger'
  return 'pill pill-muted'
}

function statusPillLabel(snapshot) {
  if (!snapshot) return 'Loading'
  if (snapshot.paused) return 'Paused'
  switch (snapshot.bindingStatus?.mode) {
    case 'global-raw-input':
      return 'Global Active'
    case 'unsupported':
      return 'Unsupported'
    default:
      return 'Focused Only'
  }
}

function helperSettingCard(label, value) {
  return createElement('article', { className: 'status-tile' }, [
    createElement('strong', { text: label }),
    createElement('small', { text: displayValue(value, 'None') })
  ])
}

function renderPendingRequests(snapshot) {
  const requests = snapshot.pendingPairingRequests || []
  nodes.pendingCount.textContent = String(requests.length)
  if (requests.length === 0) {
    renderEmptyState(nodes.pendingRequests, 'No pairing requests waiting.')
    return
  }

  nodes.pendingRequests.className = 'stack'
  nodes.pendingRequests.replaceChildren(...requests.map((request) => {
    const copy = createElement('div', { className: 'request-copy' }, [
      createElement('strong', { text: displayValue(request.origin, 'Unknown origin') }),
      createElement('small', {
        text: `${displayValue(request.clientKind, 'browser')} requested pairing at ${displayValue(request.createdAt, 'unknown time')}`
      })
    ])
    const actions = createElement('div', { className: 'card-actions' }, [
      createElement('button', {
        className: 'action-button',
        dataset: { approve: displayValue(request.requestId) },
        text: 'Approve',
        type: 'button'
      }),
      createElement('button', {
        className: 'danger-button',
        dataset: { reject: displayValue(request.requestId) },
        text: 'Reject',
        type: 'button'
      })
    ])
    return createElement('article', { className: 'request-row' }, [copy, actions])
  }))
}

function renderTrustedOrigins(snapshot) {
  const origins = snapshot.trustedOrigins || []
  nodes.trustedCount.textContent = String(origins.length)
  if (origins.length === 0) {
    renderEmptyState(nodes.trustedOrigins, 'No trusted Nebulynk sites yet.')
    return
  }

  nodes.trustedOrigins.className = 'stack'
  nodes.trustedOrigins.replaceChildren(...origins.map((origin) => {
    const normalizedOrigin = displayValue(origin.origin, 'Unknown origin')
    const clientKind = displayValue(origin.lastClientKind, 'browser')
    const copy = createElement('div', { className: 'site-copy' }, [
      createElement('strong', { text: normalizedOrigin }),
      createElement('small', {
        text: `Approved ${displayValue(origin.approvedAt, 'unknown time')} for ${clientKind}`
      })
    ])
    const actions = createElement('div', { className: 'card-actions' }, [
      createElement('span', { className: 'tag', text: clientKind }),
      createElement('button', {
        className: 'danger-button',
        dataset: { revoke: normalizedOrigin },
        text: 'Revoke',
        type: 'button'
      })
    ])
    return createElement('article', { className: 'site-row' }, [copy, actions])
  }))
}

function renderSessions(snapshot) {
  const sessions = snapshot.activeSessions || []
  nodes.sessionCount.textContent = String(sessions.length)
  if (sessions.length === 0) {
    renderEmptyState(nodes.activeSessions, 'No browser or PWA sessions connected.')
    return
  }

  nodes.activeSessions.className = 'stack'
  nodes.activeSessions.replaceChildren(...sessions.map((session) => {
    const copy = createElement('div', { className: 'session-copy' }, [
      createElement('strong', { text: displayValue(session.origin, 'Unknown origin') }),
      createElement('small', {
        text: [
          displayValue(session.clientKind, 'browser'),
          displayValue(session.route, '/'),
          session.focused ? 'focused' : 'background',
          session.authorized ? 'paired' : 'awaiting pair'
        ].join(' - ')
      })
    ])
    const actionChildren = []
    if (session.isTarget) {
      actionChildren.push(createElement('span', { className: 'tag tag-target', text: 'Target' }))
    }
    actionChildren.push(createElement('span', {
      className: 'tag',
      text: displayValue(session.sessionId, 'unknown-session')
    }))
    return createElement('article', { className: 'session-row' }, [
      copy,
      createElement('div', { className: 'card-actions' }, actionChildren)
    ])
  }))
}

function renderStatus(snapshot) {
  const status = snapshot.bindingStatus || {}
  nodes.statusPill.className = statusPillClass(snapshot)
  nodes.statusPill.textContent = statusPillLabel(snapshot)
  nodes.statusGrid.replaceChildren(...[
    helperSettingCard('Binding Mode', status.mode || 'focused-only'),
    helperSettingCard('Key', status.keyCode || 'None'),
    helperSettingCard('Current Target', snapshot.currentTargetSessionId || 'None'),
    helperSettingCard('Transport', status.usesRawInput ? 'Windows Raw Input' : 'Focused only'),
    helperSettingCard('Pairing State', `${(snapshot.trustedOrigins || []).length} trusted origins`),
    helperSettingCard('Reason', status.reason || 'Ready')
  ])
}

function renderSnapshot(snapshot) {
  currentSnapshot = snapshot
  nodes.pauseToggle.checked = snapshot.paused === true
  nodes.autostartToggle.checked = snapshot.autostartEnabled === true
  renderStatus(snapshot)
  renderPendingRequests(snapshot)
  renderTrustedOrigins(snapshot)
  renderSessions(snapshot)
}

async function refreshSnapshot() {
  const snapshot = await invoke('helper_get_state_snapshot')
  renderSnapshot(snapshot)
}

nodes.refreshButton.addEventListener('click', () => {
  refreshSnapshot().catch(console.error)
})

nodes.pauseToggle.addEventListener('change', async (event) => {
  try {
    await invoke('helper_set_paused', { paused: event.target.checked })
  } catch (error) {
    console.error(error)
  } finally {
    await refreshSnapshot()
  }
})

nodes.autostartToggle.addEventListener('change', async (event) => {
  try {
    await invoke('helper_set_autostart', { enabled: event.target.checked })
  } catch (error) {
    console.error(error)
  } finally {
    await refreshSnapshot()
  }
})

document.body.addEventListener('click', async (event) => {
  const approveId = event.target.getAttribute('data-approve')
  if (approveId) {
    try {
      await invoke('helper_approve_pairing', { requestId: approveId })
    } catch (error) {
      console.error(error)
    } finally {
      await refreshSnapshot()
    }
    return
  }

  const rejectId = event.target.getAttribute('data-reject')
  if (rejectId) {
    try {
      await invoke('helper_reject_pairing', { requestId: rejectId })
    } catch (error) {
      console.error(error)
    } finally {
      await refreshSnapshot()
    }
    return
  }

  const revokeOrigin = event.target.getAttribute('data-revoke')
  if (revokeOrigin) {
    try {
      await invoke('helper_revoke_origin', { origin: revokeOrigin })
    } catch (error) {
      console.error(error)
    } finally {
      await refreshSnapshot()
    }
  }
})

window.__TAURI__.event.listen('helper:state-changed', (event) => {
  if (event?.payload) {
    renderSnapshot(event.payload)
  }
})

refreshSnapshot().catch(console.error)
