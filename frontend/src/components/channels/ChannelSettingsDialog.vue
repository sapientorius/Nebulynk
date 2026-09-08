<template>
    <n-modal v-model:show="showSettingsModal">
      <n-card :title="$t('ui.components.channel_settings')" style="max-width: 520px; width: 100%">
        <n-form>
          <n-form-item :label="$t('ui.components.admin.name')">
            <n-input
              v-model:value="settingsForm.name"
              :placeholder="$t('ui.components.channel_name')"
              maxlength="100"
              @keyup.enter="saveChannelSettings"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.components.topic')">
            <n-input
              v-model:value="settingsForm.topic"
              type="textarea"
              :placeholder="$t('ui.components.optional_topic')"
              :autosize="{ minRows: 2, maxRows: 5 }"
            />
          </n-form-item>
          <n-form-item :label="$t('meetingHistoryAccess.channel_label')">
            <MeetingHistoryAccessSelect
              v-model="settingsForm.meetingHistoryAccess"
              data-testid="channel-meeting-history-access"
            />
          </n-form-item>
        </n-form>

        <n-divider v-if="!isDm" />
        <div v-if="!isDm" class="danger-zone">
          <div class="danger-title">{{ $t('ui.components.danger_zone') }}</div>
          <n-button
            :type="channel?.is_archived ? 'warning' : 'error'"
            :loading="savingArchive"
            @click="toggleArchiveState"
          >
            {{ channel?.is_archived
              ? $t('ui.components.restore_channel')
              : $t('ui.components.archive_channel') }}
          </n-button>
        </div>

        <template #footer>
          <n-space justify="end">
            <n-button @click="showSettingsModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button type="primary" :loading="savingSettings" @click="saveChannelSettings">{{ $t('ui.components.admin.save') }}</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>


</template>

<script>
import { useSessionStore, useChannelsStore, useDmsStore, useMeetingsStore } from '../../stores/index.js'
import MeetingHistoryAccessSelect from '../MeetingHistoryAccessSelect.vue'
import { DEFAULT_MEETING_HISTORY_ACCESS } from '../../lib/meeting-history-access.js'


export default {
  name: 'ChannelSettingsDialog',
  components: { MeetingHistoryAccessSelect },
  emits: [],
  props: { channel: { type: Object, default: null } },
  data() { return {
showSettingsModal: false,
savingSettings: false,
savingArchive: false,
settingsForm: {
        name: '',
        topic: '',
        meetingHistoryAccess: DEFAULT_MEETING_HISTORY_ACCESS
      }
  } },
  computed: {
isDm() {
      return this.channel?.type === 'dm' || this.channel?.type === 'group'
    },
canManageChannelSettings() {
      if (this.isGroupDm) {
        const selfId = this.sessionStore.user?.id
        const membership = (this.channel?.participants || []).find((entry) => entry.user_id === selfId)
        return this.sessionStore.user?.is_admin === true || membership?.role === 'owner'
      }
      return !this.isDm && this.channelsStore.can('manage_channels')
    },
sessionStore() {
      return useSessionStore()
    },
channelsStore() {
      return useChannelsStore()
    },
dmsStore() {
      return useDmsStore()
    },
meetingsStore() {
      return useMeetingsStore()
    },
isGroupDm() {
      return this.channel?.type === 'group'
    }
  },
  watch: {

  },

  methods: {
openSettingsModal() {
      if (!this.canManageChannelSettings || !this.channel) return
      this.settingsForm.name = this.channel.name || ''
      this.settingsForm.topic = this.channel.topic || ''
      this.settingsForm.meetingHistoryAccess = this.channel.meeting_history_access || DEFAULT_MEETING_HISTORY_ACCESS
      this.showSettingsModal = true
    },
async saveChannelSettings() {
      if (!this.channel || !this.canManageChannelSettings) return
      const name = this.settingsForm.name.trim()
      if (!name) return

      this.savingSettings = true
      try {
        const historyAccessChanged = this.channel.meeting_history_access !== this.settingsForm.meetingHistoryAccess
        const payload = {
          name,
          topic: this.settingsForm.topic || null,
          meeting_history_access: this.settingsForm.meetingHistoryAccess
        }
        if (this.isGroupDm) {
          await this.dmsStore.update(this.channel.id, payload)
        } else {
          await this.channelsStore.update(this.channel.id, payload)
        }
        if (historyAccessChanged) {
          await this.meetingsStore.handleSourceHistoryAccessChanged(this.channel.id)
        }
        this.showSettingsModal = false
        window.$message.success(this.$t('ui.components.channel_updated'))
      } catch {
        window.$message.error(this.$t('ui.components.failed_to_save_settings'))
      } finally {
        this.savingSettings = false
      }
    },
async toggleArchiveState() {
      if (!this.channel || !this.canManageChannelSettings) return

      this.savingArchive = true
      try {
        const willArchive = !this.channel.is_archived
        await this.channelsStore.update(this.channel.id, { is_archived: willArchive })
        window.$message.success(
          willArchive
            ? this.$t('ui.components.channel_archived')
            : this.$t('ui.components.channel_restored')
        )
        if (willArchive) this.showSettingsModal = false
      } catch {
        window.$message.error(this.$t('ui.components.failed_to_update_archive_status'))
      } finally {
        this.savingArchive = false
      }
    }
  }
}
</script>

<style scoped>

.channel-topic.placeholder {
  opacity: 0.4;
}

.header-menu-section-title.danger,
.header-menu-action.danger {
  color: rgb(229, 115, 115);
}

.summary-custom .n-button {
  grid-column: 1 / -1;
}

.danger-zone {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

@media (max-width: 900px) {

  .danger-zone {
    align-items: flex-start;
    flex-direction: column;
  }
}

</style>
