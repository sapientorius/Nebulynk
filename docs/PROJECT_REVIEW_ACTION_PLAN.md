# Projektbewertung und ausführbare Arbeitspakete

Stand: 7. September 2026  
Bewertete Anwendungsversion: `0.5.1`  
Bewerteter Commit: `baa254c` (`feat: implement default channel membership management and migration`)  
Status: AP-01 wurde am 7. September 2026 umgesetzt und verifiziert; siehe [Übergabe AP-01](AP_01_HANDOFF.md). AP-02 wurde am 8. September 2026 umgesetzt und verifiziert; siehe [Übergabe AP-02](AP_02_HANDOFF.md). AP-03 wurde am 8. September 2026 im vereinbarten Umfang umgesetzt und lokal verifiziert; siehe [Übergabe AP-03](AP_03_HANDOFF.md). AP-04 wurde am 8. September 2026 einschließlich AP-04A/B/C umgesetzt und lokal technisch abgenommen; siehe [Übergabe AP-04](AP_04_HANDOFF.md). AP-05 und AP-06 sind weiterhin offen. Die ursprüngliche Bewertung selbst enthielt noch keine Implementierung der Korrekturen.

## Zweck und Verwendung

Dieses Dokument übergibt die Ergebnisse einer Code- und Architekturprüfung an weitere Entwicklungsinstanzen. Jede Instanz soll ein ausdrücklich zugewiesenes Arbeitspaket selbstständig planen, umsetzen und überprüfen können, ohne die ursprüngliche Unterhaltung zu kennen.

Die sechs Hauptpakete entsprechen den sechs Handlungsempfehlungen der Bewertung. AP-03 und AP-04 enthalten größere Teilaufgaben, die bei Bedarf einzeln zugewiesen werden können. Eine solche Teilaufgabe schließt nicht automatisch das gesamte Hauptpaket ab.

Für jede Übernahme sind zuerst der gemeinsame Kontext und anschließend das zugewiesene Paket zu lesen. Die Pfade und Symbolnamen beziehen sich auf den oben genannten Stand. Vor Änderungen prüfen, ob zwischenzeitlich bereits Korrekturen oder Umstrukturierungen erfolgt sind. Zeilennummern sind bewusst nicht Teil der dauerhaften Verweise.

### Direkt verwendbarer Auftrag für eine Instanz

```text
Lies AGENTS.md und die dort referenzierten lokalen Vorgaben. Lies anschließend
docs/PROJECT_REVIEW_ACTION_PLAN.md, insbesondere den gemeinsamen Kontext,
die Abhängigkeiten und AP-XX.

Übernimm AP-XX. Prüfe die beschriebenen Befunde am aktuellen Code, erstelle
einen konkreten Umsetzungsplan und führe die erforderlichen Änderungen samt
Regressionstests und Dokumentation durch. Bewahre die aufgeführten Verträge.
Berücksichtige bereits abgeschlossene Pakete und Änderungen anderer Instanzen.

Dokumentiere am Ende geänderte Dateien, Entscheidungen, tatsächlich ausgeführte
Prüfungen, verbleibende Grenzen und den Erfüllungsstand der Abnahmekriterien.
Setze den Paketstatus erst auf abgeschlossen, wenn die Kriterien erfüllt sind.
```

## Gemeinsamer Kontext

### Produkt und bestehende technische Entscheidungen

Nebulynk ist eine selbst gehostete Kommunikationsplattform mit Channels, Direktnachrichten, Dateien, Suche, Rollen, Benachrichtigungen, Voice und Meetings. Meetings umfassen unter anderem Gäste, Einladungen, Video, Screensharing, Aufzeichnungen und optionale KI-Artefakte. Browser, PWA und Desktop-Anbindungen müssen berücksichtigt werden.

| Bereich | Bestehender Aufbau |
| --- | --- |
| Repository | npm-Workspaces für `backend`, `frontend` und `desktop-ptt-helper` |
| Frontend | Vue 3, Options API für Komponenten, Pinia, Naive UI, Vite |
| Backend | FeathersJS v5 auf Koa, REST und Socket.IO |
| Persistenz | PostgreSQL über Knex, versionierte Migrationen |
| Weitere Dienste | Redis, S3-kompatibler Speicher mit Garage als Standard, LiveKit |
| Sprache und IDs | Modernes JavaScript/ES6+, CUID2; keine TypeScript-Migration |
| Zielgröße | Im lokalen Projektkontext ungefähr 100 bis 1.000 gleichzeitige Nutzer; dies ist ein Ziel und kein durch diese Prüfung erbrachter Kapazitätsnachweis |

Die Entwicklung soll den vorhandenen Stack und einen modularen Monolithen beibehalten. Neue Abstraktionen müssen konkrete Verantwortlichkeiten oder Testbarkeit verbessern. Eine Microservice-Aufteilung oder ein Framework-Wechsel sind keine Voraussetzung für diese Arbeitspakete.

Wichtige Einstiegspunkte:

- [Repository-Vorgaben](../AGENTS.md), anschließend die dort referenzierten lokalen Dateien.
- [Produktübersicht](PROJECT_BRIEF.md).
- [Architekturübersicht](ARCHITECTURE.md).
- [Engineering Playbook](engineering-playbook.md).
- [Sicherer Betrieb](security-hardening.md).
- [Service-Zugriffsmatrix](security-service-access-matrix.md).

### Stärken, die bei Änderungen erhalten bleiben sollen

1. **Nachvollziehbare Systemaufteilung:** UI, API, Datenbank, Objektspeicher und Medienserver besitzen sinnvolle technische Grenzen.
2. **Vorhandene fachliche Struktur:** Beispielsweise trennen `backend/src/domains/messages/{service,repository,policy}.js` bereits Fachentscheidungen, Datenzugriff und Hilfsregeln. Repository und Uhrzeit können injiziert werden.
3. **Explizite Sicherheitsgrenzen:** Authentifizierung, Membership- und Berechtigungsprüfungen sowie die Realtime-Verteilung sind serverseitig angelegt. Interne Service-Aufrufe und externe REST-/Socket-Aufrufe müssen weiterhin bewusst unterschieden werden.
4. **Berücksichtigte Datenzugriffskosten:** Nachrichtentimelines verwenden zusammengesetzte Cursor; Meeting-Historienzugriffe haben gebündelte Berechtigungsabfragen, Indexmigrationen und Query-Budgets. Siehe [Performance-Runbook](meeting-history-access-performance.md).
5. **Breite vorhandene Absicherung:** Backend-Tests, Store-/Bibliothekstests, Browser-E2E und Security-Jobs existieren bereits. Neue Tests sollen diese sinnvoll ergänzen und schwache Tests gezielt ersetzen.
6. **Reproduzierbarer Betrieb:** Workspace-Lockfile, Container mit reduzierten Rechten, Deployment-Dokumentation und Release-/Template-Prüfungen sind vorhanden.

### Evidenz und Grenzen der Ausgangsbewertung

Die Sichtung umfasste gezielte vertiefte Stichproben in Architektur, zentralen Services, Hooks, Frontend-Modulen, Tests und Deployment-Konfiguration. Backend und Frontend hatten zusammen 376 `.js`-/`.vue`-Quelldateien mit ungefähr 85.000 Zeilen. Es wurde keine vollständige Prüfung jeder Funktion durchgeführt.

Erfolgreich ausgeführte Prüfungen am Ausgangsstand:

| Befehl | Ergebnis |
| --- | --- |
| `rtk npm run test:backend` | 620 Tests erfolgreich, keine übersprungen |
| `rtk npm run test:frontend` | 676 Tests in 146 Dateien erfolgreich |
| `rtk npm run build:frontend` | Erfolgreicher Produktionsbuild |
| `rtk npm run lint` | Syntaxprüfung erfolgreich; die Einschränkungen stehen in AP-03 |
| `rtk npm run i18n:check` | Erfolgreich |
| `rtk npm run dokploy:template:check` | Erfolgreich |
| `rtk npm run release:validate` | Sieben stabile Releases bis einschließlich `v0.5.1` validiert |

Zusätzlich wurden drei Fehlerfälle mit synthetischen Daten und den tatsächlichen betroffenen Funktionen/Hooks bestätigt:

- Fremde Datei-Metadaten samt signierter URL im Nachrichten-Create-Hook, siehe AP-01.
- Dauerhaft übergangene Erinnerungen im Zustand `processing`, siehe AP-02.
- Doppelte Benachrichtigung nach einem simulierten Datenbankfehler, siehe AP-02.

Diese Reproduktionen waren isolierte In-Process-Prüfungen mit Testdatenbank und bei AP-01 lokaler URL-Signierung. Es wurden weder fremde Daten heruntergeladen noch produktive Datenbanken verändert. Der komplette HTTP-/Socket-Angriffspfad wurde dabei nicht ausgeführt. Dauerhafte Regressionstests für diese Fälle sind Bestandteil der Umsetzung.

Nicht ausgeführt wurden Browser-E2E, allgemeine Lasttests und die vollständige Docker-/Plesk-Pipeline. Ergebnisse aus früheren CI-Läufen wurden nicht als aktuelle Testergebnisse übernommen. Der versionierte Arbeitsbaum blieb bei der ursprünglichen Bewertung unverändert.

### Gemeinsame Arbeitsregeln

- Vor Beginn Arbeitsbaum und aktuellen Code prüfen. Bereits vorhandene Änderungen anderer Instanzen erhalten.
- Sicherheits- und Membership-Prüfungen an externen Pfaden erhalten; Tests müssen den tatsächlichen Service-/Transportpfad angemessen abdecken.
- Vue-Komponenten weiterhin mit Options API entwickeln. Naive UI und den vorhandenen Dialog-Provider verwenden.
- IDs weiterhin über CUID2 erzeugen. Bestehende öffentliche Antwortformen, Fehlercodes, Events und Übersetzungsschlüssel nur mit begründeter, dokumentierter Änderung anpassen.
- Ausgerollte Migrationen nicht rückwirkend ändern. Falls erforderlich, eine neue Migration einschließlich Behandlung bestehender Daten hinzufügen.
- Shell-Befehle mit `rtk` ausführen. Neue npm-Scripts als normale Variante und explizite `:rtk`-Variante anbieten. CI und Container dürfen keine RTK-Installation benötigen.
- Die lokalen Vorgaben zu Prozessstarts und `spawn EPERM` beachten: Node-/Vitest-/Playwright-Tests benötigen in dieser Umgebung regelmäßig den vorgesehenen Ausführungsweg außerhalb der Sandbox. Ein Umgebungsfehler ist kein Produktfehler; tatsächliche Prüfgrenzen dokumentieren.
- Datenbanktests und Benchmarks nur mit ausdrücklich isolierten Testdatenbanken ausführen. Das vorhandene E2E-Reset-Script kann eine Datenbank löschen und ist kein allgemeines Test-Setup für eine beliebige Entwicklerdatenbank.
- Bei Änderungen passende Prüfungen ausführen. Breitere Prüfungen anhand der berührten Verträge wählen. Ein grüner Unit-Test-Lauf ersetzt weder einen Transaktionsnachweis noch einen Browser-Interaktionstest.
- Dieses Dokument beschreibt Entwicklungsarbeiten. Versionsanhebung, Veröffentlichung und Deployment sind kein notwendiger Bestandteil eines Pakets. Sollte später ein Release beauftragt werden, die lokalen Release-Vorgaben separat beachten, insbesondere den `stable`-Kanal in `dokploy-template/meta.json`.

