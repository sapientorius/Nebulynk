import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') throw new Error('The macOS installer must be built on a Mac or a macOS CI runner.')
const helperRoot = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const target = args.length === 0 ? (process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin')
  : args.length === 2 && args[0] === '--target' ? args[1] : null
if (!['aarch64-apple-darwin', 'x86_64-apple-darwin'].includes(target)) {
  throw new Error('Usage: npm run build:macos -- [--target aarch64-apple-darwin|x86_64-apple-darwin]')
}
const config = JSON.parse(readFileSync(join(helperRoot, 'src-tauri/tauri.conf.json'), 'utf8'))
if (!/^[a-z0-9 ()_-]+$/i.test(config.productName) || !/^\d+\.\d+\.\d+$/.test(config.version)) {
  throw new Error('Invalid macOS app name or version')
}
const require = createRequire(import.meta.url)
const cliPackagePath = require.resolve('@tauri-apps/cli/package.json')
const cliPackage = JSON.parse(readFileSync(cliPackagePath, 'utf8'))
const cli = resolve(dirname(cliPackagePath), cliPackage.bin.tauri)
const targetRoot = join(helperRoot, 'src-tauri/target')
const run = (command, values, options = {}) => execFileSync(command, values, { stdio: 'inherit', ...options })

// Tauri builds and ad-hoc signs the app. Disk-image creation uses Apple's
// non-interactive tools directly, without the Finder layout/AppleScript stage.
run(process.execPath, [cli, 'build', '--config', join(helperRoot, 'src-tauri/tauri.macos.conf.json'),
  '--target', target, '--bundles', 'app'], {
  cwd: helperRoot,
  env: { ...process.env, CARGO_TARGET_DIR: targetRoot, MACOSX_DEPLOYMENT_TARGET: '13.0' }
})
const bundle = join(targetRoot, target, 'release/bundle')
const appName = `${config.productName}.app`
const app = join(bundle, 'macos', appName)
const stage = mkdtempSync(join(tmpdir(), 'nebulynk-ptt-dmg-'))
const imageDirectory = join(bundle, 'dmg')
const arch = target.startsWith('aarch64') ? 'aarch64' : 'x64'
const image = join(imageDirectory, `${config.productName}_${config.version}_${arch}.dmg`)
try {
  const stagedApp = join(stage, appName)
  run('/usr/bin/ditto', [app, stagedApp])
  symlinkSync('/Applications', join(stage, 'Applications'))
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', stagedApp])
  mkdirSync(imageDirectory, { recursive: true })
  run('/usr/bin/hdiutil', ['create', '-srcfolder', stage, '-volname', `${config.productName} (Beta)`,
    '-fs', 'HFS+', '-format', 'UDZO', '-ov', '-o', image])
  console.log(`Built macOS Beta disk image: ${image}`)
} finally {
  // Only the temporary directory returned by this invocation's mkdtemp is removed.
  rmSync(stage, { recursive: true, force: true })
}
