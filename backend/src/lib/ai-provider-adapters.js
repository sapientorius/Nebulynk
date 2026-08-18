import {
  assertProviderBaseUrlAllowed,
  providerSupportsCapability
} from './ai-config.js'
import { badRequest } from './errors.js'

function isWhisperLikeModel(modelId) {
  return /whisper/i.test(modelId)
}

function isGpt4oTranscriptionModel(modelId) {
  const normalized = String(modelId || '').trim().toLowerCase()
  return normalized === 'gpt-4o-transcribe' || normalized === 'gpt-4o-mini-transcribe'
}

function isOpenAiTranscriptionModel(modelId) {
  return isWhisperLikeModel(modelId) || isGpt4oTranscriptionModel(modelId)
}

function modelSupportsTimestampGranularities(providerType, modelId) {
  if (providerType === 'mistral') {
    return isMistralTranscriptModel(modelId)
  }

  if (providerType === 'openai' || providerType === 'openai_compatible') {
    return isWhisperLikeModel(modelId)
  }

  return false
}

function isMistralTranscriptModel(modelId) {
  return /^voxtral-mini/i.test(modelId)
}

function isLikelyTextModel(modelId) {
  return !/(embedding|moderation|tts|speech[-_]?to[-_]?text|transcri|whisper|rerank|image|vision-preview|voxtral)/i.test(modelId)
}

function isOpenAiImageModel(modelId) {
  return /^(gpt-image-|dall-e-)/i.test(String(modelId || '').trim())
}

function modelHasOutputModality(entry, modality) {
  const outputModalities = entry?.architecture?.output_modalities || entry?.output_modalities
  return Array.isArray(outputModalities) && outputModalities.some((value) => (
    String(value || '').trim().toLowerCase() === modality
  ))
}

function normalizeModelEntry(providerType, entry) {
  const id = String(
    entry?.id
      || entry?.name
      || entry?.model
      || entry?.slug
      || ''
  ).trim()

  if (!id) return null

  const capabilities = new Set()
  let supportsTimestamps = false
  let supportsSpeakerMerge = false
  let supportsContextBias = false

  if ((providerType === 'openai' || providerType === 'openai_compatible') && isOpenAiTranscriptionModel(id)) {
    capabilities.add('transcription')
    supportsTimestamps = modelSupportsTimestampGranularities(providerType, id)
    supportsSpeakerMerge = supportsTimestamps
  }

  if (providerType === 'mistral' && isMistralTranscriptModel(id)) {
    capabilities.add('transcription')
    supportsTimestamps = true
    supportsSpeakerMerge = true
    supportsContextBias = true
  }

  if (providerType === 'openrouter' && modelHasOutputModality(entry, 'transcription')) {
    capabilities.add('transcription')
  }

  if (isLikelyTextModel(id)) {
    capabilities.add('meeting_summary')
  }

  if (providerType === 'openai' && isOpenAiImageModel(id)) {
    capabilities.add('image_generation')
  }

  return {
    id,
    label: String(entry?.name || entry?.display_name || entry?.id || id).trim(),
    provider_type: providerType,
    capabilities: [...capabilities],
    owned_by: entry?.owned_by || entry?.architecture?.modality || null,
    supports_timestamps: supportsTimestamps,
    supports_speaker_merge: supportsSpeakerMerge,
    supports_context_bias: supportsContextBias
  }
}

function filterModelsForCapability(models, capability) {
  if (capability === 'transcription') {
    return models.filter((model) => model.capabilities.includes('transcription'))
  }

  if (capability === 'meeting_summary') {
    return models.filter((model) => model.capabilities.includes('meeting_summary'))
  }

  if (capability === 'image_generation') {
    return models.filter((model) => model.capabilities.includes('image_generation'))
  }

  return models
}

async function parseJsonResponse(response) {
  if (!response.ok) {
    let detail = response.statusText
    try {
      const payload = await response.json()
      detail = payload?.error?.message || payload?.message || detail
    } catch {
      // Keep statusText fallback.
    }
    throw new Error(`${response.status} ${detail}`.trim())
  }

  return response.json()
}

function buildHeaders(providerType, apiKey) {
  if (providerType === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }
  }

  return {
    Authorization: `Bearer ${apiKey}`
  }
}

function getModelsEndpoint(baseUrl, providerType, capability) {
  if (providerType === 'openrouter' && capability === 'transcription') {
    return `${baseUrl}/models?output_modalities=transcription`
  }

  return `${baseUrl}/models`
}

function getTranscriptionEndpoint(baseUrl) {
  return `${baseUrl}/audio/transcriptions`
}

function getChatCompletionsEndpoint(baseUrl) {
  return `${baseUrl}/chat/completions`
}

function getImageGenerationsEndpoint(baseUrl) {
  return `${baseUrl}/images/generations`
}

