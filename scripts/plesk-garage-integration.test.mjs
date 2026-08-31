import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import net from 'node:net'
import path from 'node:path'
import test from 'node:test'

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const composeFile = path.join(repositoryRoot, 'scripts', 'plesk-garage-integration.compose.yml')
const projectName = `nebulynk-plesk-sigv4-${process.pid}`
const shouldRun = process.env.PLESK_GARAGE_INTEGRATION === '1'

async function reserveTcpPort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : null
  await new Promise((resolve) => server.close(resolve))
  if (!port) throw new Error('Could not reserve an integration-test port.')
  return port
}

async function dockerCompose(args, port) {
  return execFileAsync('docker', [
    'compose',
    '--project-name', projectName,
    '--file', composeFile,
    ...args
  ], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      EDGE_TEST_PORT: String(port)
    },
    maxBuffer: 2 * 1024 * 1024
  })
}

async function waitFor(check, { timeoutMs = 90_000, intervalMs = 1_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  let lastError = null

  while (Date.now() < deadline) {
    try {
      const result = await check()
      if (result) return result
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw lastError || new Error('Timed out while waiting for the Plesk Garage integration fixture.')
}

test('proxies signed Garage upload and download through /files/', { skip: !shouldRun }, async () => {
  const port = await reserveTcpPort()
  const endpoint = `http://127.0.0.1:${port}`
  const client = new S3Client({
    endpoint,
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'nebulynk',
      secretAccessKey: 'integration-storage-secret'
    },
    forcePathStyle: true
  })
  const key = `plesk-sigv4-test-${process.pid}.txt`
  const body = 'Nebulynk Plesk Garage Signature V4 integration test'

  try {
    await dockerCompose(['up', '--detach'], port)
    await waitFor(async () => {
      const response = await fetch(`${endpoint}/healthz`)
      return response.ok
    })

    await waitFor(async () => {
      try {
        await client.send(new PutObjectCommand({
          Bucket: 'files',
          Key: key,
          Body: body,
          ContentType: 'text/plain'
        }))
        return true
      } catch {
        return false
      }
    })

    const signedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: 'files', Key: key }),
      { expiresIn: 60 }
    )
    const response = await fetch(signedUrl)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), body)
  } finally {
    await dockerCompose(['down', '--volumes', '--remove-orphans'], port).catch(() => {})
  }
})
