# Container images

Production deployments use one fixed release of three public GHCR images:

| Component | Image | Port | Healthcheck |
| --- | --- | --- | --- |
| API | `ghcr.io/sapientorius/nebulynk-backend:X.Y.Z` | `3030/tcp` | `GET /health/ready` |
| Browser frontend | `ghcr.io/sapientorius/nebulynk-frontend:X.Y.Z` | `8080/tcp` | `GET /healthz` |
| Transcription worker | `ghcr.io/sapientorius/nebulynk-transcription-worker:X.Y.Z` | None | `node src/transcription-worker-health.js` |

The images support `linux/amd64` and `linux/arm64`. Plesk continues to support
Linux x86-64 only. Replace `X.Y.Z` with a published stable version; the repository
default is synchronized when preparing the next release. Historical releases do
not acquire new images through this change.

The release's `container-images.json` records the exact commit, platforms and
digests. OCI labels include version, revision, source and license, and each image
contains `/licenses/LICENSE`. SBOM and build provenance are attached to the image
indices. Published version tags are immutable; base-image security fixes require
a new release. Operators can also pin the recorded multiarch digests explicitly.

Use [Self-Hosting](SELF_HOSTING.md) as the general deployment entry point. Dedicated
instructions cover [Coolify](COOLIFY.md), [Dokploy](DOKPLOY.md), [Plesk](PLESK.md)
and the [elest.io integration reference](ELEST.md). The standalone deployment files
require Docker Compose 2.23.1 or newer for embedded `configs.content` support.

## Frontend runtime configuration

The frontend container renders `/runtime-config.js` and its Nginx configuration
when it starts. The script runs before application code and sets
`window.__NEBULYNK_CONFIG__`. Only the following public fields are included:

| Container variable | Browser field | Value |
| --- | --- | --- |
| `API_URL` | `apiUrl` | Required absolute HTTP(S) URL or root-relative path such as `/api` |
| `BACKEND_URL` | `backendUrl` | Optional HTTP(S) socket origin; otherwise derived from the API URL |
| `LIVEKIT_URL` | `livekitUrl` | Optional public HTTP(S)/WS(S) URL; the backend's resolved meeting endpoint remains supported |
| `VAPID_PUBLIC_KEY` | `vapidPublicKey` | Optional public Web Push key; empty disables configured push |
| `AUTH_CSRF_COOKIE_NAME` | `authCsrfCookieName` | Defaults to `nebulynk_csrf_token`; match the backend value |

Each variable accepts its `VITE_`-prefixed legacy alias. A canonical variable
present in the container environment wins, including an explicitly empty optional
value. The supplied Compose files also map existing deployment aliases into the
canonical environment while preserving explicitly empty canonical values. Local
Vite builds keep their existing environment defaults. Explicit
client API/socket settings, including desktop connections, take precedence over
global browser configuration.

Missing `API_URL`, invalid URLs, credentials in URLs or an invalid cookie name
fail container startup with a configuration error. Required API URL validation
runs in the frontend startup renderer. Compose alias fallbacks do not require
`VITE_API_URL` when `API_URL` is supplied, including on older Compose versions.
Values are serialized as data;
server secrets are never copied into runtime configuration. Nginx derives CSP
connection origins from the same API, socket and LiveKit values. Existing security
headers are preserved. HTML and runtime configuration use `Cache-Control: no-store`;
hashed `/assets/` and `/vendor/` resources retain their immutable cache.

The official image build uses an empty Vite environment. No deployment URL or
installation key is needed when building the image. Nginx runs as UID 101 on port
8080. Generated configuration, PID and temporary files live under `/tmp/nebulynk`;
the image supports a read-only root filesystem with writable `/tmp`, for example:

```sh
docker run --rm --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  -p 8080:8080 -e API_URL=https://api.example.com \
  -e LIVEKIT_URL=wss://livekit.example.com \
  ghcr.io/sapientorius/nebulynk-frontend:X.Y.Z
```

After editing Compose variables, redeploy or recreate the affected container:

```sh
docker compose -p nebulynk --env-file .env.production \
  -f docker-compose.yml -f docker-compose.self-hosted.yml \
  up -d --no-build --pull never frontend
```

`docker restart` and `docker compose restart` keep the container's original
environment. They do not apply edited Compose variables. A redeploy applies
configuration changes without a rebuild and without selecting a new release.

## Custom source builds

Keep production configuration and add the source override for development or
your own application changes:

```sh
docker compose -p nebulynk-custom --env-file .env.production \
  -f docker-compose.yml -f docker-compose.self-hosted.yml \
  -f docker-compose.source.yml up -d --build --pull never
```

The override builds the same `backend`, `transcription-worker` and
`production-stage` Docker targets. The backend Dockerfile's default target still
starts the API. The frontend remains runtime-configured. Use a separate test
project and test data before adopting custom images in a production installation.
For custom image provenance, set `NEBULYNK_BUILD_SHA` and `NEBULYNK_BUILD_TIME`
before building; the override passes them as Docker build arguments. Runtime
environment values cannot replace the provenance baked into an image.

Coolify users can select the standalone `/docker-compose.coolify.source.yml` in a
Git-based test resource instead of merging multiple files. It builds the selected
branch and does not use `NEBULYNK_VERSION`; see
[Testing branches with source builds](COOLIFY.md#testing-branches-with-source-builds).
This file is generated with `npm run coolify:source` and checked in CI to keep its
shared deployment settings synchronized with the production Coolify configuration.

## Verification

For deployable registry images before a stable release, follow the
[step-by-step staging guide](STAGING.md). **Publish staging images** is manually
started on a branch and produces a fixed `staging-<commit>-<run-ID>` tag shared by
all three images. Select that tag with `NEBULYNK_VERSION` in a Coolify test resource
using `/docker-compose.coolify.yml`.

`npm run test:containers` builds and runs local images, checks non-root/read-only
frontend startup and native dependencies, and exercises setup, login, chat,
sockets and persistent backend recreation in Chromium. The release runner supplies
`NEBULYNK_TEST_BACKEND_IMAGE`, `NEBULYNK_TEST_FRONTEND_IMAGE` and
`NEBULYNK_TEST_WORKER_IMAGE` pinned to candidate digests instead. The native runner
matrix executes the same gate for both supported architectures.

`npm run test:deployments` renders every production Compose configuration for
selected release and staging tags and verifies the Dokploy import. `npm run test:containers:unit`
checks publication/retry/conflict behavior without registry writes. Full CI also
retains the existing PostgreSQL, browser, Plesk/Garage, worker-isolation and security
gates. Every new npm check has a matching `:rtk` variant.
