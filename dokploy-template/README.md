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

Dokploy generates four initial domain entries. They are useful only as import
defaults; use four DNS names you control before a production deployment and
enable HTTPS with Let's Encrypt in Dokploy's **Domains** tab.

| Service | Port | Environment values to update after changing the domain |
| --- | --- | --- |
| `frontend` | `8080` | `FRONTEND_URL`, `PASSKEY_RP_ID` |
| `backend` | `3030` | `VITE_API_URL` |
| `livekit` | `7880` | `LIVEKIT_PUBLIC_URL` |
| `garage` | `3900` | `STORAGE_S3_PUBLIC_ENDPOINT` |

Use `https://` URLs for all four public endpoints. Redeploy after changing a
domain or any of the listed values because the frontend receives API and
LiveKit URLs during its image build.

The template cannot encode Dokploy certificate settings. Confirm HTTPS and a
Let's Encrypt certificate for every custom domain in the Domains tab. Do not
rely on a generated free domain for production: browser cookies, passkeys, and
media require HTTPS.

## Generated and optional configuration

Dokploy resolves the template helpers once at import time. It stores unique
values for PostgreSQL, Garage, S3, JWT, AI encryption, 2FA encryption, and
LiveKit in the Compose environment. `GARAGE_RPC_SECRET` is generated as exactly
64 hexadecimal characters. Keep these values unchanged when restoring volumes
or updating an existing instance.

Web Push, SMTP, and Klipy are deliberately not configured by the template.
Add the corresponding `VAPID_*`, `SMTP_*`, or `KLIPY_API_KEY` variables only
when those integrations are needed. Do not create a fake VAPID key pair.

## Networking and backups

Allow inbound TCP `7881` and UDP `7882` through the server and provider
firewalls for LiveKit media. The four named persistent volumes are intended
for Dokploy Volume Backups: back up PostgreSQL plus both Garage volumes;
Redis is optional. Test a restore before upgrades and never delete persistent
volumes as part of an update.
