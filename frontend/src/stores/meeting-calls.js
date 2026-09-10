import { computed, ref, onScopeDispose } from 'vue'
import { defineStore } from 'pinia'
import api from '../lib/api.js'
import router from '../router/index.js'
import { useSessionStore } from './session.js'
import { useMeetingsStore } from './meetings.js'
import { playSfx, SFX_EVENTS } from '../lib/sfx.js'
import { t } from '../lib/i18n.js'
import { getApiErrorMessage } from '../lib/api-error.js'

export const useMeetingCallsStore = defineStore('meeting-calls', () => {
  const calls = ref([])
  const now = ref(Date.now())
  const busy = ref({})
  const owned = new Set()
  const entering = new Map()
  const entered = new Set()
  const requests = new Map()
  const reconciling = new Map()
  let generation = 0
  let timer = null
  let lastRing = null
  let lastReconcile = Date.now()
  const selfId = () => useSessionStore().user?.id
  const incoming = computed(() => calls.value.filter(call => call.caller_id !== selfId()
    && call.recipient_status === 'invited'
    && (call.status === 'ringing' || (call.status === 'accepted' && call.meeting_status === 'active'))
    && new Date(call.expires_at).getTime() > now.value))
  const outgoing = computed(() => calls.value.filter(call => call.caller_id === selfId()
    && call.status === 'ringing' && new Date(call.expires_at).getTime() > now.value))
  const available = computed(() => calls.value.filter(call => call.status === 'accepted'
    && call.meeting_status === 'active' && (call.caller_id === selfId() || call.recipient_status === 'accepted')
    && useMeetingsStore().activeMeetingId !== call.meeting_id))

  function syncRing() {
    if (!incoming.value.length) { lastRing = null; return }
    if (lastRing === null || now.value - lastRing >= 4000) {
      lastRing = now.value
      playSfx(SFX_EVENTS.CALL_INCOMING)
    }
  }

  function ensureTimer() {
    if (timer) return
    timer = setInterval(() => {
      now.value = Date.now()
      syncRing()
      if (now.value - lastReconcile >= 2000) {
        lastReconcile = now.value
        reconcilePendingCalls()
      }
    }, 500)
  }

  function reconcilePendingCalls() {
    // A missed socket event must not leave the caller ringing after acceptance.
    // Keep checking ringing records beyond the local deadline: acceptance may
    // have committed just before it, and only the server knows the outcome.
    for (const call of calls.value) {
      if (call.status !== 'ringing' && !incoming.value.some(entry => entry.id === call.id)) continue
      if (reconciling.has(call.id)) continue
      const currentGeneration = generation
      reconciling.set(call.id, currentGeneration)
      load(call.id).catch(() => {}).finally(() => {
        if (reconciling.get(call.id) === currentGeneration) reconciling.delete(call.id)
      })
    }
  }

  async function enter(call, { automatic = false } = {}) {
    if (!call.meeting_id) return
    if (entering.has(call.id)) return entering.get(call.id)
    if (automatic && entered.has(call.id)) return
    const taskGeneration = generation
    const task = (async () => {
      await useMeetingsStore().join(call.meeting_id)
      if (taskGeneration !== generation) return
      entered.add(call.id)
      await router.push(`/meetings/${call.meeting_id}`)
    })().finally(() => entering.delete(call.id))
    entering.set(call.id, task)
    return task
  }

  function apply(call) {
    if (!call?.id) return
    now.value = Date.now()
    calls.value = [...calls.value.filter(entry => entry.id !== call.id), call]
    syncRing()
    ensureTimer()
    if (call.status === 'accepted' && owned.has(call.id)) {
      owned.delete(call.id)
      if (call.meeting_status === 'active') {
        enter(call, { automatic: true }).catch(error => window.$message?.error(getApiErrorMessage(error) || t('calls.unavailable')))
      }
    }
    if (!['ringing', 'accepted'].includes(call.status)) owned.delete(call.id)
  }

  async function load(id) {
    const sequence = (requests.get(id) || 0) + 1
    requests.set(id, sequence)
    const currentGeneration = generation
    try {
      const { data } = await api.get(`/meeting-calls/${id}`)
      if (currentGeneration === generation && requests.get(id) === sequence) apply(data)
      return data
    } catch (error) {
      if (currentGeneration === generation && requests.get(id) === sequence && [403, 404].includes(error.response?.status)) {
        calls.value = calls.value.filter(call => call.id !== id)
        owned.delete(id)
      }
      throw error
    }
  }

  async function refresh() {
    const currentGeneration = generation
    const beforeRefresh = new Map(calls.value.map(call => [call.id, call]))
    const { data } = await api.get('/meeting-calls')
    if (generation !== currentGeneration) return
    // Read each current record to reconcile events that arrived during the list request.
    const ids = new Set((Array.isArray(data) ? data : data.data || []).map(call => call.id))
    calls.value = calls.value.filter(call => ids.has(call.id) || beforeRefresh.get(call.id) !== call)
    await Promise.all([...ids].map(id => load(id).catch(() => {})))
  }

  async function start(sourceChannelId, title = '') {
    const currentGeneration = generation
    const { data } = await api.post('/meeting-calls', { source_channel_id: sourceChannelId, ...(title ? { title } : {}) })
    if (currentGeneration !== generation) return
    if (!data.id && data.meeting_id) {
      await useMeetingsStore().join(data.meeting_id)
      await router.push(`/meetings/${data.meeting_id}`)
      return data
    }
    if (data.created_new && data.caller_id === selfId()) owned.add(data.id)
    apply(data)
    if (data.created_new) playSfx(SFX_EVENTS.CALL_OUTGOING)
    await load(data.id)
    return data
  }

  async function act(id, action) {
    if (busy.value[id]) return
    const currentGeneration = generation
    busy.value = { ...busy.value, [id]: action }
    try {
      const { data } = await api.patch(`/meeting-calls/${id}`, { action })
      if (currentGeneration !== generation) return
      requests.set(id, (requests.get(id) || 0) + 1)
      apply(data)
      if (action === 'accept' && data.accepted_now) await enter(data, { automatic: true })
      return data
    } catch (error) {
      if (currentGeneration === generation) await load(id).catch(() => {})
      throw error
    } finally {
      if (currentGeneration === generation) delete busy.value[id]
    }
  }

  function reset() {
    generation++
    calls.value = []
    busy.value = {}
    owned.clear()
    entered.clear()
    entering.clear()
    requests.clear()
    reconciling.clear()
    clearInterval(timer)
    timer = null
    lastRing = null
    lastReconcile = Date.now()
  }
  onScopeDispose(reset)
  return { calls, incoming, outgoing, available, now, busy, start, act, load, refresh, enter, reset }
})
