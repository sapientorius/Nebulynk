import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

export const DEFAULT_PROVIDER_MAX_AUDIO_BYTES = 20 * 1024 * 1024
export const OPENAI_MAX_AUDIO_BYTES = 25 * 1024 * 1024
export const DEFAULT_CHUNK_OVERLAP_SECONDS = 2

function resolveAudioExtension(mimeType) {
  const normalized = typeof mimeType === 'string' ? mimeType.toLowerCase() : ''
  if (normalized.includes('wav')) return 'wav'
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3'
  if (normalized.includes('m4a')) return 'm4a'
  if (normalized.includes('mp4')) return 'mp4'
  return 'ogg'
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(`${command} exited with code ${code}: ${stderr || stdout}`.trim()))
    })
  })
}

async function probeAudioDurationSeconds(inputPath, { ffprobePath = process.env.FFPROBE_PATH || 'ffprobe' } = {}) {
  const { stdout } = await runProcess(ffprobePath, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    inputPath
  ])

  const payload = JSON.parse(stdout || '{}')
  const duration = Number(payload?.format?.duration || 0)
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('ffprobe did not return a valid duration')
  }

  return duration
}

export function shouldChunkAudio({ sizeBytes, providerType }) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return false
  if (providerType === 'openai' || providerType === 'openai_compatible') {
    return sizeBytes >= DEFAULT_PROVIDER_MAX_AUDIO_BYTES || sizeBytes >= OPENAI_MAX_AUDIO_BYTES
  }
  return sizeBytes >= DEFAULT_PROVIDER_MAX_AUDIO_BYTES
}

function parseSilenceDetectOutput(stderr) {
  const lines = String(stderr || '').split('\n')
  const intervals = []
  let pendingStartSec = null

  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/)
    if (startMatch) {
      pendingStartSec = parseFloat(startMatch[1])
      continue
    }

    const endMatch = line.match(/silence_end:\s*([\d.]+)/)
    if (endMatch && pendingStartSec !== null) {
      intervals.push({ startSec: pendingStartSec, endSec: parseFloat(endMatch[1]) })
      pendingStartSec = null
    }
  }

  return { intervals: intervals.sort((a, b) => a.startSec - b.startSec), pendingStartSec }
}

function deriveSpeechIntervals(silenceIntervals, totalDurationSec, pendingStartSec) {
  const speech = []
  let cursor = 0

  for (const silence of silenceIntervals) {
    if (silence.startSec > cursor + 0.01) {
      speech.push({ startSec: cursor, endSec: silence.startSec })
    }
    cursor = Math.max(cursor, silence.endSec)
  }

  if (pendingStartSec !== null && pendingStartSec > cursor + 0.01) {
    speech.push({ startSec: cursor, endSec: pendingStartSec })
  } else if (pendingStartSec === null && cursor < totalDurationSec - 0.01) {
    speech.push({ startSec: cursor, endSec: totalDurationSec })
  }

  return speech
}

