import { beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises } from '@vue/test-utils'
import MeetingSummaryEditor from '../../src/components/MeetingSummaryEditor.vue'
import MeetingSummaryHistory from '../../src/components/MeetingSummaryHistory.vue'
import VoiceRecorder from '../../src/components/VoiceRecorder.vue'
import { useChannelsStore, useMessagesStore, useMeetingsStore, useSessionStore } from '../../src/stores/index.js'
import api from '../../src/lib/api.js'
import { componentContext, deferred } from '../helpers/mount-component.js'

vi.mock('../../src/lib/api.js', async original => ({ ...await original(),
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  getPlatformStatus: vi.fn(async () => ({})), getCurrentUser: () => ({ id: 'host' })
}))
const payload = { language: 'de', mini_summary: 'Korrigierter Begriff.', summary_points: ['Korrigierter Begriff.'], decisions: [], open_items: [], topic_chapters: [], markdown: 'Korrigierter Begriff.' }
let context, body
beforeEach(async () => {
  context = await componentContext('/meetings/meeting')
  useSessionStore().user = { id: 'host' }
  useSessionStore().permissions = []
  useChannelsStore().activeChannelId = 'chat'
  useChannelsStore().channels = [{ id: 'chat', is_archived: true }]
  useMessagesStore().setDraftText('chat', 'Keep chat draft')
  vi.spyOn(useMeetingsStore(), 'ensureMeetingLoaded').mockResolvedValue({})
  api.post.mockReset(); api.patch.mockReset(); api.get.mockReset()
  api.post.mockResolvedValue({ data: { id: 'draft-1', meeting_id: 'meeting', payload, change_summary: 'Begriff berichtigt.' } })
  api.patch.mockResolvedValue({ data: { applied: true } })
  api.get.mockResolvedValue({ data: { data: [], total: 0 } })
  body = new DOMWrapper(document.body)
})
async function editor() {
  const wrapper = context.mount(MeetingSummaryEditor, { props: { show: true, meetingId: 'meeting' }, global: { stubs: { VoiceRecorder: true } } })
  await flushPromises()
  return wrapper
}
async function propose(text) {
  await body.get('[data-testid=instruction-input-textarea]').setValue(text)
  await body.get('[data-testid=instruction-submit]').trigger('click')
  await flushPromises()
}

it('creates and refines a private proposal, then applies with publication disabled without touching chat drafts', async () => {
  const wrapper = await editor()
  expect(body.get('[data-testid=summary-edit-apply]').attributes('disabled')).toBeDefined()
  expect(body.find('[data-testid=message-markdown-toolbar]').exists()).toBe(false)
  expect(body.find('input[type=file]').exists()).toBe(false)
  await propose('Begriff berichtigen')
  expect(api.post).toHaveBeenLastCalledWith('/meeting-summary-revisions', { meeting_id: 'meeting', instructions: 'Begriff berichtigen' })
  expect(body.get('[data-testid=summary-edit-preview]').text()).toContain('Korrigierter Begriff.')
  await propose('Auch den Kontext präzisieren')
  expect(api.post).toHaveBeenLastCalledWith('/meeting-summary-revisions', { meeting_id: 'meeting', instructions: 'Auch den Kontext präzisieren', parent_revision_id: 'draft-1' })
  await body.get('[data-testid=summary-edit-publish]').trigger('click')
  await body.get('[data-testid=summary-edit-apply]').trigger('click')
  await flushPromises()
  expect(api.patch).toHaveBeenCalledWith('/meeting-summary-revisions/draft-1', { action: 'apply', publish_change: false })
  expect(wrapper.emitted('applied')).toHaveLength(1)
  expect(useMessagesStore().getDraft('chat').text).toBe('Keep chat draft')
})

