import { beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ChannelHeader from '../../src/components/ChannelHeader.vue'
import MeetingHistoryAccessSelect from '../../src/components/MeetingHistoryAccessSelect.vue'
import { componentContext } from '../helpers/mount-component.js'
import { useChannelsStore, useSessionStore, useUiStore, useMessageSummariesStore } from '../../src/stores/index.js'
import api from '../../src/lib/api.js'

vi.mock('../../src/lib/api.js', async original => ({
  ...await original(), default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
  getPlatformStatus: vi.fn(async () => ({ default_meeting_language: 'en' }))
}))
let context, channels
beforeEach(async () => {
  context = await componentContext('/channels/a')
  useSessionStore().user = { id: 'alice', is_admin: true }
  channels = useChannelsStore()
  channels.channels = [{ id: 'a', name: 'Planning', type: 'private', purpose: 'default', meeting_history_access: 'all_channel_members' }]
  channels.activeChannelId = 'a'
  api.get.mockReset().mockResolvedValue({ data: [] })
  api.post.mockReset().mockResolvedValue({ data: { id: 'scheduled', status: 'scheduled' } })
  api.patch.mockReset().mockImplementation(async (_path, data) => ({ data: { ...channels.channels[0], ...data } }))
})
const body = () => new DOMWrapper(document.body)
async function render(mobile = false) {
  if (mobile) window.matchMedia.mockImplementation(query => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const wrapper = context.mount(ChannelHeader)
  await flushPromises()
  return wrapper
}
async function click(selector) {
  await body().get(`[data-testid=${selector}]`).trigger('click')
  await flushPromises()
}

it.each([false, true])('runs meetings, members, pins and summary menus (mobile=%s)', async mobile => {
  const wrapper = await render(mobile)
  const prefix = mobile ? 'channel-header-mobile' : 'channel-header'
  await click(`${prefix}-meetings-trigger`)
  await click(`${prefix}-past-meetings`)
  expect(wrapper.emitted('toggle-past-meetings')).toHaveLength(1)
  if (mobile) await click(`${prefix}-overflow-trigger`)
  await click(`${prefix}-members`)
  expect(wrapper.emitted('toggle-members')).toHaveLength(1)
  await click(`${prefix}-overflow-trigger`)
  await click(`${prefix}-pins`)
  expect(useUiStore().showPinnedPanel).toBe(true)
  await click(`${prefix}-overflow-trigger`)
  await click(`${prefix}-summary-toggle`)
  expect(body().get(`[data-testid=${prefix}-summary-toggle]`).attributes('aria-expanded')).toBe('true')
  await body().get(`[data-testid=${prefix}-summary-actions] .summary-preset`).trigger('click')
  await flushPromises()
  expect(api.post).toHaveBeenCalledWith('/message-summaries', expect.objectContaining({ channel_id: 'a', range_preset: 'last_hour' }))
})

it.each(['default', 'voice', 'meeting', 'archived'])('gates call controls for %s channels', async kind => {
  if (kind === 'voice') channels.channels[0].is_voice = true
  if (kind === 'meeting') channels.channels[0].purpose = 'meeting'
  if (kind === 'archived') channels.channels[0].is_archived = true
  const wrapper = await render(true)
  expect(wrapper.find('[data-testid=channel-header-mobile-call]').exists()).toBe(['default', 'voice'].includes(kind))
})

it('opens scheduling, submits the current channel and navigates to the created meeting', async () => {
  await render()
  await click('channel-header-meetings-trigger')
  await click('channel-header-meetings-schedule')
  const modal = new DOMWrapper(document.body.querySelector('.n-modal'))
  await modal.get('input').setValue('Next planning')
  const submit = modal.findAll('button').find(button => button.text() === 'Schedule meeting')
  expect(submit).toBeTruthy()
  await submit.trigger('click')
  await flushPromises()
  expect(api.post).toHaveBeenCalledWith('/meetings', expect.objectContaining({ source_channel_id: 'a', title: 'Next planning', language: 'en' }))
  expect(context.router.currentRoute.value.path).toBe('/meetings/scheduled')
})

it('saves the selected history policy and refuses saving after permission is revoked', async () => {
  const wrapper = await render()
  await click('channel-header-overflow-trigger')
  await click('channel-header-settings')
  const policy = wrapper.findComponent(MeetingHistoryAccessSelect)
  policy.vm.$emit('update:modelValue', 'meeting_start_members')
  await nextTick()
  const modal = new DOMWrapper(document.body.querySelector('.n-modal'))
  await modal.findAll('button').find(button => button.text() === 'Save').trigger('click')
  await flushPromises()
  expect(api.patch).toHaveBeenCalledWith('/channels/a', expect.objectContaining({ meeting_history_access: 'meeting_start_members' }))
  await click('channel-header-overflow-trigger')
  await click('channel-header-settings')
  useSessionStore().user.is_admin = false
  await nextTick()
  api.patch.mockClear()
  await new DOMWrapper(document.body.querySelector('.n-modal')).findAll('button').find(button => button.text() === 'Save').trigger('click')
  await flushPromises()
  expect(api.patch).not.toHaveBeenCalled()
})

it('selection mode is activated by its menu action', async () => {
  await render()
  await click('channel-header-overflow-trigger')
  await click('channel-header-summary-toggle')
  await body().get('.summary-select').trigger('click')
  await flushPromises()
  expect(useMessageSummariesStore().selectionMode).toBe(true)
})
