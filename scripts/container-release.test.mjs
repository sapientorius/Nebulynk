import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { access, readdir } from 'node:fs/promises'
import { assertSameDescriptors, candidateTag, components, inspectCandidate, inspectRemote, platforms, promoteImages, publicationIdentity, repository,
  validateContainerManifest, validateStagingManifest, verifyPublicAccess } from './container-release.mjs'
import { assertReleaseAssets } from './verify-release-container-assets.mjs'

const digest = (number) => `sha256:${number.toString(16).padStart(64, '0')}`
const revision = 'a'.repeat(40)
const candidates = () => platforms.map((platform, index) => ({
  version: '1.2.3', revision, platform, verified: true,
  images: Object.fromEntries(components.map((component, componentIndex) => [component, digest(index * 10 + componentIndex + 1)]))
}))

function fixture({ conflicting = false, existing = false, failCreate = false, failCreateAt = 0, tag = '1.2.3' } = {}) {
  const published = new Map()
  const writes = []
  const inspect = async (ref) => {
    if (published.has(ref)) return published.get(ref)
    if (ref.includes('@')) {
      const value = Number.parseInt(ref.split('@sha256:')[1], 16)
      const architecture = value < 10 ? 'amd64' : 'arm64'
      return { digest: digest(value), manifest: { manifests: [
        { digest: digest(value + 100), platform: { os: 'linux', architecture } },
        { digest: digest(value + 200), platform: { os: 'unknown', architecture: 'unknown' } }
      ] } }
    }
    if (existing) {
      const component = components.find((name) => ref === `${repository(name)}:${tag}`)
      const index = components.indexOf(component) + 1
      const entries = [index + 100, index + 200, index + 110, index + 210].map((value) => ({ digest: digest(value) }))
      if (conflicting) entries[0].digest = digest(999)
      return { digest: digest(500 + index), manifest: { manifests: entries } }
    }
    return null
  }
  const execute = async (args) => {
    writes.push(args)
    if (failCreate || writes.length === failCreateAt) throw new Error('Registry publication failed')
    const tag = args[args.indexOf('--tag') + 1]
    const refs = args.slice(args.indexOf('--tag') + 2)
    const entries = (await Promise.all(refs.map(inspect))).flatMap((image) => image.manifest.manifests)
    published.set(tag, { digest: digest(500 + writes.length), manifest: { manifests: entries } })
  }
  return { inspect, execute, writes }
}

test('publishes only both verified native candidates and retains exact artifact digests', async () => {
  const registry = fixture()
  const manifest = await promoteImages(candidates(), registry)
  assert.equal(registry.writes.length, 3)
  assert.equal(manifest.revision, revision)
  assert.deepEqual(manifest.platforms, platforms)
  assert.equal(manifest.images.backend.platforms['linux/amd64'], digest(1))
  validateContainerManifest(manifest, { version: '1.2.3', revision })
  assert.throws(() => validateContainerManifest(manifest, { version: '1.2.4' }))
})

test('reuses published matching versions without modifying any tag', async () => {
  const registry = fixture({ existing: true })
  await promoteImages(candidates(), registry)
  assert.equal(registry.writes.length, 0)
})

test('preflights conflicts and rejects unverified, mixed or incomplete results before writes', async () => {
  for (const values of [candidates().slice(0, 1), candidates().map((entry, index) => ({ ...entry, verified: index === 0 })),
    candidates().map((entry, index) => ({ ...entry, version: index ? '1.2.4' : '1.2.3' }))]) {
    const registry = fixture()
    await assert.rejects(promoteImages(values, registry))
    assert.equal(registry.writes.length, 0)
  }
  const registry = fixture({ existing: true, conflicting: true })
  await assert.rejects(promoteImages(candidates(), registry), /conflicting digests/)
  assert.equal(registry.writes.length, 0)
})

test('publication failure returns no completed release manifest', async () => {
  await assert.rejects(promoteImages(candidates(), fixture({ failCreate: true })), /publication failed/)
})

test('a partial publication resumes without rewriting the already published component', async () => {
  const registry = fixture({ failCreateAt: 2 })
  await assert.rejects(promoteImages(candidates(), registry), /publication failed/)
  const manifest = await promoteImages(candidates(), registry)
  assert.equal(registry.writes.filter((args) => args.includes(`${repository('backend')}:1.2.3`)).length, 1)
  assert.equal(registry.writes.length, 4)
  validateContainerManifest(manifest)
})

test('a conflicting final component prevents publication of the earlier components', async () => {
  const missing = fixture()
  const conflicting = fixture({ existing: true, conflicting: true })
  await assert.rejects(promoteImages(candidates(), {
    inspect: (ref) => ref === `${repository('transcription-worker')}:1.2.3` ? conflicting.inspect(ref) : missing.inspect(ref),
    execute: missing.execute
  }), /conflicting digests/)
  assert.equal(missing.writes.length, 0)
})

