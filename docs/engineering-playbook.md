# Engineering Playbook

## Principles

- Keep changes small, focused, and documented.
- Enforce authorization and data scope on the server, never only in the UI.
- Keep business logic out of presentation components where practical.
- Preserve stable public behavior and add regression coverage for behavior
  changes.

## Backend

- Validate external input at service boundaries.
- Use explicit authorization policies for reads, writes, and realtime events.
- Use transactions for multi-step operations that require consistency.
- Do not return credentials, private configuration, or data outside the
  caller's authorized scope.

## Frontend

- Keep components focused on rendering and interaction.
- Use stores and service modules for state and API orchestration.
- Use the shared icon system for functional controls and keep accessible labels
  available to assistive technology.

## Verification

### Full CI contract

`npm run ci` is full acceptance, locally and before a PR or stable release.
It runs the following groups sequentially and stops at the first failure:

| Group | Required checks |
| --- | --- |
| `ci:core` | CI runner regressions, ESLint, Dokploy template, i18n, release catalog and synchronized versions, backend units, all frontend projects, production build |
| `ci:integration` | Disposable PostgreSQL 17 and the complete backend integration suite |
| `ci:plesk` | Build/check the Plesk archive, all Plesk tests including the Linux cleanup fixture, Garage signed upload/download integration |
| `ci:e2e` | Disposable PostgreSQL/Redis/Garage and the complete Chromium suite, including onboarding dependencies, against the preview build |
| `ci:security` | Workspace/root dependency audit, full-history and working-source Gitleaks, Trivy vulnerabilities and misconfigurations |

`npm run ci:core` is the quick check without external test services. Its success
does **not** constitute full acceptance. Every group has a `:rtk` alias which
calls the same normal entry; GitHub, Docker and normal npm scripts need no RTK.
The existing `test:*` commands remain available for focused development.
`test:backend:lifecycle` and `benchmark:runtime` are optional AP-05 checks, not
part of this mandatory CI contract and not a media-capacity guarantee.

Prerequisites on Windows/PowerShell or Linux:

1. Node 22, at least 22.12, Git, and `npm ci` from the repository root.
2. A running **Linux** Docker engine and Docker Compose v2; image downloads need
   network access. Do not use a production Docker host.
3. `npm exec --workspace=frontend playwright install --with-deps chromium`.
4. Complete Git history for security. For a shallow checkout, run
   `git fetch --unshallow --tags`; CI checks out with `fetch-depth: 0`.

No database credentials need to be exported for the `ci:*` groups. Each runner
creates a uniquely named `nebulynk-ci-<group>-<id>` project, dedicated volumes,
and random localhost ports. Integration retains the existing explicit
`NEBULYNK_TEST_POSTGRES_ISOLATED=true` guard. Browser setup uses only its own
database and starts its own servers with reuse disabled. Its environment does
not inherit developer service settings. Backend and E2E reset support the
optional `NEBULYNK_ENV_FILE` path; the runner supplies an empty file. Without
that setting the normal root `.env` behavior is unchanged. The strict browser
run also disables frontend `.env` loading and uses zero retries both locally
and in GitHub; fake media remains a browser interaction fixture.

Missing Docker, Compose, Chromium, database readiness, or a scanner causes a
nonzero exit. Required Plesk tests cannot skip due to missing infrastructure.
Failure or an intercepted interrupt triggers cleanup of this run's resources;
cleanup failure is itself a failed group. After an uncatchable process/host
termination, use the logged exact project name to inspect and remove its own
containers and volumes. Never use a global Docker prune for test cleanup.

Service and test logs are under `output/ci/<project>/`, outside Playwright's
managed `frontend/test-results` and `frontend/playwright-report` directories.
GitHub uploads these diagnostics even after failure. A failed aggregate stops
later groups; run remaining groups separately when collecting complete failure
evidence, and do not describe that collection as a successful aggregate.

