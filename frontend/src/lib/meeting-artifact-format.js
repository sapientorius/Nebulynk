export function formatTranscriptTimestamp(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value || 0) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${mm}:${ss}`
  }
  return `${mm}:${ss}`
}

export function formatEvidenceLabel(evidence, translate) {
  const t = typeof translate === 'function' ? translate : (key) => key
  if (!evidence) return t('ui.views.evidence')
  if (evidence.type === 'chat') {
    const author = evidence.author_display_name || t('ui.components.unknown')
    return `${t('ui.views.chat_evidence')}: ${author}`
  }
  const speaker = evidence.speaker_label || t('ui.components.unknown')
  return `${t('ui.views.transcript_evidence')}: ${speaker} @ ${formatTranscriptTimestamp(evidence.start_ms)}`
}
