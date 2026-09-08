# Backend lifecycle and local capacity verification

## Supported deployment topology

Run exactly **one backend process per shared application state**. This includes
PostgreSQL, object storage, and the application's LiveKit rooms. Redis currently
coordinates rate limiting; it does not make Socket.IO rooms, presence maps or
meeting AI jobs distributed. Reminder row locks do not change this restriction.

Use a stop-before-start rollout: stop the old backend completely, then start the
new backend and wait for readiness. Disable overlapping/rolling replacement in
Dokploy, Coolify and other orchestrators. A replica count of one alone does not
prevent an old and a replacement container from overlapping. Schedule a short
maintenance window; zero-downtime backend replacement is not supported.

Startup resets online/away users to offline and deletes the shared
`voice_participants` rows. Existing browser sockets must reconnect. A LiveKit room
or egress process may outlive the API process, but this does not constitute
supported seamless media/session recovery. Media capacity needs separate testing.

## Readiness, background work and shutdown

`GET /health/ready` returns `{ "status": "ready" }` with HTTP 200 only after
migrations, startup cleanup, service/socket setup and HTTP listen have completed.
Other lifecycle states (`starting`, `stopping`, `stopped`) return HTTP 503. The
endpoint describes lifecycle readiness, not continuous dependency health.

Initial reminder and meeting AI processing starts asynchronously after readiness.
The same scheduler owns initial and recurring work. Each task waits until its
previous invocation finishes before scheduling the next delay:

| Task | Delay after completion | Initial run |
| --- | --- | --- |
| Status expiry, auto-away, idle meetings, overdue scheduled meetings | 60 seconds | After first delay |
| Guest expiry | 300 seconds | After first delay |
| Transcription followed by summaries | 15 seconds | Immediately |
| Message reminders | 30 seconds | Immediately |

The existing platform update manager retains its scheduler and lease logic;
shutdown now waits for active checks. Detached recording starts and asynchronous
channel-login work are registered with the runtime. Webhook work is tracked as
part of its HTTP request. Presence disconnect timers have an explicit owner.

`SIGTERM` and `SIGINT` initiate a single shutdown with a shared **60-second**
deadline. New external work is rejected, readiness is withdrawn, periodic
scheduling and presence disconnect scheduling stop, and Socket.IO closes the
manually owned HTTP server. HTTP middleware and external service hooks track work
until its promise settles, even when a client has already disconnected. Admitted
work may finish its registered descendants. Jobs and presence writes finish
before the notification queue drains. Service teardown then runs, followed by
S3 clients, Redis/rate limiting and finally PostgreSQL.

Successful shutdown exits with 0. Setup/cleanup failure or deadline expiry exits
with 1. On deadline expiry the process exits without first closing the pool under
running writers. PostgreSQL rolls back incomplete reminder transactions. A new
process can retry eligible reminder and meeting AI work. Already committed
notifications remain available in-app; push/socket output has no durable outbox
and can be lost on process termination. AI requests can be repeated after an
interruption, including possible repeated provider charges.

The backend image starts Node directly. Shipped backend Compose definitions allow
**75 seconds** before the container runtime kills it. Keep the same allowance in
external orchestrators. In-process runtime instances cannot restart after stop;
construct a new instance for another lifecycle.

## Reproduce the isolated verification

From the repository root, with Docker Desktop/Linux containers, Docker Compose,
Node and npm available:

```sh
npm run test:backend:lifecycle
npm run benchmark:runtime
```

Both commands have `:rtk` variants. CI and containers need no RTK installation.
The lifecycle command builds the actual backend image, runs lifecycle and Linux
signal/deadline tests plus PostgreSQL integration, stops an actual backend with an
open socket, checks its exit code and restarts it. Recovery tests interrupt real
worker processes using isolated PostgreSQL databases and verify retry in a fresh
process. Their AI boundary is synthetic, not a provider/media test.

Each invocation creates a unique `nebulynk-ap05-*` Compose project with its own
PostgreSQL 17, Redis and Garage, isolated credentials and no developer `.env`.
The runner accepts no external target URL. Cleanup removes only that project's
containers, network and volumes. Reports remain under `output/ap05/<project>/`.
An infrastructure/test failure exits nonzero; read the command output and retained
container logs. `--quick` is a generator diagnostic, **not** a baseline run.

The fixture has 1,000 load users, ten private channels of 100 users each and
100,000 historical messages. The existing meeting-history fixture adds another
1,001 users, 1,000 ended meetings, three source channels and 1,000 meeting messages.
IDs are CUID2; fixture shape and message contents are repeatable.

Stages use 100, 500 and 1,000 authenticated socket clients. Login is limited to
ten starts per second (batches of at most ten). Each stage has 60 seconds warm-up
and five minutes measurement. Users read a timeline every 15 seconds; 10% send a
message every ten seconds; 10% reconnect and refresh their session every minute.
Connected channel members check event delivery. The login IP limit is raised to
10,000 only in this stack because all clients share the generator's IP.

Stage limits: login p95 <= 2 seconds; timeline, send and event p95 <= 1 second;
unexpected operation errors < 1%; no missing events after ten seconds or missing/
duplicate persisted messages. A failed stage prevents starting the next stage.
A completed measurement can report a failed capacity target; this is not a green
capacity certification. Missing samples cannot pass. The separate meeting-history
benchmark retains its own 100-request concurrency and 10/60-second warm-up/run.

Inspect `REPORT.md`, `runtime-results.json` (including samples), `telemetry.json`,
Docker allocation/container metadata and the separate meeting-history report.
Telemetry records CPU/RAM for the application, dependencies and generator, plus
database activity, wait events, locks and counters. No extra container resource
limits are imposed. Docker VM allocation and other local workloads affect results;
repeat on a representative isolated host before sizing production.

AI, real mail/push delivery and LiveKit media are inactive in this baseline.
`NODE_ENV=test` also disables periodic platform update checks. There is no claim
about concurrent video participants, WebRTC bandwidth, transcription throughput
or egress capacity.
