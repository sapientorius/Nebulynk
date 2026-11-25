import { flushPromises } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import api, { completeBrowserAuthentication, restoreBrowserSession } from '../../src/lib/api.js'
import MeetingInviteView from '../../src/views/MeetingInviteView.vue'
import { componentContext, deferred } from '../helpers/mount-component.js'

vi.mock('../../src/lib/api.js', async (original) => ({
  ...await original(),
  default: { get: vi.fn(), post: vi.fn() },
  completeBrowserAuthentication: vi.fn(),
  restoreBrowserSession: vi.fn()
}))

const invite = { meeting_id: 'one', status: 'scheduled', title: 'Design review' }
const memberSession = { accessToken: 'member-token', user: { id: 'member', account_type: 'member' } }
const guestInput = '[data-testid="meeting-invite-display-name"]'
const guestSubmit = '[data-testid="meeting-invite-submit"]'

function apiError(status, errorCode) {
  return { response: { status, data: { error_code: errorCode } } }
}

async function renderInvite() {
  const context = await componentContext('/', { render: () => null })
  context.router.addRoute({
    name: 'MeetingInvite',
    path: '/meeting-invite/:token',
    component: MeetingInviteView
  })
  await context.router.push('/meeting-invite/token')
  return { router: context.router, wrapper: context.mount(MeetingInviteView) }
}

beforeEach(() => {
  api.get.mockReset().mockResolvedValue({ data: invite })
  api.post.mockReset()
  completeBrowserAuthentication.mockReset()
  restoreBrowserSession.mockReset().mockResolvedValue(null)
})

it('waits for the restored member session, verifies access and opens the meeting', async () => {
  const session = deferred()
  restoreBrowserSession.mockReturnValue(session.promise)
  api.get.mockResolvedValueOnce({ data: invite })
    .mockResolvedValueOnce({ data: { id: 'one', status: 'scheduled' } })

  const { router, wrapper } = await renderInvite()

  expect(wrapper.find(guestInput).exists()).toBe(false)
  session.resolve(memberSession)
  await flushPromises()

  expect(api.get).toHaveBeenCalledWith('/meetings/one')
  expect(router.currentRoute.value.fullPath).toBe('/meetings/one')
  expect(api.post).not.toHaveBeenCalled()
  expect(completeBrowserAuthentication).not.toHaveBeenCalled()
})

it.each([
  ['HTTP 403', () => api.get.mockRejectedValueOnce(apiError(403, 'api.meetings.meeting_access_denied'))],
  ['restricted details', () => api.get.mockResolvedValueOnce({
    data: { id: 'one', content_access: { allowed: false } }
  })]
])('asks a member to request an invitation for %s', async (_reason, denyAccess) => {
  restoreBrowserSession.mockResolvedValue(memberSession)
  api.get.mockResolvedValueOnce({ data: invite })
  denyAccess()
  const { router, wrapper } = await renderInvite()
  await flushPromises()

  expect(wrapper.text()).toContain('Ask the host to invite you.')
  expect(wrapper.text()).not.toContain(invite.title)
  expect(wrapper.find(guestInput).exists()).toBe(false)
  expect(wrapper.find(guestSubmit).exists()).toBe(false)
  expect(router.currentRoute.value.fullPath).toBe('/meeting-invite/token')
  expect(api.post).not.toHaveBeenCalled()
  expect(completeBrowserAuthentication).not.toHaveBeenCalled()
})

it('accepts an expired session as signed out and requires an explicit guest submission', async () => {
  restoreBrowserSession.mockRejectedValueOnce(apiError(401, 'api.auth_session.refresh_session_expired'))
  const guest = { id: 'guest', account_type: 'guest', display_name: 'Alex' }
  api.post.mockResolvedValue({
    data: { accessToken: 'guest-token', user: guest, meeting: { id: 'one' } }
  })
  const { router, wrapper } = await renderInvite()
  await flushPromises()

  await wrapper.get(guestSubmit).trigger('click')
  expect(wrapper.text()).toContain('Please enter a display name')
  expect(api.post).not.toHaveBeenCalled()

  await wrapper.get(guestInput).setValue(' Alex ')
  await wrapper.get(guestSubmit).trigger('click')
  await flushPromises()

  expect(api.post).toHaveBeenCalledExactlyOnceWith('/meeting-invite', {
    token: 'token',
    display_name: 'Alex'
  })
  expect(completeBrowserAuthentication).toHaveBeenCalledExactlyOnceWith(
    { accessToken: 'guest-token', user: guest, meeting: { id: 'one' } },
    expect.objectContaining({ remember: false })
  )
  expect(router.currentRoute.value.fullPath).toBe('/meetings/one')
})

it('displays the existing message for a revoked link before checking meeting access', async () => {
  restoreBrowserSession.mockResolvedValue(memberSession)
  api.get.mockRejectedValueOnce(apiError(400, 'api.meeting_invite.revoked'))
  const { wrapper } = await renderInvite()
  await flushPromises()

  expect(wrapper.text()).toContain('This meeting link is no longer valid')
  expect(wrapper.text()).not.toContain('Try again')
  expect(api.get).toHaveBeenCalledExactlyOnceWith('/meeting-invite', { params: { token: 'token' } })
})

it.each(['session', 'meeting access'])('can retry a transient %s error', async (failure) => {
  restoreBrowserSession.mockResolvedValue(memberSession)
  const meeting = { id: 'one', status: 'scheduled' }
  if (failure === 'session') {
    restoreBrowserSession.mockRejectedValueOnce(new Error('Network error'))
  } else {
    api.get.mockResolvedValueOnce({ data: invite }).mockRejectedValueOnce(apiError(503))
  }
  api.get.mockResolvedValueOnce({ data: invite }).mockResolvedValueOnce({ data: meeting })
  const { router, wrapper } = await renderInvite()
  await flushPromises()

  expect(wrapper.text()).toContain('Meeting link could not be loaded')
  expect(wrapper.find(guestInput).exists()).toBe(false)
  await wrapper.get('button').trigger('click')
  await flushPromises()

  expect(router.currentRoute.value.fullPath).toBe('/meetings/one')
  expect(api.post).not.toHaveBeenCalled()
})

it('ignores a delayed access check after switching invite links', async () => {
  const firstMeeting = deferred()
  restoreBrowserSession.mockResolvedValue(memberSession)
  api.get.mockResolvedValueOnce({ data: invite })
    .mockReturnValueOnce(firstMeeting.promise)
    .mockResolvedValueOnce({ data: { ...invite, meeting_id: 'two' } })
    .mockRejectedValueOnce(apiError(403, 'api.meetings.meeting_access_denied'))
  const { router, wrapper } = await renderInvite()
  await flushPromises()

  await router.push('/meeting-invite/other-token')
  await flushPromises()
  firstMeeting.resolve({ data: { id: 'one', status: 'scheduled' } })
  await flushPromises()

  expect(router.currentRoute.value.fullPath).toBe('/meeting-invite/other-token')
  expect(wrapper.text()).toContain('Ask the host to invite you.')
})
