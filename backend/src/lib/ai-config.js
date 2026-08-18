import { lookup as dnsLookup } from 'node:dns/promises'
import net from 'node:net'
import { badRequest } from './errors.js'

export const AI_PROVIDER_TYPES = ['openai', 'mistral', 'anthropic', 'openrouter', 'openai_compatible']
export const AI_FUNCTION_KEYS = ['transcription', 'meeting_summary', 'chat_summary', 'image_generation']
export const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export const PROVIDER_METADATA = {
  openai: {
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresBaseUrl: false,
    capabilities: {
      transcription: true,
      meeting_summary: true,
      image_generation: true
    }
  },
  mistral: {
    label: 'Mistral',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    requiresBaseUrl: false,
    capabilities: {
      transcription: true,
      meeting_summary: true,
      image_generation: false
    }
  },
  anthropic: {
    label: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    requiresBaseUrl: false,
    capabilities: {
      transcription: false,
      meeting_summary: true,
      image_generation: false
    }
  },
  openrouter: {
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    requiresBaseUrl: false,
    capabilities: {
      transcription: true,
      meeting_summary: true,
      image_generation: false
    }
  },
  openai_compatible: {
    label: 'OpenAI-compatible',
    defaultBaseUrl: null,
    requiresBaseUrl: true,
    capabilities: {
      transcription: true,
      meeting_summary: true,
      image_generation: false
    }
  }
}

export function getProviderMetadata(providerType) {
  return PROVIDER_METADATA[providerType] || null
}

export function isValidProviderType(providerType) {
  return AI_PROVIDER_TYPES.includes(providerType)
}

export function isValidFunctionKey(functionKey) {
  return AI_FUNCTION_KEYS.includes(functionKey)
}

export function getCapabilityForFunctionKey(functionKey) {
  if (functionKey === 'transcription') return 'transcription'
  if (functionKey === 'meeting_summary' || functionKey === 'chat_summary') return 'meeting_summary'
  if (functionKey === 'image_generation') return 'image_generation'
  return null
}

export function providerSupportsCapability(providerType, capability) {
  const metadata = getProviderMetadata(providerType)
  if (!metadata) return false
  return metadata.capabilities?.[capability] === true
}

function normalizeString(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function isProductionEnvironment(env = process.env) {
  return normalizeString(env.NODE_ENV).toLowerCase() === 'production'
}

function getDefaultProviderBaseUrl(providerType) {
  const defaultBaseUrl = getProviderMetadata(providerType)?.defaultBaseUrl || null
  return normalizeProviderBaseUrl(defaultBaseUrl)
}

function isBlockedIpv4Address(address) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return false

  const octets = address.split('.').map((item) => Number(item))
  if (octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
    return false
  }

  if (octets[0] === 127) return true
  if (octets[0] === 10) return true
  if (octets[0] === 192 && octets[1] === 168) return true
  if (octets[0] === 169 && octets[1] === 254) return true
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true
  if (octets[0] === 0 && octets[1] === 0 && octets[2] === 0 && octets[3] === 0) return true

  return false
}

function isBlockedIpv6Address(address) {
  const normalized = normalizeString(address).toLowerCase()
  if (!normalized) return false
  if (normalized === '::1' || normalized === '::') return true
  if (/^fe[89ab]/i.test(normalized)) return true
  if (/^f[cd]/i.test(normalized)) return true

  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalized.slice('::ffff:'.length)
    return isBlockedIpv4Address(mappedIpv4)
  }

  return false
}

function isBlockedNetworkAddress(address) {
  const normalized = normalizeString(address).toLowerCase()
  if (!normalized) return false

  const version = net.isIP(normalized)
  if (version === 4) return isBlockedIpv4Address(normalized)
  if (version === 6) return isBlockedIpv6Address(normalized)
  return false
}

async function resolveHostnameAddresses(hostname, lookupFn = dnsLookup) {
  const result = await lookupFn(hostname, { all: true, verbatim: true })
  const entries = Array.isArray(result) ? result : [result]

  return entries
    .map((entry) => normalizeString(typeof entry === 'string' ? entry : entry?.address))
    .filter(Boolean)
}

function buildProviderBaseUrlError(errorCode, data, message) {
  return badRequest(errorCode, data, message)
}

export function normalizeProviderBaseUrl(baseUrl = null) {
  const trimmed = normalizeString(baseUrl)
  if (!trimmed) return null

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw buildProviderBaseUrlError(
      'api.ai.base_url_invalid',
      { baseUrl: trimmed, reason: 'invalid_url' },
      'AI provider Base URL must be an absolute http(s) URL'
    )
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    throw buildProviderBaseUrlError(
      'api.ai.base_url_invalid',
      { baseUrl: trimmed, reason: 'protocol_invalid' },
      'AI provider Base URL must use http or https'
    )
  }

  if (parsed.username || parsed.password) {
    throw buildProviderBaseUrlError(
      'api.ai.base_url_invalid',
      { baseUrl: trimmed, reason: 'credentials_forbidden' },
      'AI provider Base URL must not include embedded credentials'
    )
  }

  if (parsed.search) {
    throw buildProviderBaseUrlError(
      'api.ai.base_url_invalid',
      { baseUrl: trimmed, reason: 'query_forbidden' },
      'AI provider Base URL must not include a query string'
    )
  }

  if (parsed.hash) {
    throw buildProviderBaseUrlError(
      'api.ai.base_url_invalid',
      { baseUrl: trimmed, reason: 'hash_forbidden' },
      'AI provider Base URL must not include a hash fragment'
    )
  }

  if (!normalizeString(parsed.hostname)) {
    throw buildProviderBaseUrlError(
      'api.ai.base_url_invalid',
      { baseUrl: trimmed, reason: 'hostname_missing' },
      'AI provider Base URL must include a hostname'
    )
  }

  parsed.username = ''
  parsed.password = ''
  parsed.search = ''
  parsed.hash = ''

  return parsed.toString().replace(/\/+$/, '')
}

