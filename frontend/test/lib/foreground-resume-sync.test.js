import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FOREGROUND_RESUME_SYNC_DEBOUNCE_MS,
  startForegroundResumeSync
} from '../../src/lib/foreground-resume-sync.js'

function createEventTarget() {
  const listeners = new Map()
  return {
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || new Set()
      handlers.add(handler)
      listeners.set(type, handlers)
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler)
    },
    dispatchEvent(event) {
      for (const handler of listeners.get(event.type) || []) {
        handler(event)
      }
    }
  }
}

describe('foreground resume sync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defers visible chat catch-up until the app is visible again', async () => {
    const onSync = vi.fn(async () => {})
    const targetWindow = createEventTarget()
    const targetDocument = createEventTarget()
    targetDocument.visibilityState = 'hidden'
    targetDocument.hasFocus = () => false

    const controller = startForegroundResumeSync({
      onSync,
      targetWindow,
      targetDocument
    })

    await controller.requestSync('socket-authenticated', {
      immediate: true,
      requireVisibleChat: true
    })

    expect(onSync).toHaveBeenCalledTimes(1)
    expect(onSync).toHaveBeenLastCalledWith({
      reason: 'socket-authenticated',
      isVisible: false,
      includeVisibleChat: false
    })

    targetDocument.visibilityState = 'visible'
    targetWindow.dispatchEvent({ type: 'focus' })
    vi.advanceTimersByTime(FOREGROUND_RESUME_SYNC_DEBOUNCE_MS)
    await vi.runAllTicks()

    expect(onSync).toHaveBeenCalledTimes(2)
    expect(onSync).toHaveBeenLastCalledWith({
      reason: 'focus',
      isVisible: true,
      includeVisibleChat: true
    })

    controller.stop()
  })

  it('coalesces duplicate visible triggers into a single sync run', async () => {
    const onSync = vi.fn(async () => {})
    const targetWindow = createEventTarget()
    const targetDocument = createEventTarget()
    targetDocument.visibilityState = 'visible'
    targetDocument.hasFocus = () => true

    const controller = startForegroundResumeSync({
      onSync,
      targetWindow,
      targetDocument
    })

    controller.requestSync('manual-a', { requireVisibleChat: true })
    controller.requestSync('manual-b', { requireVisibleChat: true })
    targetWindow.dispatchEvent({ type: 'focus' })

    vi.advanceTimersByTime(FOREGROUND_RESUME_SYNC_DEBOUNCE_MS)
    await vi.runAllTicks()

    expect(onSync).toHaveBeenCalledTimes(1)
    expect(onSync).toHaveBeenCalledWith({
      reason: 'manual-a',
      isVisible: true,
      includeVisibleChat: true
    })

    controller.stop()
  })
})
