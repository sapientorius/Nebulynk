import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('UserAvatar source contract', () => {
  it('uses theme-aware fallback colors for users without uploaded avatars', () => {
    const source = readFileSync(resolve('src/components/UserAvatar.vue'), 'utf8')

    expect(source).toContain("'user-avatar-fallback-frame': !resolvedSrc")
    expect(source).toContain('<span v-else class="user-avatar-fallback">{{ initial }}</span>')
    expect(source).toContain('.user-avatar-fallback-frame {')
    expect(source).toContain('background: var(--app-avatar-bg);')
    expect(source).toContain('color: var(--app-avatar-text);')
    expect(source).toContain('border: 1px solid var(--app-avatar-border);')
    expect(source).toContain('box-sizing: border-box;')
    expect(source).not.toContain('background: rgba(255, 255, 255, 0.12);')
    expect(source).not.toContain('color: rgba(255, 255, 255, 0.9);')
  })

  it('keeps uploaded avatar images filling the avatar frame', () => {
    const source = readFileSync(resolve('src/components/UserAvatar.vue'), 'utf8')

    expect(source).toContain('v-if="resolvedSrc"')
    expect(source).toContain('class="user-avatar-image"')
    expect(source).toContain('object-fit: cover;')
    expect(source).not.toContain("'user-avatar-fallback-frame': resolvedSrc")
  })
})
