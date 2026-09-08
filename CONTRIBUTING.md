# Contributing

Thanks for taking the time to improve Nebulynk.

## Contribution Licensing

By submitting a contribution to Nebulynk, you confirm that you have the right to
submit it and that it does not knowingly violate third-party rights.

Unless a separate written agreement says otherwise, you license your
contribution to the Nebulynk project under the same license terms that apply to
the project files you change. You also grant the project maintainer a
perpetual, worldwide, non-exclusive, royalty-free, sublicensable right to use,
modify, distribute, make derivative works from, and license your contribution as
part of Nebulynk, including under commercial licenses and future project
licenses. You retain copyright in your contribution.

If you cannot or do not want to grant these rights, say so clearly before
submitting the contribution.

## Development Setup

```bash
npm ci
npm run dev
```

The repository is a JavaScript monorepo with a FeathersJS backend, Vue 3
frontend, and optional Windows push-to-talk helper.

## Engineering Guidelines

- Use modern ES6+ JavaScript; TypeScript is not part of the current codebase.
- Keep Vue components on the Options API.
- Keep business logic in stores, services, or domain modules rather than large UI components.
- Keep permission checks explicit and server-side.
- Prefer small, focused changes with regression coverage.
- Update documentation when behavior, architecture, configuration, or public setup changes.

## Verification

Run the checks that match the changed scope:

```bash
npm run lint
npm run test:backend
npm run test:frontend
npm run test:frontend:components
npm run test:backend:integration
npm run build:frontend
npm run test:e2e
```

The quick, infrastructure-free product check is:

```bash
npm run ci:core
```

`lint` is semantic ESLint/Vue analysis. Frontend tests include separate Node and
rendered-component projects; static source tests are explicitly labelled.
PostgreSQL integration requires a disposable PostgreSQL 17 instance, an explicit
`NEBULYNK_TEST_POSTGRES_URL`, and `NEBULYNK_TEST_POSTGRES_ISOLATED=true`.
Missing infrastructure fails the integration suite rather than skipping it.
See the [engineering playbook](docs/engineering-playbook.md) for isolated setup.

Full acceptance uses `npm run ci`: core, PostgreSQL integration, Plesk/Garage,
the complete browser suite, and security. Use Node 22 (at least 22.12), run
`npm ci`, install Chromium with
`npm exec --workspace=frontend playwright install --with-deps chromium`, and
start Docker with a Linux engine and Compose. Integration and browser groups
create disposable services automatically; do not configure them with developer
database credentials. Security also requires Git, complete Git history, and
network access for the audit, scanner images and vulnerability database.
Missing prerequisites or failed cleanup fail acceptance rather than skipping.

Each group is independently runnable: `ci:core`, `ci:integration`, `ci:plesk`,
`ci:e2e`, and `ci:security`. `ci:core` success alone is not full acceptance.
Normal commands need no RTK; each group has a `:rtk` counterpart calling the
same normal script. GitHub and release validation use these same groups.
See the [engineering playbook](docs/engineering-playbook.md#full-ci-contract)
for diagnostics, scan scope and the required GitHub status.

If a local machine cannot run a check, include the attempted command, the reason
it could not run, and the closest focused fallback in the pull request.
