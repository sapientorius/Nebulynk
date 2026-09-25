import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { transcriptionTempRoot } from './lib/streamed-meeting-audio.js'

try {
  const metadata = await stat(join(transcriptionTempRoot(), 'health'))
  process.exit(Date.now() - metadata.mtimeMs < 60_000 ? 0 : 1)
} catch {
  process.exit(1)
}