## Priorisierung, Zuständigkeiten und Abhängigkeiten

| Paket | Priorität | Ergebnis | Empfohlene Reihenfolge | Status |
| --- | --- | --- | --- | --- |
| AP-01 | Sehr hoch | Autorisierte, atomare Dateizuordnung bei Nachrichten | Sofort; unabhängig von großen Refactorings | Abgeschlossen, siehe [Übergabe](AP_01_HANDOFF.md) |
| AP-02 | Hoch | Wiederaufnehmbare, konsistente Erinnerungsverarbeitung | Parallel zu AP-01 bei getrennter Dateizuständigkeit möglich | Abgeschlossen, siehe [Übergabe](AP_02_HANDOFF.md) |
| AP-03 | Hoch | Statische Analyse, echte Komponententests, PostgreSQL-Integrationstests | Infrastruktur früh; mit AP-01/AP-02 abstimmen | Abgeschlossen, siehe [Übergabe](AP_03_HANDOFF.md) |
| AP-04 | Mittel bis hoch | Klar abgegrenzte Meeting-, UI- und API-Module | Nach relevanter Verhaltensabsicherung aus AP-03 | Abgeschlossen: AP-04A/B/C lokal technisch abgenommen ([Übergabe](AP_04_HANDOFF.md)) |
| AP-05 | Mittel | Kontrollierter Server-Lebenszyklus und überprüfbare Betriebsannahmen | Mit AP-02 und Backend-Teil von AP-04 abstimmen | Offen |
| AP-06 | Mittel | Einheitlicher verbindlicher Prüfumfang lokal und in GitHub Actions | Vorhandene Lücken sofort; abschließende Integration nach AP-03 | Offen |

AP-01 und AP-02 dürfen nicht auf einen vollständigen Umbau der Testlandschaft warten. Sie müssen die nötigen gezielten Regressionstests selbst mitbringen. AP-03 kann deren Infrastruktur anschließend vereinheitlichen.

Gemeinsam betroffene Dateien benötigen eine abgestimmte Zuständigkeit oder getrennte Branches/Worktrees:

| Dateien/Bereiche | Betroffene Pakete | Koordination |
| --- | --- | --- |
| Root-/Workspace-`package.json`, `package-lock.json` | AP-03, AP-06, eventuell AP-05 | Neue Scripts und Abhängigkeiten zusammenführen; Lockfile nach tatsächlichen Manifesten erzeugen |
| `backend/src/app.js`, `backend/src/index.js` | AP-05; Integrationspunkte von AP-02/AP-04 | Lebenszyklus-Verantwortung bei AP-05; neue Worker-Schnittstellen vorher festlegen |
| Nachrichten-Service und seine Tests | AP-01, AP-03 | Sicherheitskorrektur zuerst übernehmen; nicht parallel umstrukturieren |
| Reminder-Prozessor, Migrationen und Tests | AP-02, AP-03, AP-05 | Zustandsmodell gehört AP-02; Scheduler-Einbindung AP-05 |
| Meeting-Komponenten und ihre Tests | AP-03, AP-04 | Verhaltensabsicherung vor oder zusammen mit Extraktion |
| `.github/workflows/ci.yml` | AP-03, AP-06 | AP-06 integriert die in AP-03 definierten Test-/Lint-Befehle |

## AP-01: Dateizugriff beim Erstellen von Nachrichten korrigieren

### Problem und fachlicher Kontext

Ein Benutzer lädt Dateien hoch und übergibt deren IDs später beim Erstellen einer Nachricht als `file_ids`. Die Dateien sollen nur dann verknüpft und zurückgegeben werden, wenn sie diesem Benutzer gehören und noch keiner anderen Nachricht zugeordnet sind.

Im Ausgangsstand liegt die Zuordnung in einem `after.create`-Hook. Die Nachricht ist zu diesem Zeitpunkt bereits erstellt. Das Update der Dateien schränkt auf `user_id` und `message_id IS NULL` ein. Der anschließende Select verwendet jedoch erneut die komplette vom Aufrufer gelieferte ID-Liste ohne diese Einschränkungen. Für diese Ergebniszeilen werden signierte S3-URLs erzeugt.

Dadurch verhindert der erste Schritt zwar die fremde Zuordnung, aber nicht die Ausgabe fremder Metadaten und Download-Berechtigungen. Das Entfernen von `storage_key` und `bucket` durch den Response-Sanitizer hilft hier nicht, weil die signierte URL bereits Zugriff gewährt.

### Relevante Dateien und Symbole

- [Nachrichten-Service und Hooks](../backend/src/services/messages/messages.js): `messages`, `after.create`, `forward`, `duplicateForwardFiles`, `cleanupDuplicatedForwardFiles`, `attachMessageRelations`.
- [Nachrichten-Schemas](../backend/src/services/messages/messages.schema.js): `createSchema`, `file_ids`.
- [Nachrichten-Domain](../backend/src/domains/messages/service.js): `prepareCreateData` und Übergabe von `fileIds`.
- [Nachrichten-Repository](../backend/src/domains/messages/repository.js).
- [URL-Signierung](../backend/src/lib/storage.js): `getFileUrl`, Standardgültigkeit im Ausgangsstand 3.600 Sekunden.
- [Response-Bereinigung](../backend/src/lib/file-response.js): `sanitizeFilesForExternal`.
- [Upload-Pfad](../backend/src/routes/upload.js).
- [Nachrichten-Tests](../backend/test/messages.service.test.js), [Forwarding-Tests](../backend/test/messages.forward.test.js), [Service-Boundary-Tests](../backend/test/service-boundary.authz.test.js).
- Nachgelagerte Arbeit: `parse-mentions.js`, `create-notifications.js`, `lib/search-index.js` und `backend/src/channels.js`.

### Bestätigte Reproduktion

1. Synthetische Datei `foreign-file` anlegen: Besitzer `other-user`, bereits an `private-message` gebunden.
2. Den tatsächlichen Datei-Hook mit `params.provider = 'rest'`, Benutzer `requesting-user`, `_fileIds = ['foreign-file']` und einer neuen Ergebnisnachricht ausführen.
3. Einen S3-Client mit ausdrücklich synthetischen Zugangsdaten und `https://storage.invalid` als Endpoint verwenden. Das Signieren benötigt keinen Download und keinen produktiven Speicher.
4. Beobachtung: Die Datenbankzuordnung bleibt `private-message`. Dennoch enthält `context.result.files` die fremde Datei und eine URL mit `X-Amz-Signature`.

Die Reproduktion isoliert den betroffenen Hook. Die dauerhafte Absicherung muss zusätzlich nachweisen, dass der externe Create-Pfad dieselbe Autorisierungsgrenze einhält.

### Zielverhalten

- Ein Aufrufer kann ausschließlich eigene, für diese Nachricht erfolgreich zugeordnete Uploads als Ergebnis erhalten.
- Fremde, nicht vorhandene oder bereits verwendete IDs führen zur Ablehnung des gesamten Zuordnungsversuchs, ohne fremde Metadaten zu verraten.
- Auch eine gemischte Liste aus gültigen und ungültigen IDs erzeugt keine teilweise erfolgreiche Nachricht.
- Zwei konkurrierende Requests dürfen dieselbe Upload-Datei nicht unterschiedlichen Nachrichten zuordnen.
- Bei Ablehnung entstehen weder eine verwaiste Nachricht noch teilweise veränderte Dateizuordnungen oder ein `messages created`-Event.

### Vorgeschlagene Umsetzung

1. Den vollständigen Create-Hook-Ablauf inklusive interner Forwarding-Aufrufe erfassen. Besonders klären, wann Feathers das externe Event veröffentlicht.
2. Datei-IDs vor dem Speichern normalisieren. Für doppelte IDs eine eindeutige Regel wählen; empfohlen ist Deduplizierung vor Mengenvergleich und Update. Keine pauschale Aufweichung der bestehenden Schema-Validierung.
3. Nachrichtenerstellung und Dateizuordnung in eine gemeinsame Datenbanktransaktion legen. Die konkrete Einbindung anhand der installierten Feathers-/Knex-Adapterversion prüfen; ein Transaktionsobjekt muss tatsächlich in allen relevanten Datenbankoperationen verwendet werden.
4. Zugehörigkeit und Verfügbarkeit atomar durchsetzen, beispielsweise mit bedingtem `UPDATE ... RETURNING` innerhalb der Transaktion. Die Zahl der zurückgegebenen eindeutigen IDs muss der Zahl der angeforderten eindeutigen IDs entsprechen. Bei Abweichung zurückrollen. Alternativ ist eine gesperrte Vorabselektion mit abgesichertem Update möglich.
5. Für Ergebnis und URL-Signierung ausschließlich diese autorisierte Ergebnismenge verwenden. Ein erneuter ungescopter Select über rohe Request-IDs ist unzulässig. Nur `user_id` beim zweiten Select zu ergänzen wäre als Gesamtlösung unzureichend, weil bereits belegte eigene Dateien und konkurrierende Zugriffe verbleiben.
6. Festlegen, welche nachgelagerten DB-Schreibvorgänge zur fachlichen Transaktion gehören. Die bestehenden Hooks verwenden teilweise `app.get('postgresqlClient')`; ein äußerer Transaktionsrahmen allein stellt deshalb noch keine Atomarität her.
7. Realtime- und Push-Ausgaben erst nach erfolgreichem Commit auslösen. Verhalten bei Fehlern in Suche, Metadatenanreicherung oder URL-Erzeugung explizit festlegen, damit ein bereits gespeicherter Vorgang nicht versehentlich als vollständig fehlgeschlagen erscheint und unkontrolliert wiederholt wird.
8. Forwarding berücksichtigen: Es erzeugt Kopien im Besitz des weiterleitenden Benutzers und räumt diese bei Fehlern wieder auf. S3-Kopieren und -Löschen sind nicht Teil einer PostgreSQL-Transaktion; die bestehende Kompensation muss erhalten bleiben.

### Erforderliche Tests

