import { beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { NSelect } from 'naive-ui'
import MeetingView from '../../src/views/MeetingView.vue'
import { componentContext, deferred } from '../helpers/mount-component.js'
import MeetingInviteDialog from '../../src/components/meetings/MeetingInviteDialog.vue'
import { useMeetingsStore, useSessionStore, useVoiceStore, useUiStore, useMessagesStore, useChannelsStore } from '../../src/stores/index.js'
import api from '../../src/lib/api.js'

vi.mock('../../src/lib/api.js', async original => ({
  ...await original(), default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
  getCurrentUser: () => ({ id: 'alice' })
}))
let context, meeting
const panel = {
  props: ['maximized'], emits: ['hide', 'toggle-chat', 'toggle-maximize'],
  template: '<section data-testid="share-panel"><button data-testid="maximize" @click="$emit(\'toggle-maximize\')">Maximize</button><button data-testid="share-chat" @click="$emit(\'toggle-chat\')">Chat</button><button data-testid="hide-share" @click="$emit(\'hide\')">Hide</button><span>{{ maximized }}</span></section>'
}
const stubs = {
  MessageList: { template: '<div data-testid="chat-messages" />' }, MessageInput: true,
  MeetingVideoGrid: { props: ['variant', 'participants'], emits: ['hide-videos'], template: '<div data-testid="video-grid"><button data-testid="hide-videos" @click="$emit(\'hide-videos\')">Hide</button></div>' }, MemberList: true, VideoSettingsContent: true, TranscriptionRecordingBanner: true,
  MeetingScreenSharePanel: panel,
  MeetingSummaryPanel: { props: ['summaryArtifact', 'canShareInApp'], emits: ['share-summary'], template: '<div data-testid="summary-content">{{ summaryArtifact?.payload?.text }}<button v-if="canShareInApp" data-testid="share-summary" @click="$emit(\'share-summary\')">Share</button></div>' },
  MeetingTranscriptPanel: { template: '<div data-testid="transcript-content" />' }, AskMeetingPanel: true
}
beforeEach(async () => {
  api.get.mockReset(); api.patch.mockReset()
  context = await componentContext('/meetings/one', MeetingView)
  useSessionStore().user = { id: 'alice', is_admin: true }
  meeting = { id: 'one', title: 'Planning', host_user_id: 'alice', source_channel_id: 'source', chat_channel_id: 'chat', status: 'active', language: 'en', participants: [], artifacts: [], scheduled_start_at: '2099-01-01T10:00:00Z', scheduled_end_at: '2099-01-01T11:00:00Z' }
  api.get.mockImplementation(async path => ({ data: path.startsWith('/meetings/') ? { ...meeting, id: path.split('/').pop() } : [] }))
  api.patch.mockImplementation(async (path, payload) => ({ data: path.startsWith('/meetings/') ? { ...meeting, status: payload.action === 'end' ? 'ended' : payload.action === 'cancel' ? 'cancelled' : meeting.status } : {} }))
})
async function render() {
  const wrapper = context.mount(MeetingView, { global: { stubs } })
  await flushPromises()
  return wrapper
}

it('ignores a directory response after closing the invitation dialog and cleans pending timers', async () => {
  const pending = deferred()
  vi.spyOn(useSessionStore(), 'searchUsers').mockReturnValue(pending.promise)
  const wrapper = await render()
  await button(wrapper, 'Invite').trigger('click')
  await flushPromises()
  const dialog = wrapper.findComponent(MeetingInviteDialog)
  dialog.findComponent(NSelect).vm.$emit('search', 'late')
  await new Promise(resolve => setTimeout(resolve, 180))
  await button(new DOMWrapper(document.body.querySelector('.n-modal')), 'Cancel').trigger('click')
  await nextTick()
  pending.resolve([{ id: 'late', display_name: 'Late result' }])
  await flushPromises()
  expect(dialog.vm.inviteSearchResults).toEqual([])
  await button(wrapper, 'Invite').trigger('click')
  await flushPromises()
  dialog.findComponent(NSelect).vm.$emit('search', 'pending')
  wrapper.unmount()
  expect(dialog.vm.inviteSearchTimer).toBeNull()
})

it('keeps meeting and share context when navigating to the separate screenshare route', async () => {
  await render()
  useUiStore().setScreenShareMaximized(true)
  await context.router.push('/meetings/one/screenshare')
  await flushPromises()
  expect(useMeetingsStore().activeMeeting?.id).toBe('one')
  expect(useUiStore().maximizeScreenShare).toBe(true)
})

it('opens query evidence in the history surface and ignores an old evidence load after navigation', async () => {
  meeting.status = 'ended'
  meeting.artifacts = [{ artifact_type: 'summary', status: 'ready', payload: { text: 'Summary' } }, { artifact_type: 'transcript', status: 'ready', payload: {} }]
  const pending = deferred()
  const messages = useMessagesStore()
  vi.spyOn(messages, 'loadAroundMessage').mockReturnValue(pending.promise)
  const wrapper = await render()
  await context.router.push('/meetings/one?message=message-one&transcript_start_ms=1000')
  await flushPromises()
  expect(messages.loadAroundMessage).toHaveBeenCalledWith('message-one', { channelId: 'chat' })
  await context.router.push('/meetings/two')
  await flushPromises()
  pending.resolve()
  await flushPromises()
  expect(useMeetingsStore().activeMeeting.id).toBe('two')
  expect(wrapper.find('[data-testid=summary-content]').exists()).toBe(true)
  expect(wrapper.find('[data-testid=transcript-content]').exists()).toBe(false)
})
function button(wrapper, label) {
  const found = wrapper.findAll('button').find(b => b.text() === label)
  expect(found, `button ${label}`).toBeTruthy()
  return found
}

it('switches the live stage between video and share focus and hides video outside the connected call', async () => {
  const wrapper = await render()
  const voice = useVoiceStore()
  expect(wrapper.find('[data-testid=video-grid]').exists()).toBe(false)
  voice.channelId = 'chat'; voice.connected = true; voice.meetingVideoEnabled = true
  await flushPromises()
  expect(wrapper.get('[data-testid=meeting-live-stage]').classes()).toContain('video-focused')
  voice.screenSharesByChannel = { chat: [{ participantId: 'bob', track: {}, isLocal: false }] }
  await flushPromises()
  expect(wrapper.get('[data-testid=meeting-live-stage]').classes()).toContain('share-focused')
  await wrapper.get('[data-testid=hide-videos]').trigger('click')
  expect(wrapper.find('[data-testid=video-grid]').exists()).toBe(false)
  expect(wrapper.find('[data-testid=share-panel]').exists()).toBe(true)
  voice.connected = false
  await flushPromises()
  expect(wrapper.find('[data-testid=video-grid]').exists()).toBe(false)
})

it('shows camera errors from the mobile video drawer and releases viewport listeners', async () => {
  const remove = vi.fn()
  const removeWindowListener = vi.spyOn(window, 'removeEventListener')
  window.matchMedia.mockImplementation(query => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: remove }))
  const voice = useVoiceStore()
  voice.channelId = 'chat'; voice.connected = true; voice.meetingVideoEnabled = true
  vi.spyOn(voice, 'toggleCamera').mockRejectedValue(new Error('camera denied'))
  const wrapper = await render()
  await wrapper.get('[data-testid=meeting-mobile-overflow-trigger]').trigger('click')
  await flushPromises()
  await new DOMWrapper(document.body).get('[data-testid=meeting-mobile-video-controls]').trigger('click')
  await flushPromises()
  await new DOMWrapper(document.body).get('[data-testid=meeting-video-mobile-toggle-camera]').trigger('click')
  await flushPromises()
  expect(window.$message.error).toHaveBeenCalled()
  expect(voice.cameraEnabled).toBe(false)
  wrapper.unmount()
  expect(remove).toHaveBeenCalledWith('change', expect.any(Function))
  expect(removeWindowListener).toHaveBeenCalledWith('resize', expect.any(Function))
})

