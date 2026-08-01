import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function extractMeetingSummaryPayloadBlocks(source) {
  return [...source.matchAll(/artifact_type: 'summary',[\s\S]*?payload:\s*\{([\s\S]*?)\n\s*\},\n\s*created_at/g)]
    .map((match) => match[1])
}

test('demo seed meeting summaries include structured payloads for the detail view', () => {
  const scripts = [
    {
      label: 'German demo seed',
      path: new URL('../scripts/seed-demo-db.mjs', import.meta.url),
      expectedSummaryCount: 1
    },
    {
      label: 'English demo seed',
      path: new URL('../scripts/seed-demo-db-en.mjs', import.meta.url),
      expectedSummaryCount: 2
    }
  ]

  for (const script of scripts) {
    const source = readFileSync(script.path, 'utf8')
    const payloadBlocks = extractMeetingSummaryPayloadBlocks(source)

    assert.equal(payloadBlocks.length, script.expectedSummaryCount, `${script.label} should seed the expected number of meeting summary artifacts`)

    for (const payloadBlock of payloadBlocks) {
      assert.match(payloadBlock, /mini_summary:/, `${script.label} summary should include a mini summary`)
      assert.match(payloadBlock, /summary_points:/, `${script.label} summary should include summary points`)
      assert.match(payloadBlock, /decisions:/, `${script.label} summary should include decisions`)
      assert.match(payloadBlock, /open_items:/, `${script.label} summary should include open items`)
      assert.match(payloadBlock, /topic_chapters:/, `${script.label} summary should include topic chapters`)
      assert.match(payloadBlock, /coverage:/, `${script.label} summary should include coverage metadata`)
      assert.match(payloadBlock, /markdown:/, `${script.label} summary should preserve markdown for sharing/export`)
    }
  }
})
