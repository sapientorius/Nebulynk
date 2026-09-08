import { AsyncLocalStorage } from 'node:async_hooks'
import { Unavailable } from '@feathersjs/errors'

export function createRuntime({ log = console, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const scope = new AsyncLocalStorage()
  const pending = new Map()
  const timers = new Set()
  const tasks = []
  let state = 'starting'
  let started = false
  let stopPromise

  function track(name, work, { external = false } = {}) {
    if (state === 'stopped' || (state === 'stopping' && !scope.getStore())) {
      return Promise.reject(new Unavailable('Server is stopping'))
    }
    if (external && state !== 'ready' && !scope.getStore()) {
      return Promise.reject(new Unavailable('Server is not ready'))
    }
    const promise = scope.run(true, () => Promise.resolve().then(work))
    pending.set(promise, name)
    promise.then(() => pending.delete(promise), () => pending.delete(promise))
    return promise
  }

  function schedule(task, delay) {
    const timer = setTimer(() => {
      timers.delete(timer)
      if (state === 'stopping' || state === 'stopped') return
      void track(task.name, task.run).catch((error) => {
        log.error('Background task failed', { task: task.name, error: error.message })
      }).finally(() => {
        if (state !== 'stopping' && state !== 'stopped') schedule(task, task.intervalMs)
      })
    }, delay)
    timers.add(timer)
  }

  function quiesce() {
    if (state === 'stopped') return
    state = 'stopping'
    for (const timer of timers) clearTimer(timer)
    timers.clear()
  }

  async function drain() {
    // Admitted work can register descendants while draining.
    while (pending.size) await Promise.allSettled([...pending.keys()])
  }

  return {
    get state() { return state },
    getPendingNames: () => [...pending.values()],
    register(task) {
      if (started || state !== 'starting') throw new Error('Register tasks before runtime start')
      tasks.push(task)
    },
    track,
    start() {
      if (state === 'stopping' || state === 'stopped') throw new Error('Runtime cannot be restarted')
      if (started) return
      started = true
      for (const task of tasks) schedule(task, task.immediate ? 0 : task.intervalMs)
    },
    ready() { if (state === 'starting') state = 'ready' },
    quiesce,
    drain,
    stop() {
      if (!stopPromise) {
        quiesce()
        stopPromise = drain().then(() => { state = 'stopped' })
      }
      return stopPromise
    },
    async middleware(ctx, next) {
      if (ctx.method === 'GET' && ctx.path === '/health/ready') {
        ctx.status = state === 'ready' ? 200 : 503
        ctx.body = { status: state }
        return
      }
      if (state !== 'ready') {
        ctx.status = 503
        ctx.body = { status: state }
        return
      }
      await track(`http:${ctx.method}:${ctx.path}`, next, { external: true })
    },
    async hook(context, next) {
      if (!context.params?.provider) return next()
      return track(`service:${context.path}:${context.method}`, next, { external: true })
    }
  }
}
