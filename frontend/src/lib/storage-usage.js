export function formatStorageBytes(value, locale = 'en') {
  if (value === null || value === undefined || value === '') return '–'
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '–'

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let amount = bytes
  let unitIndex = 0
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024
    unitIndex += 1
  }
  const maximumFractionDigits = unitIndex === 0 || amount >= 100 ? 0 : amount >= 10 ? 1 : 2
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits }).format(amount)} ${units[unitIndex]}`
}
