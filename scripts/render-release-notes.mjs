import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadReleaseCatalog } from './release-catalog.mjs'

const { releases } = await loadReleaseCatalog(process.cwd())
const outputDirectory = path.resolve(process.env.RELEASE_NOTES_OUTPUT_DIR || 'dist-release-notes')

function renderRelease({ document }, locale, includeHeading = true) {
  const lines = []
  if (includeHeading) lines.push(`## v${document.version} — ${document.title[locale]}`, '')
  lines.push(document.summary[locale], '')
  for (const change of document.changes) {
    lines.push(`- **${change.category}: ${change.title[locale]}** — ${change.description[locale]}`)
  }
  if (document.security.length === 0) {
    lines.push('', locale === 'de' ? 'Keine Security-Advisories.' : 'No security advisories.')
  } else {
    lines.push('', locale === 'de' ? '### Security-Advisories' : '### Security advisories', '')
    for (const advisory of document.security) {
      lines.push(`- **${advisory.severity.toUpperCase()}** (${advisory.affected_versions}) — ${advisory.summary[locale]}`)
    }
  }
  lines.push('', `[${locale === 'de' ? 'Upgrade-Anleitung' : 'Upgrade guide'}](${document.upgrade.docs_url})`)
  return lines.join('\n')
}

const latest = releases.at(-1)
const releaseNotes = [
  renderRelease(latest, 'de', true),
  '',
  '---',
  '',
  renderRelease(latest, 'en', true),
  ''
].join('\n')
const changelog = [
  '# Nebulynk Changelog',
  '',
  ...releases.toReversed().flatMap((entry) => [renderRelease(entry, 'de', true), ''])
].join('\n')

await mkdir(outputDirectory, { recursive: true })
await Promise.all([
  writeFile(path.join(outputDirectory, 'release-notes.md'), releaseNotes),
  writeFile(path.join(outputDirectory, 'CHANGELOG.md'), changelog)
])
process.stdout.write(`Rendered release notes for v${latest.document.version}.\n`)
