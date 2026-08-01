export function summarizeForwardFiles(files, tFn) {
  const list = Array.isArray(files) ? files.filter(Boolean) : []
  if (list.length === 0) return ''

  const translate = typeof tFn === 'function' ? tFn : (key, params) => {
    if (key === 'ui.components.forward_files_summary') {
      return `${params.count} file(s): ${params.names}`
    }
    if (key === 'ui.components.forward_files_summary_more') {
      return `${params.count} file(s): ${params.names} +${params.remaining}`
    }
    return ''
  }

  const names = list.slice(0, 3).map((file) => file.original_name).filter(Boolean)
  if (list.length > names.length) {
    return translate('ui.components.forward_files_summary_more', {
      count: list.length,
      names: names.join(', '),
      remaining: list.length - names.length
    })
  }

  return translate('ui.components.forward_files_summary', {
    count: list.length,
    names: names.join(', ')
  })
}
