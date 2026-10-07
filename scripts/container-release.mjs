import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { root, run } from './ci-support.mjs'
import { scanners } from './run-ci-security.mjs'

export const components = ['backend', 'frontend', 'transcription-worker']
export const platforms = ['linux/amd64', 'linux/arm64']
const validDigest = (value) => /^sha256:[a-f0-9]{64}$/.test(value || '')
export const repository = (component) => `ghcr.io/sapientorius/nebulynk-${component}`
const docker = (args, options = {}) => run('docker', args, { quiet: true, timeout: 120000, ...options })

const stagingTagMatches = (tag, revision) => typeof revision === 'string' &&
  new RegExp(`^staging-${revision.slice(0, 12)}-[1-9]\\d*$`).test(tag || '')

export function publicationIdentity({ version, revision, created }, env = process.env) {
  const channel = env.NEBULYNK_CONTAINER_CHANNEL || 'stable'
  if (!/^\d+\.\d+\.\d+$/.test(version || '') || !/^[a-f0-9]{40,64}$/.test(revision || '') || env.GITHUB_SHA !== revision) {
    throw new Error('Container publication requires the exact checked-out workflow commit and a stable package version')
  }
  if (channel === 'stable') {
    if (env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF !== `refs/tags/v${version}` || env.GITHUB_REF_NAME !== `v${version}`) {
      throw new Error('Stable images may only be published from the matching immutable release tag')
    }
    return { version, revision, created, channel, tag: version }
  }
  if (channel !== 'staging' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || !env.GITHUB_REF?.startsWith('refs/heads/') ||
      !/^[1-9]\d*$/.test(env.GITHUB_RUN_ID || '')) {
    throw new Error('Staging images require a manually dispatched branch workflow and a valid GitHub run ID')
  }
  return { version, revision, created, channel, tag: `staging-${revision.slice(0, 12)}-${env.GITHUB_RUN_ID}` }
}

export const candidateTag = (identity, architecture) => `candidate-${identity.channel === 'staging' ? identity.tag : identity.revision}-${architecture}`

export function validateContainerManifest(manifest, { version, revision } = {}) {
  if (manifest?.schema_version !== 1 || manifest.channel !== undefined || manifest.tag !== undefined || !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
      !/^[a-f0-9]{40,64}$/.test(manifest.revision) ||
      (version && manifest.version !== version) || (revision && manifest.revision !== revision) ||
      JSON.stringify(manifest.platforms) !== JSON.stringify(platforms) ||
      Object.keys(manifest.images || {}).sort().join() !== [...components].sort().join()) {
    throw new Error('Invalid container release manifest or release identity')
  }
  for (const component of components) {
    const image = manifest.images[component]
    if (image.repository !== repository(component) || !validDigest(image.digest) ||
        Object.keys(image.platforms || {}).sort().join() !== [...platforms].sort().join() ||
        platforms.some((platform) => !validDigest(image.platforms[platform]))) {
      throw new Error(`Invalid container image metadata: ${component}`)
    }
  }
  return manifest
}

export function validateStagingManifest(manifest, expected = {}) {
  if (manifest?.channel !== 'staging' || !stagingTagMatches(manifest.tag, manifest.revision) ||
      (expected.tag && manifest.tag !== expected.tag)) throw new Error('Invalid staging image identity')
  const { channel: _channel, tag: _tag, ...releaseFields } = manifest
  validateContainerManifest(releaseFields, expected)
  return manifest
}

export async function inspectRemote(reference, execute = docker) {
  let output
  try { output = await execute(['buildx', 'imagetools', 'inspect', reference]) } catch (error) {
    if (/manifest unknown|not found|404 Not Found/i.test(error.output || error.message)) return null
    throw error // Authentication, connectivity and permission errors are not absence.
  }
  const digest = output.match(/^Digest:\s+(sha256:[a-f0-9]{64})/m)?.[1]
  if (!digest) throw new Error(`Missing registry digest: ${reference}`)
  const repo = reference.split('@')[0].replace(/:[^/:]+$/, '')
  const raw = await execute(['buildx', 'imagetools', 'inspect', '--raw', `${repo}@${digest}`])
  const manifest = JSON.parse(raw)
  if (createHash('sha256').update(raw.trimEnd()).digest('hex') !== digest.slice(7)) {
    // CLI output may add one newline; never reconstruct registry JSON for hashing.
    if (createHash('sha256').update(raw).digest('hex') !== digest.slice(7)) throw new Error(`Registry manifest digest mismatch: ${reference}`)
  }
  return { digest, manifest }
}

