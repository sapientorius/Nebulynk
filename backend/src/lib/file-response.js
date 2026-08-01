export function sanitizeFileForExternal(file) {
  if (!file || typeof file !== 'object') return file

  const sanitized = { ...file }
  delete sanitized.storage_key
  delete sanitized.bucket
  return sanitized
}

export function sanitizeFilesForExternal(files) {
  if (!Array.isArray(files)) return files
  return files.map((file) => sanitizeFileForExternal(file))
}
