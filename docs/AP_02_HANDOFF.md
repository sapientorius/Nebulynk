# Übergabe AP-02: Konsistente und wiederaufnehmbare Erinnerungen

Datum: 8. September 2026. Ausgangscommit: `6c7cb0cb3641c8715d7a933cf4a6a1e6a07e1338`,
Anwendungsversion `0.5.1`. Umfang: AP-02 aus dem
[Maßnahmenplan](PROJECT_REVIEW_ACTION_PLAN.md).

## Ergebnis und Verträge

Der Prozessor wählt höchstens 100 fällige Kandidaten, sortiert nach Termin und
ID. Pro Kandidat sperrt eine kurze PostgreSQL-Transaktion die Reminder-Zeile
mit `FOR UPDATE SKIP LOCKED` und prüft Status, Termin und aktuelle Leserechte
erneut. Notification-Insert und Zustandswechsel auf `delivered` committen
zusammen. Bei fehlendem Zugriff wird `cancelled` gespeichert; technische Fehler
rollen zurück und lassen die Erinnerung für den nächsten Lauf aktiv. Weitere
Kandidaten werden auch nach einem Einzelfehler verarbeitet.

Neue Arbeit speichert keinen Zustand `processing`. Der vorhandene Bezug
`notification_id` wird innerhalb der gesperrten Transaktion gesetzt. Kein
Servicepfad reaktiviert eine abgeschlossene Erinnerung. Dadurch kann eine
Erinnerung über die neuen Anwendungspfade höchstens eine Benachrichtigung
erzeugen, auch wenn diese später gelöscht und ihr Bezug auf NULL gesetzt wird.

`patch` und `remove` sperren und prüfen die Zeile erneut. Gewinnt die Zustellung,
erhalten sie `api.message_reminders.not_found`; gewinnt die Änderung, wird der
neue Termin beziehungsweise Abbruch berücksichtigt. `create` verwendet den
partiellen Unique-Index für einen atomaren Upsert: ein aktiver Termin behält
seine ID; nach Zustellung entsteht eine neue Erinnerung. Antworten und externe
Statusfilter bleiben `active`, `delivered` und `cancelled`.

Service und Worker verwenden die bestehende Konto- und Channel-/Meeting-
Historienpolicy mit dem aktuellen Benutzer aus der Datenbank. Die frühere
Membership-only-Prüfung entfällt. Gesperrte Administratoren, nicht freigegebene
Konten und abgelaufene Gäste werden ebenfalls abgewiesen. Nur bekannte
fachliche Zugriffsfehler führen im Worker zur Stornierung; SQL-/Infrastruktur-
fehler bleiben wiederholbar. Die Prüfung ist eine aktuelle Zugriffsprüfung
innerhalb der Transaktion, keine neue globale Serialisierung aller parallelen
Membership- oder Policy-Änderungen.

`processDueMessageReminders(app, options)` bleibt für AP-05 direkt aufrufbar.
`now` kann eine feste Testzeit vorgeben, andernfalls liefert die injizierbare
`clock` die Zeit. Der Service akzeptiert ebenfalls `clock` als interne Option.
Rückgabe: `processed` zählt ausgewählte Kandidaten, `delivered` committete
Zustellungen, `skipped` wegen fehlenden Zugriffs stornierte Erinnerungen.
Gesperrte Kandidaten und technische Fehler sind keine `skipped`-Stornierungen.
AP-05 übernimmt weiterhin Scheduler und Shutdown; dieses Paket ändert diese
Lebenszyklen nicht. Robuste Reminder-Locks bedeuten keine allgemeine Freigabe
für mehrere Backend-Instanzen.

## Zustellgrenze und Migration

Jede Benachrichtigung wird unmittelbar nach Commit an den bestehenden Dispatcher
übergeben. Enqueue-, Socket- und Pushfehler setzen den Zustellstatus niemals
zurück. Ohne Outbox erfolgt keine dauerhafte Wiederholung dieser Seiteneffekte:
ein Abbruch zwischen Commit und Enqueue kann Push/Socket verlieren. Die
In-App-Benachrichtigung bleibt beim nächsten Abruf sichtbar. Exakt einmalige
externe Zustellung wird nicht zugesichert.

