import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateContainerManifest } from './container-release.mjs'

export function assertReleaseAssets({ expectedManifest, publishedManifest, expectedArchive, publishedArchive, publishedChecksum, archiveName }) {
  validateContainerManifest(expectedManifest)
  validateContainerManifest(publishedManifest, { version: expectedManifest.version, revision: expectedManifest.revision })
  for (const [component, expected] of Object.entries(expectedManifest.images)) {
    const actual = publishedManifest.images[component]
    if (actual.digest !== expected.digest || Object.keys(expected.platforms).some((platform) => actual.platforms[platform] !== expected.platforms[platform])) {
      throw new Error('Published container manifest conflicts with verified images')
    }
  }
  const hash = (content) => createHash('sha256').update(content).digest('hex')
  if (hash(expectedArchive) !== hash(publishedArchive) || publishedChecksum.trim() !== `${hash(publishedArchive)}  ${archiveName}`) {
    throw new Error('Published Plesk package or checksum conflicts with the verified release')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, archive] = process.argv.slice(2)
  if (!directory || !archive) throw new Error('Usage: verify-release-container-assets.mjs PUBLISHED_DIRECTORY EXPECTED_ARCHIVE')
  assertReleaseAssets({
    expectedManifest: JSON.parse(await readFile('dist/containers/container-images.json', 'utf8')),
    publishedManifest: JSON.parse(await readFile(resolve(directory, 'container-images.json'), 'utf8')),
    expectedArchive: await readFile(archive), publishedArchive: await readFile(resolve(directory, basename(archive))),
    publishedChecksum: await readFile(resolve(directory, `${basename(archive)}.sha256`), 'utf8'), archiveName: basename(archive)
  })
  console.log('Published immutable images and Plesk assets match this verified release')
}
