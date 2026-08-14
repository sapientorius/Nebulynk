# Deploying Nebulynk with Dokploy

This guide deploys the complete Nebulynk stack from the official repository
with Dokploy. It uses the dedicated
`docker-compose.dokploy.yml` Compose application and Dokploy's native domain
management. Read [Secure Self-Hosting](security-hardening.md) before exposing
an instance.

The guide assumes a current Dokploy installation, a public server, and four
HTTPS-capable DNS names. Use the `stable` branch for the reviewed update
channel or an immutable `vX.Y.Z` tag for a pinned release; do not use
`main` in production.

## Import the packaged template

For a self-contained Compose service that does not need a connected Git source,
use the complete [`dokploy-template`](../dokploy-template/README.md) package.
Its [`import.base64`](../dokploy-template/import.base64) file can be pasted into
**Compose → Advanced → Import**. Dokploy then creates the Compose file, its
environment, and the four native domain entries. The template generates unique
deployment secrets at import time and builds from the reviewed `stable` branch
by default. Set `NEBULYNK_SOURCE_REF` to an immutable release tag before the
first deployment when pinning is required.

Generated domains are import defaults, not production HTTPS configuration.
Replace them with four DNS names you control, enable HTTPS with Let's Encrypt,
and update the dependent URL variables described in the template README before
deployment. The rest of this guide documents the alternative repository-backed
Compose workflow.

## Before you begin

Point these DNS names at the Dokploy server:

| Service | Public URL | Purpose |
| --- | --- | --- |
| `frontend` | `https://app.example.com` | Browser interface |
| `backend` | `https://api.example.com` | API, authentication, and WebSockets |
| `livekit` | `https://livekit.example.com` | LiveKit signalling; Nebulynk uses it as `wss://` in clients |
| `garage` | `https://files.example.com` | S3-compatible uploads, downloads, and recordings |

LiveKit media does not travel through the HTTP proxy. Permit inbound TCP
`7881` and UDP `7882` in the server and provider firewalls. The free
HTTP-only test domains are not sufficient for a full production-style test:
secure cookies, passkeys, and browser media require HTTPS.

## 1. Create the Compose application

1. Create or choose the target Dokploy project and environment.
2. Add a **Compose** service, choose **Docker Compose** (not Docker Stack),
   and connect the official repository.
3. Select `stable` or the intended release tag and set the Compose Path to
   `docker-compose.dokploy.yml`.
4. Enable **Isolated Deployments**. Dokploy then creates and connects the
   deployment network; do not add `dokploy-network` or Traefik labels to the
   Compose file.
5. Leave Dokploy's custom Compose command unchanged unless a deliberate
   operational requirement needs a replacement.

The file builds the application images from the repository root and bakes in
the Garage and LiveKit configuration files. Do not add repository bind mounts:
Dokploy can replace the checked-out source directory during automatic
deployments.

## 2. Set environment variables

In the Compose service's **Environment** tab, create the following required
variables. Dokploy writes these values to its deployment `.env` file; the
Compose file explicitly passes each needed value to the appropriate build or
container environment.

| Variable | Example / requirement |
| --- | --- |
| `POSTGRES_PASSWORD` | Unique database password |
| `GARAGE_RPC_SECRET` | Exactly 64 hexadecimal characters; for example, `openssl rand -hex 32` |
| `STORAGE_S3_ACCESS_KEY` | Dedicated S3 access-key name |
| `STORAGE_S3_SECRET_KEY` | Unique S3 secret |
| `JWT_SECRET` | Unique browser-session signing secret |
| `AI_SECRET_KEY` | Separate secret for stored AI-provider credentials |
| `LIVEKIT_API_KEY` | Dedicated LiveKit API-key name |
| `LIVEKIT_API_SECRET` | Unique LiveKit secret |
| `FRONTEND_URL` | `https://app.example.com` |
| `PASSKEY_RP_ID` | `app.example.com` |
| `VITE_API_URL` | `https://api.example.com` |
| `LIVEKIT_PUBLIC_URL` | `https://livekit.example.com` |
| `STORAGE_S3_PUBLIC_ENDPOINT` | `https://files.example.com` |

`POSTGRES_DB=nebulynk`, `POSTGRES_USER=nebulynk`,
`STORAGE_S3_BUCKET=nebulynk-files`, and `STORAGE_S3_REGION=us-east-1`
are safe defaults and only need to be set when changing them deliberately.

Optional integrations use the same variable names as the other production
deployments:

- Web Push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and optionally
  `VAPID_SUBJECT`.
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
  `SMTP_IGNORE_TLS`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and
  `SMTP_FROM_NAME`.
- GIF search: `KLIPY_API_KEY`.
- Two-factor encryption: optionally set a strong, stable
  `AUTH_2FA_SECRET_KEY`. Existing installations can leave it unset and use
  the backwards-compatible `JWT_SECRET` fallback.

`VITE_API_URL`, `LIVEKIT_PUBLIC_URL`, the optional VAPID public key, and
the CSRF cookie name affect the frontend build. Redeploy after changing any of
them. Never place a secret in a variable with a `VITE_` prefix.

## 3. Configure domains

Use the Compose service's **Domains** tab rather than manual Traefik labels:

| Dokploy service | Domain | Container port |
| --- | --- | --- |
| `frontend` | `https://app.example.com` | `8080` |
| `backend` | `https://api.example.com` | `3030` |
| `livekit` | `https://livekit.example.com` | `7880` |
| `garage` | `https://files.example.com` | `3900` |

Do not create a domain for `postgres`, `redis`, `garage-volume-init`, or
`livekit-egress`; they remain internal. Save and redeploy after changing a
domain so Dokploy can recreate its generated routing labels.

## 4. Deploy and verify

1. Use **Preview Compose** to confirm Dokploy added its isolated network and
   domain routing only to the four public services.
2. Deploy, then inspect every service log. `garage-volume-init` should finish
   successfully and remain exited.
3. Confirm that the frontend loads without mixed-content warnings, login and
   passkey registration work, and the browser connects to the backend domain.
4. Upload and download a file; the signed URL must use the Garage domain.
5. Start a test meeting and confirm signalling, audio/video through TCP
   `7881` or UDP `7882`, and recording output in Garage.
6. If enabled, verify SMTP delivery and Web Push registration.

## Backups and updates

Use Dokploy Volume Backups for the rendered named PostgreSQL, Garage metadata,
and Garage data volumes. Redis data can be rebuilt, but backing it up is
optional. Preserve the environment values with the backups; do not rotate
database, Garage, S3, JWT, AI-encryption, or LiveKit credentials without a
service-specific migration.

Before every update, verify a restore, review the release notes, and redeploy
the same Compose service from `stable` or the reviewed target tag. Never
delete the persistent volumes during an update.

For Dokploy-specific details, see the official
[Docker Compose](https://docs.dokploy.com/docs/core/docker-compose),
[Domains](https://docs.dokploy.com/docs/core/docker-compose/domains), and
[environment variables](https://docs.dokploy.com/docs/core/variables)
documentation.
