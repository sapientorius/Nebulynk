import { describe, expect, it } from 'vitest'
import { buildSearchAuthorOptions } from '../../src/lib/search-author-options.js'

describe('buildSearchAuthorOptions', () => {
  it('shows default directory users when no search term is active', () => {
    const options = buildSearchAuthorOptions({
      defaultUsers: [
        { id: 'user-2', display_name: 'Bob' },
        { id: 'user-1', display_name: 'Alice' }
      ]
    })

    expect(options).toEqual([
      { label: 'Bob', value: 'user-2' },
      { label: 'Alice', value: 'user-1' }
    ])
  })

  it('keeps the selected author visible even when missing from default users', () => {
    const options = buildSearchAuthorOptions({
      selectedUserId: 'user-9',
      defaultUsers: [{ id: 'user-2', display_name: 'Bob' }]
    })

    expect(options).toEqual([
      { label: 'user-9', value: 'user-9' },
      { label: 'Bob', value: 'user-2' }
    ])
  })

  it('prefers remote search results over default users when a search term exists', () => {
    const options = buildSearchAuthorOptions({
      selectedUserId: 'user-1',
      selectedUser: { id: 'user-1', display_name: 'Alice' },
      defaultUsers: [{ id: 'user-2', display_name: 'Bob' }],
      searchResults: [{ id: 'user-3', display_name: 'Charlie' }],
      searchTerm: 'cha'
    })

    expect(options).toEqual([
      { label: 'Alice', value: 'user-1' },
      { label: 'Charlie', value: 'user-3' }
    ])
  })

  it('deduplicates duplicate users across selected and source lists', () => {
    const options = buildSearchAuthorOptions({
      selectedUserId: 'user-2',
      selectedUser: { id: 'user-2', display_name: 'Bob' },
      defaultUsers: [
        { id: 'user-2', display_name: 'Bob' },
        { id: 'user-1', display_name: 'Alice' },
        { id: 'user-1', display_name: 'Alice' }
      ]
    })

    expect(options).toEqual([
      { label: 'Bob', value: 'user-2' },
      { label: 'Alice', value: 'user-1' }
    ])
  })

  it('filters guest users out of selected and default author options', () => {
    const options = buildSearchAuthorOptions({
      selectedUserId: 'guest-1',
      selectedUser: { id: 'guest-1', display_name: 'Guest', account_type: 'guest' },
      defaultUsers: [
        { id: 'guest-2', display_name: 'Other Guest', account_type: 'guest' },
        { id: 'user-1', display_name: 'Alice', account_type: 'member' }
      ]
    })

    expect(options).toEqual([
      { label: 'Alice', value: 'user-1' }
    ])
  })
})
