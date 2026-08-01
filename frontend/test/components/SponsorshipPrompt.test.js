import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('SponsorshipPrompt', () => {
  it('uses a dismissible modal with a safe external sponsorship link', () => {
    const source = readFileSync(resolve('src/components/SponsorshipPrompt.vue'), 'utf8')

    expect(source).toContain('<n-modal')
    expect(source).toContain('data-testid="sponsorship-prompt"')
    expect(source).toContain(':show="show"')
    expect(source).toContain(':mask-closable="false"')
    expect(source).toContain(':close-on-esc="true"')
    expect(source).toContain('closable')
    expect(source).toContain('@close="close"')
    expect(source).toContain("$t('sponsorship.owner_note')")
    expect(source).toContain('href="https://nebulynk.net/sponsorship"')
    expect(source).toContain('target="_blank"')
    expect(source).toContain('rel="noopener noreferrer"')
    expect(source).toContain('data-testid="sponsorship-prompt-dismiss"')
    expect(source).toContain("emits: ['close']")
    expect(source).toContain('onModalVisibilityChange(visible)')
    expect(source).not.toContain('sponsorship-prompt-disable')
    expect(source).not.toContain('updateSponsorshipPromptPreference')
    expect(source).not.toContain("sponsorship.disable_action")
  })
})
