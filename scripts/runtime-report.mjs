function percentile(values, fraction) {
  if (!values.length) return null
  return [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)]
}
const format = (value) => Number.isFinite(value) ? value.toFixed(2) : 'n/a'
function memoryMiB(value) {
  const match = String(value).match(/^([\d.]+)(B|KiB|MiB|GiB|kB|MB|GB)/)
  if (!match) return 0
  const factors = { B: 1 / 1048576, KiB: 1 / 1024, MiB: 1, GiB: 1024, kB: 1000 / 1048576, MB: 1000000 / 1048576, GB: 1000000000 / 1048576 }
  return Number(match[1]) * factors[match[2]]
}

export function renderRuntimeReport({ project, report, dockerInfo, telemetry, nodeVersion, postgresVersion }) {
  const lines = ['# AP-05 local baseline', '', `Project: ${project}`, `Started: ${report.startedAt}`,
    `Mode: ${report.quick ? 'QUICK DIAGNOSTIC — not a baseline' : 'full baseline'}`,
    `Warm-up / measurement per stage: ${report.warmupMs / 1000}s / ${report.measurementMs / 1000}s`, '',
    '## Environment', '',
    `Docker ${dockerInfo.ServerVersion}; ${dockerInfo.OperatingSystem}; kernel ${dockerInfo.KernelVersion}.`,
    `Docker allocation: ${dockerInfo.NCPU} CPUs, ${format(dockerInfo.MemTotal / 1073741824)} GiB RAM. No additional container limits.`,
    `Node: ${nodeVersion.trim()}. PostgreSQL: ${postgresVersion.trim()}. Backend pool: min 2, max 10.`,
    'Fixture: 1,000 load users, 10 channels, 100,000 historical messages; additionally 1,001 meeting-history users, 1,000 meetings, 1,000 meeting messages.',
    'Other running local containers are listed in host-containers.jsonl. This is a local workstation measurement, not production sizing.', '',
    '## Measured stages', '', '| Users | Target passed | Operations/s | Error rate | Missing events | Persistence errors |',
    '| --- | --- | --- | --- | --- | --- |']
  for (const stage of report.stages) lines.push(`| ${stage.size} | ${stage.passed} | ${format(stage.operationsPerSecond)} | ${format(stage.errorRate * 100)}% | ${stage.missingEvents} | ${stage.correctnessErrors} |`)
  lines.push('', '| Users | Operation | Samples | p50 ms | p95 ms |', '| --- | --- | --- | --- | --- |')
  for (const stage of report.stages) {
    for (const [kind, latency] of Object.entries(stage.latencyMs)) lines.push(`| ${stage.size} | ${kind} | ${latency.count} | ${format(latency.p50)} | ${format(latency.p95)} |`)
  }
  lines.push('', 'Login/session samples cover initial admission; timeline/send/reconnect/event samples cover the measurement window. Throughput counts timeline, send and reconnect operations. Stage targets: login p95 <= 2s; timeline/send/event p95 <= 1s; errors < 1%; no missing events or persistence errors. Higher stages are not started after a failed target.', '')
  const resources = new Map()
  const database = []
  for (const sample of telemetry) {
    for (const line of sample.stats.trim().split('\n').filter(Boolean)) {
      const stat = JSON.parse(line)
      const role = ['backend', 'postgres', 'redis', 'garage', 'generator'].find((name) => stat.Name.includes(`-${name}`)) || stat.Name
      if (!resources.has(role)) resources.set(role, { cpu: [], memory: [] })
      resources.get(role).cpu.push(Number.parseFloat(stat.CPUPerc))
      resources.get(role).memory.push(memoryMiB(stat.MemUsage))
    }
    database.push(JSON.parse(sample.database))
  }
  lines.push('## Resource observations', '', 'Samples include initial login, the runtime stage and the separate history benchmark. Docker CPU 100% equals one logical CPU.', '',
    '| Container role | Samples | CPU p95 % | CPU peak % | Peak RAM MiB |', '| --- | --- | --- | --- | --- |')
  for (const [role, values] of resources) lines.push(`| ${role} | ${values.cpu.length} | ${format(percentile(values.cpu, .95))} | ${format(Math.max(...values.cpu))} | ${format(Math.max(...values.memory))} |`)
  if (database.length) {
    const first = database[0].database, last = database.at(-1).database
    lines.push('', `PostgreSQL peak connections: ${Math.max(...database.map((item) => item.database.numbackends))}; peak active queries (including the sampler): ${Math.max(...database.map((item) => item.activity.filter((row) => row.state === 'active').reduce((total, row) => total + Number(row.count), 0)))}; peak waiting locks: ${Math.max(...database.map((item) => Number(item.waitingLocks)))}.`,
      `Observed database deltas: ${last.xact_commit - first.xact_commit} commits, ${last.xact_rollback - first.xact_rollback} rollbacks, ${last.blks_read - first.blks_read} blocks read, ${last.blks_hit - first.blks_hit} buffer hits.`, '')
  }
  lines.push('## Limits and evidence', '', 'See runtime-results.json for samples/errors, telemetry.json for timestamped resource/database observations, container-config.json for actual container limits/images, and meeting-history.txt for the separate history run.',
    `Inactive integrations: ${report.disabled.join(', ')}. No WebRTC, video, transcription-provider or egress capacity claim.`, '')
  return lines.join('\n')
}
