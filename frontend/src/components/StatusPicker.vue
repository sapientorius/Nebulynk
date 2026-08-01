<template>
  <n-modal v-model:show="show" :mask-closable="true">
    <n-card :title="$t('ui.components.set_status')" style="max-width: 420px; width: 100%" closable @close="show = false">
      <div style="margin-bottom: 16px">
        <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; opacity: 0.7">{{ $t('ui.components.admin.status') }}</div>
        <n-radio-group v-model:value="form.status" name="status">
          <n-space :size="8">
            <n-radio value="online">
              <n-badge color="#52c41a" dot :offset="[0, 2]" />
              {{ $t('ui.components.online') }}
            </n-radio>
            <n-radio value="away">
              <n-badge color="#faad14" dot :offset="[0, 2]" />
              {{ $t('ui.components.away') }}
            </n-radio>
            <n-radio value="dnd">
              <n-badge color="#ff4d4f" dot :offset="[0, 2]" />
              {{ $t('ui.components.do_not_disturb') }}
            </n-radio>
          </n-space>
        </n-radio-group>
      </div>

      <n-divider style="margin: 12px 0" />

      <div style="margin-bottom: 16px">
        <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; opacity: 0.7">{{ $t('ui.components.custom_status') }}</div>
        <n-space :size="8" style="margin-bottom: 8px">
          <n-input
            v-model:value="form.emoji"
            placeholder=":)"
            style="width: 60px"
            :maxlength="4"
          />
          <n-input
            v-model:value="form.customStatus"
            :placeholder="$t('ui.components.what_are_you_doing_right_now')"
            style="flex: 1"
            :maxlength="100"
          />
        </n-space>

        <n-select
          v-model:value="form.duration"
          :options="durationOptions"
          :placeholder="$t('ui.components.duration')"
          size="small"
        />
      </div>

      <template #footer>
        <n-space justify="space-between">
          <n-button size="small" quaternary @click="doClearStatus">{{ $t('ui.components.clear_status') }}</n-button>
          <n-space :size="8">
            <n-button @click="show = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button type="primary" :loading="saving" @click="doSave">{{ $t('ui.components.admin.save') }}</n-button>
          </n-space>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<script>
import { useSessionStore, useUiStore } from '../stores/index.js'

export default {
  name: 'StatusPicker',
  data() {
    return {
      saving: false,
      form: {
        status: 'online',
        emoji: '',
        customStatus: '',
        duration: null
      }
    }
  },
  computed: {
    sessionStore() {
      return useSessionStore()
    },
    uiStore() {
      return useUiStore()
    },
    show: {
      get() {
        return this.uiStore.showStatusModal
      },
      set(val) {
        this.uiStore.showStatusModal = val
      }
    },
    durationOptions() {
      return [
        { label: this.$t('ui.components.do_not_clear'), value: null },
        { label: this.$t('ui.components.30_minutes'), value: 30 * 60 * 1000 },
        { label: this.$t('ui.components.1_hour'), value: 60 * 60 * 1000 },
        { label: this.$t('ui.components.2_hours'), value: 2 * 60 * 60 * 1000 },
        { label: this.$t('ui.components.3_hours'), value: 3 * 60 * 60 * 1000 },
        { label: this.$t('ui.components.until_tomorrow'), value: 'tomorrow' }
      ]
    }
  },
  watch: {
    show(val) {
      if (val) {
        this.form.status = this.sessionStore.user?.status || 'online'
        this.form.emoji = this.sessionStore.user?.custom_status_emoji || ''
        this.form.customStatus = this.sessionStore.user?.custom_status || ''
        this.form.duration = null
      }
    }
  },
  methods: {
    computeExpiresAt() {
      const d = this.form.duration
      if (!d) return null

      if (d === 'tomorrow') {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(9, 0, 0, 0)
        return tomorrow.toISOString()
      }

      return new Date(Date.now() + d).toISOString()
    },
    async doSave() {
      this.saving = true
      try {
        await this.sessionStore.updateStatus({
          status: this.form.status,
          custom_status: this.form.customStatus || null,
          custom_status_emoji: this.form.emoji || null,
          status_expires_at: this.computeExpiresAt()
        })
        this.show = false
      } catch (err) {
        console.error('Status update failed:', err)
      } finally {
        this.saving = false
      }
    },
    async doClearStatus() {
      this.saving = true
      try {
        await this.sessionStore.updateStatus({
          custom_status: null,
          custom_status_emoji: null,
          status_expires_at: null
        })
        this.show = false
      } catch (err) {
        console.error('Status clear failed:', err)
      } finally {
        this.saving = false
      }
    }
  }
}
</script>
