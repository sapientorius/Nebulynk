# Calling before a meeting starts

Spontaneous calls in direct and group chats ring for 60 seconds before a meeting
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
signaling event was missed, including notifications already loaded over HTTP.
Call discovery belongs to the authenticated session, independently of the open
chat or settings view. Throughout the signed-in session, a five-second refresh
discovers unknown attempts even if both initial realtime events were lost.
This refresh also runs in unfocused, hidden and minimized windows; it does not
pause on document visibility changes.
Returning to the tab and authenticating/reconnecting the socket trigger an
immediate refresh. Concurrent list requests share one request; logout removes
the discovery timer and visibility listener and invalidates pending responses.
Opening a chat also refreshes pending calls. The global
overlay and a banner above the source chat messages share acceptance, decline
and cancellation actions, including their pending state. The existing incoming
ringtone plays immediately and every four seconds until the invitation ends.
Normal pointer or keyboard interaction resumes the shared AudioContext early.
Before ringing, a suspended context is resumed again where allowed, and the
invitation and session are rechecked after that asynchronous operation. Audio
errors cannot suppress the overlay, and completed invitations cannot ring late.
Chrome may require previous user interaction under its
[Web Audio autoplay policy](https://developer.chrome.com/blog/web-audio-autoplay).
No autoplay flags, continuous audio or browser-setting changes are required.
Browser throttling can delay background timers; frozen or discarded tabs have
no guaranteed delivery deadline.
Clicking a call notification opens the source chat for explicit acceptance;
it never joins a meeting automatically.

Call-linked chat messages also reconcile the attempt. While an attempt is still
ringing locally, clients fetch its status every two seconds, with at most one
recovery request per attempt in flight. This continues past the local countdown
until the server confirms its outcome, so a missed acceptance event cannot strand
the caller. Only the browser that started the attempt automatically joins the
active meeting; recovered attempts on other tabs or devices still require entry.

## Ending and reconciling meetings

After the database commits the ended status and archived meeting channel, the
server emits `meetings ended` before awaiting recording and LiveKit cleanup.
Recording cleanup failures are logged and do not suppress the end event or skip
the remaining cleanup. The payload includes `sourceChannelId` as well as
`meetingId` and `chatChannelId`. Delivery uses personal socket channels for the
current members of either chat, resolved from database memberships rather than
the event's supplied channel IDs. This updates source-chat cards outside the
meeting view without broadcasting to unrelated users.

HTTP results, end events and authoritative recovery share terminal-state cleanup.
The client immediately marks the meeting ended, removes invitations and clears
the matching voice channel, participants and media state. Older list, detail or
join responses cannot turn a known ended meeting active or reconnect it.
Completing a pending join also respects navigation away from the meeting and
does not reopen an ended meeting after media setup finishes.
LiveKit disconnect callbacks carry the reason and affected room. Room deletion
clears the owned connection and reloads its meeting status; temporary network
disconnects preserve the existing reconnection behavior. Delayed callbacks and
teardown completions cannot clear a newer connection.

The global five-second timer also checks the connected meeting, even outside its
view. If an accepted call disappears from discovery, its linked meeting is
reloaded before the call is discarded; failed reads are retried. Opening a chat
rechecks cached active meeting cards. Ended cards offer no join action, while the
meeting view can remain open to display its ended state.

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

Regression coverage also leaves recipients idle in an unrelated channel and in
settings, verifies immediate realtime delivery and discovery after dropped call
events, and checks that ringtone failures cannot interrupt overlay updates.
Headed browser regressions additionally cover unfocused and minimized windows
and a genuinely hidden tab with normal autoplay/background policies, prior
keyboard login interaction and lost
discovery hints. The window-focus spec requires a graphical session (use
`xvfb-run` on Linux); it is explicitly skipped on Linux without `DISPLAY`.
The hidden-tab case launches a separate temporary Chromium profile and attaches
with `noDefaults`, avoiding Playwright's focus/visibility override. No autoplay
exemption or background-throttling bypass is supplied to that browser.
Two-participant tests verify automatic connection/card cleanup both with normal
delivery and with lost end events. Unit tests cover delayed
audio activation, failed recording cleanup, room deletion, stale HTTP responses
and disconnects from a previous connection. LiveKit adapter tests simulate SDK
events; they do not replace a production media-server end-to-end check.
