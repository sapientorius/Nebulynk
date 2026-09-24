import { GetObjectCommand } from '@aws-sdk/client-s3'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, statfs } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { spawn } from 'node:child_process'
import { DEFAULT_PROVIDER_MAX_AUDIO_BYTES, DEFAULT_CHUNK_OVERLAP_SECONDS } from './audio-chunking.js'

const DEFAULT_MAX_TEMP_BYTES = 2 * 1024 * 1024 * 1024
const DEFAULT_MAX_CHUNK_SECONDS = 300
const MIN_FREE_BYTES = 256 * 1024 * 1024
const DISK_CHECK_INTERVAL_BYTES = 64 * 1024 * 1024

function temporaryDiskFullError() {
  const error = new Error('Insufficient temporary disk space for recording')
  error.code = 'temporary_disk_full'
  return error
}

export function transcriptionTempRoot(env = process.env) {
  return env.TRANSCRIPTION_TEMP_ROOT || join(tmpdir(), 'nebulynk-transcription')
}

export async function clearStaleTranscriptionFiles(root = transcriptionTempRoot()) {
  await mkdir(root, { recursive: true })
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('job-')) {
      await rm(join(root, entry.name), { recursive: true, force: true })
    }
  }
}

function maxTempBytes(env = process.env) {
  const value = Number(env.TRANSCRIPTION_MAX_TEMP_BYTES)
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_MAX_TEMP_BYTES
}

export async function downloadRecordingToTemp(client, recording, {
  root = transcriptionTempRoot(),
  signal,
  maxBytes = maxTempBytes()
} = {}) {
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(join(root, 'job-'))
  const path = join(directory, 'recording.mp4')
  const limit = maxBytes
  try {
    const response = await client.send(new GetObjectCommand({
      Bucket: recording.storage_bucket,
      Key: recording.storage_key
    }), { abortSignal: signal })
    const declaredSize = Number(response.ContentLength)
    if (Number.isFinite(declaredSize) && declaredSize > limit) {
      const error = new Error(`Recording exceeds transcription temporary storage limit (${limit} bytes)`)
      error.code = 'recording_too_large'
      throw error
    }
    const disk = await statfs(root)
    if (disk.bavail * disk.bsize < MIN_FREE_BYTES) throw temporaryDiskFullError()
    if (Number.isFinite(declaredSize) && declaredSize > disk.bavail * disk.bsize - MIN_FREE_BYTES) {
      throw temporaryDiskFullError()
    }
    let size = 0
    let nextDiskCheck = DISK_CHECK_INTERVAL_BYTES
    const digest = createHash('sha256')
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        size += chunk.length
        if (size > limit) {
          const error = new Error(`Recording exceeds transcription temporary storage limit (${limit} bytes)`)
          error.code = 'recording_too_large'
          callback(error)
          return
        }
        digest.update(chunk)
        if (size >= nextDiskCheck) {
          nextDiskCheck = size + DISK_CHECK_INTERVAL_BYTES
          statfs(root).then((currentDisk) => {
            if (currentDisk.bavail * currentDisk.bsize < MIN_FREE_BYTES) {
              callback(temporaryDiskFullError())
            } else {
              callback(null, chunk)
            }
          }, callback)
          return
        }
        callback(null, chunk)
      }
    })
    await pipeline(response.Body, meter, createWriteStream(path), { signal })
    return {
      directory,
      path,
      size,
      mime: response.ContentType || recording.mime_type || 'video/mp4',
      signature: digest.digest('hex')
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

function runMediaProcess(command, args, { signal, onStderrLine, captureStdout = false, timeoutMs = 600_000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new Error('Media processing aborted'))
      return
    }
    const child = spawn(command, args, { stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', 'pipe'] })
    let stdout = ''
    let stderrTail = ''
    let pendingLine = ''
    let settled = false
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    const onAbort = () => child.kill('SIGKILL')
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
    if (captureStdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
        if (stdout.length > 65_536) child.kill('SIGKILL')
      })
    }
    child.stderr.on('data', (chunk) => {
      const value = chunk.toString()
      stderrTail = (stderrTail + value).slice(-2048)
      pendingLine += value
      let newline = pendingLine.indexOf('\n')
      while (newline >= 0) {
        onStderrLine?.(pendingLine.slice(0, newline))
        pendingLine = pendingLine.slice(newline + 1)
        newline = pendingLine.indexOf('\n')
      }
      if (pendingLine.length > 4096) pendingLine = pendingLine.slice(-4096)
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (code === 0 && !signal?.aborted) resolve(stdout)
      else reject(new Error(`${command} exited with code ${code}: ${stderrTail}`))
    })
  })
}

