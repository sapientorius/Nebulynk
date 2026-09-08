export function createAdministrationEndpoints({ http }) {
  async function getSecuritySettings() {
    const { data } = await http.get('/security-settings')
    return data
  }

  async function updateSecuritySettings(payload) {
    const { data } = await http.patch('/security-settings/default', payload)
    return data
  }

  async function getSmtpSettings() {
    const { data } = await http.get('/smtp-settings')
    return data
  }

  async function updateSmtpSettings(payload) {
    const { data } = await http.patch('/smtp-settings', payload)
    return data
  }

  async function testSmtpConnection() {
    const { data } = await http.post('/smtp-settings', {
      action: 'test_connection'
    })
    return data
  }

  async function sendSmtpTestEmail(payload = {}) {
    const { data } = await http.post('/smtp-settings', {
      action: 'send_test_email',
      ...payload
    })
    return data
  }

  async function listAiProviderInstances() {
    const { data } = await http.get('/ai-provider-instances')
    return data
  }

  async function createAiProviderInstance(payload) {
    const { data } = await http.post('/ai-provider-instances', payload)
    return data
  }

  async function updateAiProviderInstance(id, payload) {
    const { data } = await http.patch(`/ai-provider-instances/${id}`, payload)
    return data
  }

  async function deleteAiProviderInstance(id) {
    const { data } = await http.delete(`/ai-provider-instances/${id}`)
    return data
  }

  async function listAiFunctionConfigs() {
    const { data } = await http.get('/ai-function-configs')
    return data
  }

  async function updateAiFunctionConfig(functionKey, payload) {
    const { data } = await http.patch(`/ai-function-configs/${functionKey}`, payload)
    return data
  }

  async function listAiProviderModels(providerInstanceId, capability, { refresh = false } = {}) {
    const { data } = await http.get('/ai-provider-models', {
      params: {
        provider_instance_id: providerInstanceId,
        capability,
        refresh
      }
    })
    return data
  }

  return { getSecuritySettings, updateSecuritySettings, getSmtpSettings, updateSmtpSettings, testSmtpConnection, sendSmtpTestEmail, listAiProviderInstances, createAiProviderInstance, updateAiProviderInstance, deleteAiProviderInstance, listAiFunctionConfigs, updateAiFunctionConfig, listAiProviderModels }
}
