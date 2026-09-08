import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import MessageInput from '../../src/components/MessageInput.vue'
import AppView from '../../src/views/AppView.vue'
import { useChannelsStore, useMessagesStore, useSessionStore } from '../../src/stores/index.js'
import api from '../../src/lib/api.js'
import { optimizeImageForUpload } from '../../src/lib/image-upload-optimizer.js'
import { componentContext, deferred } from '../helpers/mount-component.js'

vi.mock('../../src/lib/api.js', async (original) => ({
  ...await original(),
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  getCurrentUser: vi.fn(() => ({ id: 'alice' })),
  getPlatformStatus: vi.fn(async () => ({}))
}))
vi.mock('../../src/lib/image-upload-optimizer.js', () => ({ optimizeImageForUpload: vi.fn() }))
// Resolve this async leaf at the module boundary so no import survives teardown.
vi.mock('../../src/components/MessageList.vue', () => ({ default: { template: '<div />' } }))

let context, channels, messages
const uploaded = { id: 'upload', original_name: 'test.txt', mime_type: 'text/plain', url: 'https://storage.invalid/file' }
beforeEach(async () => {
  api.post.mockReset()
  context = await componentContext('/channels/a')
  useSessionStore().user = { id: 'alice', is_admin: false }
  useSessionStore().permissions = ['send_messages']
  channels = useChannelsStore()
  channels.channels = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
  channels.activeChannelId = 'a'
  messages = useMessagesStore()
  api.get.mockResolvedValue({ data: uploaded })
  api.post.mockImplementation(async (path, data) => ({ data: path === '/upload' ? uploaded : { id: 'sent', ...data } }))
  optimizeImageForUpload.mockImplementation(async (file) => ({ file: new File(['small'], file.name, { type: file.type }) }))
})
const mountComposer = () => context.mount(MessageInput, { global: { stubs: {
  MentionAutocomplete: true, VoiceRecorder: true, EmojiPicker: true, GifPicker: true
} } })
async function choose(wrapper, file) {
  const input = wrapper.get('input[type=file]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
  await flushPromises()
}

describe('MessageInput rendered interactions', () => {
  it('routes an actual drop through AppView into the composer upload path', async () => {
    useSessionStore().user.is_admin = true
    api.get.mockResolvedValue({ data: [] })
    const wrapper = context.mount(AppView, { global: { stubs: {
      ChannelHeader: true, MessageList: true, MemberList: true, ChannelPastMeetingsPanel: true,
      MentionAutocomplete: true, VoiceRecorder: true, EmojiPicker: true, GifPicker: true,
      ScreenShareControls: true, ScreenShareChatOverlay: true, MeetingScreenSharePanel: true
    } } })
    await flushPromises()
    const file = new File(['dropped'], 'drop.txt', { type: 'text/plain' })
    await wrapper.get('.chat-area').trigger('drop', { dataTransfer: { files: [file] } })
    await flushPromises()
    expect(api.post.mock.calls.find(([path]) => path === '/upload')[1].get('file').name).toBe('drop.txt')
    expect(wrapper.get('.pending-file-name').text()).toBe('test.txt')
  })

  it('keeps a direct upload attached to its original channel when navigation occurs during upload', async () => {
    const wrapper = mountComposer()
    const upload = deferred()
    api.post.mockReturnValueOnce(upload.promise)
    await choose(wrapper, new File(['file'], 'test.txt', { type: 'text/plain' }))
    channels.activeChannelId = 'b'
    await nextTick()
    upload.resolve({ data: uploaded })
    await flushPromises()
    expect(messages.getDraft('a').files.map(file => file.id)).toEqual(['upload'])
    expect(messages.getDraft('b').files).toEqual([])
  })

  it('retains channel drafts and clears only the successfully submitted channel during navigation', async () => {
    const wrapper = mountComposer()
    await wrapper.get('textarea').setValue('Draft A')
    await choose(wrapper, new File(['file'], 'test.txt', { type: 'text/plain' }))
    channels.activeChannelId = 'b'
    await flushPromises()
    await wrapper.get('textarea').setValue('Draft B')
    channels.activeChannelId = 'a'
    await flushPromises()
    expect(wrapper.get('textarea').element.value).toBe('Draft A')
    expect(wrapper.get('.pending-file-name').text()).toBe('test.txt')
    const pending = deferred()
    api.post.mockReturnValueOnce(pending.promise)
    await wrapper.get('[data-testid=message-send-button]').trigger('click')
    await flushPromises()
    channels.activeChannelId = 'b'
    await nextTick()
    pending.resolve({ data: { id: 'sent', channel_id: 'a', content: 'Draft A' } })
    await flushPromises()
    expect(messages.getDraft('a').text).toBe('')
    expect(messages.getDraft('a').files).toEqual([])
    expect(wrapper.get('textarea').element.value).toBe('Draft B')
    expect(api.post).toHaveBeenLastCalledWith('/messages', { channel_id: 'a', content: 'Draft A', file_ids: ['upload'] })
  })

  it('retains text and uploaded files after a send error, then permits retry', async () => {
    const wrapper = mountComposer()
    await wrapper.get('textarea').setValue('Retry me')
    await choose(wrapper, new File(['file'], 'test.txt', { type: 'text/plain' }))
    api.post.mockRejectedValueOnce(new Error('offline'))
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(window.$message.error).toHaveBeenCalled()
    expect(wrapper.get('textarea').element.value).toBe('Retry me')
    expect(wrapper.get('.pending-file-name').text()).toBe('test.txt')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(messages.getDraft('a').text).toBe('')
  })

  it.each(['archived', 'permission'])('blocks click and Enter sends when %s', async (reason) => {
    const wrapper = mountComposer()
    await wrapper.get('textarea').setValue('Blocked')
    if (reason === 'archived') channels.channels[0].is_archived = true
    else useSessionStore().permissions = []
    await nextTick()
    expect(wrapper.get('[data-testid=message-send-button]').attributes('disabled')).toBeDefined()
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(api.post).not.toHaveBeenCalled()
  })

  it.each([false, true])('uploads selected images with original quality %s', async (original) => {
    const wrapper = mountComposer()
    const file = new File(['original image bytes'], 'image.png', { type: 'image/png' })
    await choose(wrapper, file)
    expect(api.post).not.toHaveBeenCalled()
    if (original) await wrapper.get('.pending-image-quality-trigger').trigger('click')
    await wrapper.get('[data-testid=message-send-button]').trigger('click')
    await flushPromises()
    const form = api.post.mock.calls.find(([path]) => path === '/upload')[1]
    expect(form.get('file').size).toBe(original ? file.size : 5)
    expect(optimizeImageForUpload).toHaveBeenCalledTimes(original ? 0 : 1)
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('routes pasted images through staging and preserves failed uploads for retry', async () => {
    const wrapper = mountComposer()
    await flushPromises()
    const file = new File(['image'], 'paste.png', { type: 'image/png' })
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { items: [{ kind: 'file', type: file.type, getAsFile: () => file }] } })
    wrapper.get('textarea').element.dispatchEvent(event)
    await flushPromises()
    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.get('.pending-file-name').text()).toBe('paste.png')
    api.post.mockRejectedValueOnce(new Error('upload offline'))
    await wrapper.get('[data-testid=message-send-button]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.pending-image-upload-failed').exists()).toBe(true)
    expect(window.$message.error).toHaveBeenCalled()
    await wrapper.get('[data-testid=message-send-button]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.pending-image-upload').exists()).toBe(false)
  })

  it('releases removed and unmounted previews and detaches the paste listener', async () => {
    const wrapper = mountComposer()
    await choose(wrapper, new File(['image'], 'remove.png', { type: 'image/png' }))
    await wrapper.get('.pending-file-remove').trigger('click')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    await choose(wrapper, new File(['image'], 'unmount.png', { type: 'image/png' }))
    const textarea = wrapper.get('textarea').element
    const remove = vi.spyOn(textarea, 'removeEventListener')
    wrapper.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledWith('paste', expect.any(Function))
  })
})