export async function inspectCandidate(reference, { inspect = inspectRemote, packageExists } = {}) {
  try { return await inspect(reference) } catch (error) {
    // GHCR can return 403 for a package that has never been created. This
    // exception applies only to candidate tags, never to fixed release tags.
    if (!/:candidate-(?:[a-f0-9]{40,64}|staging-[a-f0-9]{12}-[1-9]\d*)-(amd64|arm64)$/.test(reference) ||
        !/403 Forbidden|unauthorized|denied/i.test(error.output || error.message) || !packageExists || await packageExists()) throw error
    return null
  }
}

async function githubPackageExists(component) {
  if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required to check first-publication package access')
  const response = await fetch(`https://api.github.com/users/sapientorius/packages/container/nebulynk-${component}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(30000)
  })
  if (response.status === 404) return false
  if (response.ok) return true
  throw new Error(`GHCR package access check failed: HTTP ${response.status}`)
}

function descriptors(image) {
  if (!image?.manifest?.manifests?.length) throw new Error('Expected an OCI index with platform and attestation manifests')
  return image.manifest.manifests
}

export function assertSameDescriptors(existing, expected) {
  const digests = (entries) => entries.map((entry) => entry.digest).sort().join()
  if (digests(descriptors(existing)) !== digests(expected)) throw new Error('Published version has conflicting digests; refusing to overwrite it')
}

export async function promoteImages(candidates, { execute = docker, inspect = inspectRemote, channel = 'stable' } = {}) {
  const { version, revision } = candidates[0] || {}
  const tag = channel === 'staging' ? candidates[0]?.tag : version
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f0-9]{40,64}$/.test(revision || '') || candidates.length !== 2 ||
      !['stable', 'staging'].includes(channel) || (channel === 'staging' && !stagingTagMatches(tag, revision)) ||
      [...candidates.map((entry) => entry.platform)].sort().join() !== [...platforms].sort().join() ||
      candidates.some((entry) => entry.version !== version || entry.revision !== revision || entry.verified !== true ||
        (entry.channel || 'stable') !== channel || (entry.tag || entry.version) !== tag)) {
    throw new Error('Both verified native candidate results must belong to the same publication identity and channel')
  }
  const releases = []
  // Preflight every component before mutating any version tag.
  for (const component of components) {
    const refs = candidates.map((candidate) => {
      const digest = candidate.images?.[component]
      if (!validDigest(digest)) throw new Error(`Missing verified candidate digest: ${component}`)
      return `${repository(component)}@${digest}`
    })
    const indexes = await Promise.all(refs.map((ref) => inspect(ref, execute)))
    const expected = indexes.flatMap(descriptors)
    for (let index = 0; index < indexes.length; index++) {
      const runnable = descriptors(indexes[index]).filter((entry) => entry.platform?.os !== 'unknown')
      if (runnable.length !== 1 || `${runnable[0].platform.os}/${runnable[0].platform.architecture}` !== candidates[index].platform) {
        throw new Error(`Candidate platform mismatch: ${component}`)
      }
    }
    const reference = `${repository(component)}:${tag}`
    const existing = await inspect(reference, execute)
    if (existing) assertSameDescriptors(existing, expected)
    releases.push({ component, refs, expected, tag: reference, existing })
  }
  const manifest = { schema_version: 1, version, revision, platforms,
    ...(channel === 'staging' ? { channel, tag } : {}), images: {} }
  for (const release of releases) {
    if (!release.existing) await execute(['buildx', 'imagetools', 'create', '--tag', release.tag, ...release.refs])
    const published = release.existing || await inspect(release.tag, execute)
    assertSameDescriptors(published, release.expected)
    manifest.images[release.component] = {
      repository: repository(release.component), digest: published.digest,
      platforms: Object.fromEntries(candidates.map((entry) => [entry.platform, entry.images[release.component]]))
    }
  }
  return channel === 'staging' ? validateStagingManifest(manifest) : validateContainerManifest(manifest)
}

async function identity() {
  const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  const revision = (await run('git', ['rev-parse', 'HEAD'], { quiet: true })).trim()
  const created = (await run('git', ['show', '-s', '--format=%cI', 'HEAD'], { quiet: true })).trim()
  return publicationIdentity({ version, revision, created })
}

async function buildCandidates(architecture, directory) {
  if (!['amd64', 'arm64'].includes(architecture)) throw new Error('Unsupported candidate architecture')
  const expected = await identity()
  const { version, revision, created, channel, tag } = expected
  const result = { version, revision, channel, tag, platform: `linux/${architecture}`, verified: false, images: {} }
  await mkdir(directory, { recursive: true })
  for (const component of components) {
    const ref = `${repository(component)}:${candidateTag(expected, architecture)}`
    let image = await inspectCandidate(ref, { packageExists: () => githubPackageExists(component) })
    if (!image) {
      await docker(['buildx', 'build', '--platform', result.platform,
        '--file', component === 'frontend' ? 'frontend/Dockerfile' : 'backend/Dockerfile',
        '--target', component === 'frontend' ? 'production-stage' : component,
        '--build-arg', `BUILD_VERSION=${version}`, '--build-arg', `BUILD_SHA=${revision}`, '--build-arg', `BUILD_TIME=${created}`,
        '--provenance=mode=max', '--sbom=true', '--push', '--tag', ref, root
      ], { quiet: false, timeout: 1200000 })
      image = await inspectRemote(ref)
    }
    const pinned = `${repository(component)}@${image.digest}`
    await docker(['pull', '--platform', result.platform, pinned])
    const [local] = JSON.parse(await docker(['image', 'inspect', pinned]))
    const labels = local.Config.Labels
    if (labels['org.opencontainers.image.revision'] !== revision || labels['org.opencontainers.image.version'] !== version ||
        `${local.Os}/${local.Architecture}` !== result.platform) throw new Error(`Candidate identity mismatch: ${component}`)
    result.images[component] = image.digest
  }
  await writeFile(resolve(directory, `${architecture}.json`), `${JSON.stringify(result, null, 2)}\n`)
  const variables = {
    NEBULYNK_TEST_BACKEND_IMAGE: 'backend', NEBULYNK_TEST_FRONTEND_IMAGE: 'frontend', NEBULYNK_TEST_WORKER_IMAGE: 'transcription-worker'
  }
  if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required for candidate verification')
  const { appendFile } = await import('node:fs/promises')
  await appendFile(process.env.GITHUB_ENV, Object.entries(variables).map(([key, component]) => `${key}=${repository(component)}@${result.images[component]}`).join('\n') + '\n')
}

async function scanCandidates(architecture, directory) {
  const recordPath = resolve(directory, `${architecture}.json`)
  const record = JSON.parse(await readFile(recordPath, 'utf8'))
  for (const component of components) {
    const archive = resolve(directory, `${component}.tar`)
    await docker(['image', 'save', '--output', archive, `${repository(component)}@${record.images[component]}`])
    await docker(['run', '--rm', '--volume', `${resolve(directory)}:/scan`, scanners.trivy,
      'image', '--input', `/scan/${component}.tar`, '--scanners', 'vuln', '--severity', 'HIGH,CRITICAL', '--ignore-unfixed',
      '--exit-code', '1', '--timeout', '15m', '--format', 'json', '--output', `/scan/${component}-trivy.json`
    ], { quiet: false, timeout: 1200000 })
    await rm(archive)
  }
  // The workflow calls this only after its native container tests have passed.
  record.verified = true
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`)
}

