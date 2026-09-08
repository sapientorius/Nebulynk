export async function teardownRuntime(app, next) {
  const runtime = app.get('runtime')
  runtime.quiesce()
  app.get('presenceController')?.quiesce()
  app.get('platformUpdateManager')?.quiesce()
  // Keep all producer work alive until it settles. No pool cleanup on timeout:
  // the process controller owns the single deadline and forced exit.
  await Promise.all([
    app.get('presenceController')?.stop(),
    runtime.stop()
  ])
  await app.get('platformUpdateManager')?.stop()
  await app.get('notificationSideEffectsDispatcher')?.stop()
  const errors = []
  async function close(work) {
    try { await work() } catch (error) { errors.push(error) }
  }
  await close(next)
  await close(() => app.get('storageUsageManager')?.stop())
  for (const client of app.get('ownedStorageClients') || []) await close(() => client.destroy?.())
  await close(() => app.get('rateLimiter')?.close())
  await close(() => app.get('postgresqlClient')?.destroy())
  if (errors.length) throw new AggregateError(errors, 'Runtime cleanup failed')
}
