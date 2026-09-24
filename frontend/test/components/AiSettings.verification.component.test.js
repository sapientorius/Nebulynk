import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import AiSettings from '../../src/components/admin/AiSettings.vue'
import { componentContext } from '../helpers/mount-component.js'
import { useAdminStore } from '../../src/stores/admin.js'

const wrappers = []
afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount()
  wrappers.length = 0
  vi.restoreAllMocks()
})

async function render() {
  const context = await componentContext('/admin')
  const store = useAdminStore()
  store.aiProviderInstances = [{ id: 'provider-1', display_name: 'OpenAI', provider_label: 'OpenAI', enabled: true, capabilities: { meeting_summary: true, transcription: true, image_generation: true } }]
  store.aiFunctionConfigs = ['meeting_summary', 'chat_summary', 'transcription', 'image_generation'].map((functionKey) => ({
    function_key: functionKey,
    enabled: functionKey === 'meeting_summary',
    provider_instance_id: functionKey === 'meeting_summary' ? 'provider-1' : null,
    model: functionKey === 'meeting_summary' ? 'gpt-5.6-luna' : null,
    verification_status: functionKey === 'meeting_summary' ? 'verified' : 'unverified',
    verified_at: functionKey === 'meeting_summary' ? '2026-09-23T10:00:00.000Z' : null
  }))
  vi.spyOn(store, 'refreshAiProviderInstances').mockResolvedValue()
  vi.spyOn(store, 'refreshAiFunctionConfigs').mockResolvedValue()
  vi.spyOn(store, 'loadAiProviderModels').mockResolvedValue()
  const wrapper = context.mount(AiSettings)
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, store }
}

it('shows verified status and switches to unverified when the selected model changes', async () => {
  const { wrapper } = await render()
  expect(wrapper.findAll('[data-testid="ai-verification-status"]')[1].text()).toContain('Model verified')
  wrapper.vm.onFunctionModelChange('meeting_summary', 'future-model')
  await flushPromises()
  expect(wrapper.findAll('[data-testid="ai-verification-status"]')[1].text()).toContain('Model unverified')
})

it('keeps the draft and shows the provider verification reason when saving fails', async () => {
  const { wrapper, store } = await render()
  vi.spyOn(store, 'updateAiFunctionConfig').mockRejectedValue({
    message: 'Verification failed',
    response: { data: { error_params: { reason: 'Parameter response_format wird vom Modell nicht akzeptiert' } } }
  })
  wrapper.vm.onFunctionModelChange('meeting_summary', 'future-model')
  await wrapper.vm.saveFunction('meeting_summary')
  await flushPromises()
  expect(wrapper.vm.functionForms.meeting_summary.model).toBe('future-model')
  expect(wrapper.get('[data-testid="ai-verification-error"]').text()).toContain('response_format')
})

it('warns that activating image generation runs a paid test image', async () => {
  const { wrapper } = await render()
  wrapper.vm.functionForms.image_generation.enabled = true
  await flushPromises()
  expect(wrapper.text()).toContain('Saving generates a test image and may incur API charges.')
})
