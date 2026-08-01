import { describe, expect, it } from 'vitest'
import { summarizeForwardFiles } from '../../src/lib/forward-preview.js'

describe('summarizeForwardFiles', () => {
  it('returns an empty string without files', () => {
    expect(summarizeForwardFiles([], () => '')).toBe('')
  })

  it('summarizes forwarded file names', () => {
    const result = summarizeForwardFiles([
      { original_name: 'spec.pdf' },
      { original_name: 'budget.xlsx' }
    ], (key, params) => `${key}:${params.count}:${params.names}`)

    expect(result).toBe('ui.components.forward_files_summary:2:spec.pdf, budget.xlsx')
  })

  it('summarizes long file lists with overflow count', () => {
    const result = summarizeForwardFiles([
      { original_name: 'spec.pdf' },
      { original_name: 'budget.xlsx' },
      { original_name: 'diagram.png' },
      { original_name: 'notes.txt' }
    ], (key, params) => `${key}:${params.count}:${params.names}:${params.remaining}`)

    expect(result).toBe('ui.components.forward_files_summary_more:4:spec.pdf, budget.xlsx, diagram.png:1')
  })
})