| Fall | Erwartung |
| --- | --- |
| Eigener ungebundener Upload | Nachricht erstellt, Datei genau dieser Nachricht zugeordnet, autorisierte URL vorhanden |
| Fremde Datei | Ablehnung; keine URL/Metadaten der Datei, keine Teiländerungen |
| Eigene Datei an anderer Nachricht | Ablehnung, bestehende Zuordnung unverändert |
| Nicht vorhandene ID | Gleiche Informationsgrenze wie bei nicht zugänglichen IDs |
| Gültige und ungültige IDs gemischt | Vollständiger Rollback |
| Doppelte IDs | Dokumentierte Normalisierungsregel, keine doppelte Zuordnung |
| Zwei konkurrierende Creates derselben Datei | Höchstens ein erfolgreicher Besitzer der Zuordnung, keine verwaiste Nachricht |
| Fehler nach Nachrichteninsert und vor Zuordnungsabschluss | Nachricht und Teilzuordnungen zurückgerollt |
| Externer REST-/Socket-Serviceaufruf | Authentifizierung, Channel-Berechtigungen und Dateigrenzen wirksam |
| Forwarding mit Dateikopien | Erfolgsfall erhalten; Kompensation bei Fehlern wirksam |
| Fehlgeschlagener Commit | Keine verfrühte Realtime-/Push-Veröffentlichung |

Konkurrenz und Rollback mit PostgreSQL nachweisen. Die vorhandene In-Memory-Datenbank kann einfache Autorisierungsfälle unterstützen, ist dafür aber kein Ersatz.

### Abnahme und Übergabe

- [x] Der bestätigte fremde URL-Zugriff ist geschlossen und dauerhaft reproduzierbar abgesichert.
- [x] Dateizuordnung und Nachrichtenerstellung sind bei Fehlern und Konkurrenz konsistent.
- [x] Interne Forwarding-Aufrufe sowie öffentliche Antwortformen funktionieren weiter.
- [x] Relevante Backend- und Integrationstests sind erfolgreich; Event-Reihenfolge ist überprüft.
- [x] Transaktionsumfang und Verhalten nach dem Commit sind im Handoff beschrieben.

Umgesetzt und verifiziert am 7. September 2026. Die [Übergabe AP-01](AP_01_HANDOFF.md) dokumentiert 42 PostgreSQL-Integrationstests, 621 Backend-Tests, 676 Frontend-Tests, vier erfolgreiche Browser-Kernpfade und den erfolgreichen lokalen CI-Lauf einschließlich Produktionsbuild und Plesk-/Garage-Prüfungen.

Dieses Paket besitzt die Nachrichtenkorrektur. Es soll nicht gleichzeitig den gesamten Nachrichten-Service oder die Meeting-Architektur neu ordnen. Die Korrektur muss vor einer späteren größeren Extraktion übernommen werden.

## AP-02: Erinnerungen gegen Abbrüche und Teilfehler absichern

Umgesetzt und verifiziert am 8. September 2026. Die folgenden Befunde beschreiben
den Ausgangsstand. Aktueller Zustandsvertrag, Migration 071, Nachweise und
vereinbarte Zustellgrenzen stehen in der [Übergabe AP-02](AP_02_HANDOFF.md).

### Problem und fachlicher Kontext

Erinnerungen werden in `message_reminders` gespeichert. Der Hintergrundprozessor sucht fällige Einträge im Zustand `active`, setzt sie auf `processing`, prüft den Zugriff auf die Nachricht, legt eine Zeile in `notifications` an und setzt anschließend die Erinnerung auf `delivered`. Nicht mehr zugängliche Nachrichten führen zu `cancelled`.

Zwei voneinander unabhängige Fehler sind bestätigt:

1. **Liegenbleiben nach Abbruch:** Der nächste Lauf selektiert ausschließlich `active`. Ein Prozessabbruch nach dem Claim hinterlässt `processing`, das ohne Wiederaufnahme dauerhaft übergangen wird.
2. **Doppelte Benachrichtigung:** Benachrichtigungsinsert und `delivered`-Update sind nicht atomar. Scheitert das Update, setzt der Catch-Block die Erinnerung wieder auf `active`. Ein weiterer Lauf erzeugt eine zusätzliche Benachrichtigung.

### Relevante Dateien und Symbole

- [Prozessor](../backend/src/services/message-reminders/processor.js): `processDueMessageReminders`, `canReadMessage`.
- [Reminder-Service](../backend/src/services/message-reminders/message-reminders.js): `create`, `patch`, `remove`, `ALLOWED_FIND_STATUSES`.
- [Bestehende Migration](../backend/migrations/057_message_reminders.js): partieller Unique-Index nur für `status = 'active'`.
- [Prozessor- und Service-Integrationstests](../backend/integration/message-reminders.postgres.test.js): ersetzen die früheren Memory-DB-Tests.
- [Scheduler](../backend/src/app.js): `messageReminderProcessing`, Intervall alle 30 Sekunden und initialer Prozessordurchlauf.
- [Benachrichtigungs-Dispatcher](../backend/src/lib/notification-side-effects.js): `enqueue`, `drain`, `flush`.
- [Frontend-Store](../frontend/src/stores/message-reminders.js) und [Store-Tests](../frontend/test/stores/message-reminders.test.js).

### Bestätigte Reproduktionen

**Veralteter Claim:** Eine synthetische Erinnerung mit `status: 'processing'` und Monate altem `updated_at` anlegen. `processDueMessageReminders` mit einem späteren Zeitpunkt ausführen. Beobachtet wurden `processed: 0` und der unveränderte Zustand `processing`.

**Teilfehler:** Eine fällige aktive Erinnerung mit zugänglicher Nachricht anlegen. Das Insert in `notifications` normal ausführen, beim ersten Update auf `delivered` einen Fehler injizieren. Danach den Prozessor erneut ausführen. Beobachtet wurden zwei Benachrichtigungszeilen für denselben Erinnerungsversuch.

Die vorhandene Prüfung mit dem Namen „delivers due reminders exactly once“ testet lediglich zwei reguläre sequenzielle Läufe. Sie deckt diese Fehlerfenster nicht ab.

### Zielverhalten und Konsistenzgrenze

Für eine einzelne Erinnerung gibt es höchstens eine zugehörige gespeicherte Benachrichtigung. Erinnerung und Benachrichtigung bleiben bei Fehlern konsistent. Ein Abbruch verhindert spätere Verarbeitung nicht dauerhaft. Die Verarbeitung toleriert zwei gleichzeitig gestartete Prozessorläufe.

Diese Garantie betrifft zunächst die Datenbank. Eine exakt einmalige Zustellung an Browser und externe Push-Dienste folgt daraus nicht automatisch. Die Instanz muss den Unterschied dokumentieren und die gewählte Wiederholungsstrategie ausdrücklich benennen.

### Vorgeschlagene Umsetzung

1. Zustandsübergänge für Erstellen, Verschieben, Abbrechen, Claim, Zustellabschluss und Wiederaufnahme skizzieren. Auch konkurrierende `patch`-/`remove`-Aufrufe während der Verarbeitung berücksichtigen.
2. Bevorzugt prüfen, ob eine kurze PostgreSQL-Transaktion pro Erinnerung ausreicht: fälligen Datensatz sperren, Status/Zeitpunkt erneut prüfen, Zugriff prüfen, Benachrichtigung anlegen und auf `delivered` setzen. Netzwerk-/Push-Arbeit erst danach ausführen. Bei diesem Ansatz kann ein dauerhaft gespeicherter `processing`-Zustand für neue Arbeit entfallen.
3. Falls persistente Claims benötigt werden, diese als zeitlich begrenzte, eindeutig besessene Claims modellieren: Token, Ablaufzeit und bedingter Abschluss. Ein alter Worker darf nach Ablauf seines Claims nicht den Zustand eines neuen Workers überschreiben. Ein pauschales Zurücksetzen aller `processing`-Einträge bei jedem Start ist dafür nicht ausreichend.
4. Eine robuste eindeutige Verbindung zwischen Erinnerung und Benachrichtigung festlegen. Möglich ist ein eindeutiger Reminder-Bezug auf der Benachrichtigung oder eine äquivalente durch Sperren und Datenmodell nachweisbar abgesicherte Lösung. Ein vorheriges „existiert bereits?“-SELECT ohne Konkurrenzschutz genügt nicht.
5. Bestehende `processing`-Einträge migrieren oder kontrolliert wieder aufnehmen. Dabei den partiellen Unique-Index beachten: Während eine alte Erinnerung `processing` war, konnte bereits eine neue aktive Erinnerung für denselben Benutzer und dieselbe Nachricht angelegt werden. Wiederaufnahme darf weder am Unique-Index hängen bleiben noch den neueren Termin still überschreiben.
6. Den Zugriff zum Verarbeitungszeitpunkt erneut prüfen. Aktuelle Regeln für Mitgliedschaft, Meeting-Historie, gelöschte Nachrichten und deaktivierte Konten vergleichen. Abweichungen als konkrete Entscheidung oder zusätzlichen Befund dokumentieren; diese wurden durch die ursprünglichen Reproduktionen nicht vollständig bewertet.
7. Zeit für Fälligkeit, Claims und Tests kontrollierbar injizieren. Der Ausgangscode mischt ein übergebenes `now` mit direkten `new Date()`-Aufrufen; das erschwert reproduzierbare Zeitgrenzentests.
8. Push-/Socket-Arbeit nach Commit auslösen. Für das Fehlerfenster zwischen Commit und `enqueue` festlegen, ob Wiederzustellung über eine persistente Outbox erfolgen soll oder ob nur die dauerhaft sichtbare In-App-Benachrichtigung garantiert wird. Die aktuelle In-Memory-Queue ist keine dauerhafte Zustellgarantie.
9. Gegebenenfalls neue Migration erstellen, einschließlich Umgang mit bestehenden Duplikaten, Referenzen und Rollback-Grenzen. Migration 057 unverändert lassen.

### Erforderliche Tests

- Normalfall und zweiter regulärer Durchlauf ohne Duplikat.
- Simulierter Fehler zwischen Benachrichtigungsinsert und Zustandsabschluss: vollständiger Rollback oder sichere Wiederverwendung derselben Benachrichtigung.
- Abbruch vor Commit, erneuter Prozessstart, erfolgreiche spätere Verarbeitung.
- Bestehender alter `processing`-Datensatz wird kontrolliert behandelt.
- Alter `processing`-Datensatz neben neuer aktiver Erinnerung desselben Benutzers/derselben Nachricht.
- Zwei echte gleichzeitige Datenbankverbindungen verarbeiten denselben fälligen Datensatz: höchstens eine Benachrichtigung.
- Verschieben oder Abbrechen konkurriert mit Verarbeitung: dokumentierte, konsistente Reihenfolge.
- Nachricht gelöscht oder Zugriff entzogen: keine unberechtigte Zustellung.
- Fehler im Push-/Socket-Dispatcher erzeugt keine zweite Datenbankbenachrichtigung.
- Falls Claims verwendet werden: Lease-Ablauf und verspäteter Abschluss des alten Workers.
- Upgrade bestehender Daten und erneutes Ausführen des neuen Prozessors.

