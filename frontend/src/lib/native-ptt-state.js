import { reactive } from 'vue'
import {
  DEFAULT_DESKTOP_PTT_BINDING_STATUS,
  normalizeDesktopPttBindingStatus
} from './desktop-ptt-shortcut.js'

function createDefaultState() {
  return {
    transport: null,
    helperState: 'idle',
    authorized: false,
    isTarget: false,
    targetSessionId: null,
    bindingStatus: normalizeDesktopPttBindingStatus(DEFAULT_DESKTOP_PTT_BINDING_STATUS),
    lastError: null
  }
}

export const nativePttState = reactive(createDefaultState())

export function resetNativePttState(overrides = {}) {
  Object.assign(nativePttState, createDefaultState(), overrides)
}

export function applyNativePttBindingStatus(status, overrides = {}) {
  Object.assign(nativePttState, {
    bindingStatus: normalizeDesktopPttBindingStatus(status)
  }, overrides)
}

export function updateNativePttState(patch = {}) {
  if (patch.bindingStatus !== undefined) {
    patch = {
      ...patch,
      bindingStatus: normalizeDesktopPttBindingStatus(patch.bindingStatus)
    }
  }
  Object.assign(nativePttState, patch)
}
