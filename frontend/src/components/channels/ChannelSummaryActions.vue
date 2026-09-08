<template>
<div class="summary-actions"><div class="summary-presets">
                  <n-button text size="small" class="summary-preset" @click="onRequestPresetSummaryFromMenu('last_hour')">
                    {{ $t('ui.components.last_hour') }}
                  </n-button>
                  <n-button text size="small" class="summary-preset" @click="onRequestPresetSummaryFromMenu('last_24h')">
                    {{ $t('ui.components.last_24h') }}
                  </n-button>
                  <n-button text size="small" class="summary-preset" @click="onRequestPresetSummaryFromMenu('last_48h')">
                    {{ $t('ui.components.last_48h') }}
                  </n-button>
                  <n-button text size="small" class="summary-preset" @click="onRequestPresetSummaryFromMenu('last_7d')">
                    {{ $t('ui.components.last_7d') }}
                  </n-button>
                </div><n-button text size="small" class="header-menu-action summary-select" @click="onStartMessageSelectionFromMenu">
                  {{ $t('ui.components.select_messages') }}
                </n-button><div class="summary-custom">
                  <n-input-number
                    v-model:value="customSummaryRangeValue"
                    size="small"
                    :min="1"
                  />
                  <n-select
                    v-model:value="customSummaryRangeUnit"
                    size="small"
                    :options="rangeUnitOptions"
                  />
                  <n-button
                    size="small"
                    type="primary"
                    :loading="messageSummariesStore.isRequestLoading('range', channel.id)"
                    @click="onRequestCustomSummaryFromMenu"
                  >
                    {{ $t('ui.components.summarize') }}
                  </n-button>
                </div></div>
</template>

<script>
import { useMessageSummariesStore } from '../../stores/index.js'


export default {
  name: 'ChannelSummaryActions',
  components: {  },
  emits: ["update:rangeValue","update:rangeUnit","completed"],
  props: { channel: { type: Object, default: null },
rangeValue: Number,
rangeUnit: String },
  data() { return {

  } },
  computed: {
customSummaryRangeValue: { get() { return this.rangeValue }, set(value) { this.$emit('update:rangeValue', value) } },
customSummaryRangeUnit: { get() { return this.rangeUnit }, set(value) { this.$emit('update:rangeUnit', value) } },
messageSummariesStore() {
      return useMessageSummariesStore()
    },
rangeUnitOptions() {
      return [
        { label: this.$t('ui.components.hours'), value: 'hours' },
        { label: this.$t('ui.components.days'), value: 'days' }
      ]
    }
  },
  watch: {

  },

  methods: {
async requestRangeSummary(payload) {
      if (!this.channel?.id) return
      try {
        await this.messageSummariesStore.requestRangeSummary(this.channel.id, payload)
        this.$emit('completed')
        window.$message?.success(this.$t('ui.components.summary_generation_started'))
      } catch (error) {
        console.error('Failed to request channel summary:', error)
        window.$message?.error(this.$t('ui.components.summary_generation_failed'))
      }
    },
startMessageSelection() {
      this.messageSummariesStore.startSelection()
      this.$emit('completed')
    },
async onRequestPresetSummaryFromMenu(rangePreset) {
      await this.requestPresetSummary(rangePreset)
    },
async onRequestCustomSummaryFromMenu() {
      await this.requestCustomSummary()
    },
onStartMessageSelectionFromMenu() {
      this.startMessageSelection()
    },
async requestPresetSummary(rangePreset) {
      await this.requestRangeSummary({ range_preset: rangePreset })
    },
async requestCustomSummary() {
      await this.requestRangeSummary({
        range_preset: 'custom',
        range_value: this.customSummaryRangeValue,
        range_unit: this.customSummaryRangeUnit
      })
    }
  }
}
</script>

<style scoped>

.header-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 240px;
}

.header-menu-action {
  width: 100%;
  justify-content: flex-start;
  padding: 6px 8px;
}

.header-menu-section-title.danger,
.header-menu-action.danger {
  color: rgb(229, 115, 115);
}

.summary-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 0 4px;
}

.summary-presets {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 4px;
  padding: 0 8px;
}

.summary-preset {
  width: 100%;
  justify-content: flex-start;
  padding: 5px 6px;
}

.summary-custom {
  display: grid;
  grid-template-columns: minmax(72px, 1fr) minmax(96px, 1fr);
  gap: 8px;
  padding: 8px;
}

.summary-custom .n-button {
  grid-column: 1 / -1;
}

.summary-select {
  padding-left: 14px;
}

</style>
