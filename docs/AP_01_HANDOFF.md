# Übergabe AP-01: Atomare Dateizuordnung bei Nachrichten

Datum: 7. September 2026

Ausgangsstand: `baa254c7396f1e0ebce8800d190631ba4c1ec799`, Anwendung `0.5.1`.
Umfang: [AP-01](PROJECT_REVIEW_ACTION_PLAN.md#ap-01-dateizugriff-beim-erstellen-von-nachrichten-korrigieren).

## Ergebnis und Entscheidungen

Nachrichten können nur eigene, noch ungebundene Uploads übernehmen. Ein
bedingtes `UPDATE ... RETURNING` liefert die tatsächlich autorisierte Menge.
Stimmt sie nicht vollständig mit den deduplizierten IDs überein, wird die
gesamte Nachrichtenerstellung zurückgerollt. Ausschließlich diese Ergebnismenge
wird signiert, ausgegeben und als Dateianhang indexiert.

Fremde, nicht vorhandene und bereits gebundene Dateien ergeben denselben
Fehler: HTTP 400 / `api.messages.attachments_unavailable`, mit leeren
`error_params`. Der Fehlercode wurde auf Deutsch und Englisch ergänzt.
Datei-IDs werden ohne Typkonvertierung oder Trimmen dedupliziert; die erste
Reihenfolge bleibt erhalten. Für schema-gültige Dateinachrichten ohne
`content` wird `''` gespeichert.

Der neue nachrichtenspezifische Around-Hook umschließt den gesamten
Create-Pfad mit einer Knex-Callback-Transaktion. Der installierte Adapter
erhält `params.transaction.trx`; Membership-, Berechtigungs-, Repository-,
Preview-, Mention- und Notification-Abfragen verwenden denselben Client.
Dadurch benötigen parallele Creates innerhalb der Transaktion keine zweite
Poolverbindung.

Gemeinsam committen:

- Nachricht und Dateizuordnung;
- Nachrichten- und Datei-Suchindex;
- Mentions und Notification-Datensätze;
- der Lesestand des Senders.

Autorendaten, Previews und URLs werden vor dem Commit fertiggestellt.
Fehler bei diesen Schritten bewirken einen Rollback. Ein bereinigtes
`context.dispatch` schützt auch Socket-Payloads interner Creates, während
interne Aufrufer ihren bisherigen Ergebnisvertrag behalten.

Feathers emittiert `messages created` nach Rückkehr aus dem erfolgreich
committeten Around-Hook. Notification-Datensätze werden erst nach Commit an
den vorhandenen Dispatcher übergeben. Ein Fehler beim Enqueue oder beim
Push-Versand macht eine gespeicherte Nachricht nicht nachträglich zum Fehler.
Die öffentlichen Eventnamen und Publisher wurden nicht geändert.

Forwarding verwendet denselben Create-Pfad. Seine Kompensation löscht nur
passende eigene Kopien, die beim bedingten `DELETE ... RETURNING` weiterhin
ungebunden sind. Gebundene Kopien bleiben erhalten. Nach einem ausdrücklich
bestätigten PostgreSQL-Daten-/Constraintfehler beim Datei-Insert kann auch
das bereits kopierte, nachweislich nicht persistierte Objekt entfernt werden.
Bei unklarem DB-Ausgang oder nicht möglicher DB-Prüfung wird das Objekt
beibehalten und der Fall protokolliert; Cleanup verdeckt den ursprünglichen
Fehler nicht.

## Geänderte Dateien

| Datei/Bereich | Zweck |
| --- | --- |
| `backend/src/services/messages/messages.create-transaction.js` | Neuer Commit-/Rollback-Rahmen, sicherer Dispatch und verzögerte Notification-Ausgabe |
| `backend/src/services/messages/messages.js` | Transaktion anbinden, unsicheren Dateiselect entfernen, Previews und Suchindex an Transaktion binden, Forward-Kompensation absichern |
| `backend/src/domains/messages/service.js` | Deduplizierung, Inhalt reiner Dateinachrichten, autorisierte Mengenprüfung |
| `backend/src/domains/messages/repository.js` | Bedingte Datei-Zuordnung/-Bereinigung und gezielte DB-Weitergabe |
| `backend/src/hooks/check-permission.js`, `is-channel-member.js`, `parse-mentions.js`, `create-notifications.js` | Gemeinsame Verbindung; Notification-Persistenz und Ausgabe trennen |
| `backend/src/lib/i18n-messages.js`, `frontend/src/lib/api-error-messages.js` | Neuer Fehlercode in beiden Sprachen |
| `backend/integration/messages-create.postgres.test.js` | 42 Integrationstests mit realer PostgreSQL-Datenbank und Transporten |
| `backend/test/helpers/postgres-test-db.js` | Explizit isolierte, pro Lauf neu erzeugte Testdatenbank einschließlich Migrationen und Cleanup |
| `backend/test/messages.domain.test.js`, `messages.forward.test.js` | Deduplizierungsregression und angepasster Forwarding-Testaufbau |
| `backend/package.json`, `package.json`, `package-lock.json` | Integrationseinstiege und Backend-Testabhängigkeit auf den bereits im Workspace verwendeten Socket.IO-Client |
| `docs/engineering-playbook.md`, `security-service-access-matrix.md` | Reproduzierbare Prüfung und öffentlicher Zugriffsvertrag |
| Maßnahmenplan, Umsetzungsplan und diese Übergabe | Status, Entscheidungen und Abnahmebelege |

## Ausgeführte Prüfungen

Die Integration wurde gegen PostgreSQL 17 in einem ausschließlich für AP-01
gestarteten Container ausgeführt. Jeder Lauf verwendete eine neue Datenbank
`nebulynk_test_ap01_<runid>` mit allen echten Migrationen. Die Tests verwenden
den registrierten Nachrichten-Service, den Knex-Adapter, das tatsächliche
Authentifizierungsmodul und Koa/Socket.IO. Nicht benötigte Nachbardienste im
Transport-Testaufbau stellen lediglich ihre Publisher bereit.

S3-Signierung erfolgte mit synthetischen Zugangsdaten und `storage.invalid`.
Copy/Delete und externer Push wurden in der Integration ersetzt. Der
Browserlauf verwendete die vollständige Anwendung mit eigener Testdatenbank,
separatem Redis und einem isolierten MinIO-Speicher für echte Uploads und
Dateikopien. Es wurde kein produktiver Speicher oder Datenbestand verwendet.

| Prüfung | Tatsächliches Ergebnis |
| --- | --- |
| Sicherheitsregression vor Anbindung der Korrektur | Erwartet fehlgeschlagen: Der bisherige Create-Hook akzeptierte die fremde gebundene Datei (`Missing expected rejection`) |
| `rtk npm run test:backend:integration` mit expliziter Test-URL | 42 erfolgreich, keine übersprungenen Tests |
| `rtk npm run test:backend:integration:rtk` | Ebenfalls 42 erfolgreich, einschließlich des auf 60 Sekunden begrenzten Test-Runners |
| Integration ohne `NEBULYNK_TEST_POSTGRES_URL` | Erwartet Exit 1 mit eindeutiger Konfigurationsmeldung; kein Fallback auf die Anwendungsdatenbank |
| `rtk npm run test:backend` | 621 erfolgreich |
| `rtk npm run test:frontend` | 676 Tests in 146 Dateien erfolgreich |
| `rtk npm run lint` | Backend- und Frontend-Syntaxprüfung erfolgreich |
| `rtk npm run i18n:check` | Erfolgreich |
| Fokussierter Playwright-Browserlauf | 4 erfolgreich: Setup/Login, Einladung annehmen, Nachricht senden, Datei hochladen und weiterleiten |
| `rtk test npm run ci` | Erfolgreich, Exit 0: Dokploy-Template, Lint, i18n, Backend-/Frontend-Tests, Produktionsbuild, Plesk-Paket/-Tests und Garage-Signaturintegration |

Der erfolgreiche Browserbefehl war:

```powershell
rtk proxy npm run test:e2e --workspace=frontend -- --project=onboarding --grep 'setup and first login|invite accept flow|messaging path|forwarding a file message' --reporter=line --workers=1 --retries=0 --output=../output/playwright/ap01
```

Dabei waren `E2E_POSTGRES_DB` und alle PostgreSQL-/Redis-/S3-Verbindungen auf
die eigenen Testcontainer gesetzt, `E2E_BACKEND_PORT=33071`,
`E2E_FRONTEND_PORT=4173`, `E2E_EXTERNAL_SERVERS=false`,
`E2E_USE_PREVIEW_FRONTEND=false` und `CI=true`. SMTP und LiveKit zeigten für
diesen Lauf auf unbenutzte lokale Testendpunkte. Es wurden keine Nachrichten
an reale Empfänger versendet.

Die pro Integrationslauf erzeugten Datenbanken wurden nachweislich entfernt.
Anschließend wurden auch die drei eigens gestarteten Testcontainer samt
E2E-Datenbank und temporären Speicherdaten sowie der lokale Test-Wrapper
aufgeräumt.

Node-, Vitest-, Playwright- und Docker-Prüfungen verwendeten den lokal
vorgesehenen Ausführungsweg außerhalb der Sandbox. Ein Test-Fallback wegen
`spawn EPERM` war nicht erforderlich. Für den temporären PowerShell-Wrapper
wurde die Ausführungsfreigabe ausschließlich für dessen Prozess gesetzt.

Die fehlende NPM-Argumentweitergabe über den verschachtelten Root-E2E-Einstieg
wurde durch den direkten Workspace-Aufruf umgangen. Zwischenzeitliche Fehler
im neuen Transport-Testaufbau wurden korrigiert; der abschließende Lauf nutzt
keinen erzwungenen Prozessabbruch.

## Abnahmebelege und Grenzen

Die Integration belegt fremde/freie/gebundene/fehlende und gemischte Datei-IDs,
Admin-Dateigrenzen, Dubletten, Dateinachrichten ohne Text sowie unveränderte
Schema- und Channel-Regeln. Fehler nach Insert und Zuordnung sowie bei Suche,
Mentions, Notifications, Lesestand, Preview und Signierung lassen alle
geprüften Tabellen unverändert. Ein verzögerter PostgreSQL-Constraint-Trigger
belegt einen echten Commitfehler ohne Events oder Dispatcher-Enqueue.

Konkurrenztests verwenden unabhängige Verbindungen und prüfen den tatsächlich
wartenden PostgreSQL-Lock. Sowohl erfolgreiche als auch zurückrollende erste
Claims sowie überlappende Dateimengen in umgekehrter Reihenfolge hinterlassen
genau einen konsistenten Gewinner. Ein weiterer Test belegt acht gleichzeitige
Creates bei acht Poolverbindungen. Ein angehaltener Create-Pfad liefert vor
Commit keine Ausgabe; Event-/Enqueue-Beobachter können die Daten anschließend
über eine unabhängige Verbindung lesen.

Es ist keine Produktionsmigration erforderlich. Version und Release-Kanal
bleiben unverändert. Die Korrektur widerruft keine früher ausgegebenen,
noch gültigen signierten URLs und repariert keine historischen Daten.

Socket-/Push-Zustellung bleibt best effort. Das Fenster zwischen Commit und
Ausgabe wird ohne persistente Outbox nicht wiederaufgenommen. Auch ein
zusätzlich registrierter synchron werfender Anwendungs-Eventlistener kann
nach dem Commit einen Servicefehler verursachen; ein Test belegt, dass die
Forward-Kompensation dabei bereits gebundene Kopien nicht löscht. AP-01 führt
keine automatische Wiederholung dieses Vorgangs ein.

Allgemeine äußere/verschachtelte Transaktionen für `messages.create` werden
vor Schreibzugriffen abgewiesen. Der interne Forward-Aufruf und
Meeting-Nachrichten mit `skipNotifications` funktionieren weiterhin.
Unklare S3-/DB-Fehler können eine aufzuräumende Kopie zurücklassen; eine
möglicherweise bereits gebundene Datei wird dafür nicht riskiert.

Der Browserlauf umfasste die vier genannten Pfade, nicht die vollständige
E2E-Suite. Es wurde kein allgemeiner Lasttest und kein GitHub-Actions-Lauf
ausgeführt. AP-03 kann die Testinfrastruktur vereinheitlichen; AP-06 kann
`test:backend:integration` in seine gemeinsamen Prüfgruppen aufnehmen. Der
bisherige lokale `ci`-Befehl enthält diesen neuen PostgreSQL-Einstieg nicht.
