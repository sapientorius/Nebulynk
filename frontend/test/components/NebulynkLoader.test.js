import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('NebulynkLoader', () => {
  it('exposes one reusable loader component with pulse and orbit variants', () => {
    const source = readFileSync(resolve('src/components/NebulynkLoader.vue'), 'utf8')

    expect(source).toContain("name: 'NebulynkLoader'")
    expect(source).toContain("default: 'pulse'")
    expect(source).toContain("return this.variant === 'orbit' ? 'orbit' : 'pulse'")
    expect(source).toContain("'nebulynk-loader-pulse': resolvedVariant === 'pulse'")
    expect(source).toContain("'nebulynk-loader-orbit': resolvedVariant === 'orbit'")
  })

  it('supports centered layout, accessible labels, and configurable size', () => {
    const source = readFileSync(resolve('src/components/NebulynkLoader.vue'), 'utf8')

    expect(source).toContain("'nebulynk-loader-centered': centered")
    expect(source).toContain(':aria-label="label || null"')
    expect(source).toContain("'--nebulynk-loader-size': this.resolvedSize")
    expect(source).toContain("return `${this.size}px`")
    expect(source).toContain("return this.resolvedVariant === 'orbit' ? '50px' : '48px'")
  })

  it('keeps both animation keyframes and visual styles in the shared component', () => {
    const source = readFileSync(resolve('src/components/NebulynkLoader.vue'), 'utf8')

    expect(source).toContain('.nebulynk-loader-pulse .nebulynk-loader-visual')
    expect(source).toContain('.nebulynk-loader-orbit .nebulynk-loader-visual')
    expect(source).toContain('@keyframes pulse-ring')
    expect(source).toContain('@keyframes spin')
    expect(source).toContain('@keyframes scale-bounce')
  })
})
