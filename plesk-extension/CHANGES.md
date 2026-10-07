# Changes

## Next release

- Initial Linux x64 Plesk deployment with one-domain routing.
- Prebuilt GHCR backend, frontend and transcription-worker images at one fixed release.
- Deployment-only payload with verified image references and runtime frontend configuration.
- Configuration validation and image downloads before replacing the active installation.
- Download failures preserve the current deployment and environment; restart recreates containers.
- Persistent PostgreSQL, Redis and Garage data directories.
- Explicitly confirmed cleanup action for removing the deployment and its data.
- Clearer setup guidance, prerequisite checks and installation-time messaging.
- Official Nebulynk branding plus a prominent status-first operating view.
- Branded PWA icon in Plesk and classification under Web Apps & Site Editing.
