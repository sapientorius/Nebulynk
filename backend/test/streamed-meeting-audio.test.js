import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, open, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import {
  clearStaleTranscriptionFiles,
  downloadRecordingToTemp,
  planBoundedSpeechChunks
} from '../src/lib/streamed-meeting-audio.js'

test('a 90-minute continuous recording is split into at most five-minute overlapping sections', () => {
  const parts = planBoundedSpeechChunks(90 * 60)
  assert.ok(parts.length > 18)
  assert.equal(parts[0].startSec, 0)
  assert.equal(parts.at(-1).endSec, 5400)
  for (let index = 0; index < parts.length; index += 1) {
    assert.ok(parts[index].endSec - parts[index].startSec <= 300)
    if (index > 0) assert.equal(parts[index - 1].endSec - parts[index].startSec, 2)
  }
})

test('silence boundaries omit gaps and preserve absolute recording offsets', () => {
  const parts = planBoundedSpeechChunks(800, [
    { startSec: 100, endSec: 200 },
    { startSec: 500, endSec: 550 }
  ])
  assert.deepEqual(parts, [
    { startSec: 0, endSec: 100 },
    { startSec: 200, endSec: 500 },
    { startSec: 550, endSec: 800 }
  ])
})

test('S3 download streams to disk with a hard temporary size limit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nebulynk-audio-test-'))
  const block = Buffer.alloc(1024 * 1024, 7)
  const recording = { storage_bucket: 'recordings', storage_key: 'long.mp4', mime_type: 'video/mp4' }
  try {
    const client = {
      async send() {
        return { ContentLength: 12 * block.length, ETag: 'source-1', Body: Readable.from(Array(12).fill(block)) }
      }
    }
    const source = await downloadRecordingToTemp(client, recording, { root, maxBytes: 16 * block.length })
    assert.equal((await stat(source.path)).size, 12 * block.length)
    assert.equal(source.size, 12 * block.length)
    const file = await open(source.path)
    const preview = Buffer.alloc(4)
    await file.read(preview, 0, 4, 0)
    await file.close()
    assert.equal(preview.toString('hex'), '07070707')
    const changed = await downloadRecordingToTemp({
      async send() {
        return { ContentLength: 12 * block.length, ETag: 'source-1', Body: Readable.from(Array(12).fill(Buffer.alloc(block.length, 8))) }
      }
    }, recording, { root, maxBytes: 16 * block.length })
    assert.notEqual(changed.signature, source.signature)
    await rm(changed.directory, { recursive: true })
    await rm(source.directory, { recursive: true })

    const oversized = {
      async send() {
        return { Body: Readable.from(Array(12).fill(block)) }
      }
    }
    await assert.rejects(
      downloadRecordingToTemp(oversized, recording, { root, maxBytes: 8 * block.length }),
      (error) => error.code === 'recording_too_large'
    )
    await clearStaleTranscriptionFiles(root)
    assert.deepEqual(await readdir(root), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