Migration `071_message_reminder_recovery.js` lässt Migration 057 unverändert.
Für das Upgrade:

1. Alle alten Backend-Prozesse vollständig stoppen und Datenbank sichern.
2. Die neue Migration mit dem neuen Backend ausführen; der reguläre Start
   verwendet bereits `migrate.latest`. Keine alten Worker parallel betreiben.
3. Das neue Backend starten. Reaktivierte fällige Erinnerungen werden beim
   initialen beziehungsweise nächsten regulären Lauf erneut geprüft.

Die Migration sperrt `message_reminders` und läuft im Knex-Transaktionsrahmen.
Alte `processing`-Einträge mit passender referenzierter Reminder-Benachrichtigung
oder vorhandenem `delivered_at` werden `delivered`. Für die übrigen Einträge
hat ein vorhandener aktiver Termin Vorrang; konkurrierende alte Einträge werden
storniert. Ohne aktiven Termin wird der neueste alte Eintrag reaktiviert,
sortiert nach `created_at DESC NULLS LAST, id DESC`; weitere werden storniert.
Bestehende aktive Termine werden nicht verändert. Verlierer werden vor der
Reaktivierung storniert, sodass der vorhandene Unique-Index gültig bleibt.

Historische Benachrichtigungen ohne verlässlichen Reminder-Bezug bleiben
unverändert. Sie können keiner Erinnerung eindeutig zugeordnet werden;
historische Duplikate werden nicht heuristisch entfernt. Ein erneut verarbeiteter
Altbestand kann deshalb neben einer früheren unreferenzierten Benachrichtigung
erscheinen. Der neue Konsistenzvertrag ist keine rückwirkende Datenbereinigung.
`down` reaktiviert keine Erinnerungen. Die Datenkorrektur ist nur durch
Wiederherstellung eines Backups rückgängig zu machen.

## Geänderte Bereiche

| Bereich | Änderung |
| --- | --- |
| Reminder-Prozessor | Zeilensperren, atomare Persistenz, kontrollierte Zeit, Ausgabe nach Commit |
| Reminder-Service und neues `access.js` | Atomarer Upsert, gesperrte Änderungen, gemeinsame aktuelle Zugriffspolicy |
| Migration 071 | Kontrollierte Behandlung bestehender `processing`-Zeilen |
| PostgreSQL-Testhelper | Optionaler Migrationszielstand für isolierte Upgrade-Tests |
| Reminder-Integration | Echte Transaktionen, Konkurrenz, Abbruch, Berechtigungen, Migration und HTTP/JWT |
| Alte Reminder-Unit-Tests | Durch PostgreSQL-Verhaltensprüfungen ersetzt; Memory-DB nicht künstlich erweitert |
| Bestehender mobiler Browser-Test | API-Antwort, Persistenz nach Reload, Verschieben und dauerhaftes Entfernen |
| Playbook und Zugriffsdokumentation | Prüfbefehle, Zustellgrenzen und aktuelle Zugriffsregeln |

Keine neuen Abhängigkeiten, npm-Scripts oder öffentlichen API-Felder. AP-03 kann
die Integration über den bestehenden Einstieg übernehmen; AP-06 muss diesen
weiterhin separat zum bisherigen `ci`-Aggregat berücksichtigen.

## Verifikation

Die PostgreSQL-Läufe verwenden einen eigenen PostgreSQL-17-Alpine-Container
auf `127.0.0.1:55472`. Jeder Integrationslauf erzeugt und entfernt eigene
`nebulynk_test_ap01_<runid>`-Datenbanken. Der bestehende Namenspräfix wurde für
Kompatibilität beibehalten. Die Upgrade-Prüfung startet bei Migration 070 und
wendet 071 über den echten Knex-Migrator an.

| Prüfung | Ergebnis |
| --- | --- |
| `rtk npm run test:backend:integration` mit expliziter Test-URL | 69 erfolgreich: 27 Reminder- und 42 AP-01-Tests |
| `rtk test npm run ci` | Erfolgreich, Exit 0: Dokploy, Lint, i18n, Backend-/Frontend-Tests, Frontend-Build, Plesk-Paket/-Tests und Garage-Integration |
| Fokussierter Playwright-Lauf | 4 erfolgreich, keine Wiederholungen: Setup/Login, Einladung, Nachrichten und mobiler Reminder einschließlich Speichern, Neuladen, Verschieben und Entfernen |

