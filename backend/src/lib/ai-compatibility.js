import { createHash } from 'node:crypto'
import { decryptSecret } from './ai-secrets.js'
import { badRequest } from './errors.js'
import {
  AI_REQUEST_PROFILE_VERSION,
  createAiRequestProfile,
  generateImage,
  generateStructuredObject,
  transcribeAudio
} from './ai-provider-adapters.js'

const PROBE_TIMEOUT_MS = 120_000

export function compatibilityFingerprint({ providerInstance, functionKey, model, secretUpdatedAt }) {
  return createHash('sha256').update(JSON.stringify({
    version: AI_REQUEST_PROFILE_VERSION,
    providerId: providerInstance.id,
    providerType: providerInstance.provider_type,
    baseUrl: providerInstance.base_url || null,
    functionKey,
    model,
    secretUpdatedAt: secretUpdatedAt || null
  })).digest('hex')
}

export function verificationStatus(row, providerInstance, secretUpdatedAt) {
  let profile = row?.request_profile
  if (typeof profile === 'string') {
    try { profile = JSON.parse(profile) } catch { profile = null }
  }
  return row?.verification_fingerprint && row?.verified_at && profile?.version === AI_REQUEST_PROFILE_VERSION
    && providerInstance && row.verification_fingerprint === compatibilityFingerprint({
      providerInstance, functionKey: row.function_key, model: row.model, secretUpdatedAt
    })
    ? 'verified'
    : 'unverified'
}

function syntheticWav() {
  const sampleRate = 16000
  const samples = sampleRate * 2
  const pcmBytes = samples * 2
  const wav = Buffer.alloc(44 + pcmBytes)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + pcmBytes, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(pcmBytes, 40)
  for (let i = 0; i < samples; i += 1) {
    const envelope = Math.sin(Math.PI * i / samples)
    wav.writeInt16LE(Math.round(3000 * envelope * Math.sin(2 * Math.PI * 440 * i / sampleRate)), 44 + i * 2)
  }
  return wav
}

function verificationReason(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'Zeitlimit des Anbieters erreicht'
  if (error?.status === 401 || error?.status === 403) return 'API-Zugriff verweigert; Schluessel oder Modellzugriff pruefen'
  if (error?.status === 429) return 'Anbieter-Kontingent oder Rate-Limit erreicht'
  if (error?.providerParam) return `Parameter ${error.providerParam} wird vom Modell nicht akzeptiert`
  if (error?.status) return `Anbieter lehnt die Testanfrage ab (HTTP ${error.status})`
  if (error instanceof SyntaxError || /response|payload|JSON|object/i.test(error?.message || '')) {
    return 'Antwortformat des Modells ist fuer diese Funktion ungeeignet'
  }
  return 'Anbieter nicht erreichbar oder Testanfrage fehlgeschlagen'
}

export async function verifyAiFunctionConfiguration({
  db,
  app,
  providerInstance,
  functionKey,
  model,
  apiKey: suppliedApiKey = null,
  secretUpdatedAt: suppliedSecretUpdatedAt = null,
  fetchFn = app?.get('aiCompatibilityFetch') || globalThis.fetch,
  env = process.env,
  lookupFn
}) {
  const secretRow = suppliedApiKey ? null : await db('ai_provider_secrets')
    .where('provider_instance_id', providerInstance.id)
    .first()
  if (!suppliedApiKey && !secretRow) {
    throw badRequest('api.ai.provider_secret_not_found', { providerInstanceId: providerInstance.id }, 'API-Schluessel des Providers fehlt')
  }
  const apiKey = suppliedApiKey || decryptSecret(app, secretRow.encrypted_secret)
  const requestProfile = createAiRequestProfile()
  const common = {
    providerType: providerInstance.provider_type,
    apiKey,
    baseUrl: providerInstance.base_url,
    model,
    functionKey,
    requestProfile,
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    fetchFn,
    env,
    lookupFn
  }

  try {
    if (functionKey === 'transcription') {
      await transcribeAudio({ ...common, file: { buffer: syntheticWav(), mime: 'audio/wav' }, language: 'de', contextBias: 'Nebulynk' })
    } else if (functionKey === 'image_generation') {
      await generateImage({ ...common, prompt: 'A plain blue circle on a white background.' })
    } else if (functionKey === 'meeting_summary' || functionKey === 'chat_summary') {
      await generateStructuredObject({
        ...common,
        capability: 'meeting_summary',
        systemPrompt: 'Return a valid JSON object only.',
        userPrompt: 'Return {"ok":true} as JSON for this configuration test.'
      })
    } else {
      throw new Error('Unknown AI function')
    }
  } catch (error) {
    const reason = verificationReason(error)
    throw badRequest('api.ai.model_verification_failed', {
      functionKey,
      providerType: providerInstance.provider_type,
      model,
      reason,
      providerCode: error?.providerCode || null,
      providerParam: error?.providerParam || null
    }, `Modellpruefung fehlgeschlagen: ${reason}`)
  }

  return {
    request_profile: requestProfile,
    verified_at: new Date().toISOString(),
    verification_fingerprint: compatibilityFingerprint({
      providerInstance,
      functionKey,
      model,
      secretUpdatedAt: suppliedSecretUpdatedAt || secretRow?.updated_at
    }),
    verification_error: null
  }
}
