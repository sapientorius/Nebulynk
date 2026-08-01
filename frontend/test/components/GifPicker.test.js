import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('GifPicker source contract', () => {
  it('uses KLIPY attribution and search placeholder text', () => {
    const source = readFileSync(resolve('src/components/GifPicker.vue'), 'utf8')

    expect(source).toContain('placeholder="Search KLIPY"')
    expect(source).toContain('Powered by KLIPY')
    expect(source).toContain('class="gif-attribution"')
  })

  it('keeps the existing store-driven trending and search flow', () => {
    const source = readFileSync(resolve('src/components/GifPicker.vue'), 'utf8')

    expect(source).toContain('this.gifs = await this.gifSearchStore.loadTrending(20)')
    expect(source).toContain('this.gifs = await this.gifSearchStore.searchGifs(this.searchTerm.trim(), 20)')
    expect(source).toContain("this.$emit('select', gif.url)")
  })
})
