export function markdownItLinkifyInteropPlugin() {
  return {
    name: 'nebulynk-markdown-it-linkify-interop',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id.replace(/\\/g, '/')
      if (!normalizedId.endsWith('/markdown-it/lib/index.mjs')) return null

      const nextCode = code.replace(
        "import LinkifyIt from 'linkify-it'",
        "import { LinkifyIt } from 'linkify-it'"
      )

      if (nextCode === code) return null
      return { code: nextCode, map: null }
    }
  }
}
