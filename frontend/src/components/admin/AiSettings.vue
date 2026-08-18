<template>
  <div data-testid="ai-settings-panel">
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
      <h3 style="margin: 0">{{ $t('ui.components.admin.ai_settings') }}</h3>
      <n-button type="primary" data-testid="ai-provider-add" @click="openCreateModal">
        {{ $t('ui.components.admin.add_ai_provider') }}
      </n-button>
    </n-space>

    <n-space vertical :size="20">
      <n-card :title="$t('ui.components.admin.ai_provider_instances')">
        <n-space vertical :size="14">
          <div
            v-if="providerInstances.length === 0"
            class="ai-empty-state"
            data-testid="ai-provider-empty"
          >
            {{ $t('ui.components.admin.no_ai_provider_instances') }}
          </div>

          <div
            v-for="instance in providerInstances"
            :key="instance.id"
            class="ai-provider-item"
            data-testid="ai-provider-item"
          >
            <div class="ai-provider-copy">
              <strong>{{ instance.display_name }}</strong>
              <span>{{ instance.provider_label }}</span>
              <span v-if="instance.base_url" class="ai-provider-base-url">{{ instance.base_url }}</span>
            </div>
            <n-space :size="8">
              <n-tag :type="instance.enabled ? 'success' : 'default'">
                {{
                  instance.enabled
                    ? $t('ui.components.admin.provider_enabled')
                    : $t('ui.components.admin.provider_disabled')
                }}
              </n-tag>
              <n-button size="small" quaternary @click="openEditModal(instance)">
                {{ $t('ui.components.admin.edit') }}
              </n-button>
              <n-button
                size="small"
                quaternary
                type="error"
                :loading="deletingProviderId === instance.id"
                @click="removeProvider(instance)"
              >
                {{ $t('ui.components.admin.delete') }}
              </n-button>
            </n-space>
          </div>
        </n-space>
      </n-card>

      <n-card :title="$t('ui.components.admin.ai_functions')">
        <n-space vertical :size="16">
          <div
            v-for="functionKey in functionKeys"
            :key="functionKey"
            class="ai-function-card"
            data-testid="ai-function-card"
          >
            <div class="ai-function-header">
              <div>
                <strong>{{ getFunctionLabel(functionKey) }}</strong>
                <div class="ai-function-caption">{{ $t('ui.components.admin.configure_function') }}</div>
              </div>
              <n-switch v-model:value="functionForms[functionKey].enabled" />
            </div>

            <n-form label-placement="top">
              <n-form-item :label="$t('ui.components.admin.provider')">
                <n-select
                  :value="functionForms[functionKey].provider_instance_id"
                  :options="getProviderOptions(functionKey)"
                  :placeholder="$t('ui.components.admin.select_provider_instance')"
                  :disabled="providerInstances.length === 0"
                  @update:value="onFunctionProviderChange(functionKey, $event)"
                />
              </n-form-item>

              <n-form-item :label="$t('ui.components.admin.model')">
                <n-space vertical :size="8" style="width: 100%">
                  <n-select
                    :value="functionForms[functionKey].model"
                    :options="getModelOptions(functionKey)"
                    :placeholder="$t('ui.components.admin.select_model')"
                    :disabled="!functionForms[functionKey].provider_instance_id"
                    filterable
                    @update:value="functionForms[functionKey].model = $event"
                  />
                  <n-space align="center" justify="space-between" style="width: 100%">
                    <span class="ai-model-status" data-testid="ai-model-status">
                      {{ getModelStatusLabel(functionKey) }}
                    </span>
                    <n-button
                      quaternary
                      size="small"
                      :disabled="!functionForms[functionKey].provider_instance_id"
                      :loading="loadingModelsByFunction[functionKey]"
                      data-testid="ai-refresh-models"
                      @click="refreshModels(functionKey)"
                    >
                      {{ $t('ui.components.admin.model_refresh') }}
                    </n-button>
                  </n-space>
                </n-space>
              </n-form-item>
            </n-form>

            <n-space justify="end">
              <n-button
                type="primary"
                :loading="savingFunctionKey === functionKey"
                @click="saveFunction(functionKey)"
              >
                {{ $t('ui.components.admin.save') }}
              </n-button>
            </n-space>
          </div>
        </n-space>
      </n-card>
    </n-space>

    <n-modal v-model:show="showProviderModal" preset="card" :title="providerModalTitle" style="max-width: 520px">
      <n-form label-placement="top">
        <n-form-item :label="$t('ui.components.admin.provider')">
          <n-select
            v-model:value="providerForm.provider_type"
            :options="providerTypeOptions"
            :disabled="isEditingProvider"
            data-testid="ai-provider-type-select"
          />
        </n-form-item>
        <n-form-item :label="$t('ui.components.admin.provider_name')">
          <n-input
            v-model:value="providerForm.display_name"
            :placeholder="$t('ui.components.admin.provider_name_placeholder')"
            data-testid="ai-provider-display-name"
          />
        </n-form-item>
        <n-form-item :label="$t(isEditingProvider ? 'ui.components.admin.api_key_optional' : 'ui.components.admin.api_key')">
          <n-input
            v-model:value="providerForm.api_key"
            type="password"
            show-password-on="click"
            :placeholder="$t('ui.components.admin.api_key_placeholder')"
            data-testid="ai-provider-api-key"
          />
        </n-form-item>
        <n-form-item
          v-if="providerForm.provider_type === 'openai_compatible'"
          :label="$t('ui.components.admin.base_url')"
        >
          <n-input
            v-model:value="providerForm.base_url"
            :placeholder="$t('ui.components.admin.base_url_placeholder')"
            data-testid="ai-provider-base-url"
          />
        </n-form-item>
        <n-form-item :label="$t('ui.components.admin.provider_enabled')">
          <n-switch v-model:value="providerForm.enabled" />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showProviderModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
          <n-button type="primary" :loading="savingProvider" @click="saveProvider">
            {{ $t('ui.components.admin.save_provider') }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script>
import { useAdminStore } from '../../stores/index.js'

const FUNCTION_KEYS = ['transcription', 'meeting_summary', 'chat_summary', 'image_generation']
const PROVIDER_TYPE_OPTIONS = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Mistral', value: 'mistral' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'OpenRouter', value: 'openrouter' },
  { label: 'OpenAI-compatible', value: 'openai_compatible' }
]

