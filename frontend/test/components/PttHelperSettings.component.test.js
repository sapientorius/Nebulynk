import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { afterEach, expect, it, vi } from 'vitest'

const html = readFileSync(resolve('../desktop-ptt-helper/ui/index.html'), 'utf8')
const script = readFileSync(resolve('../desktop-ptt-helper/ui/settings.js'), 'utf8')
let dom
afterEach(() => dom?.window.close())

async function fixture() {
  dom = new JSDOM(html, { runScripts: 'outside-only' })
  const request = { requestId: 'request-one', origin: 'https://chat.example', keyCode: 'KeyV', previousKeyCode: 'ShiftLeft' }
  let snapshot = { platform: 'macos', inputMonitoringGranted: true, bindingStatus: {
    mode: 'focused-only', reason: 'binding-approval-required', keyCode: 'KeyV'
  }, trustedOrigins: [{ origin: request.origin, approvedKeyCode: 'ShiftLeft' }], pendingBindingRequests: [request] }
  let listener
  const invoke = vi.fn(async command => command === 'helper_get_state_snapshot' ? snapshot : undefined)
  dom.window.__TAURI__ = { core: { invoke }, event: { listen: (_name, callback) => { listener = callback } } }
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false
    this.dispatchEvent(new dom.window.Event('close'))
  }
  dom.window.eval(script)
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
  await settle()
  return {
    invoke, request, settle,
    query: selector => dom.window.document.querySelector(selector),
    update: patch => { snapshot = { ...snapshot, ...patch }; listener({ payload: snapshot }) }
  }
}

it('requires review and a second local action and freezes the exact displayed request', async () => {
  const f = await fixture()
  f.query('[data-approve-binding]').click()
  expect(f.query('#binding-confirmation').open).toBe(true)
  expect(f.query('#binding-confirmation-copy').textContent).toContain('KeyV')
  expect(f.invoke).not.toHaveBeenCalledWith('helper_approve_binding', expect.anything())
  f.update({ pendingBindingRequests: [{ ...f.request, requestId: 'request-two', keyCode: 'KeyB' }] })
  expect(f.query('#binding-confirmation-copy').textContent).toContain('KeyV')
  expect(f.query('#binding-confirmation-copy').textContent).not.toContain('KeyB')
  f.query('#binding-confirm').click()
  await f.settle()
  expect(f.invoke).toHaveBeenCalledWith('helper_approve_binding', { requestId: 'request-one' })
})

it('rejects and revokes through local commands and does not auto-open on repeated requests', async () => {
  const f = await fixture()
  expect(f.query('dialog').open).toBe(false)
  f.update({})
  expect(f.query('dialog').open).toBe(false)
  f.query('[data-reject-binding]').click()
  await f.settle()
  expect(f.invoke).toHaveBeenCalledWith('helper_reject_binding', { requestId: 'request-one' })
  f.query('[data-revoke-binding]').click()
  await f.settle()
  expect(f.invoke).toHaveBeenCalledWith('helper_revoke_binding', { origin: 'https://chat.example' })
  expect(f.query('#trusted-origins').textContent).toContain('ShiftLeft')
})

it('shows stale-request and storage failures without claiming approval', async () => {
  const f = await fixture()
  f.invoke.mockImplementation(async command => {
    if (command === 'helper_approve_binding') throw new Error('The key request changed or expired.')
    return { platform: 'macos', inputMonitoringGranted: true, bindingStatus: { reason: 'binding-approval-required' } }
  })
  f.query('[data-approve-binding]').click()
  f.query('#binding-confirm').click()
  await f.settle()
  expect(f.query('#helper-error').textContent).toContain('changed or expired')
  expect(f.query('#status-pill').textContent).toBe('Key Approval Required')
})

it('starts and stops local pairing, shows the countdown and freezes the full origin before approval', async () => {
  const f = await fixture()
  const request = { requestId: 'pair-one', origin: 'https://chat.example:8443', expiresAt: new Date(Date.now() + 60000).toISOString() }
  f.update({ pairingModeActive: true, pairingModeExpiresAt: new Date(Date.now() + 120000).toISOString(), pendingPairingRequests: [request] })
  expect(f.query('#pairing-mode-status').textContent).toContain('120')
  expect(f.query('#pairing-stop').hidden).toBe(false)
  f.query('[data-approve]').click()
  expect(f.query('#pairing-confirmation').open).toBe(true)
  expect(f.query('#pairing-confirmation-copy').textContent).toContain(request.origin)
  expect(f.invoke).not.toHaveBeenCalledWith('helper_approve_pairing', expect.anything())
  f.update({ pendingPairingRequests: [request, { ...request, requestId: 'pair-two', origin: 'https://other.example' }] })
  expect(f.query('#pairing-confirmation-copy').textContent).toContain(request.origin)
  expect(f.query('#pairing-confirmation-copy').textContent).not.toContain('other.example')
  f.query('#pairing-confirm').click()
  await f.settle()
  expect(f.invoke).toHaveBeenCalledWith('helper_approve_pairing', { requestId: request.requestId })
  f.query('#pairing-stop').click()
  await f.settle()
  expect(f.invoke).toHaveBeenCalledWith('helper_stop_pairing', {})
  f.update({ pairingModeActive: false, pendingPairingRequests: [] })
  f.query('#pairing-start').click()
  await f.settle()
  expect(f.invoke).toHaveBeenCalledWith('helper_start_pairing', {})
})

it('disables stale pairing confirmation without changing its displayed origin', async () => {
  const f = await fixture()
  const request = { requestId: 'pair-one', origin: 'https://chat.example', expiresAt: new Date(Date.now() + 60000).toISOString() }
  f.update({ pairingModeActive: true, pairingModeExpiresAt: new Date(Date.now() + 120000).toISOString(), pendingPairingRequests: [request] })
  f.query('[data-approve]').click()
  f.update({ pairingModeActive: false, pendingPairingRequests: [] })
  expect(f.query('#pairing-confirm').disabled).toBe(true)
  expect(f.query('#pairing-confirmation-status').textContent).toContain('expired')
  expect(f.query('#pairing-confirmation-copy').textContent).toContain(request.origin)
  f.query('#pairing-confirm').click()
  await f.settle()
  expect(f.invoke).not.toHaveBeenCalledWith('helper_approve_pairing', expect.anything())
})
