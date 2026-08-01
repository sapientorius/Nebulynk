import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { access, copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const TASKS_VISION_VERSION = '0.10.14'
export const MEDIAPIPE_VENDOR_PUBLIC_PATH = `/vendor/mediapipe/tasks-vision/${TASKS_VISION_VERSION}/wasm`
export const SELFIE_SEGMENTER_PUBLIC_PATH = '/vendor/mediapipe/models/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
export const SELFIE_SEGMENTER_SHA256 = '191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b'

export const TASKS_VISION_WASM_FILES = Object.freeze([
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm'
])

const scriptDir = dirname(fileURLToPath(import.meta.url))
const defaultFrontendRoot = resolve(scriptDir, '..')
const defaultRepoRoot = resolve(defaultFrontendRoot, '..')

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function resolveExistingPath(candidates, label) {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }
  throw new Error(`Missing ${label}: checked ${candidates.join(', ')}`)
}

async function sha256File(path) {
  const buffer = await readFile(path)
  return createHash('sha256').update(buffer).digest('hex')
}

async function copyFileIfChanged(source, target) {
  await mkdir(dirname(target), { recursive: true })

  try {
    const [sourceStat, targetStat] = await Promise.all([stat(source), stat(target)])
    if (sourceStat.size === targetStat.size) {
      const [sourceHash, targetHash] = await Promise.all([sha256File(source), sha256File(target)])
      if (sourceHash === targetHash) {
        return false
      }
    }
  } catch {
    // Missing or unreadable target files are replaced below.
  }

  await copyFile(source, target)
  return true
}

export async function prepareVideoAssets(options = {}) {
  const frontendRoot = options.frontendRoot ? resolve(options.frontendRoot) : defaultFrontendRoot
  const repoRoot = options.repoRoot ? resolve(options.repoRoot) : defaultRepoRoot
  const publicRoot = options.publicRoot ? resolve(options.publicRoot) : join(frontendRoot, 'public')
  const wasmSourceDir = options.wasmSourceDir
    ? resolve(options.wasmSourceDir)
    : await resolveExistingPath([
      join(frontendRoot, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
      join(repoRoot, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
    ], '@mediapipe/tasks-vision wasm directory')
  const modelSourceFile = options.modelSourceFile
    ? resolve(options.modelSourceFile)
    : join(frontendRoot, 'vendor', 'mediapipe', 'models', 'selfie_segmenter', 'float16', 'latest', 'selfie_segmenter.tflite')
  const expectedModelSha256 = (options.expectedModelSha256 || SELFIE_SEGMENTER_SHA256).toLowerCase()
  const wasmTargetDir = join(publicRoot, MEDIAPIPE_VENDOR_PUBLIC_PATH.replace(/^\//, ''))
  const modelTargetFile = join(publicRoot, SELFIE_SEGMENTER_PUBLIC_PATH.replace(/^\//, ''))
  const copied = []

  for (const fileName of TASKS_VISION_WASM_FILES) {
    const source = join(wasmSourceDir, fileName)
    if (!await pathExists(source)) {
      throw new Error(`Missing MediaPipe WASM asset: ${source}`)
    }
    const target = join(wasmTargetDir, fileName)
    if (await copyFileIfChanged(source, target)) {
      copied.push(target)
    }
  }

  if (!await pathExists(modelSourceFile)) {
    throw new Error(`Missing pinned selfie segmenter model: ${modelSourceFile}`)
  }

  const modelSourceSha256 = await sha256File(modelSourceFile)
  if (modelSourceSha256 !== expectedModelSha256) {
    throw new Error(`Pinned selfie segmenter hash mismatch: expected ${expectedModelSha256}, got ${modelSourceSha256}`)
  }

  if (await copyFileIfChanged(modelSourceFile, modelTargetFile)) {
    copied.push(modelTargetFile)
  }

  const modelTargetSha256 = await sha256File(modelTargetFile)
  if (modelTargetSha256 !== expectedModelSha256) {
    throw new Error(`Prepared selfie segmenter hash mismatch: expected ${expectedModelSha256}, got ${modelTargetSha256}`)
  }

  return {
    copied,
    wasmTargetDir,
    modelTargetFile,
    modelSha256: modelTargetSha256
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareVideoAssets()
    .then((result) => {
      console.log(`Prepared video assets (${result.copied.length} copied).`)
    })
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