function getAnthropicMessagesEndpoint(baseUrl) {
  return `${baseUrl}/messages`
}

function shouldRequestVerboseJson(providerType, modelId) {
  return (providerType === 'openai' || providerType === 'openai_compatible') && isWhisperLikeModel(modelId)
}

function shouldUseOpenAiServerChunking(providerType, modelId) {
  const normalized = String(modelId || '').trim().toLowerCase()
  return providerType === 'openai' && normalized === 'gpt-4o-transcribe-diarize'
}

function normalizeOptionalMetric(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeSegments(payload) {
  if (!Array.isArray(payload?.segments)) return []

  return payload.segments
    .map((segment) => ({
      start: Number(segment?.start ?? 0),
      end: Number(segment?.end ?? 0),
      text: typeof segment?.text === 'string' ? segment.text : '',
      avg_logprob: normalizeOptionalMetric(segment?.avg_logprob),
      no_speech_prob: normalizeOptionalMetric(segment?.no_speech_prob),
      compression_ratio: normalizeOptionalMetric(segment?.compression_ratio)
    }))
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end))
}

function extractJsonObject(text) {
  if (typeof text !== 'string') {
    throw new Error('Structured AI response is missing text content')
  }

  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('Structured AI response is empty')
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || trimmed
  const objectStart = candidate.indexOf('{')
  const objectEnd = candidate.lastIndexOf('}')
  const jsonText = objectStart >= 0 && objectEnd > objectStart
    ? candidate.slice(objectStart, objectEnd + 1)
    : candidate

  return JSON.parse(jsonText)
}

function extractOpenAiContent(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (typeof entry?.text === 'string') return entry.text
        if (typeof entry?.content === 'string') return entry.content
        return ''
      })
      .join('\n')
  }
  return ''
}

function extractAnthropicContent(payload) {
  const content = Array.isArray(payload?.content) ? payload.content : []
  return content
    .map((entry) => (typeof entry?.text === 'string' ? entry.text : ''))
    .join('\n')
}

export async function listProviderModels({
  providerType,
  apiKey,
  baseUrl = null,
  capability,
  fetchFn = globalThis.fetch,
  env = process.env,
  lookupFn
}) {
  if (!providerSupportsCapability(providerType, capability)) {
    throw badRequest(
      'api.ai.capability_not_supported',
      { providerType, capability },
      'Dieser Provider unterstuetzt die gewaehlte AI-Funktion nicht'
    )
  }

  if (typeof fetchFn !== 'function') {
    throw new Error('fetch is not available')
  }

  const resolvedBaseUrl = await assertProviderBaseUrlAllowed({
    providerType,
    baseUrl,
    env,
    lookupFn
  })
  const endpoint = getModelsEndpoint(resolvedBaseUrl, providerType, capability)

  const response = await fetchFn(endpoint, {
    headers: {
      ...buildHeaders(providerType, apiKey),
      Accept: 'application/json'
    }
  })

  const payload = await parseJsonResponse(response)
  const rawModels = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : []

  const normalized = rawModels
    .map((entry) => normalizeModelEntry(providerType, entry))
    .filter(Boolean)

  return filterModelsForCapability(normalized, capability)
    .sort((left, right) => left.label.localeCompare(right.label))
}

export async function transcribeAudio({
  providerType,
  apiKey,
  baseUrl = null,
  model,
  file,
  contextBias = null,
  language = null,
  fetchFn = globalThis.fetch,
  env = process.env,
  lookupFn
}) {
  if (!providerSupportsCapability(providerType, 'transcription')) {
    throw badRequest(
      'api.ai.capability_not_supported',
      { providerType, capability: 'transcription' },
      'Dieser Provider unterstuetzt keine Transkription'
    )
  }

  if (typeof fetchFn !== 'function') {
    throw new Error('fetch is not available')
  }

  const resolvedBaseUrl = await assertProviderBaseUrlAllowed({
    providerType,
    baseUrl,
    env,
    lookupFn
  })
  const endpoint = getTranscriptionEndpoint(resolvedBaseUrl)
  const mime = file?.mime || 'audio/ogg'
  const extension = mime.includes('wav')
    ? 'wav'
    : mime.includes('mpeg') || mime.includes('mp3')
      ? 'mp3'
      : mime.includes('m4a')
        ? 'm4a'
        : mime.includes('mp4')
          ? 'mp4'
          : mime.includes('webm')
            ? 'webm'
            : 'ogg'
  const blob = new Blob([file?.buffer || new Uint8Array()], { type: mime })
  const form = new FormData()

  form.append('file', blob, `meeting-recording.${extension}`)
  form.append('model', String(model || '').trim())

  if (providerType === 'mistral') {
    form.append('timestamp_granularities[]', 'segment')
    if (contextBias) {
      form.append('context_bias', contextBias)
    }
  } else {
    form.append('response_format', shouldRequestVerboseJson(providerType, model) ? 'verbose_json' : 'json')
    if (modelSupportsTimestampGranularities(providerType, model)) {
      form.append('timestamp_granularities[]', 'segment')
    }
    if (shouldUseOpenAiServerChunking(providerType, model)) {
      form.append('chunking_strategy', 'auto')
    }
    if (language) {
      form.append('language', language)
    }
  }

  const response = await fetchFn(endpoint, {
    method: 'POST',
    headers: buildHeaders(providerType, apiKey),
    body: form
  })

  const payload = await parseJsonResponse(response)
  return {
    text: typeof payload?.text === 'string' ? payload.text : '',
    language: typeof payload?.language === 'string' ? payload.language : null,
    duration_ms: payload?.duration != null ? Math.round(Number(payload.duration) * 1000) : null,
    segments: normalizeSegments(payload)
  }
}

