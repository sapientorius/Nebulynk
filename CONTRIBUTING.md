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

Run the existing local pipeline as well:

```bash
npm run ci
```

`lint` is semantic ESLint/Vue analysis. Frontend tests include separate Node and
rendered-component projects; static source tests are explicitly labelled.
PostgreSQL integration requires a disposable PostgreSQL 17 instance, an explicit
`NEBULYNK_TEST_POSTGRES_URL`, and `NEBULYNK_TEST_POSTGRES_ISOLATED=true`.
Missing infrastructure fails the integration suite rather than skipping it.
See the [engineering playbook](docs/engineering-playbook.md) for isolated setup.

The current `ci` aggregate does not include PostgreSQL integration, browser E2E
or all GitHub security scans. Its success is not a full CI acceptance result;
run and report relevant additional checks separately. Normal commands need no
RTK installation; explicit `:rtk` variants are available for local use.

If a local machine cannot run a check, include the attempted command, the reason
it could not run, and the closest focused fallback in the pull request.
