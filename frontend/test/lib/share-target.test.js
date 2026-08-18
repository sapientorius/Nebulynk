import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  __resetShareTargetStateForTests,
  buildSharedMessageText,
  claimSharePayload,
  hasCompatibleShareContent,
  markShareFileUploaded,
  purgeExpiredSharePayloads,
  removeSharePayload,
  removeSharePayloadsForUser,
  setActiveShareTargetUser
} from '../../src/lib/share-target.js'

describe('share target helpers', () => {
  afterEach(() => {
    delete globalThis.NebulynkShareTargetStorage
    __resetShareTargetStateForTests()
  })

  it('joins title, text, and URL in order without duplicate values', () => {
    expect(buildSharedMessageText({
      title: 'A useful link',
      text: 'A useful link',
      url: 'https://example.test/guide'
    })).toBe('A useful link\n\nhttps://example.test/guide')

    expect(buildSharedMessageText({
      title: '  ',
      text: 'Hello',
      url: 'Hello'
    })).toBe('Hello')
  })

  it('omits a title that only repeats an attached file name', () => {
    expect(buildSharedMessageText({
      title: 'PHOTO.PNG',
      text: 'A caption',
      files: [{ name: 'photo.png' }]
    })).toBe('A caption')

    expect(buildSharedMessageText({
      title: 'Holiday photos',
      text: 'A caption',
      files: [{ name: 'photo.png' }]
    })).toBe('Holiday photos\n\nA caption')
  })

  it('loads the public storage script through the HTML entry point', () => {
    const indexHtml = readFileSync(resolve('index.html'), 'utf8')
    expect(indexHtml).toContain('<script src="/share-target-storage.js"></script>')
  })

  it('recognizes text or files as compatible shared content', () => {
    expect(hasCompatibleShareContent({ text: 'hello' })).toBe(true)
    expect(hasCompatibleShareContent({ files: [{ id: 'file-1' }] })).toBe(true)
    expect(hasCompatibleShareContent({ title: '   ', text: '', url: '', files: [] })).toBe(false)
  })

  it('delegates durable payload operations to the shared service-worker storage', async () => {
    const storage = {
      purgeExpiredPayloads: vi.fn().mockResolvedValue(2),
      claimPayload: vi.fn().mockResolvedValue({ payload: { id: 'share-1' }, reason: null }),
      setActiveUser: vi.fn().mockResolvedValue('user-1'),
      markFileUploaded: vi.fn().mockResolvedValue({ id: 'share-1' }),
      removePayload: vi.fn().mockResolvedValue(true),
      removePayloadsForUser: vi.fn().mockResolvedValue(1)
    }
    globalThis.NebulynkShareTargetStorage = storage

    await expect(purgeExpiredSharePayloads()).resolves.toBe(2)
    await expect(claimSharePayload('share-1', 'user-1')).resolves.toEqual({ payload: { id: 'share-1' }, reason: null })
    await expect(setActiveShareTargetUser('user-1')).resolves.toBe('user-1')
    await expect(markShareFileUploaded('share-1', 'image-1', { id: 'file-1' })).resolves.toEqual({ id: 'share-1' })
    await expect(removeSharePayload('share-1')).resolves.toBe(true)
    await expect(removeSharePayloadsForUser('user-1')).resolves.toBe(1)

    expect(storage.claimPayload).toHaveBeenCalledWith('share-1', 'user-1')
    expect(storage.setActiveUser).toHaveBeenCalledWith('user-1')
    expect(storage.markFileUploaded).toHaveBeenCalledWith('share-1', 'image-1', { id: 'file-1' })
  })
})
