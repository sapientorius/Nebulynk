<template>
  <div class="file-upload">
    <input
      type="file"
      ref="fileInput"
      multiple
      style="display: none"
      @change="onFileSelect"
    />
    <n-button quaternary size="small" :title="$t('ui.components.attach_file')" @click="triggerSelect" :loading="uploading">
      <template #icon><n-icon><attach-icon /></n-icon></template>
    </n-button>
  </div>
</template>

<script>
import { AttachOutline as AttachIcon } from '@vicons/ionicons5'

export default {
  name: 'FileUpload',
  components: { AttachIcon },
  emits: ['files-selected'],
  props: {
    uploading: {
      type: Boolean,
      default: false
    }
  },
  methods: {
    triggerSelect() {
      this.$refs.fileInput?.click()
    },
    async onFileSelect(event) {
      const files = Array.from(event.target.files || [])
      if (files.length === 0) return
      event.target.value = ''
      await this.processFiles(files)
    },
    async processFiles(files) {
      const fileList = Array.from(files || []).filter(Boolean)
      if (fileList.length === 0) return
      this.$emit('files-selected', fileList)
    }
  }
}
</script>

<style scoped>
.file-upload {
  display: inline-flex;
}
</style>