it('inserts dictated instructions into the independent editable field and does not submit automatically', async () => {
  const wrapper = await editor()
  await body.get('[data-testid=instruction-voice-to-text]').trigger('click')
  api.post.mockResolvedValueOnce({ data: { text: 'Diktierte Korrektur' } })
  wrapper.findComponent(VoiceRecorder).vm.$emit('submit', { file: new File(['voice'], 'voice.webm', { type: 'audio/webm' }), mode: 'voice-to-text', durationMs: 500 })
  await flushPromises()
  const [path, form] = api.post.mock.calls[0]
  expect(path).toBe('/voice-drafts/transcribe')
  expect(form.get('meeting_id')).toBe('meeting')
  expect(form.get('channel_id')).toBeNull()
  expect(body.get('[data-testid=instruction-input-textarea]').element.value).toBe('Diktierte Korrektur')
  expect(api.post).toHaveBeenCalledTimes(1)
  expect(useMessagesStore().getDraft('chat').text).toBe('Keep chat draft')
})

it('discards proposals without applying them and defaults each editing session to publication', async () => {
  const wrapper = await editor()
  await propose('Korrigieren')
  await body.get('[data-testid=summary-edit-discard]').trigger('click')
  expect(api.patch).not.toHaveBeenCalled()
  expect(wrapper.emitted('update:show').at(-1)).toEqual([false])
  expect(wrapper.vm.publishChange).toBe(true)
})

it('keeps instructions on generation errors and clears stale previews so a new proposal can be created', async () => {
  const wrapper = await editor()
  api.post.mockRejectedValueOnce(new Error('Offline'))
  await propose('Keep instruction')
  expect(body.get('[data-testid=instruction-input-textarea]').element.value).toBe('Keep instruction')
  expect(body.get('[data-testid=summary-edit-error]').text()).toContain('has not changed')
  await propose('Retry')
  api.patch.mockRejectedValueOnce({ response: { data: { error_code: 'api.summary_revisions.stale' } } })
  await body.get('[data-testid=summary-edit-apply]').trigger('click')
  await flushPromises()
  expect(wrapper.vm.preview).toBeNull()
  expect(body.get('[data-testid=summary-edit-error]').text()).toContain('Create a new preview')
  await propose('Start fresh')
  expect(api.post).toHaveBeenLastCalledWith('/meeting-summary-revisions', { meeting_id: 'meeting', instructions: 'Start fresh' })
})

it('ignores an old model response after switching meetings', async () => {
  const Host = { components: { MeetingSummaryEditor }, data: () => ({ meetingId: 'meeting' }), template: '<MeetingSummaryEditor :show="true" :meeting-id="meetingId" />' }
  const wrapper = context.mount(Host, { global: { stubs: { VoiceRecorder: true } } }), pending = deferred()
  await flushPromises()
  api.post.mockReturnValueOnce(pending.promise)
  await propose('Pending')
  wrapper.vm.meetingId = 'other-meeting'
  await flushPromises()
  pending.resolve({ data: { id: 'old', payload, change_summary: 'Old result' } })
  await flushPromises()
  expect(wrapper.findComponent(MeetingSummaryEditor).vm.preview).toBeNull()
})

it('loads paginated public history and reloads it after summary updates', async () => {
  api.get.mockResolvedValue({ data: { data: [{ id: 'change', user_display_name: 'Editor', applied_at: '2026-10-01T10:00:00Z', change_summary: 'Term corrected.' }], total: 11 } })
  const wrapper = context.mount(MeetingSummaryHistory, { props: { meetingId: 'meeting' } })
  await flushPromises()
  expect(wrapper.get('[data-testid=summary-change-entry]').text()).toContain('Editor')
  expect(wrapper.get('[data-testid=summary-change-entry]').text()).toContain('Term corrected.')
  const next = wrapper.findAll('button').find(button => button.attributes('aria-label')?.includes('next'))
  if (next) await next.trigger('click')
  else wrapper.findComponent({ name: 'Pagination' }).vm.$emit('update:page', 2)
  await flushPromises()
  expect(api.get).toHaveBeenLastCalledWith('/meeting-summary-revisions', { params: { meeting_id: 'meeting', $limit: 10, $skip: 10 } })
})