test('registry access failures are not treated as an absent image', async () => {
  await assert.rejects(inspectRemote('test:image', async () => { throw Object.assign(new Error('denied'), { output: 'unauthorized' }) }), /denied/)
  assert.equal(await inspectRemote('test:image', async () => { throw Object.assign(new Error('missing'), { output: 'manifest unknown' }) }), null)
  assert.throws(() => assertSameDescriptors({ manifest: { manifests: [{ digest: digest(1) }] } }, [{ digest: digest(2) }]), /conflicting/)
})

test('initial GHCR candidates require a package absence check while fixed versions fail closed on access errors', async () => {
  const denied = async () => { throw new Error('403 Forbidden') }
  const ref = `${repository('backend')}:candidate-${revision}-amd64`
  assert.equal(await inspectCandidate(ref, { inspect: denied, packageExists: async () => false }), null)
  await assert.rejects(inspectCandidate(ref, { inspect: denied, packageExists: async () => true }), /403/)
  await assert.rejects(inspectCandidate(ref, { inspect: denied, packageExists: async () => { throw new Error('Invalid token') } }), /Invalid token/)
  await assert.rejects(inspectCandidate(`${repository('backend')}:1.2.3`, { inspect: denied, packageExists: async () => false }), /403/)
})

test('reruns require the already published Plesk package and container manifest to match before releasing the feed', async () => {
  const manifest = await promoteImages(candidates(), fixture())
  const archive = Buffer.from('deterministic Plesk package')
  const checksum = createHash('sha256').update(archive).digest('hex')
  const values = { expectedManifest: manifest, publishedManifest: manifest, expectedArchive: archive, publishedArchive: archive,
    archiveName: 'nebulynk.zip', publishedChecksum: `${checksum}  nebulynk.zip\n` }
  assertReleaseAssets(values)
  assert.throws(() => assertReleaseAssets({ ...values, publishedArchive: Buffer.from('old source package') }), /Plesk package/)
  assert.throws(() => assertReleaseAssets({ ...values, publishedChecksum: 'incorrect' }), /checksum/)
  const changed = structuredClone(manifest)
  changed.images.frontend.digest = digest(999)
  assert.throws(() => assertReleaseAssets({ ...values, publishedManifest: changed }), /conflicts/)
  assert.throws(() => assertReleaseAssets({ ...values, publishedManifest: null }), /manifest/)
})

const stagingCandidates = (run = '123456') => candidates().map((entry) => ({
  ...entry, channel: 'staging', tag: `staging-${revision.slice(0, 12)}-${run}`
}))

