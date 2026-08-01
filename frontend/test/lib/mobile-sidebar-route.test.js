import { describe, expect, it } from 'vitest'
import {
  buildMobileSidebarClosedLocation,
  buildMobileSidebarOpenLocation,
  resolveMobileSidebarCloseAction,
  resolveMobileSidebarSelectionAction
} from '../../src/lib/mobile-sidebar-route.js'

describe('mobile sidebar route helpers', () => {
  it('adds the mobile sidebar query without copying Vue Router history internals', () => {
    expect(buildMobileSidebarOpenLocation({
      path: '/channels/channel-1',
      query: { message: 'msg-1' },
      hash: '#latest'
    }, {
      historyState: {
        back: '/channels/channel-1',
        current: '/channels/channel-1',
        forward: null,
        position: 3
      }
    })).toEqual({
      path: '/channels/channel-1',
      query: {
        message: 'msg-1',
        mobileNav: 'sidebar'
      },
      hash: '#latest',
      state: {
        nebulynkMobileSidebar: true
      }
    })
  })

  it('removes only the mobile sidebar query when closing the sidebar', () => {
    expect(buildMobileSidebarClosedLocation({
      path: '/channels/channel-1',
      query: {
        message: 'msg-1',
        mobileNav: 'sidebar'
      },
      hash: '#latest'
    })).toEqual({
      path: '/channels/channel-1',
      query: {
        message: 'msg-1'
      },
      hash: '#latest'
    })
  })

  it('prefers browser back when the open sidebar came from a pushed history entry', () => {
    expect(resolveMobileSidebarCloseAction({
      path: '/channels/channel-1',
      query: { mobileNav: 'sidebar' }
    }, {
      historyState: { nebulynkMobileSidebar: true }
    })).toEqual({
      mode: 'back'
    })
  })

  it('transfers a generated open sidebar entry to the selected route before closing it', () => {
    expect(resolveMobileSidebarSelectionAction({
      path: '/channels/channel-1',
      query: { mobileNav: 'sidebar' }
    }, {
      path: '/channels/channel-2',
      query: { message: 'msg-2' },
      hash: '#latest'
    }, {
      isMobileLayout: true,
      historyState: { nebulynkMobileSidebar: true }
    })).toEqual({
      mode: 'transfer',
      openTo: {
        path: '/channels/channel-2',
        query: {
          message: 'msg-2',
          mobileNav: 'sidebar'
        },
        hash: '#latest',
        state: {
          nebulynkMobileSidebar: true
        }
      },
      closedTo: {
        path: '/channels/channel-2',
        query: { message: 'msg-2' },
        hash: '#latest'
      }
    })
  })

  it('uses a normal push when the open query was loaded without the generated history marker', () => {
    expect(resolveMobileSidebarSelectionAction({
      path: '/channels/channel-1',
      query: { mobileNav: 'sidebar' }
    }, {
      path: '/meetings/meeting-1',
      query: { transcript_start_ms: '1200' },
      hash: '#transcript'
    }, {
      isMobileLayout: true,
      historyState: { back: '/login' }
    })).toEqual({
      mode: 'push',
      to: {
        path: '/meetings/meeting-1',
        query: { transcript_start_ms: '1200' },
        hash: '#transcript'
      }
    })
  })

  it('falls back to replace when the sidebar query was loaded directly', () => {
    expect(resolveMobileSidebarCloseAction({
      path: '/channels/channel-1',
      query: {
        message: 'msg-1',
        mobileNav: 'sidebar'
      },
      hash: '#latest'
    }, {
      historyState: { back: '/login' }
    })).toEqual({
      mode: 'replace',
      to: {
        path: '/channels/channel-1',
        query: {
          message: 'msg-1'
        },
        hash: '#latest'
      }
    })
  })
})
