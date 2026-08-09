import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  confirmSelfRegistration as confirmSelfRegistrationRequest,
  createSelfRegistration as createSelfRegistrationRequest,
  getSelfRegistrationConfig as getSelfRegistrationConfigRequest
} from '../lib/api.js'

export const useSelfRegistrationStore = defineStore('selfRegistration', () => {
  const config = ref(null)
  let configRequest = null

  async function loadConfig({ refresh = false } = {}) {
    if (!refresh && config.value) return config.value
    if (!configRequest) {
      configRequest = getSelfRegistrationConfigRequest()
        .then((result) => {
          config.value = result || {}
          return config.value
        })
        .finally(() => {
          configRequest = null
        })
    }
    return configRequest
  }

  async function register(payload) {
    return createSelfRegistrationRequest(payload)
  }

  async function confirm(token) {
    if (!token) throw new Error('token is required')
    return confirmSelfRegistrationRequest(token)
  }

  return {
    config,
    loadConfig,
    register,
    confirm
  }
})
