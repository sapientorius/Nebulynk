# elest.io integration reference

Use the general [Self-Hosting Compose stack](SELF_HOSTING.md) with one fixed
`NEBULYNK_VERSION=X.Y.Z`. All three application images are public GHCR images for
`linux/amd64` and `linux/arm64`; installation does not require source builds or a
registry login. Publication and anonymous-download verification are release gates.
The release supplies `container-images.json` for exact digest references.

| Service | Image | Ports / readiness | Persistence / resources |
| --- | --- | --- | --- |
| Backend | `ghcr.io/sapientorius/nebulynk-backend:X.Y.Z` | `3030/tcp`, HTTP `/health/ready` | Application data lives in PostgreSQL/Garage; exactly one API instance, 75-second stop grace |
| Frontend | `ghcr.io/sapientorius/nebulynk-frontend:X.Y.Z` | `8080/tcp`, HTTP `/healthz` | No persistent data; UID 101, writable `/tmp`; read-only root supported |
| Transcription worker | `ghcr.io/sapientorius/nebulynk-transcription-worker:X.Y.Z` | No public port; built-in Node healthcheck | One job at a time; default 1.5 GiB RAM / 1 CPU, temporary audio inside container |
| PostgreSQL | Version pinned in Compose | Internal `5432/tcp` | Persistent database volume |
| Redis | Version pinned in Compose | Internal `6379/tcp` | Redis volume; rate limiting and LiveKit coordination |
| Garage | Versioned upstream image | Public S3 `3900/tcp`; admin/RPC private | Persistent metadata and data volumes; configuration supplied by Compose |
| LiveKit | Versioned upstream image | Public signalling `7880/tcp`, media `7881/tcp`, `7882/udp` | Configuration supplied by Compose |
| LiveKit Egress | Versioned upstream image | Internal only | Records to Garage; CPU/memory depend on concurrent recordings |

Start with the same host capacity and workload assumptions documented in
[Self-Hosting](SELF_HOSTING.md) and [runtime operations](runtime-operations.md).
Allow additional capacity for PostgreSQL, meetings, egress and the API; the worker
limit is not a whole-stack sizing estimate. Do not horizontally scale the API or
overlap old and new API instances during an update.

The required secret/public-variable checklist is in
[Self-Hosting](SELF_HOSTING.md#required-production-values). Supply the frontend's
public `API_URL`, optional `BACKEND_URL`, `LIVEKIT_URL`, `VAPID_PUBLIC_KEY` and
`AUTH_CSRF_COOKIE_NAME` at runtime; the exact contract is in
[Container images](CONTAINERS.md#frontend-runtime-configuration). An absolute API
URL or `/api` behind a path-preserving edge proxy is supported. No private key,
database credential or provider credential belongs in the frontend environment.

Terminate HTTPS at the platform proxy and forward HTTPS metadata to the backend.
Route Socket.IO with WebSocket upgrades and preserve signed Garage request paths,
queries and hosts. LiveKit's media ports must be reachable separately. Keep
PostgreSQL, Redis, Garage admin/RPC and LiveKit control endpoints private.

Updates deliberately change `NEBULYNK_VERSION` for all application services after
backups and a restore test. Pull target images before replacing containers; a
redeploy alone keeps the current version. Back up PostgreSQL, both Garage volumes
and deployment secrets together. Restoring an older image does not undo database
changes. Verify login, realtime chat, uploads, a meeting and worker readiness after
installation and upgrades.

Managed-service licensing, paid third-party support, backups and monitoring require
the separately agreed license clarification. This technical integration reference
does not change or grant permissions beyond [LICENSE](../LICENSE).
