import { execFileSync } from 'node:child_process'
import { appendFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function isDocumentationPath(path) {
  return /^[^/]+\.md$/i.test(path) || /^(?:backend|frontend|desktop-ptt-helper)\/README(?:\.[^/]+)?\.md$/i.test(path)
    || /^docs\/.+\.(?:md|png|jpe?g|webp|svg|gif|drawio|pdf)$/i.test(path)
}

export function changedPaths(eventName, event, { git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } = {}) {
  const split = (output) => output.split('\0').filter(Boolean)
  const commit = /^[a-f0-9]{40,64}$/i
  try {
    if (eventName === 'push') {
      if (event.deleted) return []
      if (/^0+$/.test(event.before || '')) return split(git(['ls-files', '-z']))
      if (!commit.test(event.before || '') || !commit.test(event.after || '')) return null
      // Renames must include the removed source path, even when the new path is documentation.
      return split(git(['diff', '--no-renames', '--name-only', '-z', event.before, event.after, '--']))
    }
    if (eventName === 'pull_request') {
      const { base, head } = event.pull_request || {}
      if (!commit.test(base?.sha || '') || !commit.test(head?.sha || '')) return null
      return split(git(['diff', '--no-renames', '--name-only', '-z', `${base.sha}...${head.sha}`, '--']))
    }
  } catch {
    console.warn('Changed paths are unavailable; applying code-change checks.')
  }
  return null
}

export function planChecks({ eventName, paths = null, profile = 'auto', localContainers = true }) {
  if (!['auto', 'quick', 'full'].includes(profile)) throw new Error(`Unknown CI profile: ${profile}`)
  if (typeof localContainers !== 'boolean') throw new Error('Local container selection must be a boolean')
  if (profile === 'auto') {
    const automatic = ['push', 'pull_request'].includes(eventName)
    const documentationOnly = Array.isArray(paths) && paths.every(isDocumentationPath)
    profile = automatic && documentationOnly ? 'documentation' : eventName === 'push' ? 'quick' : 'full'
  }
  return { profile, core: profile !== 'documentation', full: profile === 'full', containers: profile === 'full' && localContainers }
}

export function requireChecks(needs) {
  if (needs?.scope?.result !== 'success') throw new Error('CI scope planning must succeed')
  const outputs = needs.scope.outputs || {}
  if (!['documentation', 'quick', 'full'].includes(outputs.profile)) throw new Error('Missing or invalid CI profile')
  const flag = (key) => {
    if (!['true', 'false'].includes(outputs[key])) throw new Error(`Missing or invalid CI flag: ${key}`)
    return outputs[key] === 'true'
  }
  const core = flag('core')
  const full = flag('full')
  const containers = flag('containers')
  if (core !== (outputs.profile !== 'documentation') || full !== (outputs.profile === 'full') || (containers && !full)) {
    throw new Error('Inconsistent CI scope outputs')
  }
  const required = { validate: core, 'postgres-integration': full, plesk: full, security: full, e2e: full, containers }
  const failures = Object.entries(required).filter(([name, mandatory]) => {
    const result = needs[name]?.result
    return mandatory ? result !== 'success' : !['success', 'skipped'].includes(result)
  }).map(([name]) => `${name}: ${needs[name]?.result || 'missing result'}`)
  if (failures.length) throw new Error(`CI checks did not pass: ${failures.join(', ')}`)
}

async function main(command, env = process.env) {
  if (command === 'plan') {
    const profile = env.CI_PROFILE || 'auto'
    const local = env.CI_LOCAL_CONTAINERS || 'true'
    if (!['true', 'false'].includes(local)) throw new Error('Invalid CI_LOCAL_CONTAINERS value')
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'))
    const paths = profile === 'auto' ? changedPaths(env.GITHUB_EVENT_NAME, event) : null
    const plan = planChecks({ eventName: env.GITHUB_EVENT_NAME, paths, profile, localContainers: local === 'true' })
    const output = Object.entries(plan).map(([key, value]) => `${key}=${value}\n`).join('')
    if (!env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required')
    await appendFile(env.GITHUB_OUTPUT, output)
    console.log(`CI profile: ${plan.profile}; local container tests: ${plan.containers}`)
    if (env.GITHUB_STEP_SUMMARY) {
      await appendFile(env.GITHUB_STEP_SUMMARY, `CI profile: **${plan.profile}**. Local container tests: **${plan.containers ? 'enabled' : 'skipped'}**.\n`)
    }
  } else if (command === 'verify') {
    requireChecks(JSON.parse(env.CI_RESULTS))
    console.log('Every check required by the selected CI profile passed.')
  } else throw new Error('Usage: node scripts/ci-policy.mjs plan|verify')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await main(process.argv[2]) } catch (error) { console.error(error.message); process.exitCode = 1 }
}
