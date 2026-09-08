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

Source assertions establish only static conventions. The complete inventory and
replacement/defer decisions are in [AP-03 test contracts](AP_03_TEST_CONTRACTS.md),
with original assertions in its JSON companion. DOM tests prove component
interactions, not browser layout, cookie sessions or actual media delivery.
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
separately from the existing backend unit-test glob. The current `npm run ci`
does not include this new integration suite or browser E2E; run these explicitly
when changing the message-create or reminder contracts.

AP-03 also tests private membership, all three meeting-history policies,
single/batch consistency and actual SQL query budgets. Harness tests inject
migration/test failures and verify cleanup without modifying the admin
database. GitHub's required `postgres-integration` job runs the same suite with
its own PostgreSQL 17 service and explicit isolation confirmation. AP-06 owns
the remaining consolidation of the local and GitHub aggregate commands.

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
and cancellation surviving a reload. See [AP-02 handoff](AP_02_HANDOFF.md) for
the consistency boundary, upgrade procedure, and verification evidence.