async function promote(directory) {
  const files = (await readdir(directory, { recursive: true })).filter((name) => /(?:^|[\\/])(amd64|arm64)\.json$/.test(name))
  const candidates = await Promise.all(files.map(async (name) => JSON.parse(await readFile(resolve(directory, name), 'utf8'))))
  const expected = await identity()
  if (candidates.some((candidate) => candidate.version !== expected.version || candidate.revision !== expected.revision ||
      (candidate.channel || 'stable') !== expected.channel || (candidate.tag || candidate.version) !== expected.tag)) {
    throw new Error('Candidate metadata does not belong to this publication')
  }
  const manifest = await promoteImages(candidates, { channel: expected.channel })
  if (expected.channel === 'stable') await verifyPublicAccess(manifest)
  await mkdir(resolve(root, 'dist', 'containers'), { recursive: true })
  const name = expected.channel === 'staging' ? 'staging-images.json' : 'container-images.json'
  await writeFile(resolve(root, 'dist', 'containers', name), `${JSON.stringify(manifest, null, 2)}\n`)
  if (expected.channel === 'staging' && process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises')
    await appendFile(process.env.GITHUB_STEP_SUMMARY, [
      '## Staging image publication', '',
      `Commit: \`${manifest.revision}\``, '',
      `Coolify: set \`NEBULYNK_VERSION=${manifest.tag}\` with \`/docker-compose.coolify.yml\`.`, '',
      'Use this build after the anonymous-download check succeeds.', '',
      '| Component | Image | Digest |', '| --- | --- | --- |',
      ...components.map((component) => `| ${component} | \`${repository(component)}:${manifest.tag}\` | \`${manifest.images[component].digest}\` |`), '',
      'Download `container-staging-manifest` for the complete build identity and platform digests.', ''
    ].join('\n'))
  }
  console.log(`Published ${expected.channel} images: NEBULYNK_VERSION=${expected.tag}`)
}

