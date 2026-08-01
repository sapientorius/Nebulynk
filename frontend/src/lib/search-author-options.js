function toOption(user, fallbackId = null) {
  if (user?.account_type === 'guest') return null
  const userId = user?.id || fallbackId || null
  if (!userId) return null

  return {
    label: user?.display_name || userId,
    value: userId
  }
}

export function buildSearchAuthorOptions({
  selectedUserId = null,
  selectedUser = null,
  defaultUsers = [],
  searchResults = [],
  searchTerm = ''
} = {}) {
  const normalizedSearchTerm = typeof searchTerm === 'string' ? searchTerm.trim() : ''
  const sourceUsers = normalizedSearchTerm
    ? (Array.isArray(searchResults) ? searchResults : [])
    : (Array.isArray(defaultUsers) ? defaultUsers : [])

  const options = []
  const seenUserIds = new Set()

  for (const entry of [selectedUser || null, ...sourceUsers]) {
    const option = toOption(entry, entry ? null : selectedUserId)
    if (!option || seenUserIds.has(option.value)) continue
    seenUserIds.add(option.value)
    options.push(option)
  }

  return options
}
