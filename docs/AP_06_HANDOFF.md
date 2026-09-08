# Übergabe AP-06: Einheitliche lokale und GitHub-Prüfungen

Stand: 8. September 2026. Ausgangscommit `d13031e`, Anwendungsversion `0.5.1`.
Die Umsetzung und der vollständige lokale CI-Lauf sind erfolgreich verifiziert.
Ein tatsächlicher GitHub-Lauf dieses Arbeitsstands bleibt offen.

## Ergebnis und gemeinsame Schnittstellen

`npm run ci` verlangt Core, PostgreSQL-Integration, Plesk/Garage, vollständige
Browser-E2E und Security. `ci:core` ist ausdrücklich nur die Schnellprüfung.
Die Root-Scripts definieren den fachlichen Umfang. Die neuen Gruppen,
`test:ci` und `security:scans` besitzen jeweils eine `:rtk`-Variante, die den
normalen Einstieg aufruft; normale Scripts benötigen kein RTK.

Die Runner erzeugen eigene Compose-Projekte, Volumes und localhostgebundene
Ports. Tests übernehmen keine Entwickler-Dienstadressen oder Zugangsdaten.
`NEBULYNK_ENV_FILE` ist ein optionaler Dateipfad für Backend und E2E-Reset;
ohne ihn bleibt das bestehende `.env`-Verhalten erhalten. Im vollständigen
Browserlauf sind Entwickler-Env-Dateien, externe Server, Serverwiederverwendung
und Retries ausgeschlossen. Logs liegen außerhalb der von Playwright
bereinigten Verzeichnisse unter `output/ci/<Projekt>/`.

Aufbau-, Prüfungs-, Scanner- und Cleanup-Fehler ergeben Exit ungleich null.
Abfangbare Stop-Signale brechen gestartete Prüfprozesse ab und lösen das
Aufräumen der eigenen Ressourcen aus. Ein uncatchbarer Prozess-/Hostabbruch
kann weiterhin manuelles Cleanup anhand des protokollierten Projektnamens
erfordern. Der Plesk-Test prüft die Docker-Engine statt des Host-Betriebssystems;
im verbindlichen Einstieg ist kein Infrastruktur-Skip mehr zulässig. Seine
Linux-Shell-Fixture normalisiert Windows-Zeilenenden in einer temporären Kopie.

Der wiederverwendbare GitHub-Workflow ruft dieselben fünf Gruppen auf. Der
abschließende Status **CI required** wird nur grün, wenn alle Gruppen erfolgreich
sind. Der Release-Workflow verlangt zusätzlich weiterhin die Tag-Zugehörigkeit
zu `stable`; erst danach dürfen Signierung und Veröffentlichung beginnen.
Branch Protection wurde nicht geändert. Maintainer müssen den neuen
Gesamtstatus bei Bedarf als Pflichtstatus konfigurieren.

## Geänderte Bereiche und Entscheidungen

| Bereich | Änderung |
| --- | --- |
| Root-Paket und Lockfile | Gemeinsame Gruppen und RTK-Aliase; ausschließlich `fast-uri` von 4.1.2 auf 4.1.4 aktualisiert |
| `scripts/ci-support*`, `run-ci-services.mjs`, `ci-services.compose.yml` | Plattformübergreifende Prozesse, Isolation, Bereitschaft, Fehlerweitergabe, Cleanup und Regressionstests |
| `scripts/run-ci-security.mjs`, `.gitleaks.toml` | Fest versionierte Scanner, vollständiger Git-Mirror, Snapshot des Arbeitsstands, redigierte Reports und präzise Testwert-Ausnahmen |
| Backend-Env-Lader, Playwright- und Vite-Konfiguration | Vollständige Browserprüfung gegen eigene Dienste und Preview-Build |
| Plesk-Test-Fixtures | Linux-Engine-Erkennung, LF-Fixture, eigener Ressourcenbesitz und wirksame Cleanup-Fehler |
| AP-05-Testimage und Runtime-Test-Compose/-Runner | Unprivilegierter Standardbenutzer und zur Report-Dateieigentümerschaft passende Test-UID/GID |
| GitHub CI und Release | Wiederverwendbare Prüfgruppen, Diagnostik-Uploads und vollständige Release-Gates |
| Contributor-Dokumentation und Engineering Playbook | Prüfumfang, Installation, Einzelgruppen, Fehlerinterpretation und verbleibende Grenzen |

Der neue Pflicht-Audit fand hohe `fast-uri`-Befunde. Das gezielte Patchupdate
entfernt sie; ein niedriger SimpleWebAuthn- und ein moderater `qs`-Befund bleiben
sichtbar und liegen unter der unveränderten Audit-Schwelle `high`.

Gitleaks 8.24.3 prüft alle lokal verfügbaren Git-Refs sowie versionierte aktuelle
Dateien und neue, nicht ignorierte Dateien. Private `.env`-Dateien und generierte
Artefakte sind keine Snapshot-Eingaben. Vier nachweislich synthetische Werte
aus AP-01/AP-02/AP-04/AP-05 werden nur in Kombination mit ihrem jeweiligen
exakten Fixture-Pfad ausgenommen; keine Testverzeichnisse oder Commits werden
pauschal ausgeschlossen. Trivy 0.70.0 übernimmt den Engine-Stand der bisherigen
Action und die Regeln `vuln,misconfig`, `HIGH,CRITICAL`, `ignore-unfixed`.
Sein Root-Benutzer-Befund im AP-05-Testimage wurde behoben, nicht ausgeblendet.

