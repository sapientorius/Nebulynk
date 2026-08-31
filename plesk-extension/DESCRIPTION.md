# Nebulynk

Nebulynk is a self-hosted collaboration workspace for teams that want modern
communication while keeping their data and infrastructure under their own
control. It brings team chat with channels and direct messages, file sharing
and search, voice and video meetings, screen sharing, notifications, and
optional AI-assisted transcription, meeting summaries, and follow-up into one
place. AI features use a bring-your-own-key (BYOK) model, so the operator
chooses the provider and keeps the credentials under their control.

This Plesk extension deploys one complete Nebulynk instance on Plesk Obsidian
for Linux x64. It uses the server's local Docker service and connects the
installation to one dedicated existing Plesk domain or subdomain. The
extension provisions the bundled source, generates production configuration,
manages the Docker Compose project, and adds the Plesk Nginx proxy rule.

The resulting workspace includes the web application and API, realtime
Socket.IO connections, PostgreSQL, Redis, Garage S3-compatible file storage,
LiveKit voice/video infrastructure, and a local edge proxy. The application,
API, realtime connection, LiveKit signaling, and signed file URLs are exposed
under the same HTTPS domain.

## What to expect

- The first installation is source-based: Docker images are pulled, npm
  dependencies are installed, and the backend and frontend images are built on
  the target server. Allow several minutes and provide outbound access to
  Docker Hub and the npm registry.
- Before installation, install the Plesk Docker Extension, verify that the
  local Docker service is running, enable Nginx, and prepare a dedicated domain
  or subdomain with DNS and a valid TLS certificate.
- The selected domain is dedicated to Nebulynk. Existing website content at
  that domain's root is no longer served after deployment.
- LiveKit media requires inbound TCP port 7881 and UDP port 7882 in addition to
  normal HTTPS access.
- Configuration and persistent PostgreSQL, Redis, and file-storage data are
  kept below `/opt/nebulynk-plesk`. Plesk's normal backups do not include this
  Docker data, so configure an external backup for production use.
- Re-uploading a newer extension package and running **Update and rebuild**
  rebuilds the application images while preserving the deployment data.

The extension is intended for one Nebulynk instance per Plesk Linux x64
server. See the [Plesk deployment guide](https://github.com/sapientorius/Nebulynk/blob/stable/docs/PLESK.md) for the complete
prerequisites, installation flow, storage locations, and troubleshooting steps.
Nebulynk is source-available under the Business Source License 1.1; the full
terms are in the project's [LICENSE](https://github.com/sapientorius/Nebulynk/blob/stable/LICENSE).