Security uses pinned `zricethezav/gitleaks:v8.24.3` and
`aquasec/trivy:0.70.0` images. The latter matches the engine default of the
previous [Trivy action](https://github.com/aquasecurity/trivy-action/blob/v0.36.0/action.yaml).
[Gitleaks](https://github.com/gitleaks/gitleaks/blob/v8.24.3/README.md) scans all
locally available Git refs and a disposable snapshot of current tracked source
plus new, non-ignored files, so unstaged new code is not silently omitted;
reports redact secret values. Trivy scans that source snapshot with
`vuln,misconfig`, `HIGH,CRITICAL`, `ignore-unfixed`, and exit code 1 on findings.
Generated outputs and private untracked `.env` files are not scan inputs.
The narrow `.gitleaks.toml` exceptions match both an exact fixture path and an
exact synthetic credential; they do not exclude test directories or commits.
All three scanners run even if one reports findings, but the scan group still
fails if any scanner fails. The npm audit
retains `--workspaces --include-workspace-root --audit-level=high`; lower-level
findings remain visible but do not fail this established threshold. Download,
tool and scanner failures are errors, not clean results.

GitHub calls these same groups through a reusable `workflow_call` workflow.
The final **CI required** status accepts only successful results from all five
groups; failure, cancellation and skipped dependencies cannot turn it green.
Maintainers should require this status in branch protection and retire obsolete
individual check names as appropriate; AP-06 does not edit repository settings.
Stable release publication requires both tag ancestry on `stable` and the full
reusable workflow. No release is needed to test the CI configuration. Report
local results, static workflow validation and actual GitHub runs separately.

Run the checks that cover the changed scope before submitting a contribution:

```bash
npm run lint
npm run test:backend
npm run test:frontend
npm run build:frontend
npm run test:e2e
```

Document material limitations in the pull request when a relevant check cannot
run locally.

### Static analysis and rendered components

`npm run lint` uses the shared `eslint.config.mjs`: JavaScript recommended
rules and Vue 3 essential rules, including undefined/unused bindings, duplicate
keys, unreachable code and invalid templates. It covers backend/frontend source,
tests, migrations, configuration and build scripts, plus root scripts. Node,
browser, service-worker and test globals are scoped separately. Build output,
reports and copied third-party assets are excluded; maintained translation
modules are checked. Unused positional callback arguments may use an underscore;
other exceptions must be local and justified. No formatting rewrite is required.

`npm run test:frontend` runs both Vitest projects: `node` for existing unit and
explicitly labelled static source checks, and `components` for rendered Vue SFCs
in jsdom. Use `npm run test:frontend:components` for the focused DOM suite, or
`npm run test:components --workspace=frontend`. Both have `:rtk` counterparts.
New DOM tests use `*.component.test.js`, the independent DOM setup and the shared
mount helper with real Pinia, router, translations and Naive UI providers.
Mock external requests/devices, not the handler or store decision being tested.
Clean up mounted trees, listeners, timers and owned object URLs.

Source assertions establish only static conventions and are not runtime proof.
The review's replacement/defer boundary is summarized in the [project review
summary](PROJECT_REVIEW_SUMMARY.md). DOM tests prove component interactions,
not browser layout, cookie sessions or actual media delivery.
Playwright remains necessary for those browser flows. The screenshare browser
test uses a synthetic canvas MediaStream and fake LiveKit, not a media-capacity
or real-device acceptance test.

### PostgreSQL message and reminder integration

`npm run test:backend:integration` runs the message attachment, transaction,
concurrency, forwarding, HTTP/JWT, and Socket.IO regression suite, plus reminder
delivery, concurrent service changes, access policies, and recovery migrations. The backend
workspace equivalent is `npm run test:integration --workspace=backend`. Both
have explicit `:rtk` variants; the normal scripts do not require RTK.

Set `NEBULYNK_TEST_POSTGRES_URL` explicitly to a disposable PostgreSQL 17 test
instance and confirm `NEBULYNK_TEST_POSTGRES_ISOLATED=true`. Both are required.
The test role needs permission to create and drop databases. Each
run creates a uniquely named `nebulynk_test_ap01_<runid>` database, applies the
real migrations, and drops only that database on cleanup. The helper never
loads the application `.env` or `knexfile.js`. Missing configuration or an
unreachable database fails the suite; tests are not silently skipped.
The runner limits each test to 60 seconds; database queries and lock waits
have shorter explicit timeouts.

For example, in local PowerShell:

```powershell
rtk docker run --detach --name nebulynk-postgres-test --publish 127.0.0.1::5432 --env POSTGRES_PASSWORD=local-test-password --tmpfs /var/lib/postgresql/data postgres:17-alpine
rtk docker port nebulynk-postgres-test 5432
# Replace PORT with the mapped localhost port printed above.
$env:NEBULYNK_TEST_POSTGRES_URL = 'postgresql://postgres:local-test-password@127.0.0.1:PORT/postgres'
$env:NEBULYNK_TEST_POSTGRES_ISOLATED = 'true'
rtk npm run test:backend:integration
# Remove only the test container created for this run.
rtk docker rm --force nebulynk-postgres-test
```

Never point this suite or the separate `e2e:reset-db` script at a development
or production database. Integration tests live under `backend/integration/`,
separately from the existing backend unit-test glob. The full `npm run ci`
includes this integration suite and browser E2E. `npm run ci:integration`
provisions its own disposable PostgreSQL service.

AP-03 also tests private membership, all three meeting-history policies,
single/batch consistency and actual SQL query budgets. Harness tests inject
migration/test failures and verify cleanup without modifying the admin
database. GitHub's required `postgres-integration` job runs the same suite with
its own PostgreSQL 17 service and explicit isolation confirmation through the
same `ci:integration` runner used locally.

Reminder tests terminate a worker connection in the disposable test database;
the test role must be allowed to terminate its own worker backend. Upgrade tests
create another isolated database at migration 070 before applying migration 071.
The old memory-only reminder tests have moved into this suite: they no longer
pretend to exercise rollback or locking in the unit-test database double.

The integration suite uses real PostgreSQL locks and deferred commit failures,
the registered message service, and real authentication and transports. S3
signing uses synthetic credentials with `storage.invalid`; storage copy/delete
and push calls are replaced at their external boundaries. Browser upload and
forwarding checks additionally need an isolated S3-compatible storage service.

For a focused browser run, pass filters directly to the frontend workspace so
the nested root npm script does not consume the Playwright arguments:

```powershell
rtk proxy npm run test:e2e --workspace=frontend -- --project=onboarding --grep 'setup and first login|invite accept flow|messaging path|forwarding a file message' --workers=1 --retries=0
```

For reminders, replace the final filter with `mobile message reminders`. That
browser test covers mobile layout, save, reload, reschedule with the same ID,
and cancellation surviving a reload. See the [project review summary](PROJECT_REVIEW_SUMMARY.md)
for the consistency boundary and remaining delivery limits.
