import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import {
  buildPleskExtension,
  validatePleskExtension
} from './build-plesk-extension.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const execFileAsync = promisify(execFile)

function repositoryPath(...parts) {
  return path.join(repositoryRoot, ...parts)
}

const extensionIconEntries = [
  { relativePath: '_meta/icons/32x32.png', width: 32, height: 32 },
  { relativePath: '_meta/icons/64x64.png', width: 64, height: 64 },
  { relativePath: '_meta/icons/128x128.png', width: 128, height: 128 }
]
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function assertPngIcon(content, icon) {
  assert.ok(content.subarray(0, 8).equals(pngSignature), `${icon.relativePath} must be a PNG`)
  assert.equal(content.toString('ascii', 12, 16), 'IHDR', `${icon.relativePath} must contain an IHDR chunk`)
  assert.equal(content.readUInt32BE(16), icon.width, `${icon.relativePath} has an unexpected width`)
  assert.equal(content.readUInt32BE(20), icon.height, `${icon.relativePath} has an unexpected height`)
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
  assert.equal(built.release, 4)

  assert.deepEqual(
    await readFile(repositoryPath('dist', 'plesk', 'staging', 'package', 'htdocs', 'images', 'nebulynk.png')),
    await readFile(repositoryPath('frontend', 'src', 'assets', 'nebulynk.png'))
  )

  const metaXml = await readFile(repositoryPath('dist', 'plesk', 'staging', 'package', 'meta.xml'), 'utf8')
  assert.match(metaXml, /<id>nebulynk-plesk<\/id>/)
  assert.match(metaXml, /<category>web_app<\/category>/)
  assert.doesNotMatch(metaXml, /<category>server_tool<\/category>/)
  assert.match(metaXml, /<os>unix<\/os>/)
  assert.match(metaXml, /<plesk_min_version>18\.0\.53<\/plesk_min_version>/)

  const metaTemplate = await readFile(repositoryPath('plesk-extension', 'meta.xml.template'), 'utf8')
  assert.match(metaTemplate, /<category>web_app<\/category>/)
  assert.doesNotMatch(metaTemplate, /<category>server_tool<\/category>/)

  for (const icon of extensionIconEntries) {
    const stagedIcon = await readFile(repositoryPath('dist', 'plesk', 'staging', 'package', icon.relativePath))
    assertPngIcon(stagedIcon, icon)
  }

  const archiveText = (await readFile(built.archivePath)).toString('latin1')
  for (const icon of extensionIconEntries) {
    assert.ok(archiveText.includes(icon.relativePath), `Plesk ZIP is missing ${icon.relativePath}`)
  }
  assert.ok(archiveText.includes('plib/scripts/pre-uninstall.php'))
  assert.ok(archiveText.includes('plib/views/scripts/index/_cleanup.phtml'))

  const manifest = JSON.parse(await readFile(
    repositoryPath('dist', 'plesk', 'staging', 'package', 'var', 'payload', 'manifest.json'),
    'utf8'
  ))
  assert.equal(manifest.application_version, built.version)
  assert.equal(manifest.extension_release, built.release)
  assert.ok(manifest.files.some((file) => file.path === 'deploy/plesk/edge.conf'))

  for (const publicAsset of [
    'frontend/public/manifest.webmanifest',
    'frontend/public/sw.js',
    'frontend/public/share-target-storage.js',
    'frontend/public/favicon.ico',
    'frontend/public/apple-touch-icon.png',
    'frontend/public/pwa-icon-192.png',
    'frontend/public/pwa-icon-512.png',
    'frontend/public/pwa-icon-maskable-512.png'
  ]) {
    assert.ok(
      manifest.files.some((file) => file.path === publicAsset),
      `Plesk payload is missing ${publicAsset}`
    )
  }
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

test('uses fixed safe helper paths and restricts destructive cleanup to the project', async () => {
  const helper = await readFile(repositoryPath('plesk-extension', 'sbin', 'nebulynk-plesk'), 'utf8')
  assert.match(helper, /DEPLOYMENT_ROOT="\/opt\/nebulynk-plesk"/)
  assert.match(helper, /PAYLOAD_ROOT="\$PSA_ROOT\/var\/modules\/\$MODULE_ID\/payload"/)
  assert.match(helper, /rm -rf -- "\$SOURCE_ROOT"/)
  assert.match(helper, /check_edge_port\(\)/)
  assert.match(helper, /label=com\.docker\.compose\.project=\$COMPOSE_PROJECT/)
  assert.match(helper, /chown 70:70 "\$DATA_ROOT\/postgres"/)
  assert.match(helper, /chown 999:1000 "\$DATA_ROOT\/redis"/)
  assert.match(helper, /chmod -R u\+rwX,go-rwx "\$SOURCE_ROOT"/)
  assert.match(helper, /chmod 0600 "\$ENV_FILE"/)
  assert.match(helper, /chmod 0644 \\\n\s+"\$SOURCE_ROOT\/deploy\/plesk\/edge\.conf"/)
  assert.match(helper, /cleanup_stack\(\)/)
  assert.match(helper, /\[ "\$DEPLOYMENT_ROOT" = "\/opt\/nebulynk-plesk" \]/)
  assert.match(helper, /docker info/)
  assert.match(helper, /docker ps -aq/)
  assert.match(helper, /compose down --remove-orphans --rmi local/)
  assert.match(helper, /rm -rf -- "\$DEPLOYMENT_ROOT"/)
  assert.doesNotMatch(helper, /compose down[^\n]*-v/)
  assert.doesNotMatch(helper, /docker system prune/)
})

test('keeps extension removal data-preserving while exposing cleanup as a separate action', async () => {
  const hook = await readFile(repositoryPath('plesk-extension', 'plib', 'scripts', 'pre-uninstall.php'), 'utf8')
  const deployment = await readFile(repositoryPath('plesk-extension', 'plib', 'library', 'Deployment.php'), 'utf8')
  const task = await readFile(repositoryPath('plesk-extension', 'plib', 'library', 'Task', 'Deployment.php'), 'utf8')
  const controller = await readFile(repositoryPath('plesk-extension', 'plib', 'controllers', 'IndexController.php'), 'utf8')

  assert.match(hook, /callHelper\('stop'\)/)
  assert.doesNotMatch(hook, /cleanup/)
  assert.match(deployment, /CLEANUP_CONFIRMATION = 'DELETE NEBULYNK DATA'/)
  assert.match(deployment, /public static function prepareCleanup\(\)/)
  assert.match(deployment, /public static function resetDeploymentState\(\)/)
  assert.match(task, /action === 'cleanup' \? 'cleaning'/)
  assert.match(controller, /cleanup_action/)
  assert.match(controller, /cleanup_confirmation/)
  assert.match(controller, /prepareCleanup\(\)/)
  assert.match(controller, /startTask\('cleanup'\)/)
})

test('normalizes frontend document-root permissions before using the unprivileged nginx user', async () => {
  const dockerfile = await readFile(repositoryPath('frontend', 'Dockerfile'), 'utf8')

  assert.match(
    dockerfile,
    /COPY --from=build-stage \/app\/frontend\/dist \/usr\/share\/nginx\/html/
  )
  assert.match(
    dockerfile,
    /USER root\s+RUN chmod -R a\+rX \/usr\/share\/nginx\/html\s+USER 101/
  )
})

test('registers both Plesk Nginx hook variants and keeps domain routing scoped', async () => {
  const hook = await readFile(repositoryPath('plesk-extension', 'plib', 'hooks', 'WebServer.php'), 'utf8')
  const controller = await readFile(repositoryPath('plesk-extension', 'plib', 'controllers', 'IndexController.php'), 'utf8')
  const deployment = await readFile(repositoryPath('plesk-extension', 'plib', 'library', 'Deployment.php'), 'utf8')
  const task = await readFile(repositoryPath('plesk-extension', 'plib', 'library', 'Task', 'Deployment.php'), 'utf8')
  const view = await readFile(repositoryPath('plesk-extension', 'plib', 'views', 'scripts', 'index', 'index.phtml'), 'utf8')
  const actionView = await readFile(repositoryPath('plesk-extension', 'plib', 'views', 'scripts', 'index', '_actions.phtml'), 'utf8')
  const cleanupView = await readFile(repositoryPath('plesk-extension', 'plib', 'views', 'scripts', 'index', '_cleanup.phtml'), 'utf8')
  const prerequisitesView = await readFile(repositoryPath('plesk-extension', 'plib', 'views', 'scripts', 'index', '_prerequisites.phtml'), 'utf8')
  const viewFragments = `${view}\n${actionView}\n${cleanupView}\n${prerequisitesView}`

  assert.match(hook, /getDomainNginxConfig\(pm_Domain \$domain\)/)
  assert.match(hook, /getDomainNginxProxyConfig\(pm_Domain \$domain\)/)
  assert.match(deployment, /updateDomainConfiguration\(new pm_Domain\(\$domain->getId\(\)\)\)/)
  assert.match(deployment, /state\['domain_guid'\] !== \(string\)\$domain->getGuid\(\)/)
  assert.match(deployment, /\.well-known\/acme-challenge/)
  assert.match(deployment, /proxy_set_header Host \\\$http_host;/)
  assert.match(task, /'--domain'/)
  assert.match(task, /'--port'/)
  assert.match(task, /onError\(Exception \$e\)/)
  assert.match(view, /pm_Context::getBaseUrl\(\)/)
  assert.match(view, /images\/nebulynk\.png/)
  assert.doesNotMatch(view, /nebulynk-hero-mark/)
  assert.match(view, /\$isBusy = in_array\(\$statusKey, \['checking', 'cleaning'\], true\)/)
  assert.match(view, /\$isCleanupInProgress = \$statusKey === 'cleaning'/)
  assert.match(view, /\$isOperational = in_array\(\$statusKey, \['ready', 'running', 'stopped', 'error'\]/)
  assert.match(view, /_actions\.phtml/)
  assert.match(view, /_cleanup\.phtml/)
  assert.match(view, /_prerequisites\.phtml/)
  const statusBannerIndex = view.indexOf('class="nebulynk-status-banner')
  const heroIndex = view.indexOf('class="nebulynk-hero"')
  const primaryActionIndex = view.indexOf("render('index/_actions.phtml')")
  const prerequisitesIndex = view.indexOf("render('index/_prerequisites.phtml')")
  const setupActionIndex = view.lastIndexOf("render('index/_actions.phtml')")
  assert.ok(statusBannerIndex > heroIndex, 'status banner must follow the hero')
  assert.ok(primaryActionIndex < prerequisitesIndex, 'operating actions must precede prerequisites')
  assert.ok(setupActionIndex > prerequisitesIndex, 'setup actions must follow prerequisites')
  assert.match(prerequisitesView, /<details class="form-box nebulynk-card nebulynk-prerequisites-card"/)
  assert.match(prerequisitesView, /\$isOperational \? '' : ' open'/)
  assert.match(actionView, /\$isOperational/)
  assert.match(cleanupView, /cleanupConfirmationPhrase/)
  assert.match(cleanupView, /Alle Nebulynk-Daten werden gelöscht/)
  assert.match(controller, /1\. Vorabprüfung starten/)
  assert.match(controller, /kann mehrere Minuten dauern/)
  assert.match(controller, /Alle Daten löschen/)
  assert.match(viewFragments, /Docker Extension installieren/)
  assert.match(viewFragments, /Vorabprüfung &rarr; Installieren und bauen/)
  assert.match(viewFragments, /mehrere Minuten dauern/)
})

async function canRunDocker() {
  if (process.platform !== 'linux') {
    return false
  }

  try {
    await execFileAsync('docker', ['info'], { timeout: 10000 })
    return true
  } catch {
    return false
  }
}

async function runCleanupFixture({ composeExit = 0, remaining = false, symlink = false } = {}) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'nebulynk-plesk-cleanup-'))
  const fakeDockerPath = path.join(fixtureRoot, 'docker')
  const helperPath = repositoryPath('plesk-extension', 'sbin', 'nebulynk-plesk')

  await writeFile(fakeDockerPath, `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> /tmp/fake-docker.log
case "\${1:-}" in
    info)
        exit 0
        ;;
    compose)
        exit "\${FAKE_COMPOSE_EXIT:-0}"
        ;;
    ps)
        if [ "\${FAKE_REMAINING:-0}" = "1" ]; then
            printf '%s\\n' 'nebulynk-container'
        fi
        exit 0
        ;;
    *)
        exit 0
        ;;
esac
`)
  await chmod(fakeDockerPath, 0o755)

  const setup = symlink
    ? 'mkdir -p /opt/nebulynk-plesk-target && ln -s /opt/nebulynk-plesk-target /opt/nebulynk-plesk'
    : 'mkdir -p /opt/nebulynk-plesk/source/deploy/plesk /opt/nebulynk-plesk/data/postgres && printf "POSTGRES_PASSWORD=test\\n" > /opt/nebulynk-plesk/.env && : > /opt/nebulynk-plesk/source/deploy/plesk/docker-compose.yml'
  const expectedFailure = composeExit !== 0 || remaining || symlink
  const script = `set -eu
export PATH=/fake-bin:$PATH
${setup}
set +e
/usr/local/bin/nebulynk-plesk --action cleanup
status=$?
set -e
if [ "${expectedFailure ? '1' : '0'}" = "0" ]; then
    [ "$status" -eq 0 ]
    [ ! -e /opt/nebulynk-plesk ]
    case "$(cat /tmp/fake-docker.log)" in
        *'--rmi local'*) ;;
        *) exit 77 ;;
    esac
else
    [ "$status" -ne 0 ]
    if [ "${symlink ? '1' : '0'}" = "1" ]; then
        [ -e /opt/nebulynk-plesk-target ]
    else
        [ -e /opt/nebulynk-plesk ]
    fi
fi
`

  try {
    return await execFileAsync('docker', [
      'run',
      '--rm',
      '--network=none',
      '--mount',
      `type=bind,source=${helperPath},target=/usr/local/bin/nebulynk-plesk,readonly`,
      '--mount',
      `type=bind,source=${fixtureRoot},target=/fake-bin,readonly`,
      '--env',
      `FAKE_COMPOSE_EXIT=${composeExit}`,
      '--env',
      `FAKE_REMAINING=${remaining ? '1' : '0'}`,
      'alpine:3.20',
      'sh',
      '-c',
      script
    ], { timeout: 120000, maxBuffer: 1024 * 1024 })
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
}

test('fails closed before deleting the deployment when cleanup cannot be verified', async (t) => {
  if (!await canRunDocker()) {
    t.skip('requires a Linux Docker daemon')
    return
  }

  await runCleanupFixture()
  await runCleanupFixture({ composeExit: 23 })
  await runCleanupFixture({ remaining: true })
  await runCleanupFixture({ symlink: true })
})
