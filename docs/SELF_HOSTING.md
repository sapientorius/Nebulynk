# Self-Hosting with Docker and Coolify

This guide explains how to run your own Nebulynk instance. It is intended for
administrators who can manage domains, TLS certificates, and server backups.
Coolify is the recommended option for a fully managed deployment of this
repository. The Docker instructions use the existing Compose and Docker files
on a self-managed host.

Read [Secure Self-Hosting](security-hardening.md) as well. Its guidance on
secrets, TLS, backups, and access control applies in addition to this guide.

## Architecture and prerequisites

Nebulynk consists of a frontend, backend, PostgreSQL, Redis, Garage as
S3-compatible object storage, LiveKit, and LiveKit Egress. PostgreSQL, Redis,
and Garage data persists in Docker volumes. Restarting or updating containers
does not remove it; `docker compose down -v` does.

Four HTTPS/WSS endpoints are recommended for a public instance. Replace
`example.com` throughout this guide with your own domain:

| Service | Example domain | Purpose |
| --- | --- | --- |
| Frontend | `https://app.example.com` | Browser interface |
| Backend | `https://api.example.com` | API, authentication, and WebSocket endpoints |
| LiveKit | `wss://livekit.example.com` | Audio/video signalling |
| Garage/S3 | `https://files.example.com` | Signed URLs for files and recordings |

Besides these HTTP(S) endpoints, LiveKit requires direct media connections.
Open at least TCP `7881` and the UDP port configured in `livekit.yaml`
(`7882`). The included Compose files currently publish TCP `7881` and the UDP
range `50000-50100`, while `livekit.yaml` sets `udp_port: 7882`. The Compose
port mapping and the LiveKit configuration must agree for a public deployment:
publish `7882/udp`, or change both sides to the desired UDP range. Otherwise,
audio and video connections can fail.

You need:

- Docker Engine with Docker Compose v2;
- a reverse proxy or platform that terminates TLS and routes the public domains
  to the appropriate containers;
- DNS records for the domains above; and
- a stable frontend domain for passkeys, plus current backups of PostgreSQL and
  both Garage volumes.

Do not expose the database, Redis, or the internal S3 and LiveKit control
endpoints publicly. Only the deliberately routed HTTP(S) endpoints and the
required LiveKit media ports should be open in the firewall.

## Configuration

Store secrets only in the deployment environment, Coolify, or a secret
manager. `.env` is ignored by Git and must not be committed. See
[`.env.example`](../.env.example) for the full local-development reference;
the tables below cover values relevant to the supplied production Compose
files.

For example, generate strong values with:

```bash
openssl rand -base64 48    # JWT_SECRET, AI_SECRET_KEY, passwords
openssl rand -hex 32       # GARAGE_RPC_SECRET
```

Use different values for `JWT_SECRET`, `AI_SECRET_KEY`, `POSTGRES_PASSWORD`,
`STORAGE_S3_SECRET_KEY`, and `LIVEKIT_API_SECRET`. Placeholders such as
`change_me`, default passwords, and development values are not allowed with
`NODE_ENV=production`.

### Required production values

| Variable | Example or requirement | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `production` | Enables production checks. |
| `POSTGRES_DB` | `nebulynk` | Database name. |
| `POSTGRES_USER` | `nebulynk` | Database user. |
| `POSTGRES_PASSWORD` | Strong, unique secret | PostgreSQL and backend. |
| `GARAGE_RPC_SECRET` | 64 hexadecimal characters | Garage cluster secret. |
| `STORAGE_S3_ACCESS_KEY` | Custom key name | Garage access for the backend and Egress. |
| `STORAGE_S3_SECRET_KEY` | Strong, unique secret | Garage access for the backend and Egress. |
| `STORAGE_S3_BUCKET` | `nebulynk-files` | File bucket; the supplied Egress configuration expects this name. |
| `STORAGE_S3_REGION` | `us-east-1` | S3 region for Garage and Egress. |
| `JWT_SECRET` | Strong, unique secret | Signs browser sessions and tokens. |
| `AI_SECRET_KEY` | Strong, unique secret | Encrypts stored AI-provider credentials. |
| `FRONTEND_URL` | `https://app.example.com` | Backend CORS origin. Multiple origins can be comma-separated. |
| `PASSKEY_RP_ID` | `app.example.com` | WebAuthn relying-party ID; it must match the frontend domain or its parent domain. |
| `TRUST_PROXY` | `true` | Required when a proxy terminates TLS before the backend. |
| `LIVEKIT_API_KEY` | Custom key name | Shared key for backend, LiveKit, and Egress. |
| `LIVEKIT_API_SECRET` | Strong, unique secret | Shared LiveKit secret. |
| `LIVEKIT_PUBLIC_URL` | `wss://livekit.example.com` | Client-facing LiveKit URL emitted by the backend. |
| `STORAGE_S3_PUBLIC_ENDPOINT` | `https://files.example.com` | Public S3 API used for signed file URLs; never use an admin or console port. |
| `VITE_API_URL` | `https://api.example.com` | API URL embedded during the frontend build. |
| `VITE_LIVEKIT_URL` | `wss://livekit.example.com` | LiveKit URL embedded during the frontend build. |

