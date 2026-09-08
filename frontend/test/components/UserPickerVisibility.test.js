import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('static source contract: workspace user pickers stay member-only', () => {
  it('uses the shared directory-only session helpers across picker entry points', () => {
    const newDmSource = readFileSync(resolve('src/components/NewDmModal.vue'), 'utf8')
    const memberListSource = readFileSync(resolve('src/components/MemberList.vue'), 'utf8')
    const sidebarSource = readFileSync(resolve('src/components/ChannelSidebar.vue'), 'utf8')

    expect(newDmSource).toContain('this.sessionStore.getDefaultDirectoryUsers(30)')
    expect(memberListSource).toContain('this.sessionStore.getDefaultDirectoryUsers(20)')
    expect(sidebarSource).toContain('this.sessionStore.getDirectoryUsersByIds(this.newChannel.initial_user_ids)')
    expect(sidebarSource).toContain('this.sessionStore.getDefaultDirectoryUsers(20)')
  })

  it('clears stale guest author filters and keeps search author options guest-free', () => {
    const dialogSource = readFileSync(resolve('src/components/GlobalSearchDialog.vue'), 'utf8')
    const optionSource = readFileSync(resolve('src/lib/search-author-options.js'), 'utf8')

    expect(dialogSource).toContain('defaultUsers: this.sessionStore.getDefaultDirectoryUsers(20)')
    expect(dialogSource).toContain('clearGuestAuthorFilter()')
    expect(dialogSource).toContain("this.searchStore.setFilter('fromUserId', '')")
    expect(dialogSource).toContain("'searchStore.filters.fromUserId'()")
    expect(optionSource).toContain("if (user?.account_type === 'guest') return null")
  })
})