export async function probeRecordingDuration(path, { signal, ffprobePath = process.env.FFPROBE_PATH || 'ffprobe' } = {}) {
  const output = await runMediaProcess(ffprobePath, [
    '-v', 'error', '-print_format', 'json', '-show_format', path
  ], { signal, captureStdout: true, timeoutMs: 60_000 })
  const duration = Number(JSON.parse(output || '{}')?.format?.duration)
  if (!Number.isFinite(duration) || duration <= 0) {
    const error = new Error('Recording has no valid audio duration')
    error.code = 'recording_invalid'
    throw error
  }
  return duration
}

export function planBoundedSpeechChunks(durationSec, silenceIntervals = [], {
  maxChunkSeconds = DEFAULT_MAX_CHUNK_SECONDS,
  overlapSeconds = DEFAULT_CHUNK_OVERLAP_SECONDS,
  minSpeechSeconds = Number(process.env.SILENCE_DETECT_MIN_SPEECH_SEC) || 0.3
} = {}) {
  const speech = []
  let cursor = 0
  for (const interval of silenceIntervals) {
    const start = Math.min(durationSec, Math.max(cursor, interval.startSec))
    if (start - cursor >= minSpeechSeconds) speech.push({ startSec: cursor, endSec: start })
    cursor = Math.max(cursor, Math.min(durationSec, interval.endSec))
  }
  if (durationSec - cursor >= minSpeechSeconds) speech.push({ startSec: cursor, endSec: durationSec })
  if (speech.length === 0) speech.push({ startSec: 0, endSec: durationSec })

  const chunks = []
  for (const interval of speech) {
    let start = interval.startSec
    while (start < interval.endSec - 0.001) {
      const end = Math.min(interval.endSec, start + maxChunkSeconds)
      chunks.push({ startSec: start, endSec: end })
      if (end >= interval.endSec - 0.001) break
      start = end - overlapSeconds
    }
  }
  return chunks
}

export async function detectSilenceIntervals(path, durationSec, {
  signal,
  ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg'
} = {}) {
  const intervals = []
  let openStart = null
  const threshold = Number(process.env.SILENCE_DETECT_THRESHOLD_DB) || -30
  const minDuration = Number(process.env.SILENCE_DETECT_MIN_DURATION_SEC) || 0.5
  try {
    await runMediaProcess(ffmpegPath, [
      '-nostats', '-loglevel', 'info', '-i', path,
      '-af', `silencedetect=noise=${threshold}dB:d=${minDuration}`,
      '-f', 'null', '-'
    ], {
      signal,
      onStderrLine: (line) => {
        const start = line.match(/silence_start:\s*([\d.]+)/)
        if (start) openStart = Number(start[1])
        const end = line.match(/silence_end:\s*([\d.]+)/)
        if (end && openStart !== null) {
          intervals.push({ startSec: openStart, endSec: Number(end[1]) })
          openStart = null
        }
      }
    })
  } catch (error) {
    if (signal?.aborted) throw error
    return []
  }
  if (openStart !== null) intervals.push({ startSec: openStart, endSec: durationSec })
  return intervals
}

async function encodeAudioPart(sourcePath, directory, part, index, {
  signal,
  ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg'
} = {}) {
  const outputPath = join(directory, `chunk-${index}.ogg`)
  await runMediaProcess(ffmpegPath, [
    '-nostats', '-loglevel', 'error', '-y',
    '-ss', part.startSec.toFixed(3), '-i', sourcePath,
    '-t', (part.endSec - part.startSec).toFixed(3),
    '-vn', '-ac', '1', '-c:a', 'libopus', '-b:a', '64k', outputPath
  ], { signal, timeoutMs: 180_000 })
  const size = (await stat(outputPath)).size
  return { outputPath, size }
}

export async function *iterateBoundedAudioChunks(sourcePath, directory, parts, options = {}) {
  let index = 0
  const pending = [...parts].reverse()
  while (pending.length > 0) {
    const part = pending.pop()
    const encoded = await encodeAudioPart(sourcePath, directory, part, index, options)
    try {
      if (encoded.size > DEFAULT_PROVIDER_MAX_AUDIO_BYTES) {
        if (part.endSec - part.startSec < 2) {
          const error = new Error('Encoded audio chunk exceeds provider limit')
          error.code = 'recording_too_large'
          throw error
        }
        const midpoint = (part.startSec + part.endSec) / 2
        pending.push({ startSec: Math.max(part.startSec, midpoint - DEFAULT_CHUNK_OVERLAP_SECONDS), endSec: part.endSec })
        pending.push({ startSec: part.startSec, endSec: midpoint })
        continue
      }
      const buffer = await readFile(encoded.outputPath)
      yield {
        index,
        buffer,
        mime: 'audio/ogg',
        offsetMs: Math.round(part.startSec * 1000),
        durationMs: Math.round((part.endSec - part.startSec) * 1000)
      }
      index += 1
    } finally {
      await rm(encoded.outputPath, { force: true })
    }
  }
}
