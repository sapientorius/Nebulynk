import { describe, expect, it, vi } from 'vitest'
import {
  collectVisibleViewportMessageIds,
  handleMessageVisibilityEntries,
  syncObservedMessageElements
} from '../../src/lib/message-visibility.js'

async function flushAsyncWork() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('message visibility helpers', () => {
  it('collects visible message rows into one queued notification batch', async () => {
    const onVisibleMessageIds = vi.fn()
    let seenMessageIds = {}
    let pendingMessageIds = {}

    handleMessageVisibilityEntries({
      entries: [
        {
          isIntersecting: true,
          target: { dataset: { messageId: 'message-1' } }
        },
        {
          isIntersecting: true,
          target: { dataset: { messageId: 'message-2' } }
        }
      ],
      getSeenMessageIds: () => seenMessageIds,
      getPendingMessageIds: () => pendingMessageIds,
      onVisibleMessageIds,
      onSeen: (nextSeen) => {
        seenMessageIds = nextSeen
      },
      onPendingChange: (nextPending) => {
        pendingMessageIds = nextPending
      }
    })

    await flushAsyncWork()

    expect(onVisibleMessageIds).toHaveBeenCalledWith(['message-1', 'message-2'])
    expect(seenMessageIds).toEqual({})
    expect(pendingMessageIds).toEqual({
      'message-1': true,
      'message-2': true
    })
  })

  it('does not re-queue notifications for non-visible or already-processed rows', async () => {
    const onVisibleMessageIds = vi.fn()
    let seenMessageIds = { 'message-seen': true }
    let pendingMessageIds = {}

    handleMessageVisibilityEntries({
      entries: [
        {
          isIntersecting: false,
          target: { dataset: { messageId: 'message-hidden' } }
        },
        {
          isIntersecting: true,
          target: { dataset: { messageId: 'message-seen' } }
        },
        {
          isIntersecting: true,
          target: { dataset: { messageId: 'message-pending' } }
        },
        {
          isIntersecting: true,
          target: { dataset: { messageId: 'message-pending' } }
        }
      ],
      getSeenMessageIds: () => seenMessageIds,
      getPendingMessageIds: () => pendingMessageIds,
      onVisibleMessageIds,
      onSeen: (nextSeen) => {
        seenMessageIds = nextSeen
      },
      onPendingChange: (nextPending) => {
        pendingMessageIds = nextPending
      }
    })

    await flushAsyncWork()

    expect(onVisibleMessageIds).toHaveBeenCalledTimes(1)
    expect(onVisibleMessageIds).toHaveBeenCalledWith(['message-pending'])
    expect(seenMessageIds).toEqual({ 'message-seen': true })
    expect(pendingMessageIds).toEqual({ 'message-pending': true })
  })

  it('syncs observed message elements without re-observing stale rows', () => {
    const observe = vi.fn()
    const unobserve = vi.fn()
    const firstElement = { dataset: { messageId: 'message-1' } }
    const secondElement = { dataset: { messageId: 'message-2' } }

    const observed = syncObservedMessageElements({
      listEl: {
        querySelectorAll: vi.fn(() => [secondElement])
      },
      observer: {
        observe,
        unobserve
      },
      observedMessageElements: {
        'message-1': firstElement
      }
    })

    expect(observe).toHaveBeenCalledWith(secondElement)
    expect(unobserve).toHaveBeenCalledWith(firstElement)
    expect(observed).toEqual({
      'message-2': secondElement
    })
  })

  it('collects currently visible viewport rows for a foreground recheck', () => {
    const messageIds = collectVisibleViewportMessageIds({
      listEl: {
        getBoundingClientRect: () => ({
          top: 0,
          bottom: 400,
          left: 0,
          right: 320,
          width: 320,
          height: 400
        })
      },
      observedMessageElements: {
        'message-visible': {
          getBoundingClientRect: () => ({
            top: 40,
            bottom: 120,
            left: 0,
            right: 320,
            width: 320,
            height: 80
          })
        },
        'message-hidden-below': {
          getBoundingClientRect: () => ({
            top: 420,
            bottom: 520,
            left: 0,
            right: 320,
            width: 320,
            height: 100
          })
        },
        'message-hidden-above': {
          getBoundingClientRect: () => ({
            top: -140,
            bottom: -20,
            left: 0,
            right: 320,
            width: 320,
            height: 120
          })
        },
        'message-no-rect': {}
      },
      seenMessageIds: {},
      pendingMessageIds: {}
    })

    expect(messageIds).toEqual(['message-visible'])
  })

  it('skips seen, pending, and invalid rows during viewport rescans', () => {
    const messageIds = collectVisibleViewportMessageIds({
      listEl: {
        getBoundingClientRect: () => ({
          top: 0,
          bottom: 400,
          left: 0,
          right: 320,
          width: 320,
          height: 400
        })
      },
      observedMessageElements: {
        'message-seen': {
          getBoundingClientRect: () => ({
            top: 10,
            bottom: 80,
            left: 0,
            right: 320,
            width: 320,
            height: 70
          })
        },
        'message-pending': {
          getBoundingClientRect: () => ({
            top: 90,
            bottom: 160,
            left: 0,
            right: 320,
            width: 320,
            height: 70
          })
        },
        'message-zero-height': {
          getBoundingClientRect: () => ({
            top: 170,
            bottom: 170,
            left: 0,
            right: 320,
            width: 320,
            height: 0
          })
        },
        'message-visible': {
          getBoundingClientRect: () => ({
            top: 180,
            bottom: 260,
            left: 0,
            right: 320,
            width: 320,
            height: 80
          })
        }
      },
      seenMessageIds: { 'message-seen': true },
      pendingMessageIds: { 'message-pending': true }
    })

    expect(messageIds).toEqual(['message-visible'])
  })
})
