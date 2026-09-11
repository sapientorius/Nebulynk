<template>
  <n-card class="call-card" :class="{ 'call-card--compact': compact, 'call-card--outgoing': outgoing }" :bordered="false" size="small" role="region" :aria-label="`${status}: ${name}`">
    <div class="call-card-heading">
      <div class="call-avatar" aria-hidden="true">
        {{ initials }}
        <span class="call-avatar-badge"><n-icon :size="13"><CallOutline /></n-icon></span>
      </div>
      <div class="call-identity">
        <div class="call-status" role="status">{{ status }}</div>
        <div class="call-name" :title="name">{{ name }}</div>
        <div v-if="context" class="call-context" :title="context">{{ context }}</div>
      </div>
    </div>
    <div v-if="seconds !== null" class="call-time">
      <div class="call-time-label"><span>{{ $t('calls.timeRemaining') }}</span><span class="call-seconds">{{ $t('calls.seconds', { count: seconds }) }}</span></div>
      <div class="call-progress" aria-hidden="true"><div :style="{ width: `${Math.min(100, Math.max(0, seconds / 60 * 100))}%` }" /></div>
    </div>
    <div class="call-actions"><slot /></div>
  </n-card>
</template>

<script>
import { CallOutline } from '@vicons/ionicons5'

export default {
  name: 'CallInvitationCard',
  components: { CallOutline },
  props: {
    name: { type: String, required: true },
    status: { type: String, required: true },
    context: { type: String, default: '' },
    seconds: { type: Number, default: null },
    compact: { type: Boolean, default: false },
    outgoing: { type: Boolean, default: false }
  },
  computed: {
    initials() {
      return this.name.trim().split(/\s+/u).filter(Boolean).slice(0, 2).map(part => [...part][0]).join('').toLocaleUpperCase() || '?'
    }
  }
}
</script>

<style scoped>
.call-card {
  --call-accent: var(--theme-primary);
  --call-soft: var(--app-primary-soft);
  border: 1px solid var(--app-border-strong);
  border-radius: 18px;
  background: linear-gradient(135deg, var(--call-soft), transparent 65%), var(--n-color);
  color: var(--app-text);
  box-shadow: 0 12px 36px var(--app-shadow);
  overflow: hidden;
}
.call-card--outgoing { --call-accent: var(--theme-secondary); --call-soft: var(--app-secondary-soft); }
.call-card :deep(.n-card__content) { padding: 20px; }
.call-card-heading { display: flex; align-items: center; gap: 14px; }
.call-avatar {
  position: relative;
  display: grid;
  place-items: center;
  flex: 0 0 52px;
  height: 52px;
  border: 1px solid var(--app-border-strong);
  border-radius: 18px;
  background: var(--call-soft);
  color: var(--call-accent);
  font-size: 19px;
  font-weight: 700;
}
.call-avatar-badge {
  position: absolute;
  right: -5px;
  bottom: -4px;
  display: grid;
  place-items: center;
  width: 23px;
  height: 23px;
  border: 2px solid var(--n-color);
  border-radius: 50%;
  background: var(--call-accent);
  color: #102c23;
}
.call-identity { flex: 1; min-width: 0; }
.call-status { margin-bottom: 3px; font-size: 12px; font-weight: 600; color: var(--app-text-muted); }
.call-name { color: var(--app-text-strong); font-size: 19px; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
.call-context { margin-top: 4px; color: var(--app-text-muted); font-size: 12px; overflow-wrap: anywhere; }
.call-time { margin-top: 20px; }
.call-time-label { display: flex; justify-content: space-between; gap: 8px; color: var(--app-text-muted); font-size: 12px; }
.call-seconds { font-variant-numeric: tabular-nums; white-space: nowrap; }
.call-progress { height: 3px; margin-top: 8px; border-radius: 4px; overflow: hidden; background: var(--app-border); }
.call-progress > div { height: 100%; background: var(--call-accent); transition: width .5s linear; }
.call-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.call-actions :deep(.n-button) { flex: 1; min-height: 38px; border-radius: 10px; font-weight: 600; }
.call-actions :deep(.n-button:focus-visible) { outline: 2px solid var(--app-focus); outline-offset: 3px; }
.call-card--compact { border-radius: 12px; box-shadow: none; }
.call-card--compact :deep(.n-card__content) { padding: 12px 14px; }
.call-card--compact .call-avatar { flex-basis: 40px; height: 40px; border-radius: 13px; font-size: 16px; }
.call-card--compact .call-name { font-size: 15px; }
.call-card--compact .call-time, .call-card--compact .call-actions { margin-top: 10px; }
@media (prefers-reduced-motion: reduce) { .call-progress > div { transition: none; } }
</style>
