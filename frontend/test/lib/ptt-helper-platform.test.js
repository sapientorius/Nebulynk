import { describe, expect, it } from 'vitest'
import { browserPttHelperPlatform, PTT_HELPER_RELEASE_URL } from '../../src/lib/ptt-helper-platform.js'
import platformPackage from '../../../package.json'

describe('browser helper platforms', () => {
  it.each([
    [{ platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)', maxTouchPoints: 0 }, 'macos'],
    [{ userAgentData: { platform: 'macOS' } }, 'macos'],
    [{ platform: 'Win32' }, 'windows'],
    [{ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, 'windows'],
    [{ platform: 'MacIntel', maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' }, null],
    [{ userAgent: 'iPad' }, null], [{ userAgent: 'iPhone' }, null],
    [{ platform: 'Linux x86_64' }, null], [{ platform: 'Linux', userAgent: 'Android' }, null],
    [{ platform: 'Darwin' }, null], [{}, null]
  ])('classifies %j without exposing mobile helpers', (navigator, expected) => {
    expect(browserPttHelperPlatform(navigator)).toBe(expected)
  })
  it('pins downloads to the matching official platform release', () => {
    expect(PTT_HELPER_RELEASE_URL).toBe(`https://github.com/sapientorius/Nebulynk/releases/tag/v${platformPackage.version}`)
  })
})
