import { defineConfig } from 'vitest/config'
import { markdownItLinkifyInteropPlugin } from './scripts/markdown-it-linkify-interop.mjs'

export default defineConfig({
  plugins: [markdownItLinkifyInteropPlugin()],
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    clearMocks: true,
    exclude: ['test/e2e/**'],
    server: {
      deps: {
        inline: ['markdown-it', 'linkify-it']
      }
    }
  }
})
