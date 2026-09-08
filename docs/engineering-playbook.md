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

### PostgreSQL message integration

`npm run test:backend:integration` runs the message attachment, transaction,
concurrency, forwarding, HTTP/JWT, and Socket.IO regression suite. The backend
workspace equivalent is `npm run test:integration --workspace=backend`. Both
have explicit `:rtk` variants; the normal scripts do not require RTK.

Set `NEBULYNK_TEST_POSTGRES_URL` explicitly to a disposable PostgreSQL 17 test
instance. The test role needs permission to create and drop databases. Each
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
rtk npm run test:backend:integration
# Remove only the test container created for this run.
rtk docker rm --force nebulynk-postgres-test
```

Never point this suite or the separate `e2e:reset-db` script at a development
or production database. Integration tests live under `backend/integration/`,
separately from the existing backend unit-test glob. The current `npm run ci`
does not include this new integration suite or browser E2E; run these explicitly
when changing the message-create contract.

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
