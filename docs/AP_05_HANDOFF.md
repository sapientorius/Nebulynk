# Übergabe AP-05: Server-Lebenszyklus und Betriebsannahmen

Datum: 8. September 2026. Anwendungsversion weiterhin `0.5.1`.
Auftrag: AP-05 aus dem [Maßnahmenplan](PROJECT_REVIEW_ACTION_PLAN.md).

## Ergebnis und Entscheidungen

Die Backend-Runtime besitzt periodische Timer und laufende Promises. Alle sieben
Aufgaben aus dem App-Setup verwenden Wiederplanung nach Abschluss; initiale
Reminder-/KI-Läufe laufen über denselben Pfad. Readiness wartet auf Setup und
Listen, nicht auf einen langen initialen KI-Lauf. Der Update-Manager behält seine
Leasing-Logik und besitzt jetzt einen abwartbaren Stop.

`SIGTERM` und `SIGINT` starten genau einen Shutdown mit 60 Sekunden Gesamtbudget.
HTTP-Middleware und externe Feathers-Hooks erfassen Requests bis zum Ende ihrer
Arbeit, auch bei bereits getrenntem Client. Bereits angenommene Arbeit darf ihre
registrierten Folgearbeiten beenden. Recording-Starts und Channel-Login-Arbeit
sind erfasst. Presence entfernt eigene Listener und Timer; laufende Writes werden
abgewartet. Socket-Abbau erzeugt keine neue Presence-Disconnect-Arbeit.

Socket.IO besitzt den Abschluss des manuell erzeugten HTTP-Servers; Koa erhält
keine zweite Eigentümerschaft über `app.server`. Nach Requests/Jobs und Presence
wird der Dispatcher vollständig drainiert, auch bei bereits aktivem Batch.
Service-Teardown bleibt Middleware mit `await next()`. Anschließend schließen
Storage-Clients, Redis/Rate-Limiter und zuletzt PostgreSQL. Cleanup-Fehler einer
Ressource verhindern nicht das Schließen der weiteren Ressourcen.

Bei Deadline-Überschreitung werden ausstehende Runtime-Aufgaben protokolliert und
der Prozess mit Exit 1 beendet; der Pool wird nicht vorher unter laufenden Jobs
geschlossen. Erfolgreicher Stop endet mit Exit 0. Ein Runtime-Objekt kann nach
Stop nicht erneut gestartet werden. Setup-Fehler durchlaufen den Cleanup-Pfad.

Neu ist `GET /health/ready`: HTTP 200 mit `status: ready`, sonst HTTP 503 mit dem
Lifecycle-Zustand. Neue externe Arbeit wird während des Stops abgewiesen. Keine
fachlichen API-Antworten, Reminder-Transaktionen, Migrationen oder Versionen wurden
geändert. Push-/Socket-Seiteneffekte bleiben ohne dauerhafte Outbox Best Effort.

## Geänderte Bereiche

| Bereich | Zweck |
| --- | --- |
| Runtime, Server-Controller und Runtime-Teardown | Timer-/Promise-Verwaltung, Admission, Signale, Cleanup-Reihenfolge |
| App, Presence, Channel-Login, Voice, Dispatcher, Update-/Storage-Manager | Bestehende Arbeit in den Lebenszyklus einbinden |
| Backend-Dockerfile und fünf Deployment-/Template-Compose-Dateien | Node direkt starten, 75 Sekunden Stop-Frist, Readiness-Healthcheck mit konfiguriertem Port |
| Isolierter Test-Container, Linux-Prozess-/Recovery-Tests und Runtime-Tests | Tatsächliche Transport-, Deadline-, Rollback- und Wiederaufnahmenachweise |
| Lastfixture, Generator, Runner und Berichtsgenerator | Reproduzierbare lokale Baseline mit Rohdaten und Ressourcenmessung |
| Bestehender Meeting-Historienbenchmark | Fehlendes Pflichtfeld `language` ergänzen; autorisierte Persona pro Historienpolicy verwenden, statt erwartete 403 als Lastfehler zu zählen |
| Self-Hosting, Dokploy, Coolify, Plesk, Architektur und Runtime-Runbook | Eininstanzbetrieb und Stop-before-start verbindlich dokumentieren |

Neue Root-Befehle: `test:backend:lifecycle` und `benchmark:runtime`, jeweils mit
`:rtk`-Variante. Keine neuen Paketabhängigkeiten. Der Dokploy-Import wurde
regeneriert; der Kanal bleibt `stable`. Keine Veröffentlichung oder Deployment.

## Verifikation