`VITE_*` values are build arguments, not runtime secrets. Rebuild and deploy
the frontend after changing one. Never expose secrets to the browser with a
`VITE_` prefix.

### Internal endpoints and recording configuration

The following values connect containers within the Docker network. They must
not point to public domains:

| Variable | Docker/Coolify value | Purpose |
| --- | --- | --- |
| `POSTGRES_HOST` / `POSTGRES_PORT` | `postgres` / `5432` | Backend connection to PostgreSQL. |
| `REDIS_HOST` / `REDIS_PORT` | `redis` / `6379` | Backend and rate limiting. |
| `STORAGE_S3_ENDPOINT` | `http://garage:3900` | Backend's internal storage endpoint. |
| `LIVEKIT_HOST` | `http://livekit:7880` | Backend's internal LiveKit control API. |
| `LIVEKIT_WS_URL` | `ws://livekit:7880` | LiveKit Egress connection to LiveKit. |
| `MEETING_RECORDINGS_S3_ENDPOINT` | `http://garage:3900` | Backend access to recordings. |
| `MEETING_RECORDINGS_EGRESS_S3_ENDPOINT` | `http://garage:3900` | Egress access to recordings. |
| `MEETING_RECORDINGS_BUCKET` | Value of `STORAGE_S3_BUCKET` | Recordings bucket. |
| `MEETING_RECORDINGS_PREFIX` | `meeting-recordings` | Recording object prefix. |
| `MEETING_RECORDINGS_S3_REGION` | Value of `STORAGE_S3_REGION` | S3 region for recordings. |

The Coolify Compose file already fixes these internal addresses. For a manual
Docker deployment, supply them explicitly to the backend container. A custom
bucket also requires an update to LiveKit Egress's S3 configuration; the
included `livekit-egress.yaml` uses `nebulynk-files`.

### Recommended and optional values

| Group | Variables | When to set them |
| --- | --- | --- |
| Sessions and operation | `AUTH_BROWSER_ACCESS_TOKEN_TTL`, `AUTH_REFRESH_TOKEN_TTL`, `AUTH_REMEMBER_REFRESH_TOKEN_TTL`, `AUTH_COOKIE_DOMAIN`, `AUTH_REFRESH_COOKIE_NAME`, `AUTH_CSRF_COOKIE_NAME`, `LOG_LEVEL`, `BACKEND_PORT` | Use for a non-default session policy, cookie domain, logging level, or port. Defaults are in `.env.example`. |
| Abuse protection | `RATE_LIMIT_DRIVER=redis`, `AUTHENTICATION_RATE_LIMIT_IP_LIMIT`, `AI_PROVIDER_BASE_URL_ALLOWLIST` | Redis is the recommended rate-limit store in production. Set an AI allowlist only for intentionally trusted HTTPS endpoints. |
| Docker host ports | `POSTGRES_PORT`, `REDIS_PORT`, `STORAGE_S3_PORT`, `LIVEKIT_PORT` | Only change these to alter the ports published on the host by the standard Compose stack. They are usually unnecessary with Coolify or behind a reverse proxy. |
| Uploads and recordings | `MAX_FILE_SIZE`, `UPLOAD_MAX_FILE_SIZE_MB`, `UPLOAD_IMAGE_MAX_DIMENSION_PX`, `UPLOAD_IMAGE_COMPRESSION_QUALITY`, `VIDEO_BACKGROUND_MAX_PER_USER`, `MEETING_TRANSCRIPT_WAIT_TIMEOUT_MS` | Use when default size or timeout limits do not fit your deployment. |
| AI and transcript limits | `MEETING_AI_PROMPT_TRANSCRIPT_SEGMENTS`, `MEETING_AI_PROMPT_CHAT_MESSAGES`, `MEETING_AI_PROMPT_TRANSCRIPT_EXCERPT_CHARS`, `MESSAGE_SUMMARY_MIN_CHARS`, `MESSAGE_SUMMARY_MAX_CONTEXT_CHARS`, `SILENCE_DETECT_THRESHOLD_DB`, `SILENCE_DETECT_MIN_DURATION_SEC`, `SILENCE_DETECT_MIN_SPEECH_SEC` | Use only for deliberate capacity or quality tuning. Provider credentials are stored through the administration interface and protected by `AI_SECRET_KEY`. |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_IGNORE_TLS`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_FROM_NAME` | Required for invitations and security-update digests. Sending remains disabled without `SMTP_HOST`; feed checks and the update center continue to work. |
| Build provenance | `NEBULYNK_BUILD_SHA`, `NEBULYNK_BUILD_TIME` | Optional immutable commit and build timestamp shown to administrators. Only the package SemVer determines update availability. |
| Update trust override | `NEBULYNK_UPDATE_PUBLIC_KEYS_JSON` | Official release tags embed their public verification keys. Use this additive public keyring only for controlled development or an overlapping emergency rotation; never place private key material here. |
| Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `VITE_VAPID_PUBLIC_KEY` | Both server-side VAPID keys and the public build value are required for push. |
| GIF search | `KLIPY_API_KEY` | Only set when using the Klipy integration. |

