import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('FileUpload source contract', () => {
  it('acts as a shared file picker and leaves upload decisions to the composer', () => {
    const source = readFileSync(resolve('src/components/FileUpload.vue'), 'utf8')

    expect(source).toContain("emits: ['files-selected']")
    expect(source).toContain("this.$emit('files-selected', fileList)")
    expect(source).toContain('@change="onFileSelect"')
    expect(source).toContain('await this.processFiles(files)')
    expect(source).not.toContain('n-modal')
    expect(source).not.toContain('data-testid="image-upload-choice"')
    expect(source).not.toContain('data-testid="image-upload-confirm"')
    expect(source).not.toContain('optimizeImageForUpload')
    expect(source).not.toContain('isOptimizableImageFile')
    expect(source).not.toContain('25 * 1024 * 1024')
  })
})
