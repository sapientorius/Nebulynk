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
