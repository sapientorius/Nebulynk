# Secure Self-Hosting

This guide covers the minimum operational expectations for an internet-facing
Nebulynk instance.

## Secrets and Configuration

- Use unique, high-entropy secrets for authentication, databases, storage,
  mail, push, media, and AI integrations.
- Store secrets in the deployment environment or a dedicated secret manager;
  never commit them, include them in support requests, or expose them to
  browser clients.
- Rotate credentials after suspected exposure, operator handover, or copying a
  deployment into another environment.

## Network and Transport

- Terminate all public traffic with TLS and configure the reverse proxy to
  preserve the original HTTPS scheme for the backend.
- Expose only the services that clients need. Keep database, cache, storage
  administration, and internal media-control interfaces private.
- Configure every public application, storage, and media origin explicitly.

## Accounts and Data

- Use secure session cookies, CSRF protections, and rate limiting for public
  authentication and recovery flows.
- Enable only the guest, invite, and public-access features your deployment
  needs.
- Back up database and object storage, test restoration in an isolated
  environment, and protect backup access as carefully as production access.

## Integrations

- Keep AI-provider, SMTP, storage, push, and media credentials backend-only.
- Use trusted HTTPS endpoints for external providers and review any custom
  endpoint before allowing the application to connect to it.
- Review logs and error reporting for accidental credential or signed-URL
  exposure.

## Before Release

- Apply dependency and operating-system security updates.
- Run the browser checks in [Browser Security Guidance](security-browser-validation.md).
- Confirm that vulnerability reports can be sent through the channels in
  [SECURITY.md](../SECURITY.md).