export async function verifyPublicAccess(manifest, { execute = run, env = process.env } = {}) {
  const staging = manifest?.channel === 'staging'
  if (staging) validateStagingManifest(manifest)
  else validateContainerManifest(manifest)
  // This separate empty credential directory proves access without a login.
  const config = await mkdtemp(resolve(tmpdir(), 'nebulynk-anonymous-'))
  try {
    for (const component of components) {
      const ref = `${repository(component)}@${manifest.images[component].digest}`
      const options = { quiet: true, env: { ...env, DOCKER_CONFIG: config }, timeout: 300000 }
      await execute('docker', ['pull', '--platform', 'linux/amd64', ref], options)
      if (staging) await execute('docker', ['pull', '--platform', 'linux/amd64', `${repository(component)}:${manifest.tag}`], options)
    }
  } catch (error) {
    throw new Error('Anonymous image downloads failed. Make all three nebulynk-* GHCR packages public in GitHub Package settings, then rerun the failed jobs.', { cause: error })
  } finally { await rm(config, { recursive: true, force: true }) }
}

async function verifyStagingPublicAccess() {
  const expected = await identity()
  if (expected.channel !== 'staging') throw new Error('verify-public is only used by the staging workflow; stable promotion already requires public access')
  const manifest = validateStagingManifest(JSON.parse(await readFile(resolve(root, 'dist/containers/staging-images.json'), 'utf8')), expected)
  await verifyPublicAccess(manifest)
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises')
    await appendFile(process.env.GITHUB_STEP_SUMMARY, '\nAnonymous downloads succeeded. The staging images are ready for deployment.\n')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [action, architecture = '', location = 'output/container-candidates'] = process.argv.slice(2)
  if (action === 'build') await buildCandidates(architecture, resolve(location))
  else if (action === 'scan') await scanCandidates(architecture, resolve(location))
  else if (action === 'promote') await promote(resolve(architecture || 'output/container-candidates'))
  else if (action === 'verify-public') await verifyStagingPublicAccess()
  else throw new Error('Usage: container-release.mjs build|scan ARCH [DIRECTORY] | promote [DIRECTORY] | verify-public')
}