### Abnahme und Übergabe

- [x] Beide bestätigten Fehlerfälle sind geschlossen und dauerhaft getestet.
- [x] Transaktions- und Konkurrenzverhalten ist mit PostgreSQL nachgewiesen.
- [x] Bestandsdaten im Zustand `processing` haben eine dokumentierte Behandlung.
- [x] Frontend-Verträge und die fachlichen Zustände der Service-API bleiben verständlich und kompatibel oder werden gezielt migriert.
- [x] Datenbankgarantie und Push-/Socket-Zustellgarantie sind getrennt beschrieben.
- [x] Falls das Scheduler-Interface geändert wurde, ist der Übergabevertrag für AP-05 dokumentiert. Der Aufruf bleibt kompatibel; die injizierbare Uhr ist dokumentiert.

## AP-03: Aussagekraft der Qualitätsprüfungen erhöhen

### Problem und fachlicher Kontext

Der Ausgangsstand hat viele erfolgreiche Tests, aber wichtige Fehlerklassen werden durch Teile der Prüfungen nicht ausgeführt oder technisch nicht nachgebildet:

- `lint` ruft hauptsächlich `node --check` auf. Das prüft Syntax, keine allgemeine Codequalität. Im Frontend werden `<script>`-Blöcke per regulärem Ausdruck extrahiert; Vue-Templates werden dabei nicht semantisch geprüft.
- Alle 61 Testdateien unter `frontend/test/components` und `frontend/test/views` lesen Quelltext ein. Viele Assertions prüfen konkrete Zeichenfolgen mit `toContain`, auch in Dateien mit „integration“ im Namen. Ein vorhandener Handlertext beweist keine funktionierende Interaktion, keinen korrekten Renderzustand und keine saubere Ressourcenfreigabe.
- `frontend/vitest.config.js` verwendet die Node-Umgebung und besitzt am Ausgangsstand keinen Vue-SFC-Plugin-Eintrag. `test/setup.js` stellt ein vereinfachtes globales `window` bereit. Das ist für bestehende Store-/Bibliothekstests brauchbar, aber keine DOM-Testumgebung.
- `backend/test/helpers/memory-db.js` implementiert unter anderem `forUpdate()` als wirkungslose Kettenmethode und `transaction()` als direkten Callback-Aufruf ohne Rollback. Solche Doubles beweisen keine PostgreSQL-Transaktions- oder Sperrsemantik.

Die Kritik gilt nicht pauschal für die gesamte Testsuite. Tatsächlich ausgeführte Store-/Bibliothekstests und die vorhandenen Browser-E2E sind wertvoll und sollen erhalten bleiben. Quelltextprüfungen können für bestimmte statische Verträge sinnvoll sein, dürfen aber nicht als ausgeführte Komponenteninteraktionen bezeichnet werden.

### Relevante Dateien

- [Backend-Lint](../backend/scripts/lint.mjs), [Frontend-Lint](../frontend/scripts/lint.mjs).
- [Root-Manifest](../package.json), [Backend-Manifest](../backend/package.json), [Frontend-Manifest](../frontend/package.json), `package-lock.json`.
- [Vitest-Konfiguration](../frontend/vitest.config.js), [bestehendes Test-Setup](../frontend/test/setup.js).
- [MessageInput-Quelltexttests](../frontend/test/components/MessageInput.test.js).
- [Draft-Quelltexttests](../frontend/test/components/MessageInputDraftPersistence.test.js).
- [MeetingView-Quelltexttests](../frontend/test/views/MeetingView.test.js).
- [In-Memory-DB](../backend/test/helpers/memory-db.js), [Service-Boundary-Tests](../backend/test/service-boundary.authz.test.js).
- [Playwright-Konfiguration](../frontend/playwright.config.js), [Test-URLs](../frontend/test/e2e/test-urls.js), [E2E-Reset](../backend/scripts/e2e-reset-db.mjs).
- [GitHub-CI](../.github/workflows/ci.yml).

### Teilpaket AP-03A: Statische Analyse

**Ziel:** `lint` erkennt zusätzlich zur Syntax tatsächliche JavaScript- und Vue-Probleme. Ein Verstoß gegen den verbindlichen Regelumfang führt lokal und in CI zu einem Fehlercode.

Vorgehen:

1. Vorhandene Regeln, Runtime-Versionen und Paketversionen inventarisieren. Eine mit dem aktuellen Stack kompatible ESLint-/Vue-Konfiguration oder gleichwertige statische Analyse einführen; konkrete Versionen anhand des aktuellen Lockfiles und der offiziellen Dokumentation auswählen.
2. Backend-Node-Code, Browser-Code, Vue-SFCs, Testcode und Build-Scripts mit passenden Umgebungen analysieren. `window` darf beispielsweise keine pauschale Backend-Globale werden. Die bestehenden Vue-Komponenten müssen weiterhin Options API verwenden können.
3. Mindestens undefinierte Variablen, unerreichbaren Code, doppelte Schlüssel, ungenutzte Variablen/Imports und wesentliche Vue-Template-Fehler erfassen. Promise-Regeln nur soweit verbindlich machen, wie sie im bestehenden JavaScript-Setup zuverlässig arbeiten; keine nicht vorhandene TypeScript-Typanalyse voraussetzen.
4. Projektcode und generierte Dateien unterscheiden. `dist`, `node_modules`, vendorte MediaPipe-Dateien und tatsächlich generierte Übersetzungsdateien brauchen begründete Behandlung; keine breiten Ausnahmen für problematische Anwendungsdateien.
5. Befunde in überschaubaren Änderungen korrigieren. Erforderliche Verhaltensänderungen separat absichern. Eine globale Regelabschaltung oder ein repositoryweiter Formatierungsumbau wäre kein sinnvoller Ersatz für diese Arbeit.
6. Optional JSDoc für zentrale API-/Event-/Domain-Verträge ergänzen, wenn es die Verständlichkeit konkret verbessert. Eine TypeScript-Migration ist ausgeschlossen.
7. Normale und `:rtk`-Scripts aktualisieren. Optionalen Formatierungscheck ausdrücklich von semantischer Prüfung unterscheiden.

Abnahmekriterien AP-03A:

- [x] Statische Analyse läuft für Backend und Frontend über einen dokumentierten verbindlichen Umfang.
- [x] Temporäre, nicht eingecheckte Kontrollbeispiele mit undefinierter Variable und ungültigem Vue-Template werden tatsächlich abgelehnt.
- [x] Jede Ausnahme besitzt eine nachvollziehbare Begründung; neu hinzugefügter Code wird nicht pauschal ausgespart.
- [x] Normale npm-Befehle funktionieren ohne RTK; CI verwendet denselben Regelumfang.
- [x] Vorhandene Tests und Frontend-Build bleiben erfolgreich.

### Teilpaket AP-03B: Ausgeführte Komponenten- und Interaktionstests

**Ziel:** Zentrale UI-Verträge werden an gerenderten Komponenten überprüft. Refactorings können die interne Implementierung verändern, ohne ausschließlich wegen geänderter Quelltextfragmente zu scheitern.

Vorgehen:

1. Ein getrenntes oder gezielt zugeordnetes Vitest-Setup für Vue-SFCs und DOM-Tests einrichten, beispielsweise mit Vue Test Utils und einer geeigneten DOM-Umgebung. Die vorhandenen Node-Tests sollen ihre passende Umgebung behalten.
2. Das bestehende globale `window`-Mock nicht unkontrolliert in DOM-Tests übernehmen. Router, Pinia und Naive-UI-Provider so bereitstellen, dass die betroffene Interaktion tatsächlich durchlaufen wird. Vorhandenes Markdown-/Linkify-Interop berücksichtigen.
3. LiveKit, Kamera, Mikrofon, Desktop-Bridge, externe Requests und Timer an ihren Systemgrenzen kontrollieren. Fachliche Entscheidungen und Eventverdrahtung der getesteten Komponente nicht vollständig wegmocken.
4. Alle 61 Komponenten-/View-Testdateien inventarisieren und je bisher geprüftem Vertrag festhalten: durch Laufzeittest ersetzen, als begründeten statischen Vertrag behalten oder nach Ersatz als redundant entfernen.
5. Als erste vollständige Vertikalen `MessageInput` einschließlich Drafts/Uploads sowie die Live-/Historienzustände von `MeetingView` absichern. Diese Tests bilden die Grundlage für AP-04.
6. Weitere berührte Komponenten, insbesondere `ChannelHeader`, anhand ihrer Interaktionen absichern. Eine große View kann vor der Extraktion mit gezielten Kindkomponenten-Stubs geprüft werden, solange die zu bewertenden Bedingungen und Events ausgeführt werden.
7. Einen geeigneten Negativnachweis durchführen: Ein temporär entfernter Eventhandler oder absichtlich falscher Renderzustand muss den betreffenden Test zum Scheitern bringen. Anschließend die temporäre Änderung vollständig zurücknehmen.
8. Quelltexttests erst entfernen, wenn ihre fachlich relevante Aussage ersetzt oder als ungeeignet dokumentiert ist. Die Anzahl bestandener Tests allein ist kein Erfolgsmaßstab.

Mindestens abzudeckende Interaktionen:

| Bereich | Laufzeitverhalten |
| --- | --- |
| Composer-Drafts | Texte und Dateien bleiben bei Channel-Wechsel erhalten; nur der erfolgreich gesendete Draft wird geleert |
| Sendefehler | Draft und Uploadzustand bleiben wiederherstellbar; Fehler wird angezeigt |
| Uploads | Auswahl, Paste und Drop führen zum vorgesehenen gemeinsamen Ablauf; SD/HD-Auswahl wirkt sich auf den Upload aus |
| Ressourcen | Objekt-URLs, Listener und Timer werden nach Entfernen/Unmount tatsächlich freigegeben |
| Berechtigungen | Archivierte bzw. nicht beschreibbare Channels lassen keinen Sendepfad auslösen |
| Meeting-Zustände | Scheduled, Active, Ended und Cancelled erzeugen die passenden verfügbaren Aktionen |
| Screensharing | Sichtbarkeit, Maximierung und Chat-Overlay wechseln korrekt; Navigation hinterlässt keinen alten Zustand |
| Meeting-Historie | Chat, Zusammenfassung und Transkript beachten verfügbare Artefakte und Zugriff |
| Einladungen | Auswahl und Absenden verwenden die richtigen Benutzer und das aktuelle Meeting |

