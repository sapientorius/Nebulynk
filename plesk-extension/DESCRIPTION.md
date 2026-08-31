# Nebulynk

Nebulynk is a self-hosted communication platform for business teams. This
extension deploys one Nebulynk instance on a Linux Plesk server using the local
Docker service and connects it to one existing Plesk domain.

The extension includes the Nebulynk source and builds the application images on
the target server. Docker Hub and npm registry access are required during the
initial installation and later source-based updates.

The deployment uses one domain for the application, API, realtime connection,
LiveKit signaling and signed S3 file URLs. LiveKit media still requires TCP
7881 and UDP 7882.
