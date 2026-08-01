<template>
  <n-modal
    :show="show"
    class="sponsorship-prompt"
    :mask-closable="false"
    :close-on-esc="true"
    data-testid="sponsorship-prompt"
    @update:show="onModalVisibilityChange"
  >
    <n-card
      class="sponsorship-prompt-card"
      :title="$t('sponsorship.title')"
      :bordered="false"
      closable
      @close="close"
    >
      <p class="sponsorship-prompt-copy">{{ $t('sponsorship.description') }}</p>
      <p class="sponsorship-prompt-owner-note">{{ $t('sponsorship.owner_note') }}</p>
      <template #footer>
        <n-space class="sponsorship-prompt-actions" justify="end" :wrap="true">
          <n-button
            tag="a"
            type="primary"
            href="https://nebulynk.net/sponsorship"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="sponsorship-prompt-link"
          >
            {{ $t('sponsorship.sponsor_action') }}
          </n-button>
          <n-button data-testid="sponsorship-prompt-dismiss" @click="close">
            {{ $t('sponsorship.close_action') }}
          </n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<script>
export default {
  name: 'SponsorshipPrompt',
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  emits: ['close'],
  methods: {
    onModalVisibilityChange(visible) {
      if (!visible) this.close()
    },
    close() {
      this.$emit('close')
    }
  }
}
</script>

<style scoped>
.sponsorship-prompt {
  width: min(480px, calc(100vw - 32px));
}

.sponsorship-prompt-card {
  border-radius: 20px;
  background: var(--app-surface-raised);
  box-shadow: 0 28px 80px var(--app-shadow);
}

.sponsorship-prompt-copy {
  margin: 0 0 12px;
  line-height: 1.5;
}

.sponsorship-prompt-owner-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--app-text-muted);
}

.sponsorship-prompt-actions {
  align-items: center;
}

@media (max-width: 900px) {
  .sponsorship-prompt {
    width: calc(100vw - 24px);
  }
}
</style>