it('keeps guests out of the meeting invitation directory', async () => {
  const wrapper = await render()
  api.get.mockResolvedValue({ data: [{ id: 'member', display_name: 'Member', account_type: 'member' }, { id: 'guest', display_name: 'Guest', account_type: 'guest' }] })
  await button(wrapper, 'Invite').trigger('click')
  await flushPromises()
  expect(wrapper.findComponent(NSelect).props('options')).toEqual([{ value: 'member', label: 'Member' }])
})

it.each([false, true])('shares a summary with its meeting link and guards guests (guest=%s)', async guest => {
  meeting.status = 'ended'
  meeting.artifacts = [{ artifact_type: 'summary', status: 'ready', payload: { markdown: 'Decision: ship Friday' } }]
  useChannelsStore().channels = [{ id: 'destination', name: 'Destination' }]
  const send = vi.spyOn(useMessagesStore(), 'sendToChannel').mockResolvedValue({})
  const wrapper = await render()
  await wrapper.get('[data-testid=share-summary]').trigger('click')
  await flushPromises()
  wrapper.findComponent(NSelect).vm.$emit('update:value', 'destination')
  if (guest) useSessionStore().user.account_type = 'guest'
  await nextTick()
  const modal = new DOMWrapper(document.body.querySelector('.n-modal'))
  await button(modal, wrapper.vm.$t('ui.views.share_in_nebulynk')).trigger('click')
  await flushPromises()
  if (guest) {
    expect(send).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid=share-summary]').exists()).toBe(false)
  } else expect(send).toHaveBeenCalledWith('destination', expect.stringMatching(/^Meeting: .*\/meetings\/one\n\nDecision: ship Friday$/))
})

