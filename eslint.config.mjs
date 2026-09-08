import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

const targets = ['backend/**/*.{js,mjs}', 'frontend/**/*.{js,mjs,vue}', 'scripts/**/*.mjs', 'eslint.config.mjs']

export default [
  // Build output, browser reports and copied third-party models are not source.
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/test-results/**', '**/playwright-report/**', 'frontend/public/vendor/**'] },
  { ...js.configs.recommended, files: targets },
  ...vue.configs['flat/essential'].map((config) => ({ ...config, files: ['frontend/**/*.vue'] })),
  {
    files: targets,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // Callback signatures may deliberately retain unused positional arguments.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error'
    }
  },
  { files: ['backend/**/*.{js,mjs}', 'scripts/**/*.mjs', 'eslint.config.mjs', 'frontend/*.{js,mjs}', 'frontend/scripts/**/*.mjs', 'frontend/test/**/*.js'], languageOptions: { globals: globals.node } },
  { files: ['frontend/src/**/*.{js,vue}', 'frontend/test/**/*.component.test.js', 'frontend/test/helpers/**/*.js', 'frontend/test/setup-dom.js'], languageOptions: { globals: globals.browser } },
  // Playwright evaluate callbacks execute in the browser; Node unit setup supplies window only.
  { files: ['frontend/test/e2e/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['frontend/test/**/*.js'], languageOptions: { globals: { window: 'readonly' } } },
  { files: ['frontend/public/*.js'], languageOptions: { globals: globals.serviceworker } },
  { files: ['frontend/**/*.vue'], rules: { 'vue/no-unused-vars': 'error' } }
]