Browser-E2E bleiben für echte Navigation, Session/Cookies, Medienbrowser-APIs und zusammenhängende Abläufe zuständig. Ein DOM-Test ersetzt keinen vollständigen Browser- oder Mediennachweis.

Abnahmekriterien AP-03B:

- [x] Vue-SFCs werden in einer geeigneten Umgebung tatsächlich gerendert und über Interaktionen geprüft.
- [x] Die genannten kritischen Vertikalen haben aussagekräftige Erfolgs- und Fehlerfalltests.
- [x] Für alle bisherigen Komponenten-/View-Quelltexttests ist die weitere Behandlung nachvollziehbar dokumentiert.
- [x] Entfernte Assertions haben eine fachliche Ersatzprüfung oder eine begründete Einstufung als redundant.
- [x] Node-Tests, neue Komponententests, relevante Browser-E2E und Build sind erfolgreich.

### Teilpaket AP-03C: PostgreSQL-Integrationstests

**Ziel:** Kritische SQL-, Berechtigungs-, Transaktions- und Konkurrenzverträge werden gegen eine echte PostgreSQL-Instanz geprüft.

Vorgehen:

1. Einen kleinen gemeinsamen Harness für eine ausschließlich dafür bestimmte Datenbank entwerfen. Verbindung und Isolierungsbestätigung müssen ausdrücklich konfiguriert werden; kein stiller Fallback auf `POSTGRES_DB` oder die normale `.env`-Datenbank.
2. Das bestehende `e2e-reset-db.mjs` vor Wiederverwendung lesen: Es beendet Verbindungen und löscht eine Datenbank. Für diesen Harness eigene harte Zielgrenzen und eine klare Eigentümerschaft an den Testdaten definieren.
3. Schema mit den echten Migrationen aufbauen. Fixtures mit gültigen Fremdschlüsseln und passenden Benutzern/Channels anlegen. Reinigung muss auf genau die angelegte Testdatenbank bzw. den ausdrücklich isolierten Testbereich begrenzt sein.
4. Adapter- und Service-Hook-Pfade nach Möglichkeit mit echten Feathers-Serviceaufrufen prüfen. Externe Params/Auth-Kontext realistisch setzen. Mindestens ein Transporttest soll zeigen, dass die gefixten Grenzen auch extern gelten.
5. Konkurrenztests mit mehreren unabhängigen Verbindungen und kontrollierter Synchronisation schreiben. Ein sequenzieller Aufruf oder eine gemeinsame künstliche Testtransaktion kann das Problem verdecken.
6. Auf AP-01/AP-02 aufbauen: Datei-Claim samt Rollback, Reminder-Zustellung samt Fehlerfenstern und Unique-Constraints sind die ersten verbindlichen Fälle.
7. Berechtigungsabfragen für private Channels und Meeting-Historie anhand realistischer SQL-Fixtures ergänzen. Vorhandene Query-Budgets erhalten, dabei Ergebnisrichtigkeit und tatsächliche SQL-Ausführung getrennt prüfen.
8. Die Integrationstests separat aufrufbar machen und in AP-06 verbindlich integrieren. Fehlende Datenbank-Voraussetzungen dürfen im verpflichtenden CI-Job nicht zu einem grün übersprungenen Lauf führen.

Abnahmekriterien AP-03C:

- [x] Ausdrücklich isolierter, dokumentierter Testaufbau mit echten Migrationen existiert.
- [x] Rollback und Konkurrenz aus AP-01/AP-02 sind gegen PostgreSQL geprüft.
- [x] Mindestens ein relevanter Membership-/Meeting-Historienfall prüft tatsächlich ausgeführtes SQL.
- [x] Testdaten-Cleanup kann die normale Entwicklungsdatenbank nicht versehentlich als Standardziel verwenden.
- [x] Lokaler Aufruf und CI-Job verwenden denselben Testumfang und melden fehlende Voraussetzungen klar.

### Gesamtübergabe AP-03

AP-03A, AP-03B und AP-03C können separat bearbeitet werden. Änderungen an Manifesten, Lockfile und gemeinsamen Setup-Dateien müssen koordiniert werden. Für AP-04 zuerst die ausgewählten Meeting-/Composer-Verhaltenstests bereitstellen. Für AP-06 die fertigen Scriptnamen und Infrastrukturvoraussetzungen übergeben.

- [x] Alle drei Teilpakete sind abgeschlossen oder ihr noch offener Umfang ist ausdrücklich ausgewiesen.
- [x] Die Dokumentation beschreibt, was Unit-, Komponenten-, Integrations- und E2E-Tests jeweils garantieren.
- [x] Kein Testerfolg wird aus einer reinen Quelltextprüfung als ausgeführtes Nutzerverhalten abgeleitet.

Umgesetzt und lokal verifiziert am 8. September 2026. Die [Übergabe AP-03](AP_03_HANDOFF.md) dokumentiert 28 ausgeführte Komponentenfälle, 699 Frontend-Tests, 617 Backend-Tests, 78 PostgreSQL-Integrationstests, elf erfolgreiche ausgewählte Browserfälle und den erfolgreichen lokalen CI-/Build-Lauf. Die [Vertragsmatrix](AP_03_TEST_CONTRACTS.md) benennt zurückgestellte UI-Umstellungen einzeln. Ein außerhalb dieses Umfangs gefundener Foreground-Benachrichtigungsfehler bleibt offen; der vollständige Browserbestand und ein GitHub-Lauf werden nicht als erfolgreich ausgewiesen.

## AP-04: Große Module nach Verantwortlichkeiten aufteilen

### Problem und fachlicher Kontext

Die grundlegende Verzeichnisstruktur ist sinnvoll, wird aber nicht in allen Bereichen konsequent durchgehalten. Besonders im Meeting-Bereich sammeln Views und Services viele voneinander unterschiedliche Aufgaben. Dadurch werden Änderungen schwerer zu überblicken und unerwartete Wechselwirkungen wahrscheinlicher.

Größen am Ausgangsstand:

| Datei | Gesamtzeilen | Zusätzlicher Befund |
| --- | ---: | --- |
| `frontend/src/views/MeetingView.vue` | 3.350 | Etwa 1.411 Zeilen JavaScript; Rendering, Routing, Einladungen, Video, Screensharing und Artefakte |
| `backend/src/services/meetings/meetings.js` | 1.653 | API-Methoden, SQL, Autorisierung, Zustandsänderungen und Integrationen |
| `frontend/src/components/ChannelHeader.vue` | 1.681 | Etwa 716 Zeilen JavaScript; mehrere Aktionen und Dialogabläufe |
| `frontend/src/views/SettingsView.vue` | 1.533 | Etwa 654 Zeilen JavaScript; mehrere Einstellungsbereiche |
| `frontend/src/lib/api-client.js` | 1.345 | Transport, Auth-/Sessionzustand, Refresh, Plattformcache und viele fachliche Endpunkte |
| `frontend/src/stores/voice.js` | 1.166 | Medien-/Verbindungszustand und zahlreiche Aktionen |
| `frontend/src/stores/meetings.js` | 1.108 | Meetingzustand, Einladungen, Recovery und fachübergreifende Store-Koordination |

Die Zeilenzahl dient als Hinweis, nicht als starres Ziel. Die Teilung soll verständliche Verantwortlichkeiten und beherrschbare Seiteneffekte erzeugen. Große Übersetzungs- oder generierte Datendateien sind ein anderer Fall und kein vorrangiges Ziel dieses Pakets.

### Relevante Dateien

- [MeetingView](../frontend/src/views/MeetingView.vue), [ChannelHeader](../frontend/src/components/ChannelHeader.vue), [SettingsView](../frontend/src/views/SettingsView.vue).
- [Meeting-Store](../frontend/src/stores/meetings.js), [Voice-Store](../frontend/src/stores/voice.js), [Realtime-Koordination](../frontend/src/stores/realtime.js).
- Vorhandene Komponenten: `MeetingVideoGrid.vue`, `MeetingScreenSharePanel.vue`, `MeetingTranscriptPanel.vue`, `MeetingSummaryPanel.vue`, `ScreenShareControls.vue`, `ScreenShareChatOverlay.vue`.
- Vorhandene Hilfsmodule unter `frontend/src/lib/meeting-*.js` sowie `frontend/src/lib/livekit.js`.
- [Meeting-Service](../backend/src/services/meetings/meetings.js) und [Meeting-Schemas](../backend/src/services/meetings/meetings.schema.js).
- Bestehende Backend-Domainmodule unter `backend/src/domains/meetings`: `policy`, `lifecycle`, `content-access`, `serializer`, `artifacts`, `artifact-state`, `recording-control`.
- [API-Client-Factory](../frontend/src/lib/api-client.js), [API-Fassade](../frontend/src/lib/api.js), [Socket-Client](../frontend/src/lib/socket-client.js).
- [API-Client-Tests](../frontend/test/lib/api-client.test.js), `frontend/test/stores/meetings.test.js`, `frontend/test/stores/voice.test.js` und Backend-Tests `meetings.*.test.js`.

### Gemeinsamer Vorgehensrahmen

1. Pro Teilpaket ein kurzes Verantwortlichkeitsbild erstellen: Wer hält Zustand, wer führt Seiteneffekte aus, wer kennt Transport-/UI-Details, wer entscheidet fachlich?
2. Bestehende öffentliche Verträge erfassen und durch Verhaltenstests absichern. Tests aus AP-03 nutzen; kleine fehlende Charakterisierungstests unmittelbar ergänzen.
3. Einen Anwendungsfall oder UI-Bereich nach dem anderen extrahieren. Keine gleichzeitige Neugestaltung des Produkts, der Session-Semantik oder aller Verzeichnisse.
4. Hilfsmodule mit passenden Namen und klaren Eingaben/Rückgaben verwenden. Ein neues universelles `utils.js` oder ein zweiter großer Controller würde die Verantwortlichkeiten lediglich verschieben.
5. Datenbanktransaktionen und externe Seiteneffekte explizit zuordnen. Eine Datei-Aufteilung darf keine bisher atomaren Operationen auseinanderziehen.
6. Architekturübersicht um die tatsächlich entstandenen Modulgrenzen, Event-Flüsse und Invarianten ergänzen.

### Teilpaket AP-04A: Frontend-Meeting- und UI-Verantwortlichkeiten

Empfohlenes Zielbild:

- Die Meeting-Route koordiniert die aktuelle Meeting-ID, initiales Laden, übergreifende Fehlerzustände und die Auswahl der sichtbaren Oberfläche.
- Eine Oberfläche für aktive Meetings verantwortet Video, Screensharing, Live-Teilnehmer und zugehörige Anzeigezustände.
- Eine Oberfläche für vergangene Meetings verantwortet Artefakt-Tabs, Chat-/Transkript-Bezüge und historische Darstellung.
- Einladungsdialog und Benutzersuche bilden einen eigenen abgegrenzten Ablauf.
- Fachlicher Meetingzustand und Netzwerkaktionen bleiben in geeigneten Stores/Services. Flüchtiger Darstellungszustand wie ein offenes lokales Menü darf in seiner Komponente bleiben.

