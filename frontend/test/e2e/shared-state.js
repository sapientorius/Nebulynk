import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const sharedStatePath = path.resolve(process.cwd(), 'test-results', '.e2e-shared-state.json')

export async function readSharedState() {
  try {
    const raw = await readFile(sharedStatePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function writeSharedState(patch) {
  const current = (await readSharedState()) || {}
  const nextState = { ...current, ...patch }
  await mkdir(path.dirname(sharedStatePath), { recursive: true })
  await writeFile(sharedStatePath, JSON.stringify(nextState, null, 2), 'utf8')
  return nextState
}
