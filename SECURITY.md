# Security Policy

Nebulynk security reports must be handled confidentially. Do not publish
exploit details, deployment information, credentials, or affected-user data in
public issues or discussions.

## Reporting a Vulnerability

Use either of these private channels:

1. GitHub Private Vulnerability Reporting from this repository's **Security**
   tab, when it is enabled.
2. Email [info@nebulynk.net](mailto:info@nebulynk.net) with the subject
   `Nebulynk security report`.

Please include the affected version or commit, reproduction steps, expected
impact, and sanitized logs or proof of concept. Do not send passwords, API
keys, access tokens, or unredacted production data.

## Supported Scope

The public self-hosted release covers the backend API and realtime behavior,
browser frontend, self-hosting configuration, supporting data services, media
integration, and the optional Windows push-to-talk helper.

## Operator Guidance

Before exposing an instance publicly, review:

- [Secure Self-Hosting](docs/security-hardening.md)
- [Browser Security Guidance](docs/security-browser-validation.md)
- [Access Model](docs/security-service-access-matrix.md)
