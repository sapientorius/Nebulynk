import { beforeEach, describe, expect, it, vi } from 'vitest'

const setActiveApiClientContextMock = vi.hoisted(() => vi.fn())
const setActiveSocketClientContextMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/api.js', () => ({
  setActiveApiClientContext: setActiveApiClientContextMock
}))

vi.mock('../../src/lib/socket.js', () => ({
  setActiveSocketClientContext: setActiveSocketClientContextMock
}))

describe('desktop workspace client context', () => {
  beforeEach(() => {
    setActiveApiClientContextMock.mockReset()
    setActiveSocketClientContextMock.mockReset()
  })

  it('keeps the active socket client aligned with the desktop workspace api client', async () => {
    const apiClient = { getStoredAccessToken() { return 'token' } }
    setActiveApiClientContextMock.mockReturnValue(apiClient)

    const { setDesktopWorkspaceClientContext } = await import('../../src/lib/desktop-workspace-client-context.js')
    const onPersistAuthState = vi.fn(async () => {})

    const result = setDesktopWorkspaceClientContext({
      initialAuthState: {
        accessToken: 'desktop-token'
      },
      onPersistAuthState
    })

    expect(setActiveApiClientContextMock).toHaveBeenCalledWith({
      defaultSessionTransport: 'body',
      persistCsrfToStorage: false,
      initialAuthState: {
        accessToken: 'desktop-token'
      },
      onPersistAuthState
    })
    expect(setActiveSocketClientContextMock).toHaveBeenCalledWith({
      apiClient
    })
    expect(result).toBe(apiClient)
  })
})
