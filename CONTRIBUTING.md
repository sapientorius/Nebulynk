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
npm run build:frontend
npm run test:e2e
```

Before a release candidate, run the full local pipeline:

```bash
npm run ci
```

If a local machine cannot run a check, include the attempted command, the reason
it could not run, and the closest focused fallback in the pull request.
