import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { meetings } from '../src/services/meetings/meetings.js'

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
  assert.match(src, /buildAccessibleContentScopeSql/)
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
  const repository = await read('src/domains/files/repository.js')
  assert.match(src, /resolveGetAccess/)
  assert.match(src, /resolveRemoveAccess/)
  assert.match(src, /checkPermission\('manage_messages'\)/)
  assert.match(policy, /Kein Zugriff auf Dateien anderer Nutzer/)
  assert.match(repository, /buildChannelReadAccessSql/)
  assert.match(repository, /orWhereIn\('files\.message_id', readableMessageIds\)/)
  assert.doesNotMatch(repository, /orWhereExists/)
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

test('meetings service registers only its public methods, validates input and dispatches patch actions', async () => {
  let service, registration, hooks
  const app = {
    get: () => () => { throw new Error('Unexpected database access') },
    use(path, instance, options) { assert.equal(path, 'meetings'); service = instance; registration = options },
    service: () => ({ hooks(value) { hooks = value } })
  }
  meetings(app)
  assert.deepEqual(registration.methods, ['find', 'get', 'create', 'patch'])
  assert.equal(hooks.around.all.length, 1)
  await assert.rejects(hooks.before.patch[0]({ data: { action: 17 }, params: { provider: 'rest' } }), error => error.code === 400)
  await assert.rejects(hooks.before.create[0]({ data: {}, params: { provider: 'rest' } }), error => error.code === 400)
  const params = { user: { id: 'host' } }
  for (const [action, method, fields] of [
    ['invite', 'invite', { user_ids: ['member'] }], ['join', 'join', {}],
    ['end', 'end', {}], ['decline', 'decline', {}], ['set_title', 'setTitle', { title: 'Planning' }]
  ]) {
    const data = { action, ...fields }
    service[method] = async (...args) => { assert.deepEqual(args, ['meeting', data, params]); return action }
    assert.equal(await service.patch('meeting', data, params), action)
  }
})
