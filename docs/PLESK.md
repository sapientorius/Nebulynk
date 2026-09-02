# Nebulynk on Plesk

The Plesk integration targets Plesk Obsidian on Linux x64 with the local Docker
service. It deploys one Nebulynk instance behind one existing Plesk domain or
subdomain.

## What is exposed

The extension creates one local edge proxy and adds one Plesk Nginx proxy rule
through the Plesk web-server hook:

| URL | Service |
| --- | --- |
| `/` | Nebulynk frontend |
| `/api/` | Backend API |
| `/socket.io/` | Backend Socket.IO connection |
| `/livekit/` | LiveKit signaling |
| `/files/` | Garage S3 API and signed files |

The domain must be dedicated to Nebulynk. Existing website content at the root
of that domain will no longer receive requests after deployment. DNS and the
TLS certificate are prepared in Plesk before deployment.

LiveKit media still requires inbound `7881/tcp` and `7882/udp`. The domain and
certificate are shared, but these ports cannot be replaced by URL paths.

## Prerequisites

1. Plesk Obsidian on a supported Linux x64 host.
2. The Plesk Docker Extension, installed from **Extensions > Extensions
   Catalog > Docker**, and a working local Docker daemon.
3. Nginx enabled in Plesk.
4. A dedicated domain or subdomain pointing to the Plesk server.
5. A valid certificate assigned to that domain.
6. Outbound access to Docker Hub and the npm registry during the first build.
7. Enough disk space for the source build, Docker layers, PostgreSQL and Garage data.

If the Plesk GUI does not show “Upload Extension”, enable it in
`/usr/local/psa/admin/conf/panel.ini`:

```ini
[ext-catalog]
extensionUpload = true
```

You may use the panel.ini editor (extension) to edit the file.

Only install a package from a trusted Nebulynk release. The extension uses
privileged Plesk operations and controls Docker on the host.

## Installation

Before opening the Nebulynk extension, install the Plesk Docker Extension from
**Extensions > Extensions Catalog > Docker** and verify that the local Docker
service is running. Then follow this order:

1. Open the [latest stable Nebulynk release](https://github.com/sapientorius/Nebulynk/releases/latest).
2. Under **Assets**, download the matching
   `nebulynk-plesk-<version>-<release>.zip` file and its
   `nebulynk-plesk-<version>-<release>.zip.sha256` sidecar file into the same
   directory.
3. Verify the ZIP before uploading it. On Linux:

   ```sh
   sha256sum -c nebulynk-plesk-<version>-<release>.zip.sha256
   ```

   On macOS, use `shasum -a 256 -c` with the same checksum file. On Windows
   PowerShell:

   ```powershell
   $expected = ((Get-Content .\nebulynk-plesk-<version>-<release>.zip.sha256) -split '\s+')[0].ToLowerInvariant()
   $actual = (Get-FileHash .\nebulynk-plesk-<version>-<release>.zip -Algorithm SHA256).Hash.ToLowerInvariant()
   if ($actual -ne $expected) { throw 'Plesk package checksum mismatch.' }
   ```

4. Upload the ZIP under Plesk > Extensions > My Extensions > Upload Extension.
5. Open Nebulynk in the Plesk administration area.
6. Select the prepared domain and run the preflight check. This verifies the
   host architecture, Docker, Docker Compose, Nginx, OpenSSL and the extension
   payload.
7. Start the installation. The first run can take several minutes because the
   extension downloads container images, installs npm dependencies and builds
   the backend and frontend images. The task continues in the background; do
   not start the same installation more than once.
8. Wait until the Plesk task is complete and open the prepared domain. The
   extension copies the bundled source, generates production secrets, starts
   the Compose project, and activates the domain proxy.

The build is intentionally source-based. The Plesk server must therefore be
able to pull the pinned base images and install npm dependencies inside the
Docker build.

## Build an unreleased package from source

For development or for testing changes that have not been released yet, create
and verify a local package from the repository root:

```sh
npm run plesk:package
npm run plesk:package:check
```

The output is `dist/plesk/nebulynk-plesk-<version>-<release>.zip` and its
`.sha256` sidecar file.

## Release gate for `/files/`

The CI and release validation run `npm run test:plesk:garage`. You can run the
same gate locally; it starts an isolated Garage/Nginx fixture, performs a
signed path-style S3 upload, and fetches the object through `/files/`. It
requires a working local Docker daemon. A successful fixture test does not
replace the final test on a real Plesk Linux VM with the domain's TLS, Nginx
hook and LiveKit media ports.

## Storage and updates

Plesk deployments use the S3 bucket `files`. Signed URLs are generated against
the domain root and resolve through `/files/`; the edge proxy must preserve the
complete request path and query string.

Persistent data and the generated environment file are stored below:

```text
/opt/nebulynk-plesk/.env
/opt/nebulynk-plesk/data/postgres
/opt/nebulynk-plesk/data/redis
/opt/nebulynk-plesk/data/garage-meta
/opt/nebulynk-plesk/data/garage-data
```

Re-uploading a newer extension ZIP preserves these paths and rebuilds the
application images. Normal stop, restart, update and extension removal do not
delete application data.

Plesk does not include Docker volume data in its normal backup. Back up the
directories above with an external backup system, and test restoring PostgreSQL
and both Garage directories before production updates.

## Cleanup and removal

To remove the deployed Nebulynk instance and its data, create and verify an
external backup first. In the extension, open the **Danger zone** section and
enter `DELETE NEBULYNK DATA` in the confirmation field. The cleanup task disables
the Plesk proxy, stops the `nebulynk-plesk` Compose project, removes local
Nebulynk build images where possible, verifies that no project containers remain,
and then deletes `/opt/nebulynk-plesk` including the generated `.env`, source,
PostgreSQL, Redis and Garage data.

If Docker cannot be reached, the stack cannot be stopped, an image cleanup fails,
or a project container remains, the task stops before deleting the deployment
directory. It never runs a global Docker prune. Shared or pinned runtime images,
the Plesk Docker Extension, the domain, DNS, TLS certificate and firewall rules
are not removed.

The normal **Stop** action and removal of the Plesk extension remain
data-preserving. Run the cleanup before removing the extension if the data should
also be deleted. After the extension has been removed, only manual cleanup of
`/opt/nebulynk-plesk` and any remaining Docker resources is possible.

## Troubleshooting

- `502` on the domain: check the extension task log and `docker compose ps` in
  `/opt/nebulynk-plesk`.
- Manifest, favicon, service worker or PWA icons return `403` while bundled
  `/assets/...` files work: upload the updated extension and run `Update and
  rebuild` so the frontend image is rebuilt with readable public document-root
  permissions. Inspect `docker compose logs frontend` and verify the mode with
  `docker compose exec frontend stat -c '%a %U:%G %n' /usr/share/nginx/html/manifest.webmanifest`.
- Login succeeds but `POST /api/auth/session/bootstrap` returns `500`: update
  the extension and run “Update and rebuild” so the edge configuration is
  synchronized and the edge container is recreated. Inspect the backend logs
  for `Cannot send secure cookie over unencrypted connection`; the public HTTPS
  forwarding header must reach the backend. Production cookies remain `Secure`
  with `SameSite=None`.
- Login works but realtime does not: verify `/socket.io/` reaches the backend
  and that Nginx WebSocket upgrades are enabled.
- Voice/video does not connect: verify TCP `7881` and UDP `7882` are allowed by
  the host and upstream firewall.
- Files return `403`: do not add a path rewrite to `/files/`; signed S3 paths,
  query parameters and the public host must remain unchanged.
