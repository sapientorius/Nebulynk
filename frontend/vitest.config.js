import { defineConfig, configDefaults } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { markdownItLinkifyInteropPlugin } from './scripts/markdown-it-linkify-interop.mjs'

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [markdownItLinkifyInteropPlugin()],
        test: {
          name: 'node', environment: 'node', clearMocks: true,
          setupFiles: ['./test/setup.js'],
          exclude: [...configDefaults.exclude, 'test/e2e/**', '**/*.component.test.js'],
          server: { deps: { inline: ['markdown-it', 'linkify-it'] } }
        }
      },
      {
        plugins: [vue(), markdownItLinkifyInteropPlugin()],
        test: {
          name: 'components', environment: 'jsdom', clearMocks: true,
          setupFiles: ['./test/setup-dom.js'],
          include: ['test/**/*.component.test.js'],
          server: { deps: { inline: ['markdown-it', 'linkify-it'] } }
        }
      }
    ]
  }
})
