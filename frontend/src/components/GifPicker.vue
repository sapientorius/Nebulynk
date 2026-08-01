<template>
  <n-modal v-model:show="show" :mask-closable="true">
    <n-card title="GIF suchen" closable @close="show = false" style="width: 480px; max-height: 80vh;">
      <n-input
        v-model:value="searchTerm"
        placeholder="Search KLIPY"
        clearable
        @input="onSearchInput"
        ref="searchInput"
      />
      <div class="gif-grid" ref="gifGrid">
        <div v-if="loading" class="gif-loading">
          <n-spin size="medium" />
        </div>
        <div v-else-if="gifs.length === 0" class="gif-empty">
          {{ searchTerm ? 'Keine GIFs gefunden' : 'Lade Trending GIFs...' }}
        </div>
        <template v-else>
          <img
            v-for="gif in gifs"
            :key="gif.id"
            :src="gif.preview_url"
            :alt="gif.description"
            class="gif-item"
            @click="selectGif(gif)"
            loading="lazy"
          />
        </template>
      </div>
      <div class="gif-attribution">
        Powered by KLIPY
      </div>
    </n-card>
  </n-modal>
</template>

<script>
import { useGifSearchStore } from '../stores/index.js'

let searchTimeout = null

export default {
  name: 'GifPicker',
  props: {
    modelValue: { type: Boolean, default: false }
  },
  emits: ['update:modelValue', 'select'],
  data() {
    return {
      searchTerm: '',
      gifs: [],
      loading: false
    }
  },
  computed: {
    gifSearchStore() {
      return useGifSearchStore()
    },
    show: {
      get() { return this.modelValue },
      set(val) { this.$emit('update:modelValue', val) }
    }
  },
  watch: {
    modelValue(val) {
      if (val) {
        this.loadTrending()
        this.$nextTick(() => {
          this.$refs.searchInput?.focus()
        })
      }
    }
  },
  methods: {
    async loadTrending() {
      this.loading = true
      try {
        this.gifs = await this.gifSearchStore.loadTrending(20)
      } catch (error) {
        console.error('Failed to load trending GIFs:', error)
        this.gifs = []
      } finally {
        this.loading = false
      }
    },
    onSearchInput() {
      clearTimeout(searchTimeout)
      searchTimeout = setTimeout(() => {
        this.searchGifs()
      }, 300)
    },
    async searchGifs() {
      if (!this.searchTerm.trim()) {
        this.loadTrending()
        return
      }

      this.loading = true
      try {
        this.gifs = await this.gifSearchStore.searchGifs(this.searchTerm.trim(), 20)
      } catch (error) {
        console.error('Failed to search GIFs:', error)
        this.gifs = []
      } finally {
        this.loading = false
      }
    },
    selectGif(gif) {
      this.$emit('select', gif.url)
      this.show = false
      this.searchTerm = ''
    }
  }
}
</script>

<style scoped>
.gif-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.gif-item {
  width: 100%;
  height: auto;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.15s;
  object-fit: cover;
  max-height: 120px;
}

.gif-item:hover {
  transform: scale(1.03);
}

.gif-loading,
.gif-empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 40px 0;
  opacity: 0.5;
}

.gif-attribution {
  text-align: right;
  font-size: 11px;
  opacity: 0.3;
  margin-top: 8px;
}
</style>
