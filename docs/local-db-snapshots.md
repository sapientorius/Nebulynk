# Local DB Snapshots

This workflow lets you hop between branches with incompatible migration histories without losing your preferred local database states.

## Commands

```bash
npm run db:snapshot:list
npm run db:snapshot:save -- <name>
npm run db:snapshot:restore -- <name>
npm run db:snapshot:delete -- <name>
```

Snapshots are stored in `.local/db-snapshots/` and are local-only.

## Recommended Workflow

### 1. Save your current branch state

Before switching away from a working branch:

```bash
npm run db:snapshot:save -- latest-working
```

You can use more specific names like `main-before-transcription-retry` or `feature-old-baseline`.

### 2. Switch to another branch

Check out the older or alternate branch in Git.

### 3. Restore that branch's database state

If you already saved a snapshot for that branch:

```bash
npm run db:snapshot:restore -- feature-old-baseline
```

Then start the backend again.

### 4. First-time setup for a branch

If the branch does not have a snapshot yet:

1. Stop the backend.
2. Bring the database into a valid state for that branch once.
3. Start the backend and let its migrations finish.
4. Save that result as a named snapshot:

```bash
npm run db:snapshot:save -- feature-old-baseline
```

After that, you can switch back and forth by restoring the matching snapshot.

## Important Notes

- `restore` replaces the current contents of your local `POSTGRES_DB`.
- Stop the local backend before restore so it does not reconnect during the reset.
- The script starts the `postgres` Docker Compose service automatically if needed.
- The restore flow clears `public` and then imports the selected snapshot, so the result is deterministic.
- This workflow is intended for local development only.
