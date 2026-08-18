# Deploying Nebulynk with Coolify

This guide covers a new production deployment of the official Nebulynk
repository with Coolify. Use Coolify 4.1.0 or newer and keep Coolify itself up
to date. Nebulynk uses Coolify's persistent magic environment variables for
generated secrets and its service URL variables for public endpoints. See
Coolify's [Magic Environment Variables](https://coolify.io/docs/knowledge-base/environment-variables)
reference for the platform behavior used by this Compose file.

Read [Secure Self-Hosting](security-hardening.md) before exposing the instance.
The general Docker architecture, backup requirements, and manual deployment
path are documented in [Self-Hosting](SELF_HOSTING.md).

## Before you begin

Prepare four DNS names pointing to the Coolify server. The examples below use:

| Service | Public URL | Purpose |
| --- | --- | --- |
| `frontend` | `https://app.example.com` | Browser interface |
| `backend` | `https://api.example.com` | API, authentication, and WebSockets |
| `livekit` | `https://livekit.example.com` | LiveKit signalling; Nebulynk converts it to `wss://` for clients |
| `garage` | `https://files.example.com` | S3-compatible uploads, downloads, and recordings |

LiveKit media does not travel through the HTTP proxy. Allow inbound TCP `7881`
and UDP `7882` in both Coolify and the server or provider firewall.

## 1. Create the resource

1. In the target Coolify project and environment, select **New Resource** and
   **Public Repository**.
2. Enter `https://github.com/sapientorius/Nebulynk` as the repository.
3. Select **Docker Compose** as the build pack and set the Compose file to
   `/docker-compose.coolify.yml`.
4. Coolify initially selects `main`. Change the branch to `stable` before the
   first deployment. Never deploy `main` in production. Use an immutable
   `vX.Y.Z` tag instead only when the installation must remain pinned to one
   reviewed release.
5. Enable automatic deployments only when following the `stable` channel.

Do not start the first deployment until the branch, domains, and optional
configuration below have been reviewed.

## 2. Configure only the four public domains

Enter a domain only for the following services. The port suffix selects the
container port; Coolify still serves the public HTTPS endpoint on the normal
HTTPS port.

| Coolify domain field | Value |
| --- | --- |
| Domains for `frontend` | `https://app.example.com:8080` |
| Domains for `backend` | `https://api.example.com:3030` |
| Domains for `livekit` | `https://livekit.example.com:7880` |
| Domains for `garage` | `https://files.example.com:3900` |

Leave the domain fields for `postgres`, `redis`, `garage-volume-init`, and
`livekit-egress` empty. They are internal services. An empty domain field does
not expose the service through the Coolify proxy.

The Compose stack derives all browser-facing configuration from these domain
entries. Do not create or set any of the following variables for a standard
Coolify deployment:

- `COOLIFY_URL_FRONTEND`, `COOLIFY_URL_BACKEND`, or
  `COOLIFY_URL_LIVEKIT_WSS`;
- `STORAGE_S3_PUBLIC_ENDPOINT` or `LIVEKIT_PUBLIC_URL`;
- `VITE_API_URL`, `VITE_LIVEKIT_URL`, or `VITE_VAPID_PUBLIC_KEY`;
- `PASSKEY_RP_ID`; or
- `NEBULYNK_BUILD_SHA`, `NEBULYNK_BUILD_TIME`, or
  `NEBULYNK_UPDATE_PUBLIC_KEYS_JSON`.

Coolify supplies `SERVICE_URL_FRONTEND`, `SERVICE_FQDN_FRONTEND`,
`SERVICE_URL_BACKEND`, `SERVICE_URL_LIVEKIT`, and `SERVICE_URL_GARAGE` from the
domain fields. Nebulynk uses `SOURCE_COMMIT` for the build SHA. The build time
is optional and remains unset, while official update-verification keys are
already embedded in release builds.

Changing a public domain requires saving the resource and performing a full
rebuild so the frontend receives the new build-time URLs.

## 3. Review the generated secrets

On a new resource, Coolify generates and persists these values. They appear in
the environment-variable UI and can be edited before the first deployment.

