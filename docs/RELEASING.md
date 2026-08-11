# Publishing Nebulynk platform releases

Nebulynk platform releases use one machine-readable source in
`releases/vX.Y.Z.json`. Root, backend, and frontend package versions must match
the newest stable document. Desktop and PTT components keep their own release
cycle.

The publication chain is:

`release metadata -> schema and CI -> Ed25519 signature -> GitHub release -> signed Pages feed`

## One-time trust setup

1. Protect the `stable` branch and immutable `vX.Y.Z` tags with GitHub
   rulesets. Require pull-request reviews and the complete CI workflow. Do not
   use `main` as a production deployment source.
2. Create a protected GitHub environment named `release-production`, require
   manual approval, and restrict it to stable release tags.
3. Generate an Ed25519 key outside the checkout on a trusted administrator
   workstation:

   ```bash
   npm run release:keygen -- /secure/offline/nebulynk-update-key update-2026-01
   ```

   The command refuses to store the key inside the repository and refuses to
   overwrite an existing key. Copy only the private PEM to the environment
   secret `UPDATE_FEED_SIGNING_PRIVATE_KEY`. Set environment variable
   `UPDATE_FEED_SIGNING_KEY_ID` to the key ID and
   `UPDATE_FEED_PUBLIC_KEYS_JSON` to the generated keyring JSON. Copy the same
   public JSON to `backend/config/platform-update-public-keys.json` and commit
   it before tagging the release. The workflow requires the active protected
   key to match this embedded key exactly. Never copy the private PEM into
   source, build artifacts, logs, or ordinary repository secrets.
4. Configure GitHub Pages to use GitHub Actions and add the verified custom
   domain `updates.nebulynk.net`. Configure DNS and HTTPS before the first
   release.

Key rotation is overlapping: add the new public key to the embedded JSON
keyring, publish a release still signed by the old key, and let supported
installations receive that release first. Then switch the protected signing
key ID and private key. Retain the old public key until every supported
installation has received the new keyring.

## Preparing a release

1. Create `releases/vX.Y.Z.json` from `releases/schema-v1.json`, increment the
   global `sequence` in `releases/catalog.json`, and set the release `revision`
   to `1`. A corrected document keeps the version, increments its revision,
   and also increments the catalog sequence.
2. Classify every change explicitly. Security advisories are never inferred
   from commit messages. Every advisory must contain severity, affected SemVer
   range, an English summary, and optionally a CVE and HTTPS advisory URL. Use
   an explicit empty `security: []` when there is no security fix. English is
   the only required release language; historical German fields remain
   accepted but are not used for published notes or the update center.
3. Update the root, backend, and frontend versions to exactly the same stable
   SemVer. Do not add a prerelease document to the stable catalog.
4. Run:

   ```bash
   npm run release:validate
   npm run ci
   ```

5. Merge the reviewed commit into `stable`, then create the immutable tag on
   that exact commit. Pushing the tag starts `.github/workflows/release.yml`.

The release workflow verifies that the tag is on `stable`, reruns CI, signs
the exact catalog bytes in the protected environment, verifies the result
against the configured public keyring, requires its sequence to advance the
currently published signed feed, creates English GitHub release notes and a
changelog, adds legacy German compatibility fields to new feed documents, and
finally deploys the feed. Missing metadata, version drift,
prereleases, a missing key, a rollback, or an unverifiable signature stop
publication.

## Operational guarantees

- The stable feed contains no instance identifier, domain, user count, or
  installed version. Instances download the complete index and compare it
  locally.
- The update center is informational. Publication never triggers application
  installation or a Coolify deployment.
- `0.1.0` is the historical baseline. `0.2.0` is the first release containing
  the checker; installations older than it require a one-time out-of-band
  announcement and manual update.
