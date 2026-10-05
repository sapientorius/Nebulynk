import { beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises } from '@vue/test-utils'
import NotificationsPanel from '../../src/components/NotificationsPanel.vue'
import MeetingHistorySurface from '../../src/components/meetings/MeetingHistorySurface.vue'
import { useNotificationsStore, useMeetingsStore, useSessionStore, useChannelsStore } from '../../src/stores/index.js'
import api from '../../src/lib/api.js'
import { componentContext } from '../helpers/mount-component.js'

vi.mock('../../src/lib/api.js', async original => ({ ...await original(),
  default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
  getPlatformStatus: vi.fn(async () => ({})), getCurrentUser: () => ({ id: 'host' })
}))

const meeting = {
  id: 'meeting', title: 'Weekly', status: 'ended', chat_channel_id: 'chat', host_user_id: 'host',
  content_access: { allowed: true }, participants: [],
  artifacts: [
    { artifact_type: 'summary', status: 'ready', payload: { mini_summary: 'Finished summary', summary_points: [], markdown: 'Finished summary' } },
    { artifact_type: 'transcript', status: 'ready', payload: { segments: [] } }
  ]
}
let context, body
beforeEach(async () => {
  context = await componentContext('/meetings/meeting')
  body = new DOMWrapper(document.body)
  useSessionStore().user = { id: 'host' }
  useSessionStore().permissions = []
  useChannelsStore().activeChannelId = 'chat'
  useMeetingsStore().meetings = [meeting]
  vi.spyOn(useMeetingsStore(), 'loadQuestions').mockResolvedValue([])
  api.get.mockReset(); api.patch.mockReset()
  api.get.mockResolvedValue({ data: { data: [], total: 0 } })
  api.patch.mockResolvedValue({ data: { updated: 1 } })
})

it('renders summaries independently of invitation cards and opens the summary tab', async () => {
  const notifications = useNotificationsStore()
  const items = [
    { id: 'summary', type: 'meeting_summary_ready', meeting_id: 'meeting', channel_id: 'chat', actor_display_name: 'Nebulynk', message_snippet: 'The summary for “Weekly” is ready.', is_read: false, created_at: new Date().toISOString() },
    { id: 'invite', type: 'meeting_invite', meeting_id: 'meeting', channel_id: 'chat', actor_display_name: 'Host', is_read: false, created_at: new Date().toISOString() }
  ]
  api.get.mockResolvedValue({ data: { data: items, unread_total: 2 } })
  notifications.notifications = items
  notifications.showPanel = true
  context.mount(NotificationsPanel)
  await flushPromises()
  const summary = body.get('[data-notification-id=summary]')
  expect(summary.text()).toContain('Meeting summary ready')
  expect(summary.text()).toContain('The summary for “Weekly” is ready.')
  expect(summary.find('[data-testid=notification-meeting-card]').exists()).toBe(false)
  expect(body.get('[data-notification-id=invite]').find('[data-testid=notification-meeting-card]').exists()).toBe(true)
  await summary.trigger('click')
  await flushPromises()
  expect(context.router.currentRoute.value.fullPath).toBe('/meetings/meeting?tab=summary')
  expect(notifications.notifications.find(row => row.id === 'summary').is_read).toBe(true)
  expect(notifications.notifications.find(row => row.id === 'invite').is_read).toBe(false)
})

it('opens a summary deep link on an already open meeting and reads only the mounted summary', async () => {
  await context.router.push('/meetings/meeting?tab=transcript')
  const wrapper = context.mount(MeetingHistorySurface, { props: { meeting }, global: { stubs: { MessageInput: true, MessageList: true, MeetingTranscriptPanel: true, AskMeetingPanel: true } } })
  await flushPromises()
  expect(wrapper.find('[data-testid=meeting-summary-panel]').exists()).toBe(false)
  expect(api.patch).not.toHaveBeenCalled()
  await context.router.push('/meetings/meeting?tab=summary')
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.find('[data-testid=meeting-summary-panel]').exists()).toBe(true))
  expect(wrapper.get('[data-testid=meeting-summary-panel]').text()).toContain('Finished summary')
  expect(api.patch).toHaveBeenCalledWith('/notifications', { is_read: true }, {
    params: { is_read: false, meeting_id: 'meeting', type: 'meeting_summary_ready' }
  })
  api.patch.mockClear()
  await wrapper.get('[data-testid=meeting-artifact-tab-transcript]').trigger('click')
  await flushPromises()
  expect(context.router.currentRoute.value.query.tab).toBe('transcript')
  useNotificationsStore().ingestIncomingNotification({ id: 'late', type: 'meeting_summary_ready', meeting_id: 'meeting', is_read: false })
  await flushPromises()
  expect(api.patch).not.toHaveBeenCalled()
  expect(useNotificationsStore().notifications[0].is_read).toBe(false)
  await context.router.push('/meetings/meeting?tab=summary')
  await flushPromises()
  await vi.waitFor(() => expect(useNotificationsStore().notifications[0].is_read).toBe(true))
})

it('does not mark summary notifications read without content access', async () => {
  context.mount(MeetingHistorySurface, { props: { meeting: { ...meeting, content_access: { allowed: false } } },
    global: { stubs: { MessageInput: true, MessageList: true, MeetingTranscriptPanel: true, AskMeetingPanel: true } } })
  await flushPromises()
  expect(api.patch).not.toHaveBeenCalled()
})