| Generated variable | Used for |
| --- | --- |
| `SERVICE_PASSWORD_64_POSTGRES` | PostgreSQL password |
| `SERVICE_HEX_64_GARAGERPC` | Garage RPC secret |
| `SERVICE_USER_S3` | Garage/S3 access key |
| `SERVICE_PASSWORD_64_S3` | Garage/S3 secret key |
| `SERVICE_PASSWORD_64_JWT` | Browser-session signing |
| `SERVICE_PASSWORD_64_AI` | Encryption of stored AI-provider credentials |
| `SERVICE_USER_LIVEKIT` | LiveKit API key |
| `SERVICE_PASSWORD_64_LIVEKIT` | LiveKit API secret |

The standard variables `POSTGRES_PASSWORD`, `GARAGE_RPC_SECRET`,
`STORAGE_S3_ACCESS_KEY`, `STORAGE_S3_SECRET_KEY`, `JWT_SECRET`,
`AI_SECRET_KEY`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are optional
overrides. Existing non-empty values take precedence, which preserves current
installations during an update. Leave these overrides empty on a new resource
unless you intentionally supply your own credentials.

`SERVICE_HEX_64_GARAGERPC` must contain exactly 64 hexadecimal characters. To
create a replacement manually, `openssl rand -hex 32` generates 32 random
bytes represented by exactly 64 hexadecimal characters.

Generated values persist across normal rebuilds and redeployments. Back them
up securely with the PostgreSQL and Garage volumes. Do not change database,
Garage, S3, JWT, AI-encryption, or LiveKit secrets after the first deployment
without a service-specific rotation or migration procedure.

## 4. Add optional integrations

No additional environment variables are required for the base platform.
Configure only the features you intend to use:

- Web Push: set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and optionally
  `VAPID_SUBJECT`. The Compose stack reuses `VAPID_PUBLIC_KEY` for the frontend
  build automatically. Changing it requires a full frontend rebuild.
- Email: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_IGNORE_TLS`,
  `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and optionally `SMTP_FROM_NAME`.
- GIF search: optionally set `KLIPY_API_KEY` as an environment fallback. You can also add the key later under Admin → Platform Settings; the encrypted platform value takes precedence.
- Two-factor encryption: optionally set a strong, stable
  `AUTH_2FA_SECRET_KEY` to keep stored two-factor secrets separate from the
  JWT signing key. Existing installations can leave it unset and use the
  backwards-compatible `JWT_SECRET` fallback.
- Advanced limits, session settings, image pins, and logging values can keep
  their Compose defaults unless a reviewed deployment requirement says
  otherwise.

Do not put secrets in variables prefixed with `VITE_`; Vite values are embedded
in the browser image.

## 5. Deploy and verify

1. Save the resource and confirm again that the source is `stable` or the
   intended immutable release tag.
2. Deploy the complete Compose resource and inspect every service log.
3. `garage-volume-init` should finish successfully and then remain exited. It
   prepares the two Garage volumes and is not a long-running service.
4. Confirm that the frontend loads without mixed-content warnings, login and
   passkey registration work, and the browser connects to the backend domain.
5. Upload and download a file and verify that the signed URL uses the Garage
   domain.
6. Start a test meeting and verify signalling, audio/video through TCP `7881`
   or UDP `7882`, and recording output in Garage.
7. If configured, test SMTP delivery and Web Push registration.

Back up `nebulynk_postgres_data`, `nebulynk_garage_meta`, and
`nebulynk_garage_data` together. Preserve the generated environment values as
part of the recovery material. Redis data may be rebuilt.

## Updating an existing installation

Review release notes and verify backups before every update. A `stable`
resource can redeploy the latest reviewed commit; a tag-pinned resource must
be moved deliberately to the next tag. Never delete persistent volumes during
an update.

Existing explicit standard secrets continue to override Coolify-generated
defaults. Older installations that still use MinIO-named variables must copy
their current values before adopting the new Compose file:

| Legacy variable | Current variable |
| --- | --- |
| `MINIO_ROOT_USER` or `MINIO_ACCESS_KEY` | `STORAGE_S3_ACCESS_KEY` |
| `MINIO_ROOT_PASSWORD` or `MINIO_SECRET_KEY` | `STORAGE_S3_SECRET_KEY` |
| `MINIO_BUCKET` | `STORAGE_S3_BUCKET` |
| `MINIO_PUBLIC_ENDPOINT` | `STORAGE_S3_PUBLIC_ENDPOINT` |

Copy the existing values; do not generate replacements during this migration.
The bundled stack sets `STORAGE_S3_ENDPOINT` internally to
`http://garage:3900`; only map an old `MINIO_ENDPOINT` when retaining a custom
external S3-compatible service. Changing storage credentials without rotating
them in Garage can make existing objects inaccessible.