Konkrete Planungsschritte:

1. `created`, `mounted`, `watch`, Route-Hooks und `beforeUnmount` der bestehenden View aufnehmen. Für jeden Listener, Timer und Watcher die künftige Eigentümerkomponente und das Cleanup festlegen.
2. Vorhandene Video-/Screenshare-/Artefakt-Komponenten weiterverwenden. Vor einer weiteren Extraktion prüfen, ob die Verantwortung dort bereits sinnvoll angesiedelt werden kann.
3. Zustände wie `meetingVideosVisible`, fokussierter Teilnehmer, Maximierung, mobile Menüs und Historien-Tab genau einer Stelle zuordnen. Kein doppelter veränderbarer Zustand in Route, Kindkomponente und Store.
4. Navigation zwischen Meetings sowie zu separaten Screenshare-Routen absichern. Späte Antworten des vorherigen Meetings dürfen den neuen Kontext nicht überschreiben; nur bei tatsächlich fehlendem Schutz eine passende Request-/Kontextprüfung ergänzen.
5. Danach `ChannelHeader` nach Aktionen/Dialogen aufteilen, beispielsweise Channel-Einstellungen, Mitgliederverwaltung und Meeting-/Voice-Einstieg. Bestehende Berechtigungsanzeige erhalten.
6. `SettingsView`, `MessageInput`, Meeting- und Voice-Store hinsichtlich verbleibender konkreter Mehrfachverantwortlichkeiten prüfen. Identifizierte zusammengehörige Abläufe extrahieren, wenn dies einen erkennbaren Vorteil bringt. Keine vollständige Store-Neuschreibung nur aufgrund der Dateigröße.

Zu erhaltende Verhaltensverträge:

- Scheduled/Active/Ended/Cancelled und host-/adminabhängige Aktionen.
- Unterschied zwischen Live-Zugriff und Historienzugriff, einschließlich eingeschränkter Artefakte.
- Desktop- und mobile Darstellung, Screenshare-Maximierung, Chat-Overlay und getrennte Fenster/Routen.
- Kamera-/Mikrofon-Fehler, Hintergrundeffekte und vorhandene Bestätigungsdialoge.
- Route-Query-Verweise auf Nachrichten und Transkriptstellen.
- Einladungen, Gäste, Teilnehmerfokus und saubere Navigation zwischen Meetings.
- Vorhandene Übersetzungen, barrierefreie Labels und fachlich verwendete E2E-Selektoren.

Abnahmekriterien AP-04A:

- [x] Die Meeting-Route enthält vorwiegend Ablaufkoordination; Live-Oberfläche, Historie und Einladungen besitzen klare Grenzen.
- [x] Wesentliche Header-Dialoge/Aktionen sind nachvollziehbar abgegrenzt.
- [x] Für jeden extrahierten Zustand und jede Ressource ist genau ein Besitzer erkennbar.
- [x] Relevante Komponenten-, Store- und Browser-E2E-Tests sowie Build sind erfolgreich.
- [x] Verhalten und Berechtigungen wurden erhalten; begründete Abweichungen sind separat dokumentiert.

### Teilpaket AP-04B: Backend-Meeting-Anwendungsfälle

Empfohlenes Zielbild:

- Der Feathers-Service registriert öffentliche Methoden, Validierung und Transportadapter und delegiert fachliche Abläufe.
- Fachliche Anwendungsfälle wie Erstellen/Planen, Beitreten, Einladen und Beenden koordinieren ihre benötigten Schritte.
- Repositories kapseln zusammengehörige SQL-Zugriffe und akzeptieren bei Bedarf eine bestehende Transaktion.
- Bereits vorhandene Policies, Content-Access-Regeln, Serializer und Artefaktmodule behalten klare Verantwortlichkeiten.

Konkrete Planungsschritte:

1. Öffentliche Methoden und Events inventarisieren. Das Eventrouting in `backend/src/channels.js` gehört zum Vertrag, auch wenn dessen Datei unverändert bleibt.
2. Die bereits extrahierten Domainmodule prüfen und erweitern, bevor ähnliche Regeln in neuen Modulen entstehen.
3. Mit einem begrenzten Anwendungsfall beginnen, beispielsweise dem Beitritt. Im Ausgangscode beinhaltet dieser unter anderem Teilnehmeränderungen, Aktivierung geplanter Meetings, Start-Mitgliedersnapshots, Channel-Mitgliedschaft und anschließenden Voice-Beitritt.
4. Die vorhandene Transaktion und ihre Isolationsanforderungen erhalten. Reads vor Transaktionsbeginn und mögliche Konkurrenzfenster dokumentieren; ein Refactoring allein darf nicht als Behebung eines ungetesteten Race-Conditions-Befunds bezeichnet werden.
5. LiveKit, Egress, E-Mail und Socket-Ausgaben über klar erkennbare Integrationsgrenzen ansprechen. Reihenfolge zum Datenbank-Commit und Kompensation bei Ausfällen festhalten.
6. Danach die weiteren umfangreichen fachlichen Abläufe schrittweise herauslösen. Methoden, die bereits klein und verständlich sind, brauchen keine zusätzliche Klasse allein für formale Einheitlichkeit.
7. Berechtigungsprüfungen, historische Mitgliedersnapshots und Query-Budgets durch die vorhandenen Tests und neue echte Integrationstests absichern.

Abnahmekriterien AP-04B:

- [x] Die wesentlichen Meeting-Anwendungsfälle haben klare fachliche Grenzen und benannte Transaktionsverantwortung.
- [x] Der Service ist deutlich leichter als Transport-/Registrierungsschicht lesbar.
- [x] Antwortformen, Fehlercodes, Membership-Regeln, Gästezugriff und Events bleiben erhalten.
- [x] Historienzugriff und Query-Budgets sind weiterhin korrekt.
- [x] Backend- und erforderliche PostgreSQL-Integrationstests sind erfolgreich.

### Teilpaket AP-04C: API-Client nach Transport, Session und Endpunkten trennen

Die Factory `createApiClient(options)` trägt im Ausgangsstand viele unterschiedliche Aufgaben. Dabei unterstützt sie sowohl Cookie- als auch Body-Refresh-Transport, anpassbare Basis-URLs und mehrere Desktop-/Workspace-Kontexte. Diese Eigenschaften dürfen bei der Aufteilung nicht versehentlich zu globalen Singletons werden.

Empfohlenes Zielbild:

- Gemeinsamer HTTP-Transport mit Basis-URL, Headern und FormData-Behandlung.
- Klar abgegrenzte Auth-/Session-Verwaltung mit Tokenzustand, Refresh-Zusammenführung, CSRF, Listenern und Cleanup.
- Fachliche Endpunktgruppen für beispielsweise Plattform/Registrierung, Benutzer/Sicherheit und Admin-/KI-Konfiguration.
- Eine kompatible Fassade über `api.js` und die bisherige Client-Factory, damit nicht sämtliche Stores gleichzeitig umgeschrieben werden müssen.

Konkrete Planungsschritte:

1. Öffentliche Rückgabe der Factory, aktuelle Optionen und externe Konsumenten erfassen.
2. Zunächst zustandsarme Endpunktgruppen extrahieren, denen der konkrete Client/Transport injiziert wird. Danach bei Bedarf Transport und Session trennen.
3. Pro Client-Instanz getrennte Tokens, Refresh-Promises, Timer und Listener erhalten. Bestehende plattformbezogene Caches nach ihrer aktuellen Basis-URL-Semantik bewahren und nicht ungeprüft globalisieren.
4. Die 401-Wiederholung, `__skipAuthRefresh`, `__authRetryAttempted`, parallele Refresh-Aufrufe, Logout und `destroy()` als explizite Verträge testen.
5. FormData-Requests dürfen keinen falsch festgeschriebenen `Content-Type` erhalten. Cookies, CSRF-Header und Body-Refresh müssen weiterhin zum jeweiligen Transport passen.
6. Desktop-/Workspace-Wechsel, Socket-Basis-URL und das Leeren lokaler Authentifizierung zusammen mit ihren vorhandenen Tests prüfen.

Abnahmekriterien AP-04C:

- [x] Endpunktgruppen und Auth-/Transportverantwortlichkeiten sind nachvollziehbar getrennt.
- [x] Bestehende Client-Konsumenten funktionieren über eine kompatible Fassade.
- [x] Mehrere Client-Instanzen teilen keinen versehentlich globalisierten Auth-Zustand.
- [x] Refresh, CSRF, Logout, Cleanup, FormData und Basis-URL-Varianten sind durch Verhaltenstests abgesichert.
- [x] Frontend-Tests, Build und relevante Auth-/Desktop-/Browser-Abläufe sind überprüft.

### Gesamtübergabe AP-04

Die drei Teilpakete können getrennt zugewiesen werden. Für AP-04A zuerst die relevanten Tests aus AP-03B bereitstellen, für AP-04B die benötigten Integrationsprüfungen mit AP-03C abstimmen. AP-04C kann mit vorhandenen API-Client-Tests beginnen.

- [x] Alle zugewiesenen Teilpakete sind mit ihren Abnahmekriterien dokumentiert abgeschlossen.
- [x] Die neue Modulstruktur ist in `docs/ARCHITECTURE.md` anhand tatsächlicher Verantwortung beschrieben.
- [x] Vorherige Dateigrößen werden nur als Vergleich ergänzt; die Abnahme beruht auf klaren Grenzen und Verhalten.
- [x] Offene Teilpakete werden nicht durch den Abschluss einer einzelnen Extraktion verdeckt.

## AP-05: Server-Lebenszyklus und Betriebsannahmen explizit machen

### Problem und belegter Ausgangsstand

`backend/src/app.js` richtet Datenbank, Storage, Services und Hintergrundarbeit ein. Im Setup werden mehrere `setInterval`-Aufrufe gestartet, ohne ihre Handles in einem gemeinsam verwalteten Lebenszyklus zu speichern. Der Teardown schließt Rate-Limiter und Datenbank, beendet diese Intervalle jedoch nicht.

`backend/src/index.js` baut den HTTP-Server, ruft `app.setup(server)` auf und beginnt zu lauschen. Eigene Handler für `SIGTERM` und `SIGINT` fehlen am Ausgangsstand. Damit ist kein vollständiger, explizit kontrollierter Pfad von einem Stop-Signal bis zum Ende aller Hintergrundarbeit erkennbar.

Zusätzlich ist die Anwendung in wichtigen Bereichen auf einen Backend-Prozess zugeschnitten:

