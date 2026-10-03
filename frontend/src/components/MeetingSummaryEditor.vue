<template>
  <n-modal :show="show" preset="card" :title="$t('summaryEdit.title')"
    style="width: calc(100vw - 24px); max-width: 800px"
    :mask-closable="!busy" :close-on-esc="!busy" :closable="!busy" @update:show="close">
    <div data-testid="meeting-summary-editor" class="summary-editor">
      <n-alert v-if="error" type="error" :show-icon="false" data-testid="summary-edit-error">{{ error }}</n-alert>
      <div v-if="preview" class="summary-editor-preview" data-testid="summary-edit-preview">
        <MeetingSummaryPanel :summary-artifact="{ status: 'ready', payload: preview.payload }" :compact-header="true" :can-share-in-app="false" />
        <n-alert type="info" :show-icon="false" data-testid="summary-edit-changes">{{ preview.change_summary }}</n-alert>
      </div>
      <p v-else>{{ $t('summaryEdit.help') }}</p>
      <MessageInput v-model="instructions" mode="instruction" :meeting-id="meetingId" :loading="busy"
        :placeholder="$t('summaryEdit.placeholder')" :submit-label="$t('summaryEdit.preview')" @submit="generate" />
      <n-checkbox v-model:checked="publishChange" :disabled="busy" data-testid="summary-edit-publish">{{ $t('summaryEdit.publish') }}</n-checkbox>
      <n-space justify="end">
        <n-button :disabled="busy" data-testid="summary-edit-discard" @click="close">{{ $t('summaryEdit.discard') }}</n-button>
        <n-button type="primary" :disabled="!preview || busy || stale" :loading="applying" data-testid="summary-edit-apply" @click="apply">{{ $t('summaryEdit.apply') }}</n-button>
      </n-space>
    </div>
  </n-modal>
</template>

<script>
import api from '../lib/api.js'
import MessageInput from './MessageInput.vue'
import MeetingSummaryPanel from './MeetingSummaryPanel.vue'
import { useMeetingsStore } from '../stores/index.js'

export default {
  name: 'MeetingSummaryEditor',
  components: { MessageInput, MeetingSummaryPanel },
  props: { show: Boolean, meetingId: { type: String, required: true } },
  emits: ['update:show', 'applied'],
  data() { return { instructions: '', preview: null, publishChange: true, generating: false, applying: false, error: '', stale: false, generation: 0 } },
  computed: { busy() { return this.generating || this.applying } },
  watch: {
    show: { immediate: true, handler(value) { if (value) this.reset() } },
    meetingId() { this.reset() }
  },
  beforeUnmount() { this.generation++ },
  methods: {
    reset() {
      this.generation++
      this.instructions = ''; this.preview = null; this.publishChange = true
      this.error = ''; this.stale = false; this.generating = false; this.applying = false
    },
    close() { if (!this.busy) { this.generation++; this.$emit('update:show', false) } },
    setError(error) {
      const code = error?.response?.data?.error_code
      this.stale = code === 'api.summary_revisions.stale'
      const translated = code ? this.$t(code) : null
      this.error = translated && translated !== code ? translated : this.$t('summaryEdit.failed')
      if (this.stale) this.preview = null
    },
    async generate(text) {
      if (!text.trim() || this.busy) return
      const generation = this.generation
      this.generating = true; this.error = ''
      try {
        const { data } = await api.post('/meeting-summary-revisions', {
          meeting_id: this.meetingId, instructions: text,
          ...(this.preview ? { parent_revision_id: this.preview.id } : {})
        })
        if (generation !== this.generation) return
        this.preview = data; this.instructions = ''; this.stale = false
      } catch (error) { if (generation === this.generation) this.setError(error) }
      finally { if (generation === this.generation) this.generating = false }
    },
    async apply() {
      if (!this.preview || this.busy || this.stale) return
      const generation = this.generation
      const meetingId = this.meetingId
      this.applying = true; this.error = ''
      try {
        await api.patch(`/meeting-summary-revisions/${this.preview.id}`, { action: 'apply', publish_change: this.publishChange })
        if (generation !== this.generation) return
        // Saving succeeded even if refreshing the view temporarily fails.
        useMeetingsStore().ensureMeetingLoaded(meetingId, { force: true }).catch(() => {})
        this.$emit('applied')
        this.$emit('update:show', false)
      } catch (error) { if (generation === this.generation) this.setError(error) }
      finally { if (generation === this.generation) this.applying = false }
    }
  }
}
</script>

<style scoped>
.summary-editor { display: flex; flex-direction: column; gap: 16px; }
.summary-editor-preview { max-height: 50dvh; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
</style>
