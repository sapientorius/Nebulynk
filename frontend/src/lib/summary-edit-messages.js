export const summaryEditMessages = {
  en: { summaryEdit: {
    edit: 'Edit with AI', title: 'Revise meeting summary',
    help: 'Describe corrections or provide missing context. Review the AI preview before applying it.',
    placeholder: 'What should change? You can also dictate your instructions.',
    preview: 'Create preview', apply: 'Apply', discard: 'Discard',
    publish: 'Publish change in history', history: 'Change history',
    emptyHistory: 'No published changes yet.', historyFailed: 'Could not load change history.', retry: 'Retry',
    failed: 'The revision failed. Your saved summary has not changed.',
    regenerateTitle: 'Regenerate summary',
    regenerateWarning: 'Regenerating replaces the current summary using transcript and chat. Any corrections may be lost.',
    regenerateConfirm: 'Replace summary'
  } },
  de: { summaryEdit: {
    edit: 'Mit KI bearbeiten', title: 'Meeting-Zusammenfassung überarbeiten',
    help: 'Beschreibe Korrekturen oder ergänze fehlenden Kontext. Prüfe die KI-Vorschau vor dem Übernehmen.',
    placeholder: 'Was soll geändert werden? Du kannst deine Anweisungen auch diktieren.',
    preview: 'Vorschau erstellen', apply: 'Übernehmen', discard: 'Verwerfen',
    publish: 'Änderung im Verlauf veröffentlichen', history: 'Änderungsverlauf',
    emptyHistory: 'Noch keine veröffentlichten Änderungen.', historyFailed: 'Der Änderungsverlauf konnte nicht geladen werden.', retry: 'Erneut versuchen',
    failed: 'Die Überarbeitung ist fehlgeschlagen. Die gespeicherte Zusammenfassung wurde nicht geändert.',
    regenerateTitle: 'Zusammenfassung neu erstellen',
    regenerateWarning: 'Die Neuerstellung ersetzt die aktuelle Zusammenfassung aus Transkript und Chat. Bisherige Korrekturen können verloren gehen.',
    regenerateConfirm: 'Zusammenfassung ersetzen'
  } }
}

export const summaryEditApi = {
  en: { summary_revisions: {
    forbidden: 'Only the meeting creator or an administrator may revise this summary.',
    not_ready: 'A completed meeting with a ready summary is required.',
    meeting_id_required: 'A meeting ID is required.',
    instructions_required: 'Enter instructions of at most 10,000 characters.',
    draft_not_found: 'This private preview is unavailable.',
    stale: 'The summary has changed. Create a new preview using the latest summary.',
    unavailable: 'Meeting summary AI is not configured.',
    invalid_action: 'Invalid summary revision action.',
    confirm_replace: 'Confirm replacing the summary and its corrections before regenerating.'
  } },
  de: { summary_revisions: {
    forbidden: 'Nur der Meeting-Ersteller oder ein Admin darf diese Zusammenfassung überarbeiten.',
    not_ready: 'Ein beendetes Meeting mit einer fertigen Zusammenfassung ist erforderlich.',
    meeting_id_required: 'Eine Meeting-ID ist erforderlich.',
    instructions_required: 'Gib Anweisungen mit höchstens 10.000 Zeichen ein.',
    draft_not_found: 'Diese private Vorschau ist nicht verfügbar.',
    stale: 'Die Zusammenfassung wurde inzwischen geändert. Erstelle eine neue Vorschau auf Basis der aktuellen Zusammenfassung.',
    unavailable: 'Die KI für Meeting-Zusammenfassungen ist nicht konfiguriert.',
    invalid_action: 'Ungültige Aktion für die Überarbeitung.',
    confirm_replace: 'Bestätige vor der Neuerstellung das Ersetzen der Zusammenfassung und ihrer Korrekturen.'
  } }
}
