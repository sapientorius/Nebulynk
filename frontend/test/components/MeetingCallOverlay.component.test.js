import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { componentContext, deferred } from '../helpers/mount-component.js'
import MeetingCallOverlay from '../../src/components/MeetingCallOverlay.vue'
import { useMeetingCallsStore } from '../../src/stores/meeting-calls.js'

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn() }, join: vi.fn(), push: vi.fn(), sound: vi.fn()
}))
vi.mock('../../src/lib/api.js', () => ({ default: mocks.api }))
vi.mock('../../src/stores/session.js', () => ({ useSessionStore: () => ({ user: { id: 'alice' } }) }))
vi.mock('../../src/stores/meetings.js', () => ({ useMeetingsStore: () => ({ join: mocks.join, activeMeetingId: null, isMeetingEnded: () => false }) }))
vi.mock('../../src/router/index.js', () => ({ default: { push: mocks.push } }))
vi.mock('../../src/lib/sfx.js', () => ({ playSfx: mocks.sound, prepareSfxAudio: async () => true, SFX_EVENTS: { CALL_INCOMING: 'incoming' } }))

let context, store, wrappers, current
beforeEach(async () => {
  context = await componentContext('/channels/source')
  store = useMeetingCallsStore()
  wrappers = []
  current = { id: 'call', caller_id: 'bob', caller_name: 'Bob', source_name: 'Bob', source_channel_id: 'source',
    status: 'ringing', recipient_status: 'invited', expires_at: new Date(Date.now() + 60000).toISOString() }
  mocks.api.get.mockImplementation(async path => ({ data: path === '/meeting-calls' ? [current] : current }))
  mocks.join.mockResolvedValue({})
  mocks.push.mockResolvedValue(undefined)
})
afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount())
  store.$dispose()
})
async function render(props = {}) {
  const wrapper = context.mount(MeetingCallOverlay, { props })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
const button = (wrapper, label) => wrapper.findAll('button').find(entry => entry.text() === label)

it('recovers on chat entry, shares pending state with the overlay and joins once', async () => {
  const overlay = await render()
  const banner = await render({ channelId: 'source' })
  expect(overlay.get('[data-testid=incoming-meeting-call]').text()).toContain('Bob')
  expect(banner.get('[data-testid=chat-call-banner]').text()).toContain('Bob')
  const pending = deferred()
  mocks.api.patch.mockReturnValue(pending.promise)
  await button(banner, 'Accept').trigger('click')
  await nextTick()
  expect(button(overlay, 'Accept').attributes('disabled')).toBeDefined()
  expect(button(overlay, 'Decline').attributes('disabled')).toBeDefined()
  current = { ...current, status: 'accepted', recipient_status: 'accepted', meeting_id: 'meeting', meeting_status: 'active' }
  pending.resolve({ data: { ...current, accepted_now: true } })
  await flushPromises()
  expect(banner.find('[data-testid=chat-call-banner]').exists()).toBe(false)
  expect(mocks.api.patch).toHaveBeenCalledExactlyOnceWith('/meeting-calls/call', { action: 'accept' })
  expect(mocks.join).toHaveBeenCalledExactlyOnceWith('meeting')
})

it('filters by chat and keeps both surfaces actionable after a failed request', async () => {
  const overlay = await render()
  const banner = await render({ channelId: 'source' })
  const other = await render({ channelId: 'other' })
  expect(other.find('[data-testid=chat-call-banner]').exists()).toBe(false)
  mocks.api.patch.mockRejectedValue(new Error('offline'))
  window.$message = { error: vi.fn() }
  await button(overlay, 'Accept').trigger('click')
  await flushPromises()
  expect(window.$message.error).toHaveBeenCalled()
  expect(button(banner, 'Accept').attributes('disabled')).toBeUndefined()
  expect(button(overlay, 'Accept').attributes('disabled')).toBeUndefined()
})

it('renders a global invitation and rings on arrival without a chat banner or user interaction', async () => {
  const overlay = await render()
  expect(overlay.find('[data-testid=incoming-meeting-call]').exists()).toBe(false)
  await store.load('call')
  await flushPromises()
  expect(overlay.get('[data-testid=incoming-meeting-call]').text()).toContain('Bob')
  expect(overlay.get('.call-avatar').text()).toBe('B')
  expect(overlay.get('.call-time-label').text()).toContain('Time remaining')
  expect(mocks.sound).toHaveBeenCalledExactlyOnceWith('incoming')
  await store.load('call')
  await flushPromises()
  expect(overlay.findAll('[data-testid=incoming-meeting-call]')).toHaveLength(1)
  expect(mocks.sound).toHaveBeenCalledTimes(1)
})

it('shows the caller and group context separately, and gives outgoing calls a cancel action', async () => {
  current = { ...current, source_name: 'Design team', title: 'Review' }
  const overlay = await render()
  await store.load('call')
  await flushPromises()
  expect(overlay.get('.call-name').text()).toBe('Bob')
  expect(overlay.get('.call-context').text()).toBe('Design team · Review')
  current = { ...current, caller_id: 'alice', recipient_status: null }
  await store.load('call')
  await flushPromises()
  expect(overlay.get('[data-testid=outgoing-call] .call-name').text()).toBe('Design team')
  expect(button(overlay, 'Cancel')).toBeTruthy()
  expect(button(overlay, 'Accept')).toBeUndefined()
})
