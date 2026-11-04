import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { packageArtifact, collectArtifacts, verifyPublished, verifyPublic, verifyFiles, validateMetadata } from './ptt-helper-artifacts.mjs'

const revision = 'a'.repeat(40)
async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'nebulynk-helper-artifacts-'))
  const output = join(directory, 'downloads')
  try {
    for (const [platform, arch, extension] of [['macos', 'aarch64', 'dmg'], ['macos', 'x86_64', 'dmg'], ['windows', 'x86_64', 'msi']]) {
      const source = join(directory, platform, arch)
      await mkdir(source, { recursive: true })
      await writeFile(join(source, `test.${extension}`), `${platform}-${arch} installer fixture`)
      await packageArtifact({ platform, arch, source, output, revision })
    }
    await run({ directory, output, manifest: await collectArtifacts(output, revision) })
  } finally { await rm(directory, { recursive: true, force: true }) }
}

test('all architectures produce versioned checksums; only macOS carries beta status', async () => {
  await fixture(async ({ output, manifest }) => {
    assert.equal(manifest.artifacts.length, 3)
    for (const metadata of manifest.artifacts) {
      assert.equal(metadata.beta, metadata.platform === 'macos')
      assert.equal(metadata.revision, revision)
      await verifyFiles(output, metadata, manifest)
    }
  })
})

test('missing variants, corrupt installers and forged checksums block release collection', async () => {
  await fixture(async ({ output, manifest }) => {
    const metadata = manifest.artifacts[0]
    const installer = join(output, metadata.file)
    const original = await readFile(installer)
    await writeFile(installer, 'corrupt')
    await assert.rejects(collectArtifacts(output, revision), /checksum mismatch/)
    await writeFile(installer, original)
    await writeFile(`${installer}.sha256`, '0'.repeat(64) + `  ${metadata.file}\n`)
    await assert.rejects(collectArtifacts(output, revision), /checksum mismatch/)
    await rm(join(output, 'ptt-helper-macos-x86_64.json'))
    await assert.rejects(collectArtifacts(output, revision))
  })
})

test('wrong commit, helper version, architecture and unsafe paths are rejected', async () => {
  await fixture(async ({ manifest }) => {
    const original = manifest.artifacts[0]
    for (const patch of [{ revision: 'b'.repeat(40) }, { helperVersion: '999.0.0' }, { platformVersion: '999.0.0' },
      { beta: false }, { arch: 'universal' }, { file: '../outside.dmg' }, { size: 0 }]) {
      assert.throws(() => validateMetadata({ ...original, ...patch }, manifest), /Invalid or conflicting/)
    }
  })
})

test('immutable release reruns verify all downloaded bytes and manifest before advancing the feed', async () => {
  await fixture(async ({ directory, output, manifest }) => {
    const published = join(directory, 'published')
    await cp(output, published, { recursive: true })
    await verifyPublished(output, published, revision)
    await writeFile(join(published, manifest.artifacts[1].file), 'different downloaded bytes')
    await assert.rejects(verifyPublished(output, published, revision), /checksum mismatch/)
    await writeFile(join(published, 'ptt-helper-assets.json'), JSON.stringify({ ...manifest, revision: 'b'.repeat(40) }))
    await assert.rejects(verifyPublished(output, published, revision), /manifest conflicts/)
  })
})

test('public verification uses no authorization and detects inaccessible assets', async () => {
  await fixture(async ({ output }) => {
    const calls = []
    const fetchImpl = async (url, options) => {
      calls.push({ url, options })
      const bytes = await readFile(join(output, decodeURIComponent(new URL(url).pathname.split('/').at(-1))))
      return { ok: true, arrayBuffer: async () => bytes }
    }
    await verifyPublic(output, revision, { fetchImpl, repository: 'sapientorius/Nebulynk' })
    assert.equal(calls.length, 7)
    assert(calls.every(call => !call.options.headers && call.url.startsWith('https://github.com/sapientorius/Nebulynk/releases/download/v')))
    await assert.rejects(verifyPublic(output, revision, { fetchImpl: async () => ({ ok: false, status: 404 }) }), /HTTP 404/)
  })
})
