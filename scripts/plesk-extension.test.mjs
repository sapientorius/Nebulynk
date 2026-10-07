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
  const releaseDocument = JSON.parse(await readFile(
    repositoryPath('releases', `v${built.version}.json`),
    'utf8'
  ))
  assert.equal(built.release, releaseDocument.revision)

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

  assert.ok(manifest.files.some((file) => file.path === 'release.env'))
  assert.ok(manifest.files.some((file) => file.path === 'LICENSE'))
  assert.ok(!manifest.files.some((file) => /^(backend|frontend)\//.test(file.path)))
  assert.ok(!manifest.files.some((file) => /^package(?:-lock)?\.json$/.test(file.path)))
  const compose = await readFile(repositoryPath('dist', 'plesk', 'staging', 'package', 'var', 'payload', 'deploy', 'plesk', 'docker-compose.yml'), 'utf8')
  assert.doesNotMatch(compose, /^\s+build:/m)
})

test('release packages pin the verified image digests and reject mismatched application versions', async () => {
  const { version } = JSON.parse(await readFile(repositoryPath('package.json'), 'utf8'))
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nebulynk-plesk-images-'))
  const manifestPath = path.join(directory, 'container-images.json')
  const previous = process.env.NEBULYNK_CONTAINER_MANIFEST
  const manifest = { schema_version: 1, version, revision: 'a'.repeat(40), platforms: ['linux/amd64', 'linux/arm64'],
    images: Object.fromEntries(['backend', 'frontend', 'transcription-worker'].map((component, index) => [component, {
      repository: `ghcr.io/sapientorius/nebulynk-${component}`, digest: `sha256:${String(index + 1).repeat(64)}`,
      platforms: { 'linux/amd64': `sha256:${'4'.repeat(64)}`, 'linux/arm64': `sha256:${'5'.repeat(64)}` }
    }])) }
  try {
    await writeFile(manifestPath, JSON.stringify(manifest))
    process.env.NEBULYNK_CONTAINER_MANIFEST = manifestPath
    const built = await buildPleskExtension()
    await validatePleskExtension()
    const payload = repositoryPath('dist', 'plesk', 'staging', 'package', 'var', 'payload')
    const compose = await readFile(path.join(payload, 'deploy/plesk/docker-compose.yml'), 'utf8')
    for (const image of Object.values(manifest.images)) assert.ok(compose.includes(`${image.repository}@${image.digest}`))
    assert.doesNotMatch(compose, /NEBULYNK_VERSION:-/)
    assert.deepEqual(JSON.parse(await readFile(path.join(payload, 'container-images.json'), 'utf8')), manifest)
    assert.equal(await readFile(path.join(payload, 'release.env'), 'utf8'), `NEBULYNK_VERSION=${version}\n`)
    assert.equal((await buildPleskExtension()).checksum, built.checksum, 'Reruns must reproduce the immutable archive bytes')
    await writeFile(manifestPath, JSON.stringify({ ...manifest, version: '999.0.0' }))
    await assert.rejects(buildPleskExtension(), /release manifest|release identity/)
  } finally {
    if (previous === undefined) delete process.env.NEBULYNK_CONTAINER_MANIFEST
    else process.env.NEBULYNK_CONTAINER_MANIFEST = previous
    assert.equal(path.dirname(directory), os.tmpdir())
    await rm(directory, { recursive: true, force: true })
    await buildPleskExtension()
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
  const helper = (await readFile(repositoryPath('plesk-extension', 'sbin', 'nebulynk-plesk'), 'utf8'))
    .replace(/\r\n/g, '\n')
  assert.match(helper, /DEPLOYMENT_ROOT="\/opt\/nebulynk-plesk"/)
  assert.match(helper, /PAYLOAD_ROOT="\$PSA_ROOT\/var\/modules\/\$MODULE_ID\/payload"/)
  assert.match(helper, /mv "\$SOURCE_ROOT" "\$PREVIOUS_ROOT"/)
  assert.doesNotMatch(helper, /rm -rf -- "\$SOURCE_ROOT"/)
  assert.match(helper, /check_edge_port\(\)/)
  assert.match(helper, /label=com\.docker\.compose\.project=\$COMPOSE_PROJECT/)
  assert.match(helper, /chown 70:70 "\$DATA_ROOT\/postgres"/)
  assert.match(helper, /chown 999:1000 "\$DATA_ROOT\/redis"/)
  assert.match(helper, /chmod -R u\+rwX,go-rwx "\$CANDIDATE_ROOT"/)
  assert.match(helper, /chmod 0600 "\$ENV_FILE"/)
  assert.match(helper, /chmod 0644 \\\n\s+"\$CANDIDATE_ROOT\/deploy\/plesk\/edge\.conf"/)
  assert.match(helper, /cleanup_stack\(\)/)
  assert.match(helper, /\[ "\$DEPLOYMENT_ROOT" = "\/opt\/nebulynk-plesk" \]/)
  assert.match(helper, /docker info/)
  assert.match(helper, /docker ps -aq/)
  assert.match(helper, /compose down --remove-orphans --rmi local/)
  assert.match(helper, /rm -rf -- "\$DEPLOYMENT_ROOT"/)
  assert.doesNotMatch(helper, /compose down[^\n]*-v/)
  assert.doesNotMatch(helper, /docker system prune/)
  assert.match(helper, /output="\$\(compose ps --all\)"/)
  assert.match(helper, /No Nebulynk containers are currently present\./)
  assert.match(helper, /output="\$\(compose logs --no-color --tail=100\)"/)
  assert.match(helper, /No log entries are available yet\./)
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
    /USER root\s+RUN chmod -R a\+rX \/usr\/share\/nginx\/html/
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
  assert.match(actionView, /\$runtimeOutput = is_array\(\$this->runtimeOutput\)/)
  assert.match(actionView, /<details class="form-box nebulynk-card nebulynk-output-card" open>/)
  assert.match(actionView, /\$escape\(\$runtimeOutput\['title'\]\)/)
  assert.match(actionView, /\$escape\(\$runtimeOutput\['content'\]\)/)
  assert.ok(
    actionView.indexOf('nebulynk-output-card') > actionView.indexOf('<?= $this->form ?>'),
    'runtime output must follow the actions form'
  )
  assert.match(cleanupView, /cleanupConfirmationPhrase/)
  assert.match(cleanupView, /All Nebulynk data will be deleted/)
  assert.match(cleanupView, /<details class="form-box nebulynk-card nebulynk-cleanup-card">/)
  assert.doesNotMatch(cleanupView, /<details[^>]*\bopen\b/)
  assert.match(cleanupView, /<summary class="nebulynk-section-head nebulynk-cleanup-summary">/)
  assert.match(cleanupView, /<div class="nebulynk-cleanup-content">/)
  const actionFormStart = controller.indexOf('$form = new pm_Form_Simple')
  const cleanupFormStart = controller.indexOf('$cleanupForm = new pm_Form_Simple')
  const actionFormSection = controller.slice(actionFormStart, cleanupFormStart)
  const cleanupFormSection = controller.slice(cleanupFormStart)
  assert.match(actionFormSection, /'name' => 'nebulynkActionForm'/)
  assert.match(actionFormSection, /setAttrib\('id', 'nebulynkActionForm'\)/)
  assert.match(actionFormSection, /'sendTitle' => 'Run action'/)
  assert.match(actionFormSection, /'cancelHidden' => true/)
  assert.match(actionFormSection, /getElement\('send'\)->setAttrib\('id', 'nebulynkActionSubmit'\)/)
  assert.doesNotMatch(actionFormSection, /cancelTitle/)
  assert.doesNotMatch(actionFormSection, /cancelLink/)
  assert.doesNotMatch(actionFormSection, /getElement\('cancel'\)/)
  assert.match(cleanupFormSection, /'name' => 'nebulynkCleanupForm'/)
  assert.match(cleanupFormSection, /setAttrib\('id', 'nebulynkCleanupForm'\)/)
  assert.match(cleanupFormSection, /'sendTitle' => 'Delete all data'/)
  assert.match(cleanupFormSection, /'cancelHidden' => true/)
  assert.match(cleanupFormSection, /getElement\('send'\)->setAttrib\('id', 'nebulynkCleanupSubmit'\)/)
  assert.match(controller, /1\. Run preflight check/)
  assert.match(controller, /may take several minutes/)
  assert.match(controller, /'sendTitle' => 'Run action'/)
  assert.match(controller, /'sendTitle' => 'Delete all data'/)
  assert.match(controller, /'cancelHidden' => true/)
  assert.match(controller, /private const RUNTIME_OUTPUT_SESSION_KEY = 'runtime_output'/)
  assert.match(controller, /\$this->view->runtimeOutput = \$this->consumeRuntimeOutput\(\)/)
  assert.match(controller, /Modules_NebulynkPlesk_Deployment::callHelper\(\$operation\)/)
  assert.doesNotMatch(controller, /RESULT_STDOUT/)
  assert.match(controller, /\$result\['stdout'\]/)
  assert.match(controller, /storeRuntimeOutput\(/)
  assert.match(controller, /consumeRuntimeOutput\(/)
  assert.match(controller, /unset\(\$_SESSION\['module'\]/)
  assert.match(controller, /Container status retrieved\. See the result below\./)
  assert.match(controller, /Latest logs retrieved\. See the result below\./)
  assert.match(controller, /\$this->_status->addMessage\('error', \$exception->getMessage\(\)\)/)
  assert.match(controller, /\$this->_helper->json\(\['redirect' => pm_Context::getBaseUrl\(\)\]\)/)
  assert.doesNotMatch(controller, /sendButton/)
  assert.match(controller, /Delete all data/)
  assert.match(viewFragments, /Install the Plesk Docker Extension/)
  assert.match(viewFragments, /Preflight check &rarr; Download and deploy/)
  assert.match(viewFragments, /may take several minutes/)
  assert.doesNotMatch(view, /runtimeStatus/)
  assert.doesNotMatch(view, /runtimeLogs/)
})

async function canRunDocker() {
  try {
    const { stdout } = await execFileAsync('docker', ['info', '--format', '{{.OSType}}'], { timeout: 10000 })
    return stdout.trim() === 'linux'
  } catch {
    return false
  }
}

async function runCleanupFixture({ composeExit = 0, remaining = false, symlink = false } = {}) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'nebulynk-plesk-cleanup-'))
  const fakeDockerPath = path.join(fixtureRoot, 'docker')
  const helperPath = path.join(fixtureRoot, 'nebulynk-plesk')
  // Execute Linux shell source independently of Windows checkout line endings.
  await writeFile(helperPath, (await readFile(repositoryPath('plesk-extension', 'sbin', 'nebulynk-plesk'), 'utf8')).replace(/\r\n/g, '\n'))
  await chmod(helperPath, 0o755)

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
      ...(process.env.PLESK_FIXTURE_OWNER ? ['--label', `nebulynk.ci=${process.env.PLESK_FIXTURE_OWNER}`] : []),
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
    assert.notEqual(process.env.NEBULYNK_CI_STRICT, 'true', 'Full CI requires a Linux Docker daemon; Plesk cleanup must not skip')
    t.skip('requires a Linux Docker daemon')
    return
  }

  await runCleanupFixture()
  await runCleanupFixture({ composeExit: 23 })
  await runCleanupFixture({ remaining: true })
  await runCleanupFixture({ symlink: true })
})