test('stable publication requires the exact commit and matching pushed release tag', () => {
  const source = { version: '1.2.3', revision, created: '2026-10-07T12:00:00Z' }
  const env = { GITHUB_SHA: revision, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/tags/v1.2.3', GITHUB_REF_NAME: 'v1.2.3' }
  const identity = publicationIdentity(source, env)
  assert.equal(identity.channel, 'stable')
  assert.equal(identity.tag, '1.2.3')
  assert.equal(candidateTag(identity, 'amd64'), `candidate-${revision}-amd64`)
  for (const invalid of [
    { GITHUB_SHA: 'b'.repeat(40) }, { GITHUB_EVENT_NAME: 'workflow_dispatch' },
    { GITHUB_REF: 'refs/heads/v1.2.3' }, { GITHUB_REF_NAME: 'v1.2.4' },
    { NEBULYNK_CONTAINER_CHANNEL: 'preview' }
  ]) assert.throws(() => publicationIdentity(source, { ...env, ...invalid }))
  assert.throws(() => publicationIdentity({ ...source, version: '1.2.3-rc.1' }, env))
})

test('manually dispatched staging builds have unique tags and preserve rerun identity', () => {
  const source = { version: '1.2.3', revision }
  const env = { NEBULYNK_CONTAINER_CHANNEL: 'staging', GITHUB_SHA: revision,
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '123456' }
  const identity = publicationIdentity(source, env)
  assert.equal(identity.tag, stagingCandidates()[0].tag)
  assert.equal(candidateTag(identity, 'arm64'), `candidate-${identity.tag}-arm64`)
  assert.equal(publicationIdentity(source, { ...env, GITHUB_RUN_ATTEMPT: '2' }).tag, identity.tag)
  assert.notEqual(publicationIdentity(source, { ...env, GITHUB_RUN_ID: '123457' }).tag, identity.tag)
  for (const invalid of [
    { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_REF: 'refs/tags/v1.2.3' }, { GITHUB_SHA: 'b'.repeat(40) },
    { GITHUB_RUN_ID: '' }, { GITHUB_RUN_ID: '0' }, { GITHUB_RUN_ID: '../release' }
  ]) assert.throws(() => publicationIdentity(source, { ...env, ...invalid }))
})

test('staging publication only writes staging tags and its manifest cannot be used as a stable release', async () => {
  const registry = fixture()
  const manifest = await promoteImages(stagingCandidates(), { ...registry, channel: 'staging' })
  assert.equal(registry.writes.length, 3)
  for (const [index, component] of components.entries()) {
    assert.equal(registry.writes[index][registry.writes[index].indexOf('--tag') + 1], `${repository(component)}:${manifest.tag}`)
  }
  assert.equal(manifest.version, '1.2.3')
  assert.equal(manifest.channel, 'staging')
  validateStagingManifest(manifest, { version: '1.2.3', revision, tag: stagingCandidates()[0].tag })
  assert.throws(() => validateStagingManifest(manifest, { tag: stagingCandidates('123457')[0].tag }))
  assert.throws(() => validateContainerManifest(manifest), /release manifest/)
  assert.throws(() => assertReleaseAssets({ expectedManifest: manifest }), /release manifest/)
})

test('staging retries reuse matching tags and reject conflicts without any writes', async () => {
  const tag = stagingCandidates()[0].tag
  const matching = fixture({ existing: true, tag })
  await promoteImages(stagingCandidates(), { ...matching, channel: 'staging' })
  assert.equal(matching.writes.length, 0)
  const conflict = fixture({ existing: true, conflicting: true, tag })
  await assert.rejects(promoteImages(stagingCandidates(), { ...conflict, channel: 'staging' }), /conflicting digests/)
  assert.equal(conflict.writes.length, 0)
  const partial = fixture({ failCreateAt: 2 })
  await assert.rejects(promoteImages(stagingCandidates(), { ...partial, channel: 'staging' }), /publication failed/)
  await promoteImages(stagingCandidates(), { ...partial, channel: 'staging' })
  assert.equal(partial.writes.filter((args) => args.includes(`${repository('backend')}:${tag}`)).length, 1)
})

test('mixed channels, staging runs and unverified results cannot publish any tags', async () => {
  const cases = [
    { values: stagingCandidates(), channel: 'stable' },
    { values: candidates(), channel: 'staging' },
    { values: [stagingCandidates()[0], stagingCandidates('123457')[1]], channel: 'staging' },
    { values: [stagingCandidates()[0], candidates()[1]], channel: 'staging' },
    { values: stagingCandidates().map((entry) => ({ ...entry, tag: '1.2.3' })), channel: 'staging' },
    { values: stagingCandidates().map((entry) => ({ ...entry, tag: 'staging-bbbbbbbbbbbb-123456' })), channel: 'staging' },
    { values: stagingCandidates().map((entry) => ({ ...entry, verified: false })), channel: 'staging' }
  ]
  for (const { values, channel } of cases) {
    const registry = fixture()
    await assert.rejects(promoteImages(values, { ...registry, channel }))
    assert.equal(registry.writes.length, 0)
  }
})

test('first-publication staging candidates require the same package-absence check as release candidates', async () => {
  const denied = async () => { throw new Error('403 Forbidden') }
  const ref = `${repository('backend')}:candidate-${stagingCandidates()[0].tag}-amd64`
  assert.equal(await inspectCandidate(ref, { inspect: denied, packageExists: async () => false }), null)
  await assert.rejects(inspectCandidate(ref, { inspect: denied, packageExists: async () => true }), /403/)
  await assert.rejects(inspectCandidate(`${repository('backend')}:${stagingCandidates()[0].tag}`, {
    inspect: denied, packageExists: async () => false
  }), /403/)
})

test('staging verifies anonymous pulls of all deployment tags and exact digests with an empty credential directory', async () => {
  const manifest = await promoteImages(stagingCandidates(), { ...fixture(), channel: 'staging' })
  const commands = []
  let config
  await verifyPublicAccess(manifest, {
    env: { DOCKER_CONFIG: '/existing-authenticated-config' },
    execute: async (command, args, options) => {
      assert.equal(command, 'docker')
      config = options.env.DOCKER_CONFIG
      assert.notEqual(config, '/existing-authenticated-config')
      assert.deepEqual(await readdir(config), [])
      commands.push(args)
    }
  })
  assert.equal(commands.length, 6)
  for (const [index, component] of components.entries()) {
    assert.equal(commands[index * 2].at(-1), `${repository(component)}@${manifest.images[component].digest}`)
    assert.equal(commands[index * 2 + 1].at(-1), `${repository(component)}:${manifest.tag}`)
  }
  await assert.rejects(access(config), { code: 'ENOENT' })
})

test('anonymous download failures retain their cause and block the public-access gate', async () => {
  const manifest = await promoteImages(candidates(), fixture())
  const denied = new Error('unauthorized')
  let config
  await assert.rejects(verifyPublicAccess(manifest, { execute: async (_command, _args, options) => {
    config = options.env.DOCKER_CONFIG
    throw denied
  } }), (error) => error.cause === denied && /GHCR packages public/.test(error.message))
  await assert.rejects(access(config), { code: 'ENOENT' })
})