Die Integration belegt echte gleichzeitige Verbindungen mit kontrollierten
Transaktionsbarrieren und beobachteten PostgreSQL-Lock-Wartezuständen. Eine
Worker-Verbindung wird vor Commit serverseitig beendet; ein neuer Worker
verarbeitet die zurückgerollte Erinnerung. Trigger injizieren Fehler zwischen
Insert und Statusabschluss sowie beim verzögerten Commit. Zusätzlich werden
nach Commit sichtbare Daten und Fehler im tatsächlichen Dispatcher geprüft.

Der Browserbefehl verwendet die isolierte Datenbank `nebulynk_ap02_e2e`,
separates Redis auf Port 56382 und einen separaten S3-kompatiblen MinIO-
Testcontainer auf Port 59072. Backend-Port: 33072; Frontend-Port: 4173.
SMTP und LiveKit zeigen auf unbenutzte lokale Testendpunkte. Die Tests
benötigen keine reale Mail-, Push- oder Medienzustellung.
`E2E_EXTERNAL_SERVERS=false`, `E2E_USE_PREVIEW_FRONTEND=false` und `CI=true`
lassen Playwright eigene Server starten. Der E2E-Reset war ausdrücklich auf
die genannte Testdatenbank im separaten Container begrenzt.

```powershell
rtk proxy npm run test:e2e --workspace=frontend -- --project=onboarding --grep 'setup and first login|invite accept flow|messaging path|mobile message reminders' --reporter=line --workers=1 --retries=0 --output=../output/playwright/ap02
```

Node-/Docker-/Browserprüfungen wurden über den vorgesehenen Ausführungsweg
außerhalb der Sandbox ausgeführt. Ein `spawn EPERM`-Fallback war nicht nötig.
Der erste Image-Download (`postgres:17`) scheiterte mit EOF; das lokal vorhandene
`postgres:17-alpine` wurde verwendet. Ein erster Testaufruf verlor durch
PowerShell-Quoting die Test-URL und scheiterte ausdrücklich ohne Datenbankfallback.
Danach setzte ein lokaler temporärer Wrapper die Testumgebung korrekt.
Fehler in den anfänglichen Test-Fixtures wurden vor den erfolgreichen Läufen
korrigiert (Meeting-Pflichtfeld und eigener Pool für die absichtlich beendete
Worker-Verbindung).

Nach den Läufen war keine pro Integration erzeugte Testdatenbank mehr vorhanden.
Die drei eigens gestarteten AP-02-Container samt temporären Daten sowie lokale
Wrapper wurden entfernt. Bestehende Entwicklerdienste wurden nicht verändert.

Keine Produktivmigration, kein Release, kein Deployment, kein Lasttest und kein
GitHub-Actions-Lauf wurden durchgeführt. Der Browserlauf ist gezielt, nicht die
vollständige E2E-Suite. Nicht dauerhafte Push-/Socket-Zustellung und historische
unreferenzierte Benachrichtigungen sind die vereinbarten Grenzen.

## Abnahme

- [x] Beide ursprünglichen Fehlerfenster mit dauerhaften PostgreSQL-Regressionen geschlossen.
- [x] Konkurrenzverhalten, Rollback und Wiederaufnahme nach Verbindungsabbruch nachgewiesen.
- [x] Altdatenmigration einschließlich aktivem Konkurrenztermin und Upgrade geprüft.
- [x] Besitzer-, Konto- und Meeting-Historiengrenzen sowie externe HTTP-/JWT-Verträge geprüft.
- [x] Frontend-Verträge durch Store-Suite und ausgeführten Browserablauf erhalten.
- [x] Datenbankgarantie und Best-Effort-Ausgabe getrennt dokumentiert.
- [x] Kompatibles Prozessorinterface und Zuständigkeiten an AP-03/AP-05/AP-06 übergeben.

AP-02 ist für den vereinbarten Umfang abgeschlossen. Es bestehen keine offenen
Abnahmekriterien; Deployment und Produktivmigration bleiben Betreiberaufgaben.
