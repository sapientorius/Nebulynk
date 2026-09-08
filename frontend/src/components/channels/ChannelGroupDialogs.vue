<template>
    <n-modal v-model:show="showTopicModal">
      <n-card :title="$t('ui.components.edit_group_topic')" style="max-width: 500px; width: 100%">
        <n-form>
          <n-form-item :label="$t('ui.components.topic')">
            <n-input
              v-model:value="topicForm.topic"
              type="textarea"
              :placeholder="$t('ui.components.what_is_this_channel_about')"
              :autosize="{ minRows: 2, maxRows: 5 }"
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showTopicModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button type="primary" :loading="savingTopic" @click="saveGroupTopic">{{ $t('ui.components.admin.save') }}</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal v-model:show="showRenameModal">
      <n-card :title="$t('ui.components.rename_group')" style="max-width: 400px; width: 100%">
        <n-form>
          <n-form-item :label="$t('ui.components.group_name')">
            <n-input
              v-model:value="renameForm.name"
              :placeholder="$t('ui.components.group_name')"
              maxlength="100"
              @keyup.enter="saveRename"
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showRenameModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button type="primary" :loading="savingRename" @click="saveRename">{{ $t('ui.components.admin.save') }}</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>


</template>

<script>
import { useDmsStore } from '../../stores/index.js'


export default {
  name: 'ChannelGroupDialogs',
  components: {  },
  emits: [],
  props: { channel: { type: Object, default: null } },
  data() { return {
showTopicModal: false,
showRenameModal: false,
savingRename: false,
savingTopic: false,
topicForm: {
        topic: ''
      },
renameForm: {
        name: ''
      }
  } },
  computed: {
isGroupDm() {
      return this.channel?.type === 'group'
    },
dmDisplayInfo() {
      if (!this.isDm || !this.channel) return null
      return this.dmsStore.displayInfo(this.channel)
    },
dmsStore() {
      return useDmsStore()
    },
isDm() {
      return this.channel?.type === 'dm' || this.channel?.type === 'group'
    }
  },
  watch: {

  },

  methods: {
openTopicModal() {
      if (!this.isGroupDm) return
      this.topicForm.topic = this.channel.topic || ''
      this.showTopicModal = true
    },
openRenameModal() {
      if (!this.isGroupDm) return
      this.renameForm.name = this.dmDisplayInfo?.name || ''
      this.showRenameModal = true
    },
async saveRename() {
      if (!this.channel || !this.renameForm.name.trim()) return

      this.savingRename = true
      try {
        await this.dmsStore.update(this.channel.id, { name: this.renameForm.name.trim() })
        this.showRenameModal = false
        window.$message.success(this.$t('ui.components.group_name_updated'))
      } catch {
        window.$message.error(this.$t('ui.components.failed_to_rename_group'))
      } finally {
        this.savingRename = false
      }
    },
async saveGroupTopic() {
      if (!this.channel) return

      this.savingTopic = true
      try {
        const topic = this.topicForm.topic || null
        await this.dmsStore.update(this.channel.id, { topic })
        this.showTopicModal = false
        window.$message.success(this.$t('ui.components.topic_updated'))
      } catch {
        window.$message.error(this.$t('ui.components.failed_to_update_topic'))
      } finally {
        this.savingTopic = false
      }
    }
  }
}
</script>

<style scoped>

.channel-topic.placeholder {
  opacity: 0.4;
}

.summary-custom .n-button {
  grid-column: 1 / -1;
}

</style>