export function resolveAiProviderBaseUrlAllowlist(env = process.env) {
  const configured = normalizeString(env.AI_PROVIDER_BASE_URL_ALLOWLIST)
  if (!configured) return []

  return [...new Set(
    configured
      .split(',')
      .map((entry) => normalizeProviderBaseUrl(entry))
      .filter(Boolean)
  )]
}

export function normalizeProviderBaseUrlForStorage(providerType, baseUrl = null) {
  const normalizedBaseUrl = normalizeProviderBaseUrl(baseUrl)
  if (providerType === 'openai_compatible') {
    return normalizedBaseUrl
  }

  const defaultBaseUrl = getDefaultProviderBaseUrl(providerType)
  if (!normalizedBaseUrl || normalizedBaseUrl === defaultBaseUrl) {
    return null
  }

  return normalizedBaseUrl
}

export function validateProviderConfig({ providerType, baseUrl }) {
  const metadata = getProviderMetadata(providerType)
  if (!metadata) {
    throw badRequest('api.ai.provider_type_invalid', { providerType }, 'Unbekannter AI-Provider-Typ')
  }

  const normalizedBaseUrl = normalizeProviderBaseUrl(baseUrl)
  const defaultBaseUrl = getDefaultProviderBaseUrl(providerType)

  if (metadata.requiresBaseUrl && !normalizedBaseUrl) {
    throw badRequest(
      'api.ai.base_url_required',
      { providerType },
      'base_url ist fuer diesen Provider erforderlich'
    )
  }

  if (
    providerType !== 'openai_compatible'
    && normalizedBaseUrl
    && normalizedBaseUrl !== defaultBaseUrl
  ) {
    throw badRequest(
      'api.ai.base_url_not_supported_for_provider',
      { providerType },
      'Eine benutzerdefinierte base_url ist nur fuer OpenAI-kompatible Provider erlaubt'
    )
  }

  return normalizedBaseUrl
}

export async function assertProviderBaseUrlAllowed({
  providerType,
  baseUrl,
  env = process.env,
  lookupFn = dnsLookup
}) {
  const normalizedBaseUrl = validateProviderConfig({ providerType, baseUrl })
  const effectiveBaseUrl = normalizedBaseUrl || getDefaultProviderBaseUrl(providerType)

  if (!effectiveBaseUrl || !isProductionEnvironment(env)) {
    return effectiveBaseUrl
  }

  const parsed = new URL(effectiveBaseUrl)
  if (parsed.protocol !== 'https:') {
    throw buildProviderBaseUrlError(
      'api.ai.base_url_https_required',
      { providerType, baseUrl: effectiveBaseUrl },
      'AI provider Base URL must use https in production'
    )
  }

  const allowlist = resolveAiProviderBaseUrlAllowlist(env)
  if (allowlist.includes(effectiveBaseUrl)) {
    return effectiveBaseUrl
  }

  const hostname = normalizeString(parsed.hostname).toLowerCase()
  if (hostname === 'localhost') {
    throw buildProviderBaseUrlError(
      'api.ai.base_url_private_host_forbidden',
      { providerType, baseUrl: effectiveBaseUrl, host: hostname },
      'AI provider Base URL must not target localhost or a private network in production'
    )
  }

  if (isBlockedNetworkAddress(hostname)) {
    throw buildProviderBaseUrlError(
      'api.ai.base_url_private_host_forbidden',
      { providerType, baseUrl: effectiveBaseUrl, host: hostname },
      'AI provider Base URL must not target localhost or a private network in production'
    )
  }

  try {
    const resolvedAddresses = await resolveHostnameAddresses(hostname, lookupFn)
    if (resolvedAddresses.some((entry) => isBlockedNetworkAddress(entry))) {
      throw buildProviderBaseUrlError(
        'api.ai.base_url_private_host_forbidden',
        { providerType, baseUrl: effectiveBaseUrl, host: hostname, resolvedAddresses },
        'AI provider Base URL must not target localhost or a private network in production'
      )
    }
  } catch (error) {
    if (error?.data?.error_code === 'api.ai.base_url_private_host_forbidden') {
      throw error
    }

    throw buildProviderBaseUrlError(
      'api.ai.base_url_dns_lookup_failed',
      {
        providerType,
        baseUrl: effectiveBaseUrl,
        host: hostname,
        detail: error?.message || 'lookup failed'
      },
      'AI provider Base URL host could not be resolved in production'
    )
  }

  return effectiveBaseUrl
}

export function resolveProviderBaseUrl(providerType, baseUrl = null) {
  const metadata = getProviderMetadata(providerType)
  const normalizedBaseUrl = normalizeProviderBaseUrl(baseUrl)
  if (normalizedBaseUrl) return normalizedBaseUrl
  return metadata?.defaultBaseUrl || null
}
