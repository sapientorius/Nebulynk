import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test('voice create hook chain keeps validate -> membership -> permission order', async () => {
  const source = await readFile(resolve(process.cwd(), 'src/services/voice/voice.js'), 'utf8')
  assert.match(
    source,
    /create:\s*\[\s*validate\(createSchema\),\s*isChannelMember\(\),\s*checkJoinVoiceAccess\(\)\s*\]/
  )
})

test('voice service no longer exports public voice auto-join helper', async () => {
  const source = await readFile(resolve(process.cwd(), 'src/services/voice/voice.js'), 'utf8')
  assert.doesNotMatch(source, /autoJoinPublicVoiceMembership/)
})