export default {
  name: 'AiSettings',
  data() {
    return {
      showProviderModal: false,
      editingProviderId: null,
      savingProvider: false,
      deletingProviderId: null,
      savingFunctionKey: null,
      loadingModelsByFunction: {},
      functionForms: {
        transcription: {
          enabled: false,
          provider_instance_id: null,
          model: null
        },
        meeting_summary: {
          enabled: false,
          provider_instance_id: null,
          model: null
        },
        chat_summary: {
          enabled: false,
          provider_instance_id: null,
          model: null
        },
        image_generation: {
          enabled: false,
          provider_instance_id: null,
          model: null
        }
      },
      providerForm: {
        provider_type: 'openai',
        display_name: '',
        api_key: '',
        enabled: true,
        base_url: ''
      }
    }
  },
  computed: {
    adminStore() {
      return useAdminStore()
    },
    providerInstances() {
      return this.adminStore.aiProviderInstances
    },
    functionConfigs() {
      return this.adminStore.aiFunctionConfigs
    },
    functionKeys() {
      return FUNCTION_KEYS
    },
    providerTypeOptions() {
      return PROVIDER_TYPE_OPTIONS
    },
    isEditingProvider() {
      return typeof this.editingProviderId === 'string' && this.editingProviderId.length > 0
    },
    providerModalTitle() {
      return this.isEditingProvider
        ? this.$t('ui.components.admin.edit_ai_provider')
        : this.$t('ui.components.admin.add_ai_provider')
    }
  },
  async created() {
    await this.load()
  },
  methods: {
    createEmptyProviderForm() {
      return {
        provider_type: 'openai',
        display_name: '',
        api_key: '',
        enabled: true,
        base_url: ''
      }
    },
    getFunctionLabel(functionKey) {
      return this.$t(`ui.components.admin.${functionKey}`)
    },
    getCapability(functionKey) {
      if (functionKey === 'transcription') return 'transcription'
      if (functionKey === 'image_generation') return 'image_generation'
      return 'meeting_summary'
    },
    getModelCacheKey(functionKey) {
      const providerInstanceId = this.functionForms[functionKey].provider_instance_id
      if (!providerInstanceId) return null
      return `${providerInstanceId}:${this.getCapability(functionKey)}`
    },
    getProviderOptions(functionKey) {
      const currentId = this.functionForms[functionKey].provider_instance_id
      return this.providerInstances
        .filter((instance) => instance.capabilities?.[this.getCapability(functionKey)] && (instance.enabled || instance.id === currentId))
        .map((instance) => ({
          label: `${instance.display_name} (${instance.provider_label})`,
          value: instance.id
        }))
    },
    getModelOptions(functionKey) {
      const cacheKey = this.getModelCacheKey(functionKey)
      const response = cacheKey ? this.adminStore.aiProviderModelsByCacheKey[cacheKey] : null
      return (response?.data || [])
        .filter((model) => model.capabilities?.includes(this.getCapability(functionKey)))
        .map((model) => ({
        label: model.label,
        value: model.id
      }))
    },
    getModelStatusLabel(functionKey) {
      const cacheKey = this.getModelCacheKey(functionKey)
      if (!cacheKey) {
        return this.$t('ui.components.admin.select_provider_instance')
      }

      if (this.loadingModelsByFunction[functionKey]) {
        return this.$t('ui.components.admin.model_loading')
      }

      const response = this.adminStore.aiProviderModelsByCacheKey[cacheKey]
      if (!response) {
        return this.$t('ui.components.admin.no_models_available')
      }
      if (response.stale) {
        return this.$t('ui.components.admin.model_cache_stale')
      }
      if (response.last_fetch_status === 'failed') {
        return this.$t('ui.components.admin.model_fetch_failed')
      }
      return this.$t('ui.components.admin.models_loaded')
    },
    syncFunctionForms() {
      const configByKey = Object.fromEntries(this.functionConfigs.map((config) => [config.function_key, config]))
      for (const functionKey of FUNCTION_KEYS) {
        const config = configByKey[functionKey]
        this.functionForms[functionKey] = {
          enabled: config?.enabled || false,
          provider_instance_id: config?.provider_instance_id || null,
          model: config?.model || null
        }
      }
    },
    async load() {
      await Promise.all([
        this.adminStore.refreshAiProviderInstances(),
        this.adminStore.refreshAiFunctionConfigs()
      ])
      this.syncFunctionForms()

      for (const functionKey of FUNCTION_KEYS) {
        if (this.functionForms[functionKey].provider_instance_id) {
          await this.loadModels(functionKey)
        }
      }
    },
    openCreateModal() {
      this.editingProviderId = null
      this.providerForm = this.createEmptyProviderForm()
      this.showProviderModal = true
    },
    openEditModal(instance) {
      this.editingProviderId = instance.id
      this.providerForm = {
        provider_type: instance.provider_type,
        display_name: instance.display_name,
        api_key: '',
        enabled: instance.enabled,
        base_url: instance.provider_type === 'openai_compatible' ? (instance.base_url || '') : ''
      }
      this.showProviderModal = true
    },
    async saveProvider() {
      this.savingProvider = true
      try {
        const payload = {
          provider_type: this.providerForm.provider_type,
          display_name: this.providerForm.display_name,
          enabled: this.providerForm.enabled,
          ...(this.providerForm.provider_type === 'openai_compatible'
            ? { base_url: this.providerForm.base_url }
            : {}),
          ...(this.providerForm.api_key ? { api_key: this.providerForm.api_key } : {})
        }

        if (this.isEditingProvider) {
          await this.adminStore.updateAiProviderInstance(this.editingProviderId, payload)
        } else {
          await this.adminStore.createAiProviderInstance(payload)
        }

        await this.adminStore.refreshAiProviderInstances()
        this.showProviderModal = false
        window.$message?.success(this.$t('ui.components.admin.provider_saved'))
      } catch (error) {
        console.error('Failed to save AI provider:', error)
        window.$message?.error(error.message || this.$t('ui.components.admin.saving_failed'))
      } finally {
        this.savingProvider = false
      }
    },
    async removeProvider(instance) {
      this.deletingProviderId = instance.id
      try {
        await this.adminStore.deleteAiProviderInstance(instance.id)
        await this.adminStore.refreshAiProviderInstances()
        window.$message?.success(this.$t('ui.components.admin.provider_deleted'))
      } catch (error) {
        console.error('Failed to delete AI provider:', error)
        window.$message?.error(error.message || this.$t('ui.components.delete_failed'))
      } finally {
        this.deletingProviderId = null
      }
    },
    async onFunctionProviderChange(functionKey, providerInstanceId) {
      this.functionForms[functionKey].provider_instance_id = providerInstanceId
      this.functionForms[functionKey].model = null
      if (providerInstanceId) {
        await this.loadModels(functionKey)
      }
    },
    async loadModels(functionKey, { refresh = false } = {}) {
      const providerInstanceId = this.functionForms[functionKey].provider_instance_id
      if (!providerInstanceId) return

      this.loadingModelsByFunction = {
        ...this.loadingModelsByFunction,
        [functionKey]: true
      }

      try {
        await this.adminStore.loadAiProviderModels(providerInstanceId, this.getCapability(functionKey), { refresh })
      } catch (error) {
        console.error('Failed to load AI models:', error)
        window.$message?.error(error.message || this.$t('ui.components.admin.model_fetch_failed'))
      } finally {
        this.loadingModelsByFunction = {
          ...this.loadingModelsByFunction,
          [functionKey]: false
        }
      }
    },
    async refreshModels(functionKey) {
      await this.loadModels(functionKey, { refresh: true })
    },
    async saveFunction(functionKey) {
      this.savingFunctionKey = functionKey
      try {
        const payload = {
          enabled: this.functionForms[functionKey].enabled,
          provider_instance_id: this.functionForms[functionKey].provider_instance_id,
          model: this.functionForms[functionKey].model
        }
        await this.adminStore.updateAiFunctionConfig(functionKey, payload)
        await this.adminStore.refreshAiFunctionConfigs()
        this.syncFunctionForms()
        window.$message?.success(this.$t('ui.components.admin.function_saved'))
      } catch (error) {
        console.error('Failed to save AI function config:', error)
        window.$message?.error(error.message || this.$t('ui.components.admin.saving_failed'))
      } finally {
        this.savingFunctionKey = null
      }
    }
  }
}
</script>

<style scoped>
.ai-empty-state {
  padding: 14px 16px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  opacity: 0.72;
}

.ai-provider-item,
.ai-function-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

.ai-provider-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-provider-copy span,
.ai-function-caption,
.ai-model-status,
.ai-provider-base-url {
  font-size: 13px;
  opacity: 0.72;
  line-height: 1.5;
}

.ai-function-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

@media (max-width: 900px) {
  .ai-function-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