it.each([
  ['scheduled', 'Cancel meeting', 'End meeting'],
  ['active', 'End meeting', 'Cancel meeting'],
  ['ended', null, 'End meeting'],
  ['cancelled', null, 'Cancel meeting']
])('renders available actions for %s and sends the matching action', async (status, available, absent) => {
  meeting.status = status
  const wrapper = await render()
  expect(wrapper.findAll('button').some(b => b.text() === absent)).toBe(false)
  if (available) {
    await button(wrapper, available).trigger('click')
    await flushPromises()
    expect(api.patch).toHaveBeenCalledWith('/meetings/one', { action: status === 'active' ? 'end' : 'cancel' })
  }
})

it('shows a failed end action and keeps the active meeting recoverable', async () => {
  const wrapper = await render()
  api.patch.mockRejectedValueOnce(new Error('offline'))
  await button(wrapper, 'End meeting').trigger('click')
  await flushPromises()
  expect(window.$message.error).toHaveBeenCalled()
  expect(useMeetingsStore().activeMeeting.status).toBe('active')
  expect(button(wrapper, 'End meeting').attributes('disabled')).toBeUndefined()
})

it('gates transcript tabs by artifact availability and denies protected content', async () => {
  meeting.status = 'ended'
  meeting.artifacts = [{ artifact_type: 'summary', status: 'ready', payload: { text: 'Summary' } }, { artifact_type: 'transcript', status: 'ready', payload: {} }]
  const wrapper = await render()
  await wrapper.get('[data-testid=meeting-artifact-tab-transcript]').trigger('click')
  expect(wrapper.find('[data-testid=transcript-content]').exists()).toBe(true)
  await wrapper.get('[data-testid=meeting-artifact-tab-summary]').trigger('click')
  expect(wrapper.find('[data-testid=summary-content]').exists()).toBe(true)
  useMeetingsStore().activeMeeting = { ...meeting, artifacts: [] }
  await flushPromises()
  expect(wrapper.find('[data-testid=meeting-artifact-tab-transcript]').exists()).toBe(false)
  useMeetingsStore().activeMeeting = { ...meeting, content_access: { allowed: false } }
  await flushPromises()
  expect(wrapper.find('[data-testid=meeting-access-restricted]').exists()).toBe(true)
  expect(wrapper.find('[data-testid=chat-messages]').exists()).toBe(false)
  expect(wrapper.find('[data-testid=summary-content]').exists()).toBe(false)
})

