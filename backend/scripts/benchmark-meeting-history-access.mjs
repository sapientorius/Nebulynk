import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

const CONFIRMATION_VALUE = 'isolated-target'

function readOption(name, fallback = null) {
  const prefix = `${name}=`
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || fallback
}

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function percentile(values, percentileValue) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1)
  return Math.round(sorted[index] * 100) / 100
}

function parseTokens() {
  const raw = process.env.MEETING_HISTORY_BENCHMARK_TOKENS
    || process.env.MEETING_HISTORY_BENCHMARK_TOKEN
    || ''
  return raw.split(/[\s,]+/).map((token) => token.trim()).filter(Boolean)
}

function buildScenarios({ sourceChannelIds, chatChannelIds }) {
  const scenarios = []
  for (const sourceChannelId of sourceChannelIds) {
    scenarios.push(
      {
        name: `meeting-list:${sourceChannelId}`,
        path: `/meetings?${new URLSearchParams({
          source_channel_id: sourceChannelId,
          time_bucket: 'past',
          include_ended: 'true',
          detail: 'summary',
          $limit: '100'
        })}`
      },
      {
        name: `global-search:${sourceChannelId}`,
        path: `/search?${new URLSearchParams({
          q: 'benchmark',
          tab: 'meetings',
          channel_id: sourceChannelId,
          $limit: '50'
        })}`
      }
    )
  }

  for (const chatChannelId of chatChannelIds) {
    scenarios.push(
      {
        name: `meeting-messages:${chatChannelId}`,
        path: `/messages?${new URLSearchParams({ channel_id: chatChannelId, $limit: '50' })}`
      },
      {
        name: `message-search:${chatChannelId}`,
        path: `/message-search?${new URLSearchParams({ q: 'benchmark', channel_id: chatChannelId, $limit: '50' })}`
      }
    )
  }

  return scenarios
}

async function loadManifest(filePath) {
  if (!filePath) return null
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function authenticateManifestPersonas(baseUrl, manifest) {
  if (!Array.isArray(manifest?.personas) || manifest.personas.length === 0) return []
  return Promise.all(manifest.personas.map(async (persona) => {
    const response = await fetch(`${baseUrl}/authentication`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        strategy: 'local',
        email: persona.email,
        password: persona.password
      })
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !body.accessToken) {
      throw new Error(`Could not authenticate benchmark persona ${persona.role || persona.email} (${response.status}).`)
    }
    return body.accessToken
  }))
}

