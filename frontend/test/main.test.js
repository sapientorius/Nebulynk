import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('main source contract', () => {
  it('registers admin settings input components with Naive UI', () => {
    const source = readFileSync(resolve('src/main.js'), 'utf8')

    expect(source).toContain('NInputNumber')
    expect(source).toContain('NColorPicker')
  })

  it('uses the desktop workspace client-context helper for bridge windows', () => {
    const source = readFileSync(resolve('src/main.js'), 'utf8')

    expect(source).toContain('setDesktopWorkspaceClientContext')
  })
})