it('runs share hide, maximize and overlay events and resets state on meeting navigation', async () => {
  const wrapper = await render()
  const voice = useVoiceStore(), ui = useUiStore()
  voice.channelId = 'chat'; voice.connected = true
  voice.screenSharesByChannel = { chat: [{ participantId: 'bob', track: {}, isLocal: false }] }
  await flushPromises()
  await wrapper.get('[data-testid=maximize]').trigger('click')
  expect(ui.maximizeScreenShare).toBe(true)
  await wrapper.get('[data-testid=share-chat]').trigger('click')
  expect(ui.showScreenShareChat).toBe(true)
  expect(wrapper.find('[data-testid=meeting-screen-share-chat-overlay]').exists()).toBe(true)
  await wrapper.get('[data-testid=hide-share]').trigger('click')
  expect(ui.hideScreenSharePanel).toBe(true)
  expect(wrapper.find('[data-testid=share-panel]').exists()).toBe(false)
  ui.resetScreenShareVisibility()
  await nextTick()
  await context.router.push('/meetings/two')
  await flushPromises()
  expect(useMeetingsStore().activeMeeting.id).toBe('two')
  expect(ui.maximizeScreenShare).toBe(false)
  expect(ui.showScreenShareChat).toBe(false)
  await context.router.push('/channels/source')
  await flushPromises()
  expect(useMeetingsStore().activeMeeting).toBeNull()
})

it('invites selected users to the current meeting and retains selection after failure', async () => {
  const session = useSessionStore()
  session.users = [{ id: 'bob', display_name: 'Bob' }, { id: 'carol', display_name: 'Carol' }]
  const wrapper = await render()
  await button(wrapper, 'Invite').trigger('click')
  await flushPromises()
  const select = wrapper.findComponent(NSelect)
  // Exercise the select's public change event; the view and real store assemble the request.
  select.vm.$emit('update:value', ['bob', 'carol'])
  await nextTick()
  const body = new DOMWrapper(document.body.querySelector('.n-modal'))
  api.patch.mockRejectedValueOnce(new Error('offline'))
  await button(body, 'Invite').trigger('click')
  await flushPromises()
  expect(window.$message.error).toHaveBeenCalled()
  expect(select.props('value')).toEqual(['bob', 'carol'])
  await button(body, 'Invite').trigger('click')
  await flushPromises()
  expect(api.patch).toHaveBeenCalledWith('/meetings/one', { action: 'invite', user_ids: ['bob', 'carol'] })
})

it('cancels a pending directory search and releases the viewport listener on unmount', async () => {
  const wrapper = await render()
  await button(wrapper, 'Invite').trigger('click')
  await flushPromises()
  const remove = vi.spyOn(window, 'removeEventListener')
  vi.useFakeTimers()
  wrapper.findComponent(NSelect).vm.$emit('search', 'Carol')
  await nextTick()
  const timer = wrapper.findComponent({ name: 'MeetingInviteDialog' }).vm.inviteSearchTimer
  expect(timer).not.toBeNull()
  const clear = vi.spyOn(window, 'clearTimeout')
  wrapper.unmount()
  expect(clear).toHaveBeenCalledWith(timer)
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  api.get.mockClear()
  await vi.advanceTimersByTimeAsync(200)
  expect(api.get).not.toHaveBeenCalled()
})
