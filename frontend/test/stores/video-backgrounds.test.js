import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('video backgrounds store source contract', () => {
  it('keeps authenticated blob URLs and image generation availability in the store', () => {
    const source = readFileSync(resolve('src/stores/video-backgrounds.js'), 'utf8')
    const apiClientSource = readFileSync(resolve('src/lib/api-client.js'), 'utf8')

    expect(source).toContain("api.get('/video-backgrounds'")
    expect(source).toContain('image_generation_available')
    expect(source).toContain("api.post('/video-backgrounds/upload'")
    expect(source).toContain('new FormData()')
    expect(source).toContain("form.append('file', file)")
    expect(source).toContain("api.post('/video-backgrounds'")
    expect(source).toContain("responseType: 'blob'")
    expect(source).toContain('URL.createObjectURL')
    expect(source).toContain('disposeObjectUrls')
    expect(apiClientSource).toContain('isFormDataPayload(config.data)')
    expect(apiClientSource).toContain("deleteHeader(config.headers, 'Content-Type')")
  })
})
