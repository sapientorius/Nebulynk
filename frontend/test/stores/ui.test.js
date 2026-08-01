import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from '../../src/stores/ui.js'

describe('ui store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults every sidebar section to expanded and persists toggles to localStorage', () => {
    const store = useUiStore()

    expect(store.isSidebarSectionExpanded('channels')).toBe(true)
    expect(store.isSidebarSectionExpanded('meetings')).toBe(true)
    expect(store.isSidebarSectionExpanded('voiceChannels')).toBe(true)
    expect(store.isSidebarSectionExpanded('directMessages')).toBe(true)

    store.setSidebarSectionExpanded('meetings', false)
    store.toggleSidebarSection('directMessages')

    expect(JSON.parse(localStorage.getItem('sidebarSectionsExpanded'))).toEqual({
      channels: true,
      meetings: false,
      voiceChannels: true,
      directMessages: false
    })
  })

  it('hydrates persisted sidebar section visibility on a fresh store instance', () => {
    localStorage.setItem('sidebarSectionsExpanded', JSON.stringify({
      channels: false,
      meetings: true,
      voiceChannels: false,
      directMessages: true,
      ignored: true
    }))

    setActivePinia(createPinia())
    const store = useUiStore()

    expect(store.isSidebarSectionExpanded('channels')).toBe(false)
    expect(store.isSidebarSectionExpanded('meetings')).toBe(true)
    expect(store.isSidebarSectionExpanded('voiceChannels')).toBe(false)
    expect(store.isSidebarSectionExpanded('directMessages')).toBe(true)
  })

  it('opens, closes, and resets the sponsorship prompt', () => {
    const store = useUiStore()

    expect(store.showSponsorshipPrompt).toBe(false)
    store.openSponsorshipPrompt()
    expect(store.showSponsorshipPrompt).toBe(true)
    store.closeSponsorshipPrompt()
    expect(store.showSponsorshipPrompt).toBe(false)
    store.openSponsorshipPrompt()
    store.reset()
    expect(store.showSponsorshipPrompt).toBe(false)
  })
})