| Prüfung | Tatsächliches Ergebnis |
| --- | --- |
| `rtk proxy npm run ci` | Exit 0: 631 Backend-Tests, 697 Frontend-Tests in 148 Dateien, Build, Lint, i18n, Dokploy und Plesk/Garage |
| `rtk proxy npm run test:backend:lifecycle` | Exit 0: 24 Lifecycle-/Dispatcher-/Presence-/Linux-/Recovery-Prüfungen und 89 PostgreSQL-Integrationstests |
| Tatsächlicher Backend-Entrypoint mit offenem Socket | Exit 0 nach 993 ms; Neustart erreicht wieder Readiness |
| Vorhandene Playwright-Browserregressionen | Vier bestanden, keine Retries: erster Login, Einladung, Nachrichten und mobile Reminder |
| `rtk npm run dokploy:template:check` | Exit 0 nach Regeneration |

Der endgültige Lifecycle-Lauf liegt unter
`output/ap05/nebulynk-ap05-782f62e71860/`. Auch ein Setup-Fehler nach bereits
empfangenem Stop-Signal bewahrt Exit 1 und genau einen Teardown.
Ein PostgreSQL-Advisory-Lock blockiert
den Reminder vor Commit; das Shutdown-Budget beendet den Worker, PostgreSQL rollt
zurück und ein neuer Prozess liefert genau einmal. Eine synthetisch blockierte
Summary bleibt nach Deadline-Abbruch wiederaufnehmbar und erreicht im neuen
Prozess `ready`. Externe KI-/Medienanbieter werden dabei nicht kontaktiert.

Die Browser liefen gegen eigene PostgreSQL-/Redis-/Garage-Container mit der
Datenbank `nebulynk_ap05_e2e`, Backend-Port 33075 und Frontend-Port 4173. Effektiver
Playwright-Aufruf:

```sh
node node_modules/@playwright/test/cli.js test --config=frontend/playwright.config.js --project=onboarding --grep "setup and first login|invite accept flow|messaging path|mobile message reminders" --reporter=line --workers=1 --retries=0
```

Browser-Artefakte und Ausgabe:
`output/playwright/nebulynk-ap05-e2e-1788881832163/`. Die vier Tests bestanden,
anschließend schlug der temporäre Wrapper beim Cleanup fehl, weil Playwright
seine im Ausgabeordner abgelegte Compose-Konfiguration entfernt hatte. Die
eigenen Container/Volumes wurden anschließend gezielt erfolgreich entfernt.
Es wurde keine Entwicklerdatenbank zurückgesetzt.

Ein vorhandener Plesk-Test meldete im lokalen CI-Lauf einen Infrastruktur-Skip
(`requires a Linux Docker daemon`). Die separate Plesk/Garage-Integration bestand.
Das ist kein vollständig ausgeführter Security-/GitHub-Actions-Nachweis.

Während der Entwicklung korrigierte Fixture-/Runner-Probleme: ausgeschlossene
Docker-Testhelper, fehlende Pflichtfelder in Meeting-/Reminder-Fixtures und
Session-Token-/Socket-Acknowledgement-Behandlung im neuen Lastgenerator. Frühere
Diagnoseläufe sind keine Basismessungen. Node-/Docker-/Browser-Prüfungen liefen
über den vorgesehenen Ausführungsweg außerhalb der Sandbox.

## Kapazität und verbleibende Grenzen

Die [gemessene Baseline](AP_05_BASELINE.md) liegt vor. Bei 100 gleichzeitigen
Nutzern überschreitet Login-p95 mit 3,79 Sekunden die Grenze von 2 Sekunden.
Timeline, Nachrichten und Events bleiben unter einer Sekunde; null Request-,
Zustell- oder Persistenzfehler. 500 und 1.000 Nutzer wurden deshalb planmäßig
nicht gestartet. Der separate korrigierte Historienlauf erreicht 179,46 Requests/s
bei p95 913,21 ms und null Fehlern. AP-05 ist mit dieser dokumentierten lokalen
Messgrenze abgeschlossen; daraus folgt keine bestandene 100-Nutzer-Kapazitätszusage.
Der Basisbericht nennt Rohdaten, Hardware, konkurrierende Container sowie die
einzelne Telemetrielücke am Ende des ersten Laufs und ihre Runner-Korrektur.

Mehrinstanzbetrieb, überlappende Deployments, echte Video-/WebRTC-/Egress-Last,
externe KI-Durchsatzmessungen und produktionsrepräsentatives Sizing bleiben
außerhalb der nachgewiesenen Kapazität. Ein nicht bestandenes Lastziel wird als
Messgrenze dokumentiert und nicht durch einen grünen Testlauf verdeckt.

AP-06 muss die neuen optionalen Lifecycle-/Lasttest-Einstiege in seiner
Prüfumfangsdokumentation berücksichtigen; das bestehende `ci`-Aggregat wurde in
AP-05 nicht neu definiert.
