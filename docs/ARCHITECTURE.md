# Architecture Overview

Nebulynk is a web-first, self-hosted application with a separate frontend,
backend, and supporting data services.

## Components

- A Vue-based browser and PWA frontend.
- A realtime backend API that applies authentication, authorization, and data
  validation at the server boundary.
- PostgreSQL for application data, Redis for transient coordination and rate
  limiting, and S3-compatible storage for media.
- LiveKit for voice and meeting media when those features are enabled.
- An optional Windows push-to-talk helper that pairs only with an explicitly
  trusted browser or PWA origin.

## Design Principles

- Server-side permission checks scope data to the appropriate user,
  membership, or administrator role.
- Browser clients use authenticated sessions and communicate with the backend
  over HTTPS and secure realtime transports in production.
- Storage and external-provider credentials stay on the backend; clients
  receive only the data required for their authorized operation.
- Deployment-specific origins, secrets, and network topology are supplied by
  the operator rather than embedded in the application.

## Development

Project conventions and verification expectations are documented in
[Engineering Playbook](engineering-playbook.md). Operators should use
[Secure Self-Hosting](security-hardening.md) for production preparation.

## Meeting and client boundaries (AP-04)

`frontend/src/lib/api-client.js` composes a client from `api-client/transport.js`,
`session.js`, and the platform, authentication and administration endpoint groups.
The transport owns Axios, URL resolution, headers, FormData and interceptors. The
session owns tokens, CSRF, refresh coalescing, proactive timers and auth listeners.
The factory supplies session callbacks to the transport; there is no circular
module import. Mutable authentication state belongs to each client. Only the
platform cache is shared, keyed by normalized base URL. `api.js` remains the active
client facade, including SMTP delegation and desktop workspace switching.

`MeetingView` owns route identity, loading/errors, navigation, the mobile observer
and context cleanup. It composes `MeetingManagementActions`, `MeetingLiveSurface`,
`MeetingHistorySurface` and `MeetingInviteDialog`. The history surface lays out
its header and live slots alongside historical chat and artifacts; it owns the
short-viewport listener, evidence navigation, questions and summary sharing.
The live surface owns video focus, local video menus and share presentation.
Management and invitation components own their respective forms. Context travels
through props, with named events for navigation and cross-surface actions.

Meeting data stays in Pinia. Screenshare visibility, maximization and overlay
state stay in the UI store because the dedicated screenshare route shares that
state. Meeting activation generations invalidate stale requests on a meeting
switch, clear or reset, including the subsequent channel selection. Keyed
surfaces and evidence generations prevent an old evidence response from choosing
the new meeting's tab. Invitation and scheduling dialogs own and invalidate their
search timers and response generations on close and unmount.

`ChannelHeader` keeps its menus and panel events. Settings/archive, group
name/topic, scheduling and summary requests belong to components in
`components/channels`. Summary range values stay in the header and are passed
with `v-model`, preserving them across desktop/mobile menu remounts. The persistent
`ChannelLeaveAction` owns the leave request until navigation completes, even when
its trigger menu closes. Save actions recheck current permissions.
Settings security forms belong to `PasswordSettings`, `TwoFactorSettings` and
`PasskeySettings`; they remain mounted across tab switches to preserve form state
and the previous loading order.

Each meetings store creates its own `meeting-call-runtime`; reset and scope
disposal stop ringing and invitation timers. A runtime generation also prevents
pending invitation loads from restarting ringing after disposal. The voice store
retains connection/retry/microphone ownership and delegates LiveKit event binding
to `voice-livekit-callbacks.js`, passing explicit state actions.

## Backend meeting extraction and transaction order

Direct and group chat calls use a separate, server-timed signaling phase before
meeting creation. See [Calling before a meeting starts](meeting-call-signaling.md)
for the API, transaction boundaries, Notes exception and recovery behavior.

`MeetingsService` composes the meeting domain's join, creation, invitation,
metadata, completion and artifact application cases with the read/access services,
repository and integration adapters. It retains Feathers registration,
authentication, schema validation and `patch` dispatch. Only `find`, `get`,
`create` and `patch` are externally registered. Existing internal method delegates
preserve the service's test and extension seams without moving domain ownership
back into the transport layer. See the [project review summary](PROJECT_REVIEW_SUMMARY.md)
for verification.

Application cases own transactions and pass `trx` explicitly to repository
operations. Repositories do not start nested transactions. Creation retains the
source-channel lock and `repeatable read`; join retains `repeatable read` and
writes participant state, private membership and start-member snapshots together.
The extracted join supports injected time and ID generation.

Join commits before voice creation/patching and emits `joined` only after voice
processing succeeds. A voice failure therefore preserves the committed join and
does not emit `joined`. End commits meeting/channel archive state, participant
state, recording pauses and artifact queue changes atomically. Recording stop,
voice-row cleanup and room cleanup follow that commit; room-cleanup failures are
logged. The channel update precedes `ended`, followed by artifact-queue events.
Pre-transaction authorization/metadata reads remain outside the transaction, and
post-commit external failures have no compensating transaction. These are
preserved boundaries, not new delivery guarantees. Service lifecycle work stays
with AP-05.

## Backend lifecycle and instance count

Run exactly one backend instance per shared application state. Stop the previous
backend completely before starting its replacement; overlapping/rolling backend
deployments are unsupported even with a desired replica count of one. Configure
the orchestrator accordingly and allow a maintenance window.

The backend handles SIGTERM/SIGINT with a 60-second shutdown budget; container
stop grace is 75 seconds. Wait for `GET /health/ready` to return HTTP 200 before
routing traffic. Startup clears shared voice participants and stale presence;
existing LiveKit media does not imply seamless API-session recovery.

See [runtime operations and isolated capacity verification](runtime-operations.md)
for lifecycle ownership, recovery limits, exact rollout steps and reproducible
local Docker tests. Redis rate limiting does not enable multiple API instances.
