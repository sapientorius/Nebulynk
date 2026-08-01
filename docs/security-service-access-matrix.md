# Access Model

Nebulynk applies authorization on the backend for every externally reachable
operation. The exact service and route inventory is maintained privately so it
can evolve without publishing an operational attack map.

## Public Access

Only intentionally public onboarding, authentication, account-recovery, and
meeting-invitation flows may be reachable without an authenticated account.
They must be rate-limited and must not reveal account existence or private
data.

## Authenticated Access

Member and guest access is limited by account type, membership, invitation
scope, and the permissions granted by the operator. Personal data,
notifications, files, messages, meetings, and AI artifacts are accessible only
within their authorized scope.

## Administrative Access

Administrative operations require explicitly granted elevated permissions.
Sensitive configuration, provider credentials, and system-wide management data
remain administrator-only and are never returned to ordinary clients.

Report suspected authorization issues privately through the channels in
[SECURITY.md](../SECURITY.md).
