# Editing meeting summaries

After a meeting ends and its summary is ready, the meeting creator and
administrators can select **Edit with AI**. Describe corrections or supply
missing context, then create a preview. The microphone inserts dictated text
into the same editable input; it does not submit instructions automatically.
Dictation requires configured transcription AI. Text editing uses the existing
manual meeting-summary AI configuration, including when automatic summaries
are disabled.

Further instructions refine the private preview. **Apply** saves the final
proposal; **Discard** leaves the current summary unchanged. If another editor
changes the summary in the meantime, create a fresh preview instead of
overwriting that change. Summaries and their change descriptions retain the
original summary language.

**Publish change in history** is selected by default for each editing session.
Published entries show the editor, time and a short AI description below the
summary, visible to everyone with access to the meeting content. Deselecting
the option saves the correction without a visible history entry. Earlier
summary versions and private instructions are not exposed through this history.

Administrators can still regenerate a summary from transcript and chat. The
confirmation warns that corrections may be lost and offers the same history
publication option. Failed regeneration restores the previous summary.

This feature requires migration `075_meeting_summary_revisions.js`, which runs
with the backend's normal startup migrations. Existing summaries start at
version 0. No additional AI configuration is required beyond the existing
manual summary configuration and, for dictation, active transcription.

## Summary completion notifications

When the first summary becomes ready, everyone who actually joined the meeting
receives one `meeting_summary_ready` notification, including the host and people
who left early. Invitations without attendance do not qualify. Automatic and
manual generation, including a successful retry, use the same behavior. Later
regeneration and editing do not send another completion notification.

The notification center retains the entry even for muted channels. Browser push
and desktop delivery use the existing notification settings, permissions,
foreground suppression and Do Not Disturb status. Notifications contain the
meeting title and a completion notice, without summary contents. Opening one
selects the summary tab. Viewing the ready summary in a visible window also
marks its completion notification read; other meeting tabs and invitations
remain separate.

Migration `076_meeting_summary_notifications.js` stores an internal completion
marker with the summary. Existing completed summaries, including those being
regenerated, do not send historical notifications. Summary completion and
notification rows commit atomically; socket and push delivery run after commit
without a persistent delivery queue. Delivery failures leave the notification
available in the notification center.

## API

All requests require authentication and use existing meeting-content access
rules. Only the creator or an administrator may generate and apply proposals;
a private proposal belongs to the user who created it.

- `POST /meeting-summary-revisions`: `{ meeting_id, instructions,
  parent_revision_id? }`. Instructions must contain 1–10,000 characters.
  Returns `{ id, meeting_id, payload, change_summary }`. A parent proposal must
  belong to the same editor and meeting and use the current saved version.
- `PATCH /meeting-summary-revisions/:id`: `{ action: "apply",
  publish_change?: true }`. Returns `{ id, meeting_id, applied: true }`.
  Repeating a successful apply does not create another history entry.
- `GET /meeting-summary-revisions?meeting_id=…&$limit=10&$skip=0` returns
  `{ data, total, limit, skip }`, newest first, with at most 100 entries per page.
  Each entry contains `id`, `user_id`, `user_display_name`, `change_summary`
  and `applied_at`. Counts exclude private and suppressed revisions.
- `POST /voice-drafts/transcribe` accepts multipart `meeting_id`, `file`, and
  optional `duration_ms`. Supply either `meeting_id` or the existing
  `channel_id`. Meeting dictation does not require chat write permission.
- Existing `PATCH /meetings/:id` with `action: "generate_summary"` additionally
  accepts `publish_change` and `confirm_replace`. Confirmation is required
  after a correction has been applied, including unpublished corrections.

Stale proposals fail with HTTP 409 and `api.summary_revisions.stale`. Access
is checked again after AI generation and before apply. Proposals never replace
the current summary during preview creation. Internal proposals and snapshots
are retained until the meeting is deleted.
