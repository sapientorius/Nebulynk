import { readdir, readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = resolve(process.cwd())
const SRC_DIR = join(ROOT, 'src')
const files = []

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full)
      continue
    }
    if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.vue'))) {
      files.push(full)
    }
  }
}

function runCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' })
  return result.status === 0
}

function extractScriptBlocks(vueSource) {
  const regex = /<script[^>]*>([\s\S]*?)<\/script>/g
  const blocks = []
  let match
  while ((match = regex.exec(vueSource)) !== null) {
    blocks.push(match[1])
  }
  return blocks
}

await walk(SRC_DIR)

let failed = 0
const tempDir = await mkdtemp(join(tmpdir(), 'nebulynk-vue-lint-'))

try {
  for (const file of files) {
    if (file.endsWith('.js')) {
      if (!runCheck(file)) {
        failed++
        console.error(`Syntax check failed: ${relative(ROOT, file)}`)
      }
      continue
    }

    const source = await readFile(file, 'utf8')
    const blocks = extractScriptBlocks(source)
    for (let i = 0; i < blocks.length; i++) {
      const script = blocks[i]
      const tempFile = join(tempDir, `${relative(ROOT, file).replace(/[\\/]/g, '_')}.${i}.mjs`)
      await writeFile(tempFile, script, 'utf8')
      if (!runCheck(tempFile)) {
        failed++
        console.error(`Vue script syntax failed: ${relative(ROOT, file)} (block ${i + 1})`)
      }
    }
  }
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

if (failed > 0) {
  process.exit(1)
}

console.log(`Frontend lint (syntax) passed for ${files.length} files`)
