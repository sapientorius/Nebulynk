<template>
  <div data-testid="security-settings-panel">
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
      <h3 style="margin: 0">{{ $t('securitySettings.title') }}</h3>
    </n-space>

    <n-spin :show="loading">
      <n-card :title="$t('securitySettings.passwordTitle')">
        <n-form label-placement="top">
          <n-form-item :label="$t('securitySettings.passwordTitle')">
            <div class="security-field">
              <n-select
                v-model:value="passwordStrengthLevel"
                :options="passwordStrengthOptions"
                data-testid="security-password-strength"
              />
              <span class="security-hint">{{ $t('securitySettings.passwordHelp') }}</span>
            </div>
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space justify="end">
            <n-button type="primary" :loading="saving" data-testid="security-settings-save" @click="save">
              {{ $t('common.save') }}
            </n-button>
          </n-space>
        </template>
      </n-card>
    </n-spin>
  </div>
</template>

<script>
import { useAdminStore } from '../../stores/index.js'

export default {
  name: 'SecuritySettings',
  data() {
    return {
      passwordStrengthLevel: 'basic',
      saving: false
    }
  },
  computed: {
    adminStore() {
      return useAdminStore()
    },
    loading() {
      return this.adminStore.loadingSecuritySettings
    },
    passwordStrengthOptions() {
      return [
        { label: this.$t('securitySettings.basic'), value: 'basic' },
        { label: this.$t('securitySettings.strong'), value: 'strong' },
        { label: this.$t('securitySettings.veryStrong'), value: 'very_strong' }
      ]
    }
  },
  async created() {
    try {
      const settings = await this.adminStore.refreshSecuritySettings()
      this.passwordStrengthLevel = settings?.level || 'basic'
    } catch (error) {
      console.error('Failed to load security settings:', error)
    }
  },
  methods: {
    async save() {
      this.saving = true
      try {
        const settings = await this.adminStore.updateSecuritySettings({
          password_strength_level: this.passwordStrengthLevel
        })
        this.passwordStrengthLevel = settings?.level || this.passwordStrengthLevel
        window.$message?.success(this.$t('securitySettings.saved'))
      } catch (error) {
        console.error('Failed to save security settings:', error)
        window.$message?.error(this.$t('securitySettings.saveFailed'))
      } finally {
        this.saving = false
      }
    }
  }
}
</script>

<style scoped>
.security-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.security-hint {
  font-size: 12px;
  opacity: 0.7;
}
</style>
