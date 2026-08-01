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
