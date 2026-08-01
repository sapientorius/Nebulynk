import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { buildFrontendContentSecurityPolicy, resolveFrontendConnectSourceOrigins } from './security-headers.config.js'

const MEDIAPIPE_TASKS_VISION_WASM_PATH = '/vendor/mediapipe/tasks-vision/0.10.14/wasm'
const MEDIAPIPE_SELFIE_SEGMENTER_MODEL_PATH = '/vendor/mediapipe/models/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
const LIVEKIT_TRACK_PROCESSORS_PACKAGE_PATH = '/@livekit/track-processors/'

function selfHostedLivekitTrackProcessorAssetsPlugin() {
  return {
    name: 'nebulynk-self-hosted-livekit-track-processor-assets',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id.replace(/\\/g, '/')
      if (!normalizedId.includes(LIVEKIT_TRACK_PROCESSORS_PACKAGE_PATH)) {
        return null
      }

      const nextCode = code
        .replace(
          /`https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@[^`]+\/wasm`/g,
          `'${MEDIAPIPE_TASKS_VISION_WASM_PATH}'`
        )
        .replace(
          /(["'])https:\/\/storage\.googleapis\.com\/mediapipe-models\/image_segmenter\/selfie_segmenter\/float16\/latest\/selfie_segmenter\.tflite\1/g,
          `'${MEDIAPIPE_SELFIE_SEGMENTER_MODEL_PATH}'`
        )

      if (nextCode === code) {
        return null
      }

      return {
        code: nextCode,
        map: null
      }
    }
  }
}

function resolveConfiguredOrigin(key) {
  const value = process.env[key]?.trim()
  if (!value) return ''

  try {
    return new URL(value).origin
  } catch {
    return ''
  }
}

function resolveConfiguredConnectOrigins() {
  return resolveFrontendConnectSourceOrigins({
    apiOrigins: [
      resolveConfiguredOrigin('VITE_API_URL'),
      resolveConfiguredOrigin('VITE_BACKEND_URL')
    ].filter(Boolean),
    livekitOrigins: [
      resolveConfiguredOrigin('VITE_LIVEKIT_URL')
    ].filter(Boolean)
  })
}

const previewSecurityHeaders = {
  'Content-Security-Policy': buildFrontendContentSecurityPolicy({
    connectOrigins: resolveConfiguredConnectOrigins()
  }),
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), fullscreen=(self)',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff'
}

export default defineConfig({
  plugins: [
    selfHostedLivekitTrackProcessorAssetsPlugin(),
    vue(),
    vueDevTools(),
  ],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')

          if (!normalizedId.includes('node_modules')) {
            if (
              normalizedId.includes('/src/stores/voice.js')
              || normalizedId.includes('/src/lib/livekit.js')
              || normalizedId.includes('/src/lib/mic-activation.js')
            ) {
              return 'feature-voice'
            }

            if (
              normalizedId.includes('/src/lib/emoji-data.js')
              || normalizedId.includes('/src/components/EmojiPicker.vue')
              || normalizedId.includes('/src/components/GifPicker.vue')
            ) {
              return 'feature-composer'
            }

            return undefined
          }

          if (
            normalizedId.includes('/node_modules/naive-ui/')
            || normalizedId.includes('/node_modules/vooks/')
            || normalizedId.includes('/node_modules/vdirs/')
            || normalizedId.includes('/node_modules/treemate/')
            || normalizedId.includes('/node_modules/@css-render/')
            || normalizedId.includes('/node_modules/css-render/')
            || normalizedId.includes('/node_modules/seemly/')
            || normalizedId.includes('/node_modules/vueuc/')
          ) {
            return 'vendor-ui'
          }

          if (normalizedId.includes('@vicons')) {
            return 'vendor-icons'
          }

          if (
            normalizedId.includes('/vue/')
            || normalizedId.includes('/@vue/')
            || normalizedId.includes('pinia')
            || normalizedId.includes('vue-router')
          ) {
            return 'vendor-vue'
          }

          if (normalizedId.includes('livekit-client')) {
            return 'vendor-livekit'
          }

          if (
            normalizedId.includes('socket.io-client')
            || normalizedId.includes('engine.io-client')
            || normalizedId.includes('socket.io-parser')
          ) {
            return 'vendor-realtime'
          }

          if (normalizedId.includes('axios')) {
            return 'vendor-axios'
          }

          return 'vendor-misc'
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3030',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      }
    }
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    headers: previewSecurityHeaders
  }
})
