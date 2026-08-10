import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function read(relPath) {
  const file = resolve(backendRoot, relPath)
  return readFile(file, 'utf8')
}

test('users.create is blocked for external callers', async () => {
  const src = await read('src/services/users/users.js')
  assert.match(src, /Direkte Benutzererstellung ist nicht erlaubt/)
  assert.match(src, /create:\s*\[\]/)
})

test('channel-members find/patch are guarded', async () => {
  const src = await read('src/services/channel-members/channel-members.js')
  const policy = await read('src/domains/channel-members/policy.js')
  assert.match(src, /assertFindAccess/)
  assert.match(src, /resolvePatchAccess/)
  assert.match(policy, /channel_id ist erforderlich/)
  assert.match(src, /checkPermission\('manage_channel_members'\)/)
})

test('channel-read-state is authenticated and membership scoped', async () => {
  const src = await read('src/services/channel-read-state/channel-read-state.js')
  assert.match(src, /authenticate\('jwt'\)/)
  assert.match(src, /channel_id: channelId,\s*user_id: userId/)
  assert.match(src, /membership_required/)
})

test('message-search is authenticated and meeting-content-policy scoped', async () => {
  const src = await read('src/services/message-search/message-search.js')
  assert.match(src, /authenticate\('jwt'\)/)
  assert.match(src, /assertCanReadChannel/)
  assert.match(src, /buildChannelReadAccessSql/)
})

test('search service is authenticated and meeting-content-policy scoped', async () => {
  const src = await read('src/services/search/search.js')
  assert.match(src, /authenticate\('jwt'\)/)
  assert.match(src, /assertCanReadChannel/)
  assert.match(src, /buildMeetingContentAccessSql/)
})

test('messages.find enforces channel_id', async () => {
  const src = await read('src/services/messages/messages.js')
  const policy = await read('src/domains/messages/policy.js')
  assert.match(src, /assertFindAccess/)
  assert.match(src, /resolveMutationAccess/)
  assert.match(policy, /channel_id ist erforderlich/)
})

test('files service has read/remove policy checks', async () => {
  const src = await read('src/services/files/files.js')
  const policy = await read('src/domains/files/policy.js')
  assert.match(src, /resolveGetAccess/)
  assert.match(src, /resolveRemoveAccess/)
  assert.match(src, /checkPermission\('manage_messages'\)/)
  assert.match(policy, /Kein Zugriff auf Dateien anderer Nutzer/)
})

test('voice create is RBAC and membership protected', async () => {
  const src = await read('src/services/voice/voice.js')
  assert.match(src, /isChannelMember\(\)/)
  assert.match(src, /function checkJoinVoiceAccess\(\)/)
  assert.match(src, /isGuestAccount\(context\.params\.user\)/)
  assert.match(src, /checkPermission\('join_voice_channels'\)/)
})

test('mentions find rejects global reads', async () => {
  const policy = await read('src/domains/mentions/policy.js')
  assert.match(policy, /user_id oder message_id ist erforderlich/)
})

test('channels find uses domain access policy for archived/private scoping', async () => {
  const src = await read('src/services/channels/channels.js')
  const policy = await read('src/domains/channels/policy.js')
  assert.match(src, /resolveFindAccess/)
  assert.match(src, /addArchiveMetadata/)
  assert.match(policy, /normalizeIncludeArchived/)
})

test('gifs service no longer logs process.env or console.log', async () => {
  const src = await read('src/services/gifs/gifs.js')
  assert.doesNotMatch(src, /console\.log\(/)
  assert.doesNotMatch(src, /Using KLIPY API key/)
})

test('meetings service uses patch action contract and internal source message create', async () => {
  const src = await read('src/services/meetings/meetings.js')
  assert.match(src, /methods:\s*\['find', 'get', 'create', 'patch'\]/)
  assert.match(src, /patch:\s*\[validate\(patchSchema\)\]/)
  assert.match(src, /async patch\(id, data, params\)/)
  assert.match(src, /action === 'invite'/)
  assert.match(src, /action === 'join'/)
  assert.match(src, /action === 'end'/)
  assert.match(src, /action === 'decline'/)
  assert.match(src, /action === 'set_title'/)
  assert.match(src, /async _createSourceMessage\(\{ meetingId, sourceChannel, user \}\)/)
  assert.doesNotMatch(src, /async _createSourceMessage\(\{[^}]*provider/)
})
