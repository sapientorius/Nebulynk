<template>
  <slot :loading="loading" :leave="leave" />
</template>

<script>
import { useChannelsStore, useDmsStore } from '../../stores/index.js'

export default {
  name: 'ChannelLeaveAction',
  props: { channel: { type: Object, default: null }, allowed: Boolean },
  emits: ['leaving', 'navigate'],
  data: () => ({ loading: false }),
  methods: {
    async leave() {
      if (!this.allowed || this.loading) return
      const channel = this.channel
      const channels = useChannelsStore()
      this.loading = true
      this.$emit('leaving')
      try {
        if (channel.type === 'group') await useDmsStore().leaveGroup(channel.id)
        else await channels.leaveChannel(channel.id)
        const fallbackId = channels.firstUnarchivedChannelId()
        if (fallbackId) await channels.select(fallbackId)
        else channels.clearActiveContext()
        this.$emit('navigate', fallbackId ? `/channels/${fallbackId}` : '/channels')
      } catch {
        window.$message?.error(this.$t('ui.components.action_failed'))
      } finally {
        this.loading = false
      }
    }
  }
}
</script>
