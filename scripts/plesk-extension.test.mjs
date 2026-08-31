import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

import {
  buildPleskExtension,
  validatePleskExtension
} from './build-plesk-extension.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function repositoryPath(...parts) {
  return path.join(repositoryRoot, ...parts)
}

test('builds and validates an uploadable Plesk package', async () => {
  const built = await buildPleskExtension()
  const validated = await validatePleskExtension()

  assert.equal(validated.archivePath, built.archivePath)
  assert.match(path.basename(built.archivePath), /^nebulynk-plesk-\d+\.\d+\.\d+-\d+\.zip$/)
  assert.ok(built.fileCount > 20)
  assert.match(built.checksum, /^[a-f0-9]{64}$/)
  assert.equal(
    await readFile(`${built.archivePath}.sha256`, 'utf8'),
    `${built.checksum}  ${path.basename(built.archivePath)}\n`
  )

  const metaXml = await readFile(repositoryPath('dist', 'plesk', 'staging', 'package', 'meta.xml'), 'utf8')
  assert.match(metaXml, /<id>nebulynk-plesk<\/id>/)
  assert.match(metaXml, /<os>unix<\/os>/)
  assert.match(metaXml, /<plesk_min_version>18\.0\.53<\/plesk_min_version>/)

  const manifest = JSON.parse(await readFile(
    repositoryPath('dist', 'plesk', 'staging', 'package', 'var', 'payload', 'manifest.json'),
    'utf8'
  ))
  assert.equal(manifest.application_version, built.version)
  assert.equal(manifest.extension_release, built.release)
  assert.ok(manifest.files.some((file) => file.path === 'deploy/plesk/edge.conf'))
})

test('keeps all one-domain edge routes and signature-sensitive proxy semantics', async () => {
  const edgeConfig = await readFile(repositoryPath('deploy', 'plesk', 'edge.conf'), 'utf8')
  assert.match(edgeConfig, /map \$http_x_forwarded_proto \$nebulynk_forwarded_proto/)
  assert.match(edgeConfig, /default \$http_x_forwarded_proto;/)
  assert.match(edgeConfig, /''\s+\$scheme;/)
  assert.match(edgeConfig, /proxy_set_header X-Forwarded-Proto \$nebulynk_forwarded_proto;/)
  assert.doesNotMatch(edgeConfig, /proxy_set_header X-Forwarded-Proto \$scheme;/)
  assert.match(edgeConfig, /location \^~ \/api\//)
  assert.match(edgeConfig, /proxy_pass http:\/\/backend:3030\//)
  assert.match(edgeConfig, /location \^~ \/socket\.io\//)
  assert.match(edgeConfig, /proxy_pass http:\/\/backend:3030;/)
  assert.match(edgeConfig, /location \^~ \/livekit\//)
  assert.match(edgeConfig, /proxy_pass http:\/\/livekit:7880\//)
  assert.match(edgeConfig, /location \^~ \/files\//)
  assert.match(edgeConfig, /proxy_pass http:\/\/garage:3900;/)
  assert.match(edgeConfig, /proxy_set_header Host \$http_host;/)
  assert.match(edgeConfig, /proxy_set_header Upgrade \$http_upgrade;/)
})

test('keeps internal services private and exposes only the edge and LiveKit media ports', async () => {
  const compose = await readFile(repositoryPath('deploy', 'plesk', 'docker-compose.yml'), 'utf8')
  assert.doesNotMatch(compose, /container_name:/)
  assert.match(compose, /127\.0\.0\.1:\$\{EDGE_PORT:/)
  assert.match(compose, /- "7881:7881"/)
  assert.match(compose, /- "7882:7882\/udp"/)
  assert.doesNotMatch(compose, /127\.0\.0\.1:\$\{BACKEND_PORT/)
  assert.doesNotMatch(compose, /127\.0\.0\.1:\$\{STORAGE_S3_PORT/)
  assert.match(compose, /STORAGE_S3_PUBLIC_ENDPOINT: https:\/\/\$\{NEBULYNK_DOMAIN/)
  assert.match(compose, /STORAGE_S3_BUCKET: \$\{STORAGE_S3_BUCKET:-files\}/)
})

test('uses fixed safe helper paths and does not expose a volume-deleting action', async () => {
  const helper = await readFile(repositoryPath('plesk-extension', 'sbin', 'nebulynk-plesk'), 'utf8')
  assert.match(helper, /DEPLOYMENT_ROOT="\/opt\/nebulynk-plesk"/)
  assert.match(helper, /PAYLOAD_ROOT="\$PSA_ROOT\/var\/modules\/\$MODULE_ID\/payload"/)
  assert.match(helper, /rm -rf -- "\$SOURCE_ROOT"/)
  assert.match(helper, /check_edge_port\(\)/)
  assert.match(helper, /label=com\.docker\.compose\.project=\$COMPOSE_PROJECT/)
  assert.match(helper, /chown 70:70 "\$DATA_ROOT\/postgres"/)
  assert.match(helper, /chown 999:1000 "\$DATA_ROOT\/redis"/)
  assert.match(helper, /chmod 0644 \\\n\s+"\$SOURCE_ROOT\/deploy\/plesk\/edge\.conf"/)
  assert.doesNotMatch(helper, /compose down[^\n]*-v/)
  assert.doesNotMatch(helper, /docker system prune/)
})

test('registers both Plesk Nginx hook variants and keeps domain routing scoped', async () => {
  const hook = await readFile(repositoryPath('plesk-extension', 'plib', 'hooks', 'WebServer.php'), 'utf8')
  const controller = await readFile(repositoryPath('plesk-extension', 'plib', 'controllers', 'IndexController.php'), 'utf8')
  const deployment = await readFile(repositoryPath('plesk-extension', 'plib', 'library', 'Deployment.php'), 'utf8')
  const task = await readFile(repositoryPath('plesk-extension', 'plib', 'library', 'Task', 'Deployment.php'), 'utf8')
  const view = await readFile(repositoryPath('plesk-extension', 'plib', 'views', 'scripts', 'index', 'index.phtml'), 'utf8')

  assert.match(hook, /getDomainNginxConfig\(pm_Domain \$domain\)/)
  assert.match(hook, /getDomainNginxProxyConfig\(pm_Domain \$domain\)/)
  assert.match(deployment, /updateDomainConfiguration\(new pm_Domain\(\$domain->getId\(\)\)\)/)
  assert.match(deployment, /state\['domain_guid'\] !== \(string\)\$domain->getGuid\(\)/)
  assert.match(deployment, /\.well-known\/acme-challenge/)
  assert.match(deployment, /proxy_set_header Host \\\$http_host;/)
  assert.match(task, /'--domain'/)
  assert.match(task, /'--port'/)
  assert.match(task, /onError\(Exception \$e\)/)
  assert.match(controller, /1\. Vorabprüfung starten/)
  assert.match(controller, /kann mehrere Minuten dauern/)
  assert.match(view, /Docker Extension installieren/)
  assert.match(view, /Vorabprüfung &rarr; Installieren und bauen/)
  assert.match(view, /mehrere Minuten dauern/)
})
