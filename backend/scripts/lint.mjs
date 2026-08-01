import { readdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = resolve(process.cwd())
const TARGET_DIRS = ['src', 'test']
const FILES = []

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      FILES.push(full)
    }
  }
}

for (const dir of TARGET_DIRS) {
  await walk(join(ROOT, dir))
}

let failed = 0
for (const file of FILES) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' })
  if (result.status !== 0) {
    failed++
    console.error(`Syntax check failed: ${relative(ROOT, file)}`)
  }
}

if (failed > 0) {
  process.exit(1)
}

console.log(`Lint (syntax) passed for ${FILES.length} files`)