The backend reads the legacy names `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`,
`MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_ROOT_USER`, and
`MINIO_ROOT_PASSWORD` as fallbacks. Use the consistent `STORAGE_S3_*` names
for new deployments.

## Docker on a self-managed host

The existing [`docker-compose.yml`](../docker-compose.yml) stack contains the
persistent dependencies (PostgreSQL, Redis, Garage, LiveKit, and Egress). It
does not currently include application containers. Start the backend and
frontend from their existing Dockerfiles in the same Compose network. Always
use a fixed project name so the network name is predictable.

1. Clone the repository and create a production `.env.production` file that is
   not committed, following the tables above. This stack particularly needs
   `GARAGE_RPC_SECRET`, storage credentials, and LiveKit credentials.
2. Start the infrastructure with a fixed project name:

   ```bash
   docker compose -p nebulynk --env-file .env.production up -d
   ```

3. Build the backend image and start it in the Compose network. These `-e`
   values override the local-host defaults in `.env.example`:

   ```bash
   docker build -t nebulynk-backend ./backend
   docker run -d --name nebulynk-backend --restart unless-stopped \
     --network nebulynk_default --env-file .env.production \
     -e POSTGRES_HOST=postgres -e POSTGRES_PORT=5432 \
     -e REDIS_HOST=redis -e REDIS_PORT=6379 \
     -e STORAGE_S3_ENDPOINT=http://garage:3900 \
     -e LIVEKIT_HOST=http://livekit:7880 \
     -e LIVEKIT_WS_URL=ws://livekit:7880 \
     -e MEETING_RECORDINGS_S3_ENDPOINT=http://garage:3900 \
     -e MEETING_RECORDINGS_EGRESS_S3_ENDPOINT=http://garage:3900 \
     -p 3030:3030 nebulynk-backend
   ```

4. Build and start the frontend with public HTTPS/WSS URLs. The values are
   included in the generated JavaScript:

   ```bash
   docker build -t nebulynk-frontend ./frontend \
     --build-arg VITE_API_URL=https://api.example.com \
     --build-arg VITE_LIVEKIT_URL=wss://livekit.example.com \
     --build-arg VITE_VAPID_PUBLIC_KEY=PUBLIC_VAPID_KEY \
     --build-arg VITE_AUTH_CSRF_COOKIE_NAME=nebulynk_csrf_token
   docker run -d --name nebulynk-frontend --restart unless-stopped \
     -p 8080:8080 nebulynk-frontend
   ```

5. Configure the reverse proxy and firewall: route the frontend, backend,
   LiveKit WebSocket, and Garage S3 endpoints to their container ports,
   terminate TLS, and pass `X-Forwarded-Proto: https` to the backend. Do not
   expose PostgreSQL or Redis. Observe the LiveKit UDP-port alignment described
   above. For external LiveKit access, do not retain `--node-ip 127.0.0.1` from
   the base Compose file; remove it or replace it with the server IP reachable
   by clients.

