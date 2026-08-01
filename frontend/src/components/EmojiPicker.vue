<template>
  <div class="emoji-picker">
    <div class="emoji-search">
      <n-input
        v-model:value="searchTerm"
        placeholder="Emoji suchen..."
        size="small"
        clearable
        ref="searchInput"
      />
    </div>
    <div class="emoji-categories" v-if="!searchTerm">
      <span
        v-for="cat in categories"
        :key="cat.name"
        class="category-icon"
        :class="{ active: activeCategory === cat.name }"
        @click="scrollToCategory(cat.name)"
        :title="cat.label"
      >
        {{ cat.icon }}
      </span>
    </div>
    <div class="emoji-grid-container" ref="gridContainer">
      <template v-if="searchTerm">
        <div class="emoji-grid">
          <span
            v-for="e in filteredEmojis"
            :key="e.emoji"
            class="emoji-item"
            :title="e.name"
            @click="handleSelect(e.emoji)"
          >
            {{ e.emoji }}
          </span>
          <div v-if="filteredEmojis.length === 0" class="emoji-empty">
            Keine Emojis gefunden
          </div>
        </div>
      </template>
      <template v-else>
        <div
          v-if="recentEmojiEntries.length > 0"
          class="emoji-recent-section"
          data-testid="emoji-picker-recent-section"
        >
          <div class="category-label">Zuletzt verwendet</div>
          <div class="emoji-grid">
            <span
              v-for="e in recentEmojiEntries"
              :key="`recent-${e.emoji}`"
              class="emoji-item"
              :title="e.name"
              @click="handleSelect(e.emoji)"
            >
              {{ e.emoji }}
            </span>
          </div>
        </div>
        <div
          v-for="cat in categories"
          :key="cat.name"
          :ref="(el) => { if (el) categoryRefs[cat.name] = el }"
        >
          <div class="category-label">{{ cat.label }}</div>
          <div class="emoji-grid">
            <span
              v-for="e in cat.emojis"
              :key="e.emoji"
              class="emoji-item"
              :title="e.name"
              @click="handleSelect(e.emoji)"
            >
              {{ e.emoji }}
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
import { emojiCategories, allEmojis } from '../lib/emoji-data.js'
import { readIsMobileLayout } from '../lib/mobile-layout.js'
import { loadRecentEmojis, saveRecentEmoji } from '../lib/recent-emojis.js'

const emojiLookup = new Map(allEmojis.map((entry) => [entry.emoji, entry]))

export default {
  name: 'EmojiPicker',
  emits: ['select'],
  data() {
    return {
      searchTerm: '',
      activeCategory: emojiCategories[0]?.name || '',
      categories: emojiCategories,
      categoryRefs: {},
      recentEmojis: []
    }
  },
  computed: {
    recentEmojiEntries() {
      return this.recentEmojis
        .map((emoji) => emojiLookup.get(emoji))
        .filter(Boolean)
    },
    filteredEmojis() {
      if (!this.searchTerm) return []
      const term = this.searchTerm.toLowerCase()
      return allEmojis.filter(
        (e) =>
          e.name.includes(term) ||
          e.keywords.some((k) => k.includes(term))
      )
    }
  },
  mounted() {
    this.recentEmojis = loadRecentEmojis()
    if (readIsMobileLayout()) return

    this.$nextTick(() => {
      this.$refs.searchInput?.focus()
    })
  },
  methods: {
    handleSelect(emoji) {
      this.recentEmojis = saveRecentEmoji(emoji)
      this.$emit('select', emoji)
    },
    scrollToCategory(name) {
      this.activeCategory = name
      const el = this.categoryRefs[name]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }
}
</script>

<style scoped>
.emoji-picker {
  width: 320px;
  display: flex;
  flex-direction: column;
}

.emoji-search {
  padding: 8px;
}

.emoji-categories {
  display: flex;
  gap: 2px;
  padding: 0 8px 8px;
  border-bottom: 1px solid var(--app-border);
}

.category-icon {
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 16px;
  transition: background 0.15s;
}

.category-icon:hover,
.category-icon.active {
  background: var(--app-hover);
}

.emoji-grid-container {
  max-height: 280px;
  overflow-y: auto;
  padding: 4px 8px 8px;
}

.emoji-recent-section {
  margin-bottom: 4px;
}

.category-label {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.6;
  padding: 8px 0 4px;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
}

.emoji-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  font-size: 20px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}

.emoji-item:hover {
  background: var(--app-hover);
}

.emoji-empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 16px;
  opacity: 0.5;
  font-size: 13px;
}
</style>
