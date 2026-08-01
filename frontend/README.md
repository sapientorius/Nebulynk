# Nebulynk Frontend

The Nebulynk frontend is a Vue and Vite browser application.

## Development

```bash
npm run dev --workspace=frontend
```

## Build

```bash
npm run build --workspace=frontend
```

## Testing

Run the relevant frontend checks from the repository root:

```bash
npm run test:frontend
npm run test:e2e
npm run build:frontend
```

The frontend supports English and German. User-facing text belongs in the
shared translation catalogs, and accessibility should be considered for every
new interaction.
