import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    clearMocks: true,
    exclude: ['test/e2e/**']
  }
})
