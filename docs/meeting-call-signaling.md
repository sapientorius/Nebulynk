# Calling before a meeting starts

Spontaneous calls in direct and group chats ring for 30 seconds before a meeting
exists. The first recipient to accept creates the normal meeting, including its
chat, access snapshot and source-chat card. Recording and AI processing continue
to follow the existing meeting settings after participants join. An audio
connection failure after acceptance does not undo the meeting.

Personal Notes chats start immediately. A Notes chat is the caller's own `dm`
named `notes`, with that user as its only member. Ordinary channels and scheduled
meetings retain their existing behavior. If a meeting is already active, callers
join it instead of creating another attempt.

## Signaling service

The authenticated `meeting-calls` service exposes `find`, `get`, `create` and
`patch`. Creation accepts `source_channel_id` and optional `title`. Patch accepts
`action: accept | decline | cancel`. Only the caller can cancel; only invited,
current chat members can accept or decline. The service rechecks membership when
handling an action. Public spontaneous creation through `meetings` is rejected
for direct/group chats other than Notes, so clients must use signaling first.

An attempt has `ringing`, `accepted`, `declined`, `cancelled` or `expired` status,
an absolute `expires_at`, and an optional `meeting_id`. Each recipient has its own
response. Responses expose only the current user's recipient state, alongside
the caller and source-chat display names. `created_new` on create and
`accepted_now` on accept grant the requesting browser automatic entry; replayed
requests and other devices only recover the state and offer explicit entry.

The `changed` event is scoped to current members who are involved in the attempt.
Clients fetch its ID to reconcile authoritative state. `find` recovers ringing
attempts and calls associated with active meetings. Expired notifications open
the source chat; they never initiate a fresh call.

Incoming call notifications also fetch the attempt as a recovery path when its
signaling event was missed. Opening a chat refreshes pending calls. The global
overlay and a banner above the source chat messages share acceptance, decline
and cancellation actions, including their pending state. The existing incoming
ringtone plays immediately and every four seconds until the invitation ends.
Clicking a call notification opens the source chat for explicit acceptance;
it never joins a meeting automatically.

Call-linked chat messages also reconcile the attempt. While an attempt is still
ringing locally, clients fetch its status every two seconds, with at most one
recovery request per attempt in flight. This continues past the local countdown
until the server confirms its outcome, so a missed acceptance event cannot strand
the caller. Only the browser that started the attempt automatically joins the
active meeting; recovered attempts on other tabs or devices still require entry.

## Transactions and history

All attempt mutations lock the source channel before locking the attempt. A
partial unique index permits only one ringing attempt per source. Meeting
creation uses the caller's identity and the same database connection and
transaction as acceptance. Network operations and realtime events run after
commit. The first successful recipient transition grants automatic entry once,
including when two devices accept simultaneously.

Remaining group recipients keep the original deadline after the first acceptance.
Their timeout or decline does not end the meeting. A runtime task expires attempts
every second and immediately on startup; acceptance also checks the deadline
inside its transaction, independently of the task and browser timers.

Unsuccessful attempts create one source-chat message linked by `call_id`, with
`call_outcome` indicating expiry, cancellation or collective decline. A unique
constraint prevents duplicate history entries. The row is indexed for chat
search in the same transaction. The UI localizes its label and provides a retry
action. Individual group declines are not displayed in chat. Successful attempts
have only the regular meeting card, not a second call-history card.

Migration `072_meeting_calls.js` is additive and preserves existing meetings.
Deploy backend and frontend together and run the standard migrations before
starting the updated application. No recording or AI settings require changes.

## Verification

PostgreSQL integration tests cover deduplication, acceptance races, rollback,
deadline enforcement, recovery, membership and the direct-start exceptions.
Store tests cover device ownership, stale responses, logout and group deadlines.
Browser tests exercise cancel, decline, timeout, reload, acceptance in two browser
contexts and immediate Notes meetings. The browser suite uses the existing fake
LiveKit adapter; it verifies application/media wiring, not delivery through a
production LiveKit server.