- `presence.js` hält Online-Nutzer, Verbindungen und Vordergrundzustand in prozesslokalen Maps.
- Beim Start löscht `app.js` sämtliche `voice_participants` aus der gemeinsamen Datenbank.
- Transkript- und Summary-Prozessoren verwenden prozesslokale Sets für laufende Artefakte.
- Der vorhandene Redis-Rate-Limiter stellt für sich allein keine prozessübergreifende Presence-, Socket- oder Job-Koordination her.

Das sind nachvollziehbare Ausgangspunkte für einen Betrieb mit einer API-Instanz. Eine zweite parallel laufende API-Instanz oder überlappende Deployments dürfen daraus jedoch nicht als bereits unterstützt abgeleitet werden. Ein Rollout- oder Lasttest wurde in der Bewertung nicht durchgeführt.

### Relevante Dateien

- [App-Setup und Teardown](../backend/src/app.js), [HTTP-Einstieg](../backend/src/index.js).
- [Presence](../backend/src/presence.js), [Realtime-Channels](../backend/src/channels.js).
- [Reminder-Prozessor](../backend/src/services/message-reminders/processor.js).
- [Transkript-Prozessor](../backend/src/services/meetings/transcript-processor.js), [Summary-Prozessor](../backend/src/services/meetings/summary-processor.js), [Recording-Runtime](../backend/src/services/meetings/recordings-runtime.js).
- [Notification-Dispatcher](../backend/src/lib/notification-side-effects.js).
- [Update-Manager](../backend/src/lib/platform-updates.js): vorhandene `start`-/`stop`-Methoden und eigene Leasing-Logik berücksichtigen.
- [Backend-Container](../backend/Dockerfile), [Self-Hosted-Compose](../docker-compose.self-hosted.yml), weitere Compose-/Deployment-Varianten.
- [Self-Hosting-Dokumentation](SELF_HOSTING.md), [Meeting-Benchmark-Runbook](meeting-history-access-performance.md).
- [Presence-Tests](../backend/test/presence.test.js), [Dispatcher-Tests](../backend/test/notification-side-effects.test.js), Tests der einzelnen Prozessoren.

### Teilaufgabe A: Hintergrundarbeit zentral verwalten

1. Sämtliche periodischen Aufgaben und verzögerten Callbacks inventarisieren: Statusablauf, Gastablauf, Auto-Away, Meeting-Idle-Timeout, Ablauf geplanter Meetings, Transkript/Summary, Erinnerungen, Update-Prüfung und Presence-Disconnect-Timer.
2. Einen kleinen Runtime-/Scheduler-Baustein mit explizitem `start()` und asynchronem `stop()` einführen. Er besitzt Timer-Handles und die tatsächlich laufenden Promises. Bereits vorhandene Manager einbinden, statt dieselben Aufgaben erneut zu planen.
3. Pro Aufgabe festlegen, ob überlappende Ausführungen erlaubt sind. Für periodische DB-/KI-Arbeit ist eine Ausführung mit Wiederplanung nach Abschluss oder ein klarer In-Flight-Schutz meist passend. Der Schutz muss auch bei Fehlern wieder freigegeben werden.
4. Initiale Läufe und spätere Intervallläufe über denselben verwalteten Pfad ausführen. Ein langsamer initialer KI-Lauf soll nicht versehentlich mit einem bereits gestarteten Intervall konkurrieren. Den Zeitpunkt der Betriebsbereitschaft ausdrücklich festlegen.
5. `stop()` verhindert neue Arbeit und wartet auf bereits gestartete Arbeit innerhalb eines dokumentierten Zeitbudgets. `clearInterval` beendet keine bereits laufenden Promises; `unref()` allein ist ebenfalls kein geordneter Shutdown.
6. Bei Setup-Fehlern bereits geöffnete Ressourcen wieder schließen. Für Tests möglichst eine klar aufrufbare Runtime-Konstruktion verwenden, ohne beim bloßen Import einen vollständigen Produktivstart zu erzwingen.

### Teilaufgabe B: Geordnetes Herunterfahren

Empfohlener Ablauf, an die tatsächlich installierte Feathers-/Koa-/Socket.IO-Lebenszyklus-API anzupassen:

1. Shutdown einmalig markieren; weitere Signale lösen keinen zweiten konkurrierenden Teardown aus.
2. Neue Anfragen und neue Hintergrundarbeit stoppen. Falls Readiness eingeführt oder vorhanden ist, diese zu Beginn zurücknehmen.
3. HTTP-/Socket-Abbau und das Ende laufender Requests so koordinieren, dass offene WebSockets den Shutdown nicht unbegrenzt blockieren. Die konkrete Reihenfolge und Eigentümerschaft von `server.close`, Socket-Abbau und `app.teardown` prüfen.
4. Laufende Jobs und Benachrichtigungsarbeit drainieren. Im aktuellen Dispatcher reicht ein ungeprüfter Aufruf von `flush()` nicht als Nachweis: `drain()` kehrt bei bereits aktivem Drain früh zurück. Das neue Verhalten muss wirklich auf die relevante laufende Arbeit warten.
5. Presence-Timer und Listener freigeben. Beim Disconnect ausgelöste DB-Arbeit muss vor dem Schließen des Pools abgeschlossen oder ausdrücklich verhindert werden.
6. Erst danach Redis-/Rate-Limiter-Verbindungen, Storage-Clients und PostgreSQL-Pool schließen, soweit die jeweilige Ressource eine Cleanup-API besitzt.
7. Ein begrenztes Shutdown-Budget mit nachvollziehbaren Logs vorsehen. Beim Überschreiten den definierten Abbruchpfad ausführen; noch laufende Jobs brauchen einen durch AP-02 bzw. die jeweilige Joblogik wiederherstellbaren Zustand. Keine Datenbank schließen und anschließend unkontrolliert dieselben Jobs weiterschreiben lassen.
8. Setup-/Teardown-Hooks bleiben Middleware und müssen ihre Fortsetzung korrekt aufrufen. Bestehende Service-/Socket-Teardowns dürfen durch die neue Verwaltung nicht abgeschnitten oder doppelt ausgeführt werden.
9. Den Container-Start prüfen: Aktuell wird Node über `npm run start` gestartet. Signalweiterleitung und Stop-Verhalten unter dem realen Container-Einstieg testen und bei Bedarf mit einem direkten, passenden Entrypoint vereinfachen. Nicht allein aus einem lokalen Node-Test auf Containerverhalten schließen.

Erforderliche Tests:

- Start/Stop hinterlässt keine aktiven periodischen Timer.
- Wiederholter Stop ist sicher; ein zweiter Start erzeugt entweder einen sauber neuen Lebenszyklus oder wird ausdrücklich verhindert.
- Ein langsamer Job überlappt nicht mit seinem nächsten Tick, wenn dies untersagt ist.
- Nach Beginn von Stop starten keine weiteren Jobs.
- Der Datenbankpool wird erst nach der letzten erforderlichen DB-Arbeit geschlossen.
- Der Dispatcher-Drain wartet auch dann, wenn beim Stop bereits ein Batch verarbeitet wird.
- Fehler einer Aufgabe verhindern weder zukünftige zulässige Läufe noch Cleanup anderer Ressourcen.
- Setup-Fehler hinterlassen keine halb gestarteten Timer-/Verbindungssammlungen.
- Ein isolierter Prozess reagiert auf Stop-Signale; Container-Smoke-Test berücksichtigt den tatsächlichen Entrypoint und offene Sockets.
- Ein künstlich blockierter Job führt zum dokumentierten begrenzten Abbruchpfad.

### Teilaufgabe C: Unterstützte Topologie und Kapazität dokumentieren

1. Für den aktuellen Stand den Betrieb mit genau einer Backend-Instanz pro gemeinsamem Anwendungszustand ausdrücklich dokumentieren. Besondere Aufmerksamkeit gilt Deployments, bei denen alte und neue Container zeitweise gleichzeitig laufen.
2. Compose-/Dokploy-/Coolify-/Plesk-Anleitungen auf widersprüchliche Skalierungs- oder Rollout-Annahmen prüfen. Die globale Voice-Bereinigung beim Start und ihre Konsequenzen für bestehende Medienverbindungen beschreiben oder gezielt korrigieren.
3. In diesem Paket keine vollständige verteilte Architektur einführen. Ein späterer Mehrinstanzbetrieb benötigt ein eigenes belegtes Konzept für Socket-Events/Rooms, Presence, Job-Claims und Besitzer der Startup-Bereinigung. Änderungen aus AP-02 machen nur die betreffende Jobverarbeitung robuster.
4. Eine reproduzierbare Lastprüfung gegen isolierte Daten vorbereiten und einen dokumentierten Basislauf durchführen. Mindestens Anmeldung/Session, Socket-Verbindungen, Nachrichtensenden/-empfangen, Timeline-/Historienzugriffe und Reconnects berücksichtigen.
5. WebRTC-/Video-/Egress-Kapazität als separate Medienlast behandeln. 1.000 offene Sockets oder 1.000 HTTP-Clients sind kein Nachweis für 1.000 aktive Videoteilnehmer. Fake-LiveKit aus E2E darf nicht als Medienkapazitätsnachweis verwendet werden.
6. Vorher konkrete Szenarien, Dauer, Parallelität und Akzeptanzgrenzen definieren. Beispielsweise stufenweise 100/500/1.000 Verbindungen untersuchen, soweit die isolierte Umgebung dies zulässt. Erreichbare Stufen und Grenzen ehrlich protokollieren.
7. Hardware, Containerlimits, Datenmenge, Node-/PostgreSQL-Version, Pool-Konfiguration und aktivierte Dienste festhalten. Mindestens p50/p95, Durchsatz, Fehlerquote, Event-Verzögerung, CPU/RAM und Datenbankauslastung erfassen.
8. Bestehenden Meeting-Historienbenchmark nutzen, wo er passt. Er prüft einen bestimmten Zugriffspfad und ersetzt nicht die übrigen Lastszenarien.

### Abnahme und Übergabe

- [ ] Alle relevanten Hintergrundaufgaben besitzen einen verwalteten Start-/Stop-Lebenszyklus.
- [ ] Signalverarbeitung, laufende Requests/Jobs, Socket-Abbau und Ressourcenschließung sind konsistent getestet.
- [ ] Dispatcher- und Presence-Cleanup sind berücksichtigt; keine ausstehenden Timer schreiben nach Pool-Schließung.
- [ ] Unterstützte Eininstanz-Topologie und Auswirkungen überlappender Deployments sind dokumentiert.
- [ ] Reproduzierbarer Lasttest-Aufruf und ein Basisbericht mit tatsächlich gemessenen Ergebnissen liegen vor.
- [ ] Nicht erreichte Laststufen oder nicht verfügbare Medieninfrastruktur werden als offene Verifikation ausgewiesen.

