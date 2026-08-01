# Architecture Overview

Nebulynk is a web-first, self-hosted application with a separate frontend,
backend, and supporting data services.

## Components

- A Vue-based browser and PWA frontend.
- A realtime backend API that applies authentication, authorization, and data
  validation at the server boundary.
- PostgreSQL for application data, Redis for transient coordination and rate
  limiting, and S3-compatible storage for media.
- LiveKit for voice and meeting media when those features are enabled.
- An optional Windows push-to-talk helper that pairs only with an explicitly
  trusted browser or PWA origin.

## Design Principles

- Server-side permission checks scope data to the appropriate user,
  membership, or administrator role.
- Browser clients use authenticated sessions and communicate with the backend
  over HTTPS and secure realtime transports in production.
- Storage and external-provider credentials stay on the backend; clients
  receive only the data required for their authorized operation.
- Deployment-specific origins, secrets, and network topology are supplied by
  the operator rather than embedded in the application.

## Development

Project conventions and verification expectations are documented in
[Engineering Playbook](engineering-playbook.md). Operators should use
[Secure Self-Hosting](security-hardening.md) for production preparation.
