export async function confirmUnsupportedBlurFallback(t) {
  const title = t('ui.components.background_blur_unsupported_title')
  const content = t('ui.components.background_blur_unsupported_body')
  const positiveText = t('ui.components.start_video_without_blur')
  const negativeText = t('common.cancel')

  if (window.$dialog?.warning) {
    return await new Promise((resolve) => {
      let settled = false
      const settle = (value) => {
        if (settled) return
        settled = true
        resolve(value)
      }

      window.$dialog.warning({
        title,
        content,
        positiveText,
        negativeText,
        onPositiveClick: () => settle(true),
        onNegativeClick: () => settle(false),
        onClose: () => settle(false)
      })
    })
  }

  return window.confirm(`${title}\n\n${content}`)
}
