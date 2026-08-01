import test from 'node:test'
import assert from 'node:assert/strict'
import { channels } from '../src/channels.js'

function createAppHarness() {
  const eventHandlers = new Map()
  const channelsByName = new Map()
  const services = new Map()

  const app = {
    on(eventName, handler) {
      eventHandlers.set(eventName, handler)
    },
    channel(name) {
      if (!channelsByName.has(name)) {
        channelsByName.set(name, {
          name,
          join() {},
          leave() {},
          send() {}
        })
      }
      return channelsByName.get(name)
    },
    service(name) {
      if (!services.has(name)) {
        const publishHandlers = new Map()
        services.set(name, {
          publishHandlers,
          publish(arg1, arg2) {
            if (typeof arg1 === 'function') {
              publishHandlers.set('*', arg1)
              return
            }
            publishHandlers.set(arg1, arg2)
          }
        })
      }
      return services.get(name)
    }
  }

  return {
    app,
    eventHandlers,
    getPublishHandler(serviceName, eventName) {
      const service = services.get(serviceName)
      if (!service) return null
      return service.publishHandlers.get(eventName) || null
    }
  }
}

test('socket contract: messages publish only to their channel room', () => {
  const harness = createAppHarness()
  channels(harness.app)

  const created = harness.getPublishHandler('messages', 'created')
  const patched = harness.getPublishHandler('messages', 'patched')
  const removed = harness.getPublishHandler('messages', 'removed')

  assert.ok(created)
  assert.ok(patched)
  assert.ok(removed)

  assert.equal(created({ channel_id: 'channel-1' }).name, 'channel/channel-1')
  assert.equal(patched({ channel_id: 'channel-2' }).name, 'channel/channel-2')
  assert.equal(removed({ channel_id: 'channel-3' }).name, 'channel/channel-3')
})

test('socket contract: voice participant events publish to channel room', () => {
  const harness = createAppHarness()
  channels(harness.app)

  const joined = harness.getPublishHandler('voice', 'participant-joined')
  const left = harness.getPublishHandler('voice', 'participant-left')
  const updated = harness.getPublishHandler('voice', 'participant-updated')

  assert.ok(joined)
  assert.ok(left)
  assert.ok(updated)

  assert.equal(joined({ channelId: 'voice-1' }).name, 'channel/voice-1')
  assert.equal(left({ channelId: 'voice-1', userId: 'user-1' }).name, 'channel/voice-1')
  assert.equal(updated({ channelId: 'voice-1', userId: 'user-1' }).name, 'channel/voice-1')
})

test('socket contract: meeting recording state events publish to meeting channel room', () => {
  const harness = createAppHarness()
  channels(harness.app)

  const updated = harness.getPublishHandler('meetings', 'recording-state-updated')
  assert.ok(updated)

  assert.equal(updated({ chatChannelId: 'meeting-channel-1' }).name, 'channel/meeting-channel-1')
})

test('socket contract: meeting invitations publish to target user channels', () => {
  const harness = createAppHarness()
  channels(harness.app)

  const invited = harness.getPublishHandler('meetings', 'invited')
  assert.ok(invited)

  const targets = invited({ userIds: ['user-1', 'user-2'] })
  assert.equal(Array.isArray(targets), true)
  assert.equal(targets[0].name, 'user/user-1')
  assert.equal(targets[1].name, 'user/user-2')
})

test('socket contract: meeting invitations without target users are not broadcast', () => {
  const harness = createAppHarness()
  channels(harness.app)

  const invited = harness.getPublishHandler('meetings', 'invited')
  assert.ok(invited)

  assert.equal(invited({ userIds: [] }), null)
  assert.equal(invited({}), null)
})

test('socket contract: raw admin role and invite payloads are not broadcast', () => {
  const harness = createAppHarness()
  channels(harness.app)

  const rolesPublish = harness.app.service('roles').publishHandlers.get('*')
  const rolePermissionsPublish = harness.app.service('role-permissions').publishHandlers.get('*')
  const invitesPublish = harness.app.service('invites').publishHandlers.get('*')

  assert.ok(rolesPublish)
  assert.ok(rolePermissionsPublish)
  assert.ok(invitesPublish)

  assert.equal(rolesPublish({ id: 'role-1' }), null)
  assert.equal(rolePermissionsPublish({ id: 'role-permission-1' }), null)
  assert.equal(invitesPublish({ id: 'invite-1', token: 'secret-token' }), null)
})

test('socket contract: user-role events publish to the affected user channel', () => {
  const harness = createAppHarness()
  channels(harness.app)

  const userRolesPublish = harness.app.service('user-roles').publishHandlers.get('*')
  assert.ok(userRolesPublish)

  assert.equal(userRolesPublish({ user_id: 'user-42' }).name, 'user/user-42')
})

test('socket contract: notification create events publish to recipient user channel', () => {
  const harness = createAppHarness()
  channels(harness.app)

  const created = harness.getPublishHandler('notifications', 'created')
  assert.ok(created)

  assert.equal(created({ user_id: 'user-42' }).name, 'user/user-42')
})

test('socket contract: message summary artifacts publish to owner user channel', () => {
  const harness = createAppHarness()
  channels(harness.app)

  const anyEvent = harness.app.service('message-summaries').publishHandlers.get('*')
  assert.ok(anyEvent)

  assert.equal(anyEvent({ user_id: 'user-42' }).name, 'user/user-42')
})
