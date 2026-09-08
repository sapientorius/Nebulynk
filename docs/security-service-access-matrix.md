# Access Model

Nebulynk applies authorization on the backend for every externally reachable
operation. The exact service and route inventory is maintained privately so it
can evolve without publishing an operational attack map.

## Public Access

Only intentionally public onboarding, authentication, account-recovery, and
meeting-invitation flows may be reachable without an authenticated account.
They must be rate-limited and must not reveal account existence or private
data.

## Authenticated Access

Member and guest access is limited by account type, membership, invitation
scope, and the permissions granted by the operator. Personal data,
notifications, files, messages, meetings, and AI artifacts are accessible only
within their authorized scope.

### Message attachments

Attaching an upload to a new message requires that the upload belongs to the
sender and is still unassigned. This rule also applies to administrators.
Forwarding creates new copies owned by the sender after checking source access.

Duplicate attachment IDs are deduplicated. An unavailable attachment rejects
the entire create request with HTTP 400 and
`api.messages.attachments_unavailable`; the response does not distinguish
missing, foreign, or already assigned files. No partial message or attachment
assignment is retained. Public responses and realtime payloads contain only
authorized file metadata and omit internal storage coordinates.

Message creation, attachment assignment, search documents, mentions,
notification records, and the sender's read position commit together. Realtime
events and notification delivery start only after that commit. Push delivery
is best effort; it does not provide an exactly-once delivery guarantee.

### Message reminders

Reminder creation and changes require current access to the non-deleted
message. Only the owner can list or change their reminders. The worker checks
the current account state and the same channel/meeting-history read policy
again when processing a due reminder. Disabled or unapproved accounts and
expired guests cannot receive a new reminder notification, including admins
with disabled accounts. Missing access cancels the reminder; database failures
leave it retryable.

Each reminder's notification insert and delivered status commit in one locked
transaction. Concurrent delivery, rescheduling, and cancellation respect that
lock. A completed reminder cannot be rescheduled or cancelled; these requests
return the existing not-found error. Creating a new reminder after completion
creates a new ID. Push and socket dispatch happen after commit and remain best
effort: an interruption can lose these transient signals while the In-App
notification remains stored. There is no persistent delivery outbox.

### Past meeting content

Public and private channels and group chats store a `meeting_history_access`
policy. The supported values are:

- `all_channel_members`: current source-channel members and users who actually
  joined the meeting can read its ended-meeting content.
- `meeting_start_members`: current source-channel members must also be present
  in the membership snapshot captured when the meeting became active. Users
  who actually joined the meeting keep access independently of current source
  membership.
- `active_participants`: only participants with a recorded `joined_at` value
  can read the content.

Direct-message meetings keep their participant-based access model. Scheduled
and active meetings keep their invitation and join rules. Platform
administrators retain administrative access.

The platform setting `default_meeting_history_access` is copied when a channel
or group is created; changing it does not alter existing channels. A channel's
own policy change applies immediately and retroactively to all of its ended
meetings.

Meeting details return `content_access.allowed` and
`content_access.denial_reason`. A current source-channel member who may see the
meeting card but not its content receives only the meeting title, source,
status, and timestamps. Descriptions, participants, counts, chat identifiers,
recording state, summaries, files, messages, pins, reactions, meeting
questions, and search content remain protected. Policy-derived read access
does not grant write access to an ended meeting channel.

## Administrative Access

Administrative operations require explicitly granted elevated permissions.
Sensitive configuration, provider credentials, and system-wide management data
remain administrator-only and are never returned to ordinary clients.

Report suspected authorization issues privately through the channels in
[SECURITY.md](../SECURITY.md).
