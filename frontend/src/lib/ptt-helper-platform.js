import platformPackage from '../../../package.json'

export const PTT_HELPER_RELEASE_URL = `https://github.com/sapientorius/Nebulynk/releases/tag/v${platformPackage.version}`
export const PTT_HELPER_GUIDE_URL = `https://github.com/sapientorius/Nebulynk/blob/v${platformPackage.version}/docs/PTT_HELPER.md`

export function browserPttHelperPlatform(navigator = {}) {
  const platform = navigator.userAgentData?.platform || navigator.platform || ''
  const userAgent = navigator.userAgent || ''
  if (/iPad|iPhone|iPod|Android/i.test(userAgent) || (/mac/i.test(platform) && navigator.maxTouchPoints > 1)) return null
  if (/^win/i.test(platform) || /Windows NT/i.test(userAgent)) return 'windows'
  if (/^mac/i.test(platform) || /Macintosh/i.test(userAgent)) return 'macos'
  return null
}