async function runDeploymentFixture({ existing = true, configExit = 0, pullExit = 0 } = {}) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'nebulynk-plesk-deployment-'))
  const helperPath = path.join(fixtureRoot, 'nebulynk-plesk')
  await writeFile(helperPath, (await readFile(repositoryPath('plesk-extension', 'sbin', 'nebulynk-plesk'), 'utf8')).replace(/\r\n/g, '\n'))
  await writeFile(path.join(fixtureRoot, 'ss'), '#!/bin/sh\nexit 0\n')
  await writeFile(path.join(fixtureRoot, 'openssl'), '#!/bin/sh\nprintf "%064d\\n" 1\n')
  await writeFile(path.join(fixtureRoot, 'docker'), `#!/bin/sh
set -eu
printf '%s version=%s\\n' "$*" "\${NEBULYNK_VERSION:-unset}" >> /tmp/docker.log
case "$*" in
    *' config') exit ${configExit} ;;
    *' pull')
        # The legacy source deployment must still exist during every download.
        if [ '${existing ? '1' : '0'}' = 1 ]; then [ -f /opt/nebulynk-plesk/source/legacy-source ]; fi
        exit ${pullExit}
        ;;
esac
`)
  for (const file of ['nebulynk-plesk', 'ss', 'openssl', 'docker']) await chmod(path.join(fixtureRoot, file), 0o755)
  const fail = configExit !== 0 || pullExit !== 0
  const script = `set -eu
export PATH=/fake-bin:$PATH
payload=/usr/local/psa/var/modules/nebulynk-plesk/payload
deployment=/opt/nebulynk-plesk
mkdir -p "$payload/deploy/plesk" "$deployment/data/postgres"
for file in garage.toml livekit.yaml deploy/plesk/edge.conf deploy/plesk/livekit-egress.yaml deploy/plesk/docker-compose.yml; do : > "$payload/$file"; done
printf 'NEBULYNK_VERSION=9.8.7\\n' > "$payload/release.env"
printf 'retained-data\\n' > "$deployment/data/postgres/fixture"
cat > "$deployment/.env" <<'ENV'
NEBULYNK_DOMAIN=app.example.com
EDGE_PORT=49152
JWT_SECRET=existing-jwt-secret
AI_SECRET_KEY=existing-ai-secret
POSTGRES_PASSWORD=existing-database-secret
STORAGE_S3_SECRET_KEY=existing-storage-secret
NEBULYNK_VERSION=0.1.0
ENV
cp "$deployment/.env" /tmp/previous.env
if [ '${existing ? '1' : '0'}' = 1 ]; then
    mkdir -p "$deployment/source/deploy/plesk"
    : > "$deployment/source/deploy/plesk/docker-compose.yml"
    printf 'legacy-code\\n' > "$deployment/source/legacy-source"
fi
set +e
/usr/local/bin/nebulynk-plesk --action update --domain changed.example.com
status=$?
set -e
[ "$(cat "$deployment/data/postgres/fixture")" = retained-data ]
grep -qx 'JWT_SECRET=existing-jwt-secret' "$deployment/.env"
grep -qx 'AI_SECRET_KEY=existing-ai-secret' "$deployment/.env"
grep -qx 'POSTGRES_PASSWORD=existing-database-secret' "$deployment/.env"
grep -qx 'STORAGE_S3_SECRET_KEY=existing-storage-secret' "$deployment/.env"
if [ '${fail ? '1' : '0'}' = 1 ]; then
    [ "$status" -ne 0 ]
    [ -f "$deployment/source/legacy-source" ]
    [ ! -e "$deployment/source/release.env" ]
    cmp /tmp/previous.env "$deployment/.env"
    ! grep -q ' up ' /tmp/docker.log
else
    [ "$status" -eq 0 ]
    [ -f "$deployment/source/release.env" ]
    grep -qx 'NEBULYNK_DOMAIN=changed.example.com' "$deployment/.env"
    [ ! -e "$deployment/source/legacy-source" ]
    if [ '${existing ? '1' : '0'}' = 1 ]; then [ -f "$deployment/source.previous/legacy-source" ]; fi
    grep -q 'up -d --no-build --pull never.*--wait' /tmp/docker.log
    ! grep 'compose ' /tmp/docker.log | grep -vq 'version=9.8.7'
    /usr/local/bin/nebulynk-plesk --action restart
    grep -q 'up -d --no-build --pull never --force-recreate' /tmp/docker.log
fi
cat /tmp/docker.log
`
  try {
    const { stdout } = await execFileAsync('docker', ['run', '--rm', '--network=none',
      ...(process.env.PLESK_FIXTURE_OWNER ? ['--label', `nebulynk.ci=${process.env.PLESK_FIXTURE_OWNER}`] : []),
      '--mount', `type=bind,source=${helperPath},target=/usr/local/bin/nebulynk-plesk,readonly`,
      '--mount', `type=bind,source=${fixtureRoot},target=/fake-bin,readonly`,
      'alpine:3.20', 'sh', '-c', script
    ], { timeout: 120000, maxBuffer: 1024 * 1024 })
    if (!fail) assert.ok(stdout.indexOf(' config') < stdout.indexOf(' pull') && stdout.indexOf(' pull') < stdout.indexOf(' up '))
  } finally { await rm(fixtureRoot, { recursive: true, force: true }) }
}

test('Plesk installs images and upgrades legacy source deployments only after successful downloads', async (t) => {
  if (!await canRunDocker()) {
    assert.notEqual(process.env.NEBULYNK_CI_STRICT, 'true', 'Full CI requires Linux Docker; Plesk deployment fixtures must not skip')
    t.skip('requires a Linux Docker daemon')
    return
  }
  await runDeploymentFixture({ existing: false })
  await runDeploymentFixture()
  await runDeploymentFixture({ configExit: 12 })
  await runDeploymentFixture({ pullExit: 23 })
})
