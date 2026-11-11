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
  autostartToggle: document.getElementById('autostart-toggle'),
  title: document.getElementById('helper-title'),
  macPermissions: document.getElementById('mac-permissions'),
  permissionStatus: document.getElementById('input-permission-status'),
  permissionButton: document.getElementById('input-permission-button'),
  error: document.getElementById('helper-error')
}

const bindingRequests = document.getElementById('binding-requests')
const bindingCount = document.getElementById('binding-count')
const bindingDialog = document.getElementById('binding-confirmation')
const bindingDialogCopy = document.getElementById('binding-confirmation-copy')
const bindingConfirm = document.getElementById('binding-confirm')
let confirmationRequest = null
let currentSnapshot = null

const statusReasons = {
  'binding-approval-required': 'Confirm the requested PTT key in this helper. Global capture is off until approval.',
  'binding-rejected': 'The requested PTT key was rejected. Choose a key again in Nebulynk to request approval.',
  'macos-input-monitoring-required': 'Allow Input Monitoring in System Settings > Privacy & Security.',
  'macos-secure-input': 'macOS Secure Input is active. Global PTT is paused until protected input ends.',
  'macos-key-unsupported': 'This key cannot be used for global hold-to-talk on macOS. Choose another key.',
  'macos-event-tap-unavailable': 'Keyboard monitoring could not start. Check Input Monitoring and restart the helper.',
  'macos-event-tap-restarting': 'Keyboard monitoring is restarting. Release your key before trying again.',
  'macos-input-thread-unavailable': 'Keyboard monitoring stopped responding. Restart the helper.'
}

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
  if (['global-raw-input', 'global-native'].includes(snapshot.bindingStatus?.mode)) return 'pill pill-ok'
  if (snapshot.bindingStatus?.mode === 'unsupported') return 'pill pill-danger'
  return 'pill pill-muted'
}

function statusPillLabel(snapshot) {
  if (!snapshot) return 'Loading'
  if (snapshot.paused) return 'Paused'
  if (snapshot.bindingStatus?.reason === 'binding-approval-required') return 'Key Approval Required'
  if (snapshot.bindingStatus?.reason === 'binding-rejected') return 'Key Rejected'
  switch (snapshot.bindingStatus?.mode) {
    case 'global-raw-input':
    case 'global-native':
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

function renderBindingRequests(snapshot) {
  const requests = snapshot.pendingBindingRequests || []
  bindingCount.textContent = String(requests.length)
  if (!requests.length) {
    renderEmptyState(bindingRequests, 'No key requests waiting.')
    return
  }
  bindingRequests.className = 'stack'
  bindingRequests.replaceChildren(...requests.map((request) => createElement('article', { className: 'request-row' }, [
    createElement('div', { className: 'request-copy' }, [
      createElement('strong', { text: request.origin }),
      createElement('small', { text: 'Requested key: ' + request.keyCode }),
      createElement('small', { text: 'Previously allowed: ' + (request.previousKeyCode || 'None') })
    ]),
    createElement('div', { className: 'card-actions' }, [
      createElement('button', { type: 'button', className: 'action-button', text: 'Review key', dataset: { approveBinding: request.requestId } }),
      createElement('button', { type: 'button', className: 'danger-button', text: 'Reject', dataset: { rejectBinding: request.requestId } })
    ])
  ])))
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
        text: `Approved ${displayValue(origin.approvedAt, 'unknown time')} for ${clientKind}; allowed key: ${origin.approvedKeyCode || 'None'}`
      })
    ])
    const actions = createElement('div', { className: 'card-actions' }, [
      createElement('span', { className: 'tag', text: clientKind }),
      ...(origin.approvedKeyCode ? [createElement('button', {
        type: 'button', className: 'danger-button', text: 'Revoke key', dataset: { revokeBinding: normalizedOrigin }
      })] : []),
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
    helperSettingCard('Transport', status.usesRawInput ? 'Windows Raw Input' : status.isGlobal ? 'macOS keyboard monitoring' : 'Focused only'),
    helperSettingCard('Pairing State', `${(snapshot.trustedOrigins || []).length} trusted origins`),
    helperSettingCard('Reason', statusReasons[status.reason] || status.reason || 'Ready')
  ])
}

function renderSnapshot(snapshot) {
  currentSnapshot = snapshot
  const mac = snapshot.platform === 'macos'
  nodes.title.textContent = mac ? 'macOS Push-to-Talk (Beta)' : 'Windows Push-to-Talk'
  nodes.macPermissions.hidden = !mac
  nodes.permissionStatus.textContent = snapshot.inputMonitoringGranted
    ? 'Input Monitoring is allowed.' : 'Input Monitoring permission is required for global Push-to-Talk.'
  nodes.permissionButton.hidden = snapshot.inputMonitoringGranted === true
  nodes.pauseToggle.checked = snapshot.paused === true
  nodes.autostartToggle.checked = snapshot.autostartEnabled === true
  renderStatus(snapshot)
  renderBindingRequests(snapshot)
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
    showError(error)
  } finally {
    await refreshSnapshot()
  }
})

nodes.autostartToggle.addEventListener('change', async (event) => {
  try {
    await invoke('helper_set_autostart', { enabled: event.target.checked })
  } catch (error) {
    showError(error)
  } finally {
    await refreshSnapshot()
  }
})

function showError(error) {
  nodes.error.hidden = false
  nodes.error.textContent = String(error)
}

nodes.permissionButton.addEventListener('click', async () => {
  try {
    await invoke('helper_request_input_monitoring')
    await refreshSnapshot()
  } catch (error) { showError(error) }
})

document.body.addEventListener('click', async (event) => {
  const approveBinding = event.target.getAttribute('data-approve-binding')
  if (approveBinding) {
    const request = currentSnapshot?.pendingBindingRequests?.find((item) => item.requestId === approveBinding)
    if (!request) return
    // Freeze the exact request shown. Live snapshots must never change this decision.
    confirmationRequest = Object.freeze({ ...request })
    bindingDialogCopy.textContent = 'Allow ' + confirmationRequest.origin + ' to observe ' + confirmationRequest.keyCode + '?'
    bindingDialog.showModal()
    return
  }
  const rejectBinding = event.target.getAttribute('data-reject-binding')
  const revokeBinding = event.target.getAttribute('data-revoke-binding')
  if (rejectBinding || revokeBinding) {
    try {
      await invoke(rejectBinding ? 'helper_reject_binding' : 'helper_revoke_binding',
        rejectBinding ? { requestId: rejectBinding } : { origin: revokeBinding })
    } catch (error) { showError(error) }
    finally { await refreshSnapshot() }
    return
  }
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

bindingConfirm.addEventListener('click', async () => {
  if (!confirmationRequest || bindingConfirm.disabled) return
  const request = confirmationRequest
  bindingConfirm.disabled = true
  try {
    await invoke('helper_approve_binding', { requestId: request.requestId })
  } catch (error) { showError(error) }
  finally {
    confirmationRequest = null
    bindingConfirm.disabled = false
    bindingDialog.close()
    await refreshSnapshot()
  }
})
document.getElementById('binding-cancel').addEventListener('click', () => bindingDialog.close())
bindingDialog.addEventListener('close', () => { confirmationRequest = null })
