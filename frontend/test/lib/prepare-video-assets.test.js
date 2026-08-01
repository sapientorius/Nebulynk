import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MEDIAPIPE_VENDOR_PUBLIC_PATH,
  SELFIE_SEGMENTER_PUBLIC_PATH,
  TASKS_VISION_WASM_FILES,
  prepareVideoAssets
} from '../../scripts/prepare-video-assets.mjs'

const tempDirs = []

async function makeTempDir() {
  const path = await mkdtemp(join(tmpdir(), 'nebulynk-video-assets-'))
  tempDirs.push(path)
  return path
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function writeFixture(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, value)
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('prepare video assets script', () => {
  it('copies MediaPipe wasm files and verifies the pinned model hash', async () => {
    const root = await makeTempDir()
    const wasmSourceDir = join(root, 'wasm-source')
    const modelSourceFile = join(root, 'model-source', 'selfie_segmenter.tflite')
    const publicRoot = join(root, 'public')
    const modelBytes = 'model-bytes-v1'

    for (const fileName of TASKS_VISION_WASM_FILES) {
      await writeFixture(join(wasmSourceDir, fileName), `wasm:${fileName}`)
    }
    await writeFixture(modelSourceFile, modelBytes)

    const result = await prepareVideoAssets({
      wasmSourceDir,
      modelSourceFile,
      publicRoot,
      expectedModelSha256: sha256(modelBytes)
    })

    for (const fileName of TASKS_VISION_WASM_FILES) {
      const copied = await readFile(join(publicRoot, MEDIAPIPE_VENDOR_PUBLIC_PATH.slice(1), fileName), 'utf8')
      expect(copied).toBe(`wasm:${fileName}`)
    }
    expect(await readFile(join(publicRoot, SELFIE_SEGMENTER_PUBLIC_PATH.slice(1)), 'utf8')).toBe(modelBytes)
    expect(result.modelSha256).toBe(sha256(modelBytes))
  })

  it('fails when the pinned model hash changes', async () => {
    const root = await makeTempDir()
    const wasmSourceDir = join(root, 'wasm-source')
    const modelSourceFile = join(root, 'model-source', 'selfie_segmenter.tflite')

    for (const fileName of TASKS_VISION_WASM_FILES) {
      await writeFixture(join(wasmSourceDir, fileName), `wasm:${fileName}`)
    }
    await writeFixture(modelSourceFile, 'unexpected-model')

    await expect(prepareVideoAssets({
      wasmSourceDir,
      modelSourceFile,
      publicRoot: join(root, 'public'),
      expectedModelSha256: sha256('expected-model')
    })).rejects.toThrow('Pinned selfie segmenter hash mismatch')
  })
})