Back up PostgreSQL and the Garage volumes before an update. Then update images,
rebuild the backend and frontend, and replace both application containers. Do
not use `docker compose down -v` when data must be retained.

## Deploying with Coolify

Coolify manages builds, containers, domains, and TLS. The repository includes
[`docker-compose.coolify.yml`](../docker-compose.coolify.yml) for this purpose;
it contains every Nebulynk service.

1. Create a project and a Docker Compose resource in Coolify from the
   repository. Select `docker-compose.coolify.yml` as the Compose file and use
   the protected `stable` branch or an immutable `vX.Y.Z` tag. `main` is not a
   supported production channel.
2. Add the values from the tables above as Coolify environment variables. Set
   at least `POSTGRES_PASSWORD`, `GARAGE_RPC_SECRET`, `JWT_SECRET`,
   `AI_SECRET_KEY`, `STORAGE_S3_ACCESS_KEY`, `STORAGE_S3_SECRET_KEY`,
   `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `STORAGE_S3_PUBLIC_ENDPOINT`, and
   `PASSKEY_RP_ID` before the first deployment.
3. Configure these domains for the services at the specified internal port.
   Then add the corresponding build/runtime variables:

   | Coolify service | Port | Variable |
   | --- | --- | --- |
   | `frontend` | `8080` | `COOLIFY_URL_FRONTEND=https://app.example.com` |
   | `backend` | `3030` | `COOLIFY_URL_BACKEND=https://api.example.com` |
   | `livekit` | `7880` | `COOLIFY_URL_LIVEKIT_WSS=wss://livekit.example.com` |
   | `garage` | `3900` | `STORAGE_S3_PUBLIC_ENDPOINT=https://files.example.com` |

   The Compose stack sets `FRONTEND_URL` from `COOLIFY_URL_FRONTEND`. Frontend
   build arguments come from `COOLIFY_URL_BACKEND`,
   `COOLIFY_URL_LIVEKIT_WSS`, `VITE_VAPID_PUBLIC_KEY`, and
   `AUTH_CSRF_COOKIE_NAME`. Set `LIVEKIT_PUBLIC_URL` to the same WSS URL.
4. Open direct LiveKit media ports in Coolify and the server firewall as well.
   TCP `7881` and the UDP port actually configured in `livekit.yaml` must be
   reachable by clients; an HTTP proxy alone is not sufficient.
5. Deploy and check every service log. Changing `VITE_*`,
   `COOLIFY_URL_BACKEND`, or `COOLIFY_URL_LIVEKIT_WSS` requires a full frontend
   rebuild. A normal backend or configuration change only requires a resource
   redeploy.

Coolify creates persistent volumes for the Compose volumes. Back up
`nebulynk_postgres_data`, `nebulynk_garage_meta`, and
`nebulynk_garage_data` together. Redis can be rebuilt from its data store if
needed.

## Acceptance checks, troubleshooting, and updates

After the first deployment and after infrastructure changes, check that:

1. `https://app.example.com` loads without mixed-content warnings, and login
   plus cookie refresh work.
2. The backend accepts only origins allowed by `FRONTEND_URL`, and passkey
   registration works for the configured `PASSKEY_RP_ID`.
3. File uploads and downloads through signed URLs work via
   `STORAGE_S3_PUBLIC_ENDPOINT`.
4. A test meeting can connect, transmit audio/video, and write a recording to
   the S3 bucket. If only the media path fails, check the UDP firewall,
   LiveKit node IP, and port alignment first.
5. If enabled, SMTP delivery, push notifications, and AI integrations work
   without exposing their secrets in the browser or logs.

Useful Docker commands are `docker compose -p nebulynk ps` and
`docker compose -p nebulynk logs -f livekit livekit-egress`. In Coolify, use
the logs of the affected resource. Before every update, verify backups and a
restore test; apply security updates promptly.

The administration area contains an informational **Updates** center. It
checks the signed stable feed, lists every release between the installed and
latest versions, and sends security digests to active platform administrators
when SMTP is configured. It never installs or deploys an update. Apply an
update manually from `stable` or an immutable release tag after reviewing its
backup, downtime, and migration notes.

Only the platform owner can disable checks, and doing so also stops new
security email notices. The last verified catalog remains visible but becomes
stale. Re-enable checks before relying on the displayed update state.