export async function generateStructuredObject({
  providerType,
  apiKey,
  baseUrl = null,
  model,
  systemPrompt,
  userPrompt,
  capability = 'meeting_summary',
  temperature = 0,
  validateObject = null,
  fetchFn = globalThis.fetch,
  env = process.env,
  lookupFn
}) {
  if (!providerSupportsCapability(providerType, capability)) {
    throw badRequest(
      'api.ai.capability_not_supported',
      { providerType, capability },
      'Dieser Provider unterstuetzt die gewaehlte AI-Funktion nicht'
    )
  }

  if (typeof fetchFn !== 'function') {
    throw new Error('fetch is not available')
  }

  const resolvedBaseUrl = await assertProviderBaseUrlAllowed({
    providerType,
    baseUrl,
    env,
    lookupFn
  })
  const normalizedModel = String(model || '').trim()
  const normalizedSystemPrompt = String(systemPrompt || '').trim()
  const normalizedUserPrompt = String(userPrompt || '').trim()

  let payload = null
  if (providerType === 'anthropic') {
    const response = await fetchFn(getAnthropicMessagesEndpoint(resolvedBaseUrl), {
      method: 'POST',
      headers: {
        ...buildHeaders(providerType, apiKey),
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: normalizedModel,
        system: normalizedSystemPrompt,
        messages: [{
          role: 'user',
          content: normalizedUserPrompt
        }],
        max_tokens: 2048,
        temperature
      })
    })

    payload = extractJsonObject(extractAnthropicContent(await parseJsonResponse(response)))
  } else {
    const response = await fetchFn(getChatCompletionsEndpoint(resolvedBaseUrl), {
      method: 'POST',
      headers: {
        ...buildHeaders(providerType, apiKey),
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: normalizedModel,
        temperature,
        response_format: {
          type: 'json_object'
        },
        messages: [
          {
            role: 'system',
            content: normalizedSystemPrompt
          },
          {
            role: 'user',
            content: normalizedUserPrompt
          }
        ]
      })
    })

    payload = extractJsonObject(extractOpenAiContent(await parseJsonResponse(response)))
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Structured AI response is not an object')
  }

  if (typeof validateObject === 'function') {
    return validateObject(payload)
  }

  return payload
}

export async function generateImage({
  providerType,
  apiKey,
  baseUrl = null,
  model,
  prompt,
  size = '1536x1024',
  quality = 'auto',
  fetchFn = globalThis.fetch,
  env = process.env,
  lookupFn
}) {
  const capability = 'image_generation'
  if (!providerSupportsCapability(providerType, capability)) {
    throw badRequest(
      'api.ai.capability_not_supported',
      { providerType, capability },
      'Dieser Provider unterstuetzt die gewaehlte AI-Funktion nicht'
    )
  }
  if (providerType !== 'openai') {
    throw badRequest(
      'api.ai.image_generation_provider_unsupported',
      { providerType },
      'Nur OpenAI-Bildgenerierung wird aktuell unterstuetzt'
    )
  }
  if (typeof fetchFn !== 'function') throw new Error('fetch is not available')

  const resolvedBaseUrl = await assertProviderBaseUrlAllowed({ providerType, baseUrl, env, lookupFn })
  const normalizedModel = String(model || '').trim()
  const normalizedPrompt = String(prompt || '').trim()
  const response = await fetchFn(getImageGenerationsEndpoint(resolvedBaseUrl), {
    method: 'POST',
    headers: {
      ...buildHeaders(providerType, apiKey),
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: normalizedModel,
      prompt: normalizedPrompt,
      n: 1,
      size,
      quality
    })
  })
  const payload = await parseJsonResponse(response)
  const imageBase64 = payload?.data?.[0]?.b64_json
  if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
    throw new Error('Image generation returned no image payload')
  }

  return {
    buffer: Buffer.from(imageBase64, 'base64'),
    revisedPrompt: payload?.data?.[0]?.revised_prompt || null
  }
}