export async function splitOnSilence({
  buffer,
  mimeType = 'audio/ogg',
  silenceThresholdDb = Number(process.env.SILENCE_DETECT_THRESHOLD_DB) || -30,
  minSilenceDurationSec = Number(process.env.SILENCE_DETECT_MIN_DURATION_SEC) || 0.5,
  minSpeechDurationSec = Number(process.env.SILENCE_DETECT_MIN_SPEECH_SEC) || 0.3,
  ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg',
  ffprobePath = process.env.FFPROBE_PATH || 'ffprobe'
} = {}) {
  const normalizedBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || [])
  if (normalizedBuffer.length === 0) return []

  const singleChunkFallback = [{ buffer: normalizedBuffer, mime: mimeType, offsetMs: 0, durationMs: null }]
  const extension = resolveAudioExtension(mimeType)
  const tempDir = await mkdtemp(join(tmpdir(), 'nebulynk-silence-split-'))
  const inputPath = join(tempDir, `input.${extension}`)
  const outputExtension = extension === 'wav' ? 'wav' : 'ogg'

  try {
    await writeFile(inputPath, normalizedBuffer)

    let totalDurationSec
    try {
      totalDurationSec = await probeAudioDurationSeconds(inputPath, { ffprobePath })
    } catch {
      return singleChunkFallback
    }

    if (totalDurationSec < 1.0) {
      return [{ buffer: normalizedBuffer, mime: mimeType, offsetMs: 0, durationMs: Math.round(totalDurationSec * 1000) }]
    }

    let detectResult
    try {
      detectResult = await runProcess(ffmpegPath, [
        '-i', inputPath,
        '-af', `silencedetect=noise=${silenceThresholdDb}dB:d=${minSilenceDurationSec}`,
        '-f', 'null',
        '-'
      ])
    } catch {
      return singleChunkFallback
    }

    const { intervals, pendingStartSec } = parseSilenceDetectOutput(detectResult.stderr)

    if (intervals.length === 0 && pendingStartSec === null) {
      return [{
        buffer: normalizedBuffer,
        mime: mimeType,
        offsetMs: 0,
        durationMs: Math.round(totalDurationSec * 1000)
      }]
    }

    const speechIntervals = deriveSpeechIntervals(intervals, totalDurationSec, pendingStartSec)
      .filter(interval => (interval.endSec - interval.startSec) >= minSpeechDurationSec)

    if (speechIntervals.length === 0) {
      return [{
        buffer: normalizedBuffer,
        mime: mimeType,
        offsetMs: 0,
        durationMs: Math.round(totalDurationSec * 1000)
      }]
    }

    if (speechIntervals.length === 1 && speechIntervals[0].startSec < 0.05 && speechIntervals[0].endSec >= totalDurationSec - 0.05) {
      return [{
        buffer: normalizedBuffer,
        mime: mimeType,
        offsetMs: 0,
        durationMs: Math.round(totalDurationSec * 1000)
      }]
    }

    const chunks = []
    for (let i = 0; i < speechIntervals.length; i++) {
      const interval = speechIntervals[i]
      const durationSec = interval.endSec - interval.startSec
      const outputPath = join(tempDir, `speech-${i}.${outputExtension}`)

      await runProcess(ffmpegPath, [
        '-y',
        '-i', inputPath,
        '-vn',
        '-ss', interval.startSec.toFixed(3),
        '-t', durationSec.toFixed(3),
        ...(outputExtension === 'wav'
          ? ['-c:a', 'pcm_s16le']
          : ['-c:a', 'libopus', '-b:a', '64k']),
        outputPath
      ])

      const chunkBuffer = await readFile(outputPath)
      chunks.push({
        buffer: chunkBuffer,
        mime: outputExtension === 'wav' ? 'audio/wav' : 'audio/ogg',
        offsetMs: Math.round(interval.startSec * 1000),
        durationMs: Math.round(durationSec * 1000)
      })
    }

    return chunks
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

export async function chunkAudioBuffer({
  buffer,
  mimeType = 'audio/ogg',
  providerType,
  overlapSeconds = DEFAULT_CHUNK_OVERLAP_SECONDS,
  ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg'
}) {
  const normalizedBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || [])
  if (!shouldChunkAudio({ sizeBytes: normalizedBuffer.length, providerType })) {
    return [{
      buffer: normalizedBuffer,
      mime: mimeType,
      offsetMs: 0,
      durationMs: null
    }]
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'nebulynk-audio-chunks-'))
  const extension = resolveAudioExtension(mimeType)
  const inputPath = join(tempDir, `input.${extension}`)
  const outputExtension = extension === 'wav' ? 'wav' : 'ogg'

  try {
    await writeFile(inputPath, normalizedBuffer)

    let durationSeconds = 0
    try {
      durationSeconds = await probeAudioDurationSeconds(inputPath)
    } catch {
      durationSeconds = Math.max(60, Math.ceil(normalizedBuffer.length / DEFAULT_PROVIDER_MAX_AUDIO_BYTES) * 120)
    }

    const chunkCount = Math.max(2, Math.ceil(normalizedBuffer.length / DEFAULT_PROVIDER_MAX_AUDIO_BYTES))
    const baseChunkSeconds = Math.max(30, durationSeconds / chunkCount)
    const chunks = []

    for (let index = 0; index < chunkCount; index += 1) {
      const rawStartSeconds = baseChunkSeconds * index
      const startSeconds = Math.max(0, rawStartSeconds - (index > 0 ? overlapSeconds : 0))
      const targetEndSeconds = index === chunkCount - 1
        ? durationSeconds
        : Math.min(durationSeconds, baseChunkSeconds * (index + 1) + overlapSeconds)
      const chunkDurationSeconds = Math.max(1, targetEndSeconds - startSeconds)
      const outputPath = join(tempDir, `chunk-${index}.${outputExtension}`)

      await runProcess(ffmpegPath, [
        '-y',
        '-i', inputPath,
        '-vn',
        '-ss', startSeconds.toFixed(3),
        '-t', chunkDurationSeconds.toFixed(3),
        ...(outputExtension === 'wav'
          ? ['-c:a', 'pcm_s16le']
          : ['-c:a', 'libopus', '-b:a', '64k']),
        outputPath
      ])

      const chunkBuffer = await readFile(outputPath)
      chunks.push({
        buffer: chunkBuffer,
        mime: outputExtension === 'wav' ? 'audio/wav' : 'audio/ogg',
        offsetMs: Math.max(0, Math.round(startSeconds * 1000)),
        durationMs: Math.max(1, Math.round(chunkDurationSeconds * 1000))
      })
    }

    return chunks
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
