import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const snapshotDir = resolve(rootDir, '.local/db-snapshots')

dotenv.config({ path: resolve(rootDir, '.env') })

const command = process.argv[2]
const rawSnapshotName = process.argv[3]

function printUsage() {
  console.log(`Nebulynk DB snapshot workflow

Usage:
  npm run db:snapshot:list
  npm run db:snapshot:save -- <name>
  npm run db:snapshot:restore -- <name>
  npm run db:snapshot:delete -- <name>

Notes:
  - Snapshots are stored in .local/db-snapshots/
  - Restore replaces the current local database contents
  - Stop the local backend before restore to avoid reconnect races
`)
}

function sanitizeSnapshotName(input) {
  if (!input) {
    throw new Error('Snapshot name is required')
  }

  if (!/^[A-Za-z0-9._-]+$/.test(input)) {
    throw new Error(`Invalid snapshot name "${input}". Use letters, numbers, dot, dash, or underscore.`)
  }

  return input
}

function getSnapshotPaths(name) {
  return {
    dumpPath: join(snapshotDir, `${name}.dump`),
    metaPath: join(snapshotDir, `${name}.json`)
  }
}

function runCommand(commandName, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(commandName, args, {
      cwd: rootDir,
      stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
      shell: false
    })

    let stdout = ''
    let stderr = ''

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
    }

    child.on('error', (error) => {
      rejectPromise(error)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr })
        return
      }

      rejectPromise(new Error(stderr.trim() || `${commandName} exited with code ${code}`))
    })
  })
}

function runDockerStream(args, { outputPath, inputPath }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('docker', args, {
      cwd: rootDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    })

    let stderr = ''
    let settled = false

    const fail = async (error) => {
      if (settled) return
      settled = true

      child.kill('SIGTERM')

      if (outputPath) {
        try {
          await fsp.rm(outputPath, { force: true })
        } catch {}
      }

      rejectPromise(error)
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
    }

    child.on('error', (error) => {
      void fail(error)
    })

    if (outputPath) {
      const output = fs.createWriteStream(outputPath)
      child.stdout.pipe(output)
      output.on('error', (error) => {
        void fail(error)
      })
    }

    if (inputPath) {
      const input = fs.createReadStream(inputPath)
      input.on('error', (error) => {
        void fail(error)
      })
      input.pipe(child.stdin)
    } else {
      child.stdin.end()
    }

    child.on('close', (code) => {
      if (settled) return
      settled = true

      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(new Error(stderr.trim() || `docker exited with code ${code}`))
    })
  })
}

async function ensureSnapshotDir() {
  await fsp.mkdir(snapshotDir, { recursive: true })
}

async function ensureDockerPostgres() {
  await runCommand('docker', ['compose', 'up', '-d', 'postgres'], {
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

async function tryGetGitContext() {
  try {
    const [{ stdout: branch }, { stdout: revision }] = await Promise.all([
      runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
      runCommand('git', ['rev-parse', '--short', 'HEAD'])
    ])

    return {
      branch: branch.trim(),
      revision: revision.trim()
    }
  } catch {
    return {
      branch: null,
      revision: null
    }
  }
}

async function saveSnapshot() {
  const name = sanitizeSnapshotName(rawSnapshotName)
  const { dumpPath, metaPath } = getSnapshotPaths(name)

  await ensureSnapshotDir()

  try {
    await fsp.access(dumpPath)
    throw new Error(`Snapshot "${name}" already exists`)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  await ensureDockerPostgres()

  await runDockerStream(
    ['compose', 'exec', '-T', 'postgres', 'sh', '-lc', 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'],
    { outputPath: dumpPath }
  )

  const gitContext = await tryGetGitContext()
  const metadata = {
    name,
    createdAt: new Date().toISOString(),
    database: process.env.POSTGRES_DB || 'nebulynk',
    dockerService: 'postgres',
    gitBranch: gitContext.branch,
    gitRevision: gitContext.revision
  }

  await fsp.writeFile(metaPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')

  console.log(`Saved snapshot "${name}" to ${dumpPath}`)
}

async function listSnapshots() {
  await ensureSnapshotDir()
  const entries = await fsp.readdir(snapshotDir)
  const metadataFiles = entries.filter((entry) => entry.endsWith('.json')).sort()

  if (metadataFiles.length === 0) {
    console.log('No DB snapshots found.')
    return
  }

  for (const file of metadataFiles) {
    const metadata = JSON.parse(await fsp.readFile(join(snapshotDir, file), 'utf8'))
    const branchLabel = metadata.gitBranch ? ` branch=${metadata.gitBranch}` : ''
    const revisionLabel = metadata.gitRevision ? ` sha=${metadata.gitRevision}` : ''
    console.log(`${metadata.name}  ${metadata.createdAt}  db=${metadata.database}${branchLabel}${revisionLabel}`)
  }
}

async function restoreSnapshot() {
  const name = sanitizeSnapshotName(rawSnapshotName)
  const { dumpPath } = getSnapshotPaths(name)

  await fsp.access(dumpPath)
  await ensureDockerPostgres()

  await runCommand('docker', [
    'compose',
    'exec',
    '-T',
    'postgres',
    'sh',
    '-lc',
    'export PGPASSWORD="$POSTGRES_PASSWORD"; psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();" -c "DROP SCHEMA IF EXISTS public CASCADE;" -c "CREATE SCHEMA public;" -c "GRANT ALL ON SCHEMA public TO \\"$POSTGRES_USER\\";" -c "GRANT ALL ON SCHEMA public TO public;"'
  ])

  await runDockerStream(
    ['compose', 'exec', '-T', 'postgres', 'sh', '-lc', 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges'],
    { inputPath: dumpPath }
  )

  console.log(`Restored snapshot "${name}" onto database "${process.env.POSTGRES_DB || 'nebulynk'}"`)
}

async function deleteSnapshot() {
  const name = sanitizeSnapshotName(rawSnapshotName)
  const { dumpPath, metaPath } = getSnapshotPaths(name)

  await fsp.rm(dumpPath, { force: true })
  await fsp.rm(metaPath, { force: true })

  console.log(`Deleted snapshot "${name}"`)
}

try {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage()
  } else if (command === 'save') {
    await saveSnapshot()
  } else if (command === 'list') {
    await listSnapshots()
  } else if (command === 'restore') {
    await restoreSnapshot()
  } else if (command === 'delete') {
    await deleteSnapshot()
  } else {
    throw new Error(`Unknown command "${command}"`)
  }
} catch (error) {
  console.error(`[db-snapshot] ${error.message}`)
  printUsage()
  process.exitCode = 1
}