async function runStage({ baseUrl, concurrency, durationSeconds, scenarios, tokens, collect }) {
  const endAt = performance.now() + (durationSeconds * 1000)
  const measurements = []
  const failures = []
  let nextRequest = 0

  async function worker() {
    while (performance.now() < endAt) {
      const requestIndex = nextRequest
      nextRequest += 1
      const scenario = scenarios[requestIndex % scenarios.length]
      const token = tokens[requestIndex % tokens.length]
      const startedAt = performance.now()
      try {
        const response = await fetch(`${baseUrl}${scenario.path}`, {
          headers: { authorization: `Bearer ${token}` }
        })
        const durationMs = performance.now() - startedAt
        if (collect) {
          measurements.push({ durationMs, status: response.status, scenario: scenario.name })
        }
        if (!response.ok) {
          failures.push({ status: response.status, scenario: scenario.name })
        }
        await response.arrayBuffer()
      } catch (error) {
        if (collect) {
          measurements.push({ durationMs: performance.now() - startedAt, status: 0, scenario: scenario.name })
        }
        failures.push({ status: 0, scenario: scenario.name, message: error?.message || 'request failed' })
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return { measurements, failures }
}

const baseUrl = (readOption('--url', process.env.MEETING_HISTORY_BENCHMARK_URL || 'http://127.0.0.1:3030'))
  .replace(/\/$/, '')
const manifestFile = readOption('--manifest-file', process.env.MEETING_HISTORY_BENCHMARK_MANIFEST_FILE)
const concurrency = readPositiveInteger(readOption('--concurrency', process.env.MEETING_HISTORY_BENCHMARK_CONCURRENCY), 100)
const warmupSeconds = readPositiveInteger(readOption('--warmup-seconds', process.env.MEETING_HISTORY_BENCHMARK_WARMUP_SECONDS), 10)
const durationSeconds = readPositiveInteger(readOption('--duration-seconds', process.env.MEETING_HISTORY_BENCHMARK_DURATION_SECONDS), 60)
const manifest = await loadManifest(manifestFile)
const explicitSourceChannelId = readOption('--source-channel-id', process.env.MEETING_HISTORY_BENCHMARK_SOURCE_CHANNEL_ID)
const explicitChatChannelId = readOption('--chat-channel-id', process.env.MEETING_HISTORY_BENCHMARK_CHAT_CHANNEL_ID)
const sourceChannelIds = explicitSourceChannelId
  ? [explicitSourceChannelId]
  : Object.values(manifest?.sourceChannelIds || {})
const chatChannelIds = explicitChatChannelId
  ? [explicitChatChannelId]
  : Object.values(manifest?.chatChannelIds || {})

if (process.env.MEETING_HISTORY_BENCHMARK_CONFIRM !== CONFIRMATION_VALUE) {
  throw new Error(`Set MEETING_HISTORY_BENCHMARK_CONFIRM=${CONFIRMATION_VALUE} before running this benchmark.`)
}
if (process.env.MEETING_HISTORY_BENCHMARK_ISOLATED_DB !== 'true') {
  throw new Error('Set MEETING_HISTORY_BENCHMARK_ISOLATED_DB=true only for a dedicated benchmark database.')
}
const hostname = new URL(baseUrl).hostname
const isLocalTarget = ['127.0.0.1', 'localhost', '::1'].includes(hostname)
if (!isLocalTarget && process.env.MEETING_HISTORY_BENCHMARK_ALLOW_REMOTE !== 'true') {
  throw new Error('Remote targets require MEETING_HISTORY_BENCHMARK_ALLOW_REMOTE=true in addition to the confirmation value.')
}

if (sourceChannelIds.length === 0) {
  throw new Error('Pass --source-channel-id=<id> or provide a benchmark manifest with sourceChannelIds.')
}

const tokens = parseTokens()
const resolvedTokens = tokens.length > 0
  ? tokens
  : await authenticateManifestPersonas(baseUrl, manifest)
if (resolvedTokens.length === 0) {
  throw new Error('Set MEETING_HISTORY_BENCHMARK_TOKENS or provide a manifest with benchmark persona credentials.')
}

const scenarios = buildScenarios({ sourceChannelIds, chatChannelIds })
console.log(JSON.stringify({
  phase: 'warmup',
  expectedFixture: { historicalMeetings: 1000, channelMembers: 1000, personas: 4 },
  concurrency,
  warmupSeconds,
  durationSeconds,
  scenarios: scenarios.map((scenario) => scenario.name),
  personaTokenCount: resolvedTokens.length
}))

await runStage({
  baseUrl,
  concurrency,
  durationSeconds: warmupSeconds,
  scenarios,
  tokens: resolvedTokens,
  collect: false
})

const startedAt = performance.now()
const result = await runStage({
  baseUrl,
  concurrency,
  durationSeconds,
  scenarios,
  tokens: resolvedTokens,
  collect: true
})
const elapsedSeconds = (performance.now() - startedAt) / 1000
const successful = result.measurements.filter((measurement) => measurement.status >= 200 && measurement.status < 400)

console.log(JSON.stringify({
  phase: 'result',
  requests: result.measurements.length,
  successfulRequests: successful.length,
  failures: result.failures.length,
  errorRatePercent: result.measurements.length === 0
    ? 0
    : Math.round((result.failures.length / result.measurements.length) * 10_000) / 100,
  requestsPerSecond: Math.round((result.measurements.length / elapsedSeconds) * 100) / 100,
  latencyMs: {
    p50: percentile(successful.map((measurement) => measurement.durationMs), 50),
    p95: percentile(successful.map((measurement) => measurement.durationMs), 95)
  },
  failuresByScenario: result.failures.reduce((summary, failure) => {
    summary[failure.scenario] = (summary[failure.scenario] || 0) + 1
    return summary
  }, {})
}))
