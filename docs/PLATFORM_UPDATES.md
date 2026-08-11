# Platform update information architecture

Nebulynk's platform update subsystem is informational only. It cannot install
an update, trigger a deployment, or call Coolify. The implementation lives in
`backend/src/lib/platform-updates.js`; release publication is documented in
`RELEASING.md`.

## Data flow and trust boundary

The backend downloads the complete stable index from the fixed production URL
`https://updates.nebulynk.net/v1/index.json`. Requests contain neither an
instance identifier nor the installed version.
The backend verifies the Ed25519 signature with the
embedded keyring, rejects sequence rollback, then downloads only changed
release documents and verifies their SHA-256 digests. The installed package
SemVer is compared locally.

The checker runs after startup and then hourly with jitter. ETags, a ten-second
timeout, response-size limits, exponential backoff, and a database lease bound
network and multi-replica load. The lease remains held through security email
processing, so concurrent checks cannot duplicate a digest. A failed request
preserves the last verified cache and can still retry pending mail from that
cache.

## Persistence

Migration `062_platform_updates.js` creates:

- the singleton checker state, verified cache, sequence, ETag, backoff, and
  expiring lease;
- acknowledgements keyed by administrator, installed version, release version,
  and release revision;
- security email delivery attempts with successful-send deduplication; and
- database-enforced append-only enable/disable audit events.

A detected downgrade clears acknowledgements and successful-mail
deduplication before the next fetch so newly open releases are visible again.

## Private administrator API

- `GET /platform-updates` — system administrators only;
- `POST /platform-updates/check` — throttled manual check for any system
  administrator, returning `409` while checks are disabled;
- `POST /platform-updates/acknowledgements` — per-administrator acknowledgement
  of selected outstanding versions;
- `PATCH /platform-updates/settings` — platform owner only; and
- `POST /platform-updates/settings/passkey-options` — platform-owner passkey
  reauthentication options.

Disabling requires the exact phrase `DISABLE_UPDATE_CHECKS` and current
password or a registered passkey. The server verifies role, phrase,
reauthentication, and rate limits independently of the UI. Reenabling needs no
risk phrase and starts an immediate check.

## Security notification behavior

Every outstanding advisory is evaluated against the installed SemVer. New
applicable advisories are bundled into one localized message per active,
non-disabled member with `is_admin=true`; recipients are sent separately.
Only an accepted SMTP delivery is considered sent. Failed and unconfigured
SMTP states do not fail the feed check and remain retryable. The platform owner
sees both missing SMTP and recorded delivery failures in the update center.

Acknowledgement hides the banner and badge only for that administrator. It
never changes the objective update state in the update center and never marks
security email as delivered.
