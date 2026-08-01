import { BadRequest, Conflict, Forbidden, NotFound, TooManyRequests } from '@feathersjs/errors'

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function buildFallbackCode(error) {
  const className = typeof error?.className === 'string' ? error.className.replace(/-/g, '_') : 'error'
  const messageSlug = slugify(error?.message || 'unexpected')
  return `api.${className}.${messageSlug || 'unexpected'}`
}

function applyMetadata(error, code, params) {
  const normalizedParams = params && typeof params === 'object' ? params : {}
  error.data = error.data && typeof error.data === 'object' ? { ...error.data } : {}
  error.data.error_code = code
  error.data.error_params = normalizedParams
  error.error_code = code
  error.error_params = normalizedParams
  return error
}

function createError(ErrorType, code, params = {}, message = null) {
  const err = new ErrorType(message || code, {
    error_code: code,
    error_params: params
  })
  return applyMetadata(err, code, params)
}

export function badRequest(code, params = {}, message = null) {
  return createError(BadRequest, code, params, message)
}

export function forbidden(code, params = {}, message = null) {
  return createError(Forbidden, code, params, message)
}

export function notFound(code, params = {}, message = null) {
  return createError(NotFound, code, params, message)
}

export function conflict(code, params = {}, message = null) {
  return createError(Conflict, code, params, message)
}

export function tooManyRequests(code, params = {}, message = null) {
  return createError(TooManyRequests, code, params, message)
}

export function attachErrorMetadata(error) {
  if (!error || typeof error !== 'object') return error

  const existingCode = (error.data && typeof error.data.error_code === 'string' && error.data.error_code.trim())
    ? error.data.error_code
    : null
  const code = existingCode || buildFallbackCode(error)
  const params = (error.data && typeof error.data.error_params === 'object')
    ? error.data.error_params
    : {}

  return applyMetadata(error, code, params)
}

export function buildErrorBody(code, message, params = {}) {
  return {
    error_code: code,
    error_params: params,
    message
  }
}
