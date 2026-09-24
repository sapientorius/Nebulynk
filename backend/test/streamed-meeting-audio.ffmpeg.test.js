import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  detectSilenceIntervals,
  iterateBoundedAudioChunks,
  planBoundedSpeechChunks,
  probeRecordingDuration
} from '../src/lib/streamed-meeting-audio.js'

const ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0

function makeAudio(args) {
  const result = spawnSync('ffmpeg', ['-nostats', '-loglevel', 'error', '-y', ...args], {
    encoding: 'utf8', timeout: 120_000
  })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
}

test('FFmpeg encodes a continuous recording longer than five minutes one bounded chunk at a time', {
  skip: !ffmpegAvailable
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nebulynk-ffmpeg-test-'))
  try {
    const source = join(directory, 'continuous.mp4')
    makeAudio(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000:duration=302',
      '-c:a', 'aac', '-b:a', '32k', source])
    const duration = await probeRecordingDuration(source)
    const plan = planBoundedSpeechChunks(duration, await detectSilenceIntervals(source, duration))
    assert.equal(plan.length, 2)
    assert.ok(plan.every((part) => part.endSec - part.startSec <= 300))
    assert.equal(plan[0].endSec - plan[1].startSec, 2)
    const results = []
    for await (const chunk of iterateBoundedAudioChunks(source, directory, plan)) {
      results.push({ index: chunk.index, offsetMs: chunk.offsetMs, size: chunk.buffer.length })
    }
    assert.deepEqual(results.map((item) => item.index), [0, 1])
    assert.equal(results[1].offsetMs, 298_000)
    assert.ok(results.every((item) => item.size > 0 && item.size <= 20 * 1024 * 1024))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('FFmpeg silence detection excludes a quiet gap from the chunk plan', {
  skip: !ffmpegAvailable
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nebulynk-silence-test-'))
  try {
    const source = join(directory, 'silence.mp4')
    makeAudio([
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000:duration=3',
      '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono:d=2',
      '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=16000:duration=3',
      '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]',
      '-map', '[out]', '-c:a', 'aac', source
    ])
    const duration = await probeRecordingDuration(source)
    const silences = await detectSilenceIntervals(source, duration)
    assert.ok(silences.some((interval) => interval.startSec > 2.5 && interval.endSec < 5.5))
    const plan = planBoundedSpeechChunks(duration, silences)
    assert.equal(plan.length, 2)
    assert.ok(plan[1].startSec - plan[0].endSec > 1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
