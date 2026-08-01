import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AiSettings source contract', () => {
  it('includes provider management and function assignment controls', () => {
    const source = readFileSync(resolve('src/components/admin/AiSettings.vue'), 'utf8')

    expect(source).toContain('data-testid="ai-settings-panel"')
    expect(source).toContain('data-testid="ai-provider-add"')
    expect(source).toContain('data-testid="ai-provider-type-select"')
    expect(source).toContain('data-testid="ai-provider-base-url"')
    expect(source).toContain("providerForm.provider_type === 'openai_compatible'")
    expect(source).toContain('data-testid="ai-refresh-models"')
    expect(source).toContain("const FUNCTION_KEYS = ['transcription', 'meeting_summary', 'chat_summary', 'image_generation']")
    expect(source).toContain('chat_summary: {')
    expect(source).toContain("if (functionKey === 'image_generation') return 'image_generation'")
    expect(source).toContain('model.capabilities?.includes(this.getCapability(functionKey))')
  })
})
