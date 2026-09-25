import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginView from '../../src/views/LoginView.vue'

const {
  getCurrentUserMock,
  restoreBrowserSessionMock,
  loadConfigMock,
  sessionStore,
  isDesktopManagerWindowMock
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  restoreBrowserSessionMock: vi.fn(),
  loadConfigMock: vi.fn(),
  sessionStore: {
    user: null,
    init: vi.fn(),
    logout: vi.fn()
  },
  isDesktopManagerWindowMock: vi.fn()
}))

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn()
}))

vi.mock('../../src/lib/api.js', () => ({
  getCurrentUser: getCurrentUserMock,
  restoreBrowserSession: restoreBrowserSessionMock
}))

vi.mock('../../src/lib/api-error.js', () => ({
  translateApiError: vi.fn(() => 'Translated error')
}))

vi.mock('../../src/lib/theme-settings.js', () => ({
  buildNaiveThemeOverrides: vi.fn(() => ({}))
}))

vi.mock('../../src/lib/runtime.js', () => ({
  isDesktopManagerWindow: isDesktopManagerWindowMock
}))

vi.mock('../../src/lib/desktop-runtime.js', () => ({
  addDesktopProfile: vi.fn(),
  desktopState: { activeProfileId: null, profiles: [] },
  getActiveDesktopProfile: vi.fn(() => null),
  removeDesktopProfile: vi.fn(),
  setActiveDesktopProfile: vi.fn()
}))

vi.mock('../../src/stores/index.js', () => ({
  useSelfRegistrationStore: () => ({ loadConfig: loadConfigMock }),
  useSessionStore: () => sessionStore,
  useThemeStore: () => ({ platformThemeSettings: {} })
}))

const componentStubs = {
  AuthFlipCard: {
    template: '<div><slot name="front" /></div>'
  },
  RegisterView: true,
  'n-config-provider': { template: '<div><slot /></div>' },
  'n-card': { template: '<section><slot /></section>' },
  'n-form': { template: '<form><slot /></form>' },
  'n-form-item': { template: '<div><slot /></div>' },
  'n-input': {
    props: ['inputProps'],
    template: '<input v-bind="inputProps" />'
  },
  'n-checkbox': { template: '<label><slot /></label>' },
  'n-button': {
    emits: ['click'],
    template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>'
  },
  'n-alert': { template: '<div><slot /></div>' },
  'n-select': true,
  'n-spin': { template: '<div />' },
  'router-link': { template: '<a><slot /></a>' }
}

function mountLoginView() {
  const router = {
    push: vi.fn().mockResolvedValue(),
    resolve: vi.fn(() => ({ name: 'App' }))
  }
  const wrapper = mount(LoginView, {
    global: {
      stubs: componentStubs,
      mocks: {
        $route: { name: 'Login', query: {} },
        $router: router,
        $t: (key, params = {}) => key === 'login.session.description'
          ? `Signed in as ${params.name}`
          : key
      }
    }
  })
  return { wrapper, router }
}

describe('LoginView active browser session', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset()
    restoreBrowserSessionMock.mockReset()
    loadConfigMock.mockReset()
    sessionStore.user = null
    sessionStore.init.mockReset()
    sessionStore.logout.mockReset()
    isDesktopManagerWindowMock.mockReset()

    isDesktopManagerWindowMock.mockReturnValue(false)
    loadConfigMock.mockResolvedValue({ enabled: false })
  })

  it('shows a temporary loading state, then replaces the form with the restored user session', async () => {
    let resolveSessionRestore
    restoreBrowserSessionMock.mockImplementation(() => new Promise((resolve) => {
      resolveSessionRestore = resolve
    }))
    getCurrentUserMock.mockReturnValue({ display_name: 'Alex Example', email: 'alex@example.com' })

    const { wrapper } = mountLoginView()
    expect(wrapper.get('[data-testid="login-session-loading"]').exists()).toBe(true)

    resolveSessionRestore()
    await flushPromises()

    expect(restoreBrowserSessionMock).toHaveBeenCalledWith({ forceRefresh: true, silent: true })
    expect(wrapper.get('[data-testid="login-active-session-user"]').text()).toContain('Alex Example')
    expect(wrapper.find('[data-testid="login-email"]').exists()).toBe(false)
  })

  it('falls back to the email address and continues the restored session', async () => {
    restoreBrowserSessionMock.mockResolvedValue({ accessToken: 'restored-token' })
    getCurrentUserMock.mockReturnValue({ email: 'alex@example.com' })
    sessionStore.init.mockImplementation(async () => {
      sessionStore.user = { id: 'alex' }
    })

    const { wrapper, router } = mountLoginView()
    await flushPromises()
    await wrapper.get('[data-testid="login-session-continue"]').trigger('click')

    expect(wrapper.get('[data-testid="login-active-session-user"]').text()).toContain('alex@example.com')
    expect(sessionStore.init).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith('/')
  })

  it('returns to the normal form after a missing session or explicit logout', async () => {
    restoreBrowserSessionMock.mockRejectedValue(new Error('Expired session'))

    const { wrapper } = mountLoginView()
    await flushPromises()
    expect(wrapper.find('[data-testid="login-email"]').exists()).toBe(true)

    restoreBrowserSessionMock.mockResolvedValue({ accessToken: 'restored-token' })
    getCurrentUserMock.mockReturnValue({ display_name: 'Alex Example' })
    await wrapper.vm.restoreExistingSession()
    await wrapper.get('[data-testid="login-session-logout"]').trigger('click')

    expect(sessionStore.logout).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="login-active-session"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="login-email"]').exists()).toBe(true)
  })
})
