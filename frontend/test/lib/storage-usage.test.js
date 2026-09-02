import { describe, expect, it } from 'vitest'
import { formatStorageBytes } from '../../src/lib/storage-usage.js'

describe('storage usage formatting', () => {
  it('formats byte values with binary units', () => {
    expect(formatStorageBytes('0')).toBe('0 B')
    expect(formatStorageBytes('1536')).toBe('1.5 KiB')
    expect(formatStorageBytes(String(1024 ** 3))).toBe('1 GiB')
  })

  it('localizes number separators and handles unavailable values', () => {
    expect(formatStorageBytes('1536', 'de')).toBe('1,5 KiB')
    expect(formatStorageBytes(null)).toBe('–')
    expect(formatStorageBytes('-1')).toBe('–')
  })
})
