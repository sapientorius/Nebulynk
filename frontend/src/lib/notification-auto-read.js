export function shouldRetryNotificationAutoRead(error) {
  const status = Number(error?.response?.status)
  if (!Number.isInteger(status)) return true
  if (status === 429) return true
  return status >= 500
}