AP-05 muss die in AP-02 gewählte Reminder-Verarbeitung einbinden, ohne deren Fachlogik erneut zu ändern. Mit AP-04B ist die Zuständigkeit für Meeting-Jobs und externe Seiteneffekte abzustimmen. Teilaufgabe C kann getrennt bearbeitet werden; ein fertiger Shutdown allein schließt die Kapazitätsprüfung nicht ab.

## AP-06: Lokale Prüfungen und GitHub-CI vereinheitlichen

### Problem und belegter Ausgangsstand

Der Name `ci` beschreibt lokal einen anderen Prüfumfang als der GitHub-Workflow. Einzelne wichtige Prüfungen sind jeweils nur auf einer Seite vorhanden. Das erschwert die Aussage, ob ein lokal geprüfter Stand auch alle verbindlichen Kriterien für einen Pull Request erfüllt.

| Prüfung | Root-`npm run ci` am Ausgangsstand | GitHub-Workflow am Ausgangsstand |
| --- | --- | --- |
| Dokploy-Template-Konsistenz | Ja | Nein |
| Lint/Syntax | Ja | Ja |
| Übersetzungsprüfung | Ja | Nein |
| Release-Katalog/Versionskonsistenz | Nein | Ja |
| Backend-Tests | Ja | Ja |
| Frontend-Tests | Ja | Ja |
| Frontend-Build | Ja | Ja |
| Plesk-Paket, Paketprüfung, Plesk-/Garage-Tests | Ja | Ja |
| Browser-E2E | Nein | Ja, eigener Job mit PostgreSQL und Garage |
| Dependency-Audit | Nein | Ja, Security-Job |
| Secret- und Konfigurations-/Vulnerability-Scan | Nein | Ja, Security-Job |
| Dedizierte PostgreSQL-Serviceintegration aus AP-03 | Noch nicht vorhanden | Noch nicht vorhanden |

Der Workflow ruft `npm run ci` nicht einfach auf, sondern listet Prüfungen separat. Die Unterschiede sind deshalb kein bloßer Anzeigename, sondern tatsächlich unterschiedliche ausgeführte Befehle.

### Relevante Dateien

- [Root-Scripts](../package.json), [Backend-Scripts](../backend/package.json), [Frontend-Scripts](../frontend/package.json).
- [GitHub-CI](../.github/workflows/ci.yml), [Release-Workflow](../.github/workflows/release.yml).
- [Engineering Playbook](engineering-playbook.md), [Contributing](../CONTRIBUTING.md).
- [Release-Validierung](../scripts/validate-releases.mjs), [Dokploy-Builder/-Check](../scripts/build-dokploy-template.mjs), [i18n-Check](../scripts/i18n-check.mjs).
- [Plesk-Garage-Runner](../scripts/run-plesk-garage-integration.mjs), [Playwright-Konfiguration](../frontend/playwright.config.js).
- Neue Lint-/Komponenten-/PostgreSQL-Integrationseinträge aus AP-03.

### Zielverhalten

Es gibt einen klar dokumentierten verbindlichen Prüfumfang und wiederverwendbare Befehle für seine Bestandteile. Lokal und in GitHub werden dieselben produktbezogenen Prüfschritte ausgeführt. Unterschiede bei Bereitstellung von Diensten, Scan-Werkzeugen, Report-Upload und CI-Berechtigungen sind ausdrücklich beschrieben.

Schnelle Prüfungen dürfen weiterhin separat ausführbar sein. Ihr Erfolg darf jedoch nicht als vollständiger CI-Erfolg bezeichnet werden, wenn Integration, Browser oder Security noch fehlen.

### Vorgeschlagene Umsetzung

1. Matrix am aktuellen Stand verifizieren und Scriptnamen aus AP-03 übernehmen. Die sofortigen Lücken bei i18n und Dokploy im GitHub-Workflow sowie Release-Validierung im lokalen Aggregat können früh geschlossen werden.
2. Kleine wiederverwendbare Gruppen definieren. Empfohlener Zielvertrag: ein schneller Core-Prüfbefehl für statische Analyse, Metadaten, Unit-/Komponententests und Build; getrennte Integrations-/Browser- und Security-Befehle mit klaren Voraussetzungen; ein dokumentierter vollständiger Gesamtpfad. Die konkreten Namen in einem gemeinsamen Plan festlegen, bevor mehrere Manifeste geändert werden.
3. Die Core-Gruppe lokal und im Workflow identisch aufrufen. Für Integration und E2E dieselben Testscripts verwenden; GitHub stellt nur PostgreSQL/Garage/Browser und die passende Umgebung bereit.
4. Den Namen `ci` eindeutig festlegen. Wenn er den vollständigen Gesamtpfad bezeichnet, dürfen fehlende Voraussetzungen nicht still zum Überspringen verpflichtender Prüfungen führen. Wird ein anderer Einstieg zum vollständigen Prüfen gewählt, den bestehenden Namen und seine Grenzen unmissverständlich dokumentieren.
5. Security-Prüfungen erhalten. Für lokale Entsprechungen zu Gitleaks/Trivy die nötigen CLI-/Containerwerkzeuge und Parameter dokumentieren oder passende Wrapper bereitstellen. GitHub-spezifische Kommentar-/Report-Funktionen dürfen plattformspezifisch bleiben, die fachlichen Scan-Regeln müssen nachvollziehbar sein.
6. `package.json`-Scripts als gemeinsame Quelle verwenden, statt Befehlsfolgen in YAML und Dokumentation dauerhaft mehrfach zu pflegen. Normale Scripts enthalten keine RTK-Abhängigkeit; jede neu eingeführte lokale Variante erhält eine `:rtk`-Entsprechung.
7. GitHub-Jobs können parallel bleiben, wenn sie unabhängig sind. Sicherheits- oder Integrationsprüfungen nicht versehentlich durch `continue-on-error`, Shell-Verkettung, falsche Filter oder zu weite Path-Filter entwerten.
8. Reports und Fehlersignale erhalten: aussagekräftige Testausgaben, Browser-Artefakte und ein korrekter Exit-Code. Der Status eines Gesamtjobs muss bei einer verpflichtenden fehlgeschlagenen Prüfung fehlschlagen.
9. Dockerabhängige Plesk-/Garage-Prüfungen sowie neue Datenbanktests mit ihren tatsächlichen Voraussetzungen aufführen. Unterschiede zwischen Linux-CI und lokaler PowerShell berücksichtigen; Shell-spezifische Parallelisierung nicht ungeprüft in plattformübergreifende Scripts übernehmen.
10. Release-Workflow auf wiederverwendbare Prüfungen und doppelte bzw. fehlende Gates prüfen. Dieses Paket verändert keine Release-SemVer und keine Channel-Metadaten.
11. Engineering Playbook und Contributing aktualisieren: Schnellprüfung, vollständige Prüfung, benötigte Infrastruktur, Testdaten-Isolation, erwartete Laufumgebung und Interpretation fehlgeschlagener Schritte.

### Erforderliche Verifikation

- Gemeinsam verwendete Core-Gruppe einmal vollständig lokal ausführen.
- Neue PostgreSQL-Integration, Browser-E2E und Plesk-/Garage-Prüfungen in der dafür vorgesehenen isolierten Umgebung tatsächlich ausführen, soweit diese für den Abschluss verfügbar ist.
- Konfiguration der GitHub-Jobs gegen den dokumentierten Gesamtumfang vergleichen. Ein statisches YAML-Review allein ist kein Nachweis eines erfolgreichen GitHub-Laufs.
- Vorübergehend einen kontrollierten Fehler in einer geeigneten nicht versionierten Fixture oder isolierten Kopie erzeugen und nachweisen, dass der gemeinsame Einstieg fehlschlägt. Keine absichtliche Beschädigung veröffentlichter Release-Daten.
- Fehlende Voraussetzungen müssen einen nachvollziehbaren Fehler oder ausdrücklich unvollständigen Status ergeben; kein grüner Scheinlauf.
- RTK-Varianten stichprobenartig auf identischen fachlichen Umfang prüfen. CI und Container müssen mit den normalen Varianten auskommen.

### Abnahme und Übergabe

- [ ] Ein vollständiger, verbindlicher Prüfumfang ist dokumentiert.
- [ ] i18n, Dokploy-Template und Release-/Versionsvalidierung sind auf beiden relevanten Wegen enthalten.
- [ ] Lint, Unit-/Komponenten-, Datenbank- und Browser-Tests verwenden gemeinsame fachliche Einstiegspunkte.
- [ ] Security- und Plesk-/Garage-Prüfungen sind erhalten und klar eingeordnet.
- [ ] Fehlende Infrastruktur oder eine fehlschlagende Pflichtprüfung können nicht als vollständiger Erfolg erscheinen.
- [ ] Normale und `:rtk`-Scripts sowie Contributor-Dokumentation sind konsistent.
- [ ] Tatsächlich ausgeführte lokale/CI-Prüfungen sind getrennt von nur geprüfter Konfiguration ausgewiesen.

## Abschlussprotokoll je Instanz

Die folgende Vorlage am Ende der jeweiligen Umsetzung ausfüllen, beispielsweise im PR-/Task-Handoff. Den Status in der Übersicht nur für den tatsächlich erledigten Umfang ändern. Bei getrennten Teilpaketen deren IDs ausdrücklich angeben.

```markdown
### Übergabe AP-XX / AP-XXA

- Bearbeiteter Stand: <Commit/Branch/Datum>
- Ergebnis: <konkretes Verhalten bzw. entstandene Modul-/Prüfstruktur>
- Abgeschlossener Umfang: <Hauptpaket oder benannte Teilpakete>
- Geänderte Dateien: <Pfade mit Zweck>
- Entscheidungen: <Transaktionsgrenzen, Zustandsmodell, öffentliche Verträge>
- Migration/Bestandsdaten: <erforderlich? Vorgehen und geprüfte Fälle>
- Tests: <exakte Befehle, Ergebnisse, relevante Fehler-/Konkurrenzfälle>
- Umgebung: <DB/Container/Browser; besondere Voraussetzungen>
- Nicht ausgeführte Prüfungen: <mit tatsächlichem Grund>
- Offene Abnahmekriterien: <konkrete verbleibende Arbeit>
- Übergabe an andere Pakete: <Schnittstellen, Scriptnamen, Konfliktdateien>
```

Ein Paket gilt erst als abgeschlossen, wenn seine funktionalen Kriterien und die zugehörige Verifikation erfüllt sind. Eine neue Testinfrastruktur ohne die beschriebenen Regressionen, eine reine Datei-Extraktion ohne erhaltene Verträge oder ein aktualisierter Workflow ohne nachvollziehbaren Prüfumfang sind jeweils nur Teilfortschritte.
