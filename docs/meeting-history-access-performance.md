# Meeting-Historienzugriff: Performance-Runbook

Die Berechtigungsprüfung für vergangene Meetings verwendet gebündelte Abfragen
und set-basierte SQL-Scopes. Es gibt bewusst keinen serverseitigen
Berechtigungs-Cache: Eine Änderung der Channel-Regel muss sofort wirksam sein.

## Query-Budgets

- Eine Meeting-Liste benötigt nach ihrer Basisabfrage höchstens zwei
  Berechtigungsabfragen; bei vorhandener `meeting_start_members`-Regel höchstens
  drei.
- Eine Channel-Leseprüfung lädt ihren vollständigen Kontext in einer Abfrage.
- Suche und Dateien verwenden einen nutzerbezogenen Semi-Join statt einer
  Berechtigungs-Subquery je Treffer.
- Start-Snapshots verarbeiten höchstens 500 Mitglieder pro Lese- und
  Insert-Batch.

## Benchmark auf einer isolierten Datenbank

1. Migrationen einschließlich `066_meeting_history_access_performance` ausführen.
2. Ausschließlich eine dedizierte Benchmark-Datenbank verwenden. Beide Skripte
   verweigern den Start ohne die explizite Isolierungsbestätigung.
3. Die Fixture erzeugen. Das Script schreibt ein Manifest mit Quell- und
   Meeting-Chat-IDs sowie vier Benchmark-Personas in das temporäre Verzeichnis.

   ```powershell
   $env:MEETING_HISTORY_BENCHMARK_CONFIRM='isolated-target'
   $env:MEETING_HISTORY_BENCHMARK_ISOLATED_DB='true'
   npm run seed:meeting-history-benchmark -- --apply
   ```

4. Backend gegen dieselbe isolierte Datenbank starten und den Benchmark mit dem
   ausgegebenen Manifest ausführen.

   ```powershell
   $env:MEETING_HISTORY_BENCHMARK_CONFIRM='isolated-target'
   $env:MEETING_HISTORY_BENCHMARK_ISOLATED_DB='true'
   $env:MEETING_HISTORY_BENCHMARK_MANIFEST_FILE='C:\Temp\nebulynk-meeting-history-benchmark.json'
   npm run benchmark:meeting-history
   ```

Der Benchmark führt zehn Sekunden Warm-up und 60 Sekunden Messung mit 100
parallelen Requests aus. Er gibt Durchsatz, Fehlerquote sowie p50/p95 aus; die
verbindliche Regressionserkennung erfolgt über die automatisierten
Query-Budget-Tests.

## Fehlende historische Snapshots

Migration 065 bleibt unverändert. Falls ein früherer Rollout unvollständig war,
kann der idempotente Backfill fehlende Snapshot-Zeilen in 500er-Seiten ergänzen.
Er verlangt eine explizite Bestätigung und speichert seinen Cursor standardmäßig
außerhalb des Repositories.

```powershell
$env:MEETING_HISTORY_BACKFILL_CONFIRM='missing-meeting-start-snapshots'
npm run backfill:meeting-start-members -- --apply
```