Es gibt keine Anwendungs-API- oder Datenbankschemaänderung, keine Migration,
Versionsanhebung, Veröffentlichung oder Änderung des Dokploy-Kanals `stable`.
Lifecycle- und Lastprüfungen bleiben optionale AP-05-Einstiege; der Lifecycle
wurde hier wegen der tatsächlichen Testimage-Änderung zusätzlich geprüft.

## Tatsächlich ausgeführte Prüfungen

Die Ausführung erfolgte auf Windows mit Linux-Docker. Erste Gruppen liefen mit
Node 24.19.0; der vollständige Schlusslauf verwendet Node 22.23.2. Node/Vitest/
Playwright und Docker liefen über den vorgesehenen Weg außerhalb der Sandbox.

| Prüfung | Ergebnis |
| --- | --- |
| `npm run ci` unter Node 22.23.2 | Exit 0: alle fünf Pflichtgruppen einschließlich Security bestanden |
| `ci:core` im Gesamtpfad | 8 Runner-, 631 Backend- und 697 Frontend-Tests; Lint, Dokploy, i18n, Release-Validierung und Build erfolgreich |
| `ci:integration` | 89 PostgreSQL-Tests, keine übersprungen; eigene Dienste und Volumes aufgeräumt |
| `ci:plesk` | 8 Plesk-Tests und 1 Garage-Integration, keine übersprungen |
| `ci:e2e` | Alle 39 Chromium-Fälle, 0 Retries; unter Node 24 und im Node-22-Gesamtpfad bestanden |
| `ci:security` im Gesamtpfad | Audit ohne hohe/kritische Befunde; Git-Historie und aktueller Quellstand ohne Gitleaks-Treffer; Trivy ohne Befunde bei der vereinbarten Schwelle |
| `test:ci:rtk` | Alle 8 Runner-Tests erfolgreich; identischer normaler Einstieg |
| Kontrollierter Fehler im temporären npm-Projekt | Originaler `ci`-Gruppenablauf scheitert mit Exit 17; spätere Gruppe wird nicht gestartet |
| Runner-Negativfälle | Fehlendes Docker/Compose, falsche Engine, Prozess-/Scannerfehler, Timeout, Abbruch, Cleanup-Fehler und Projektbegrenzung geprüft |
| Gitleaks-Negativkontrolle mit Docker | Exaktes Testwert-/Pfadpaar erlaubt; anderer Wert am selben Pfad und gleicher Wert an anderem Pfad jeweils erkannt, Exit 1 |
| `test:backend:lifecycle` | 24 Lifecycle-/Recovery- und 89 PostgreSQL-Tests bestanden, keine übersprungen; echter Entrypoint stoppt nach 1.151 ms mit Exit 0 und erreicht nach Neustart Readiness |
| `actionlint` 1.7.7 im Container | Geänderte Workflows erfolgreich statisch validiert |
| Abschließendes ESLint | Erfolgreich, einschließlich angepasstem Runtime-Runner |

Das vollständige lokale Protokoll liegt in
`output/ci/ap06-full-node22.log`. Der temporäre Aufrufwrapper
`output/ap06-full-run.mjs` protokolliert den unveränderten `npm run ci`-Einstieg;
gestartet wurde er mit
`rtk proxy npm exec --yes --package=node@22 -- node output/ap06-full-run.mjs`.
Die Gitleaks-Negativkontrolle liegt in `output/ap06-gitleaks-negative.mjs`,
ihre redigierten Ergebnisse unter `output/ci/gitleaks-negative/`.
Die Lifecycle-Evidenz liegt unter `output/ap05/nebulynk-ap05-2d90e34c62da/`.
Diese lokalen Hilfsdateien und Berichte sind ignoriert und keine Laufzeitabhängigkeit.

Frühe Integrationsläufe scheiterten korrekt am bisher übersprungenen
CRLF-Plesk-Helper, am alten Dependency-Pin und an Scannerbefunden. Diese Läufe
sind Diagnoseevidenz und werden nicht als bestandene Gesamtprüfung gezählt.

## Offene Abnahme

- Kein tatsächlicher GitHub-Actions-Lauf dieses uncommitteten Arbeitsstands:
  Hier steht weder `gh` noch ein GitHub-Connector zur Verfügung. Es wurde keine
  Prüf-Branch veröffentlicht und kein Release erzeugt. `actionlint` und lokale
  Gruppenläufe ersetzen diesen externen Nachweis nicht.
- Echte Medienkapazität, Lastbenchmarks und produktive Rollouts wurden nicht
  ausgeführt; sie gehören nicht zum verbindlichen AP-06-Prüfumfang.

Der Paketstatus bleibt bis zur offenen Abnahme ausdrücklich nicht vollständig
abgeschlossen.
