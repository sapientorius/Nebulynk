# Nebulynk for Dokploy

This directory is a complete Dokploy blueprint. `docker-compose.yml` and
`template.toml` can be copied to `blueprints/nebulynk/` in the official
Dokploy templates repository. `import.base64` is the directly importable form.

## Import

1. Regenerate `import.base64` with `npm run dokploy:template` when this
   directory changes.
2. In Dokploy, create a **Compose** service using **Docker Compose**, then
   open **Advanced** and paste the complete contents of `import.base64` into
   **Import**.
3. Inspect the imported environment and use **Preview Compose** before the
   first deployment. Dokploy manages domains, Traefik labels, and the isolated
   deployment network; do not add those to the Compose file.

The template builds Nebulynk directly from the public repository. It defaults
to the reviewed `stable` branch. Set `NEBULYNK_SOURCE_REF` to an immutable tag
such as `v0.4.0` before deployment when a pinned release is required.

## Domains and TLS

Dokploy generates four initial `sslip.io` domain entries. The imported
template intentionally starts with `NODE_ENV=development` and `http://` URLs,
so the first deployment works without certificates. This is suitable for an
initial smoke test only.

Before exposing the instance beyond a controlled test, use four DNS names you
control, enable HTTPS with Let's Encrypt in Dokploy's **Domains** tab, and set
`NODE_ENV=production` in the imported environment.

| Service | Port | Environment values to update after changing the domain |
| --- | --- | --- |
| `frontend` | `8080` | `FRONTEND_URL`, `PASSKEY_RP_ID` |
| `backend` | `3030` | `VITE_API_URL` |
| `livekit` | `7880` | `LIVEKIT_PUBLIC_URL` |
| `garage` | `3900` | `STORAGE_S3_PUBLIC_ENDPOINT` |

For the initial generated-domain test, keep `http://` on all four public
endpoint values. For production, change all four values to their actual
`https://` URLs:

- `FRONTEND_URL`
- `VITE_API_URL`
- `LIVEKIT_PUBLIC_URL`
- `STORAGE_S3_PUBLIC_ENDPOINT`

Dokploy does not synchronize the **Domains** tab back into environment
variables. After changing a domain or enabling HTTPS, update the matching
environment values manually and redeploy. The frontend receives the API and
LiveKit URLs during its image build.

The template cannot encode Dokploy certificate settings. Confirm HTTPS and a
Let's Encrypt certificate for every custom domain in the Domains tab. Do not
rely on generated free domains for production: browser cookies, passkeys, and
media require HTTPS.

## Generated and optional configuration

Dokploy resolves the template helpers once at import time. It stores unique
values for PostgreSQL, Garage, S3, JWT, AI encryption, 2FA encryption, and
LiveKit in the Compose environment. `GARAGE_RPC_SECRET` is generated as exactly
64 hexadecimal characters. Keep these values unchanged when restoring volumes
or updating an existing instance.

The imported environment lists the optional integration and operational
variables so they are visible in Dokploy. Instance-specific values such as
Klipy, VAPID, SMTP credentials, sender addresses, and AI allowlists are empty
by default; configure them only when needed. Safe defaults for ports, cookie
names, session lifetimes, Redis rate limiting, logging, and proxy handling are
preserved. Do not create a fake VAPID key pair.

## Networking and backups

Allow inbound TCP `7881` and UDP `7882` through the server and provider
firewalls for LiveKit media. The four named persistent volumes are intended
for Dokploy Volume Backups: back up PostgreSQL plus both Garage volumes;
Redis is optional. Test a restore before upgrades and never delete persistent
volumes as part of an update.
