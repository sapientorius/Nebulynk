# Umsetzungsplan AP-01: Sichere, atomare Dateizuordnung bei Nachrichten

Stand: 7. September 2026

Geprüfter Commit: `baa254c7396f1e0ebce8800d190631ba4c1ec799` / Anwendung `0.5.1`

Ursprünglicher Auftrag: Umsetzung planen. Status: **Am 7. September 2026 umgesetzt und verifiziert.**

Dieser Text bewahrt den ursprünglichen Entwurf. Die tatsächlichen Änderungen,
Prüfungen und Grenzen stehen in der [Übergabe AP-01](AP_01_HANDOFF.md).

Grundlage: [AP-01 im Projektmaßnahmenplan](PROJECT_REVIEW_ACTION_PLAN.md#ap-01-dateizugriff-beim-erstellen-von-nachrichten-korrigieren).

## 1. Am aktuellen Code bestätigte Ausgangslage

- In `backend/src/services/messages/messages.js` verwendet `after.create` beim Datei-Update Besitzer und freie Zuordnung als Bedingungen, liest anschließend aber wieder alle angeforderten IDs. Für diese unzureichend eingeschränkte Menge werden URLs signiert.
- Das Nachrichteninsert erfolgt über den geerbten Knex-Adapter vor diesem Hook. Mengenprüfung und gemeinsame Transaktion fehlen.
- Suchindex, Mentions, Benachrichtigungen und Lesestand verwenden derzeit den globalen DB-Client. `createNotifications` fängt Fehler ab und ruft den Dispatcher unmittelbar nach dem Insert auf; dieser startet per Microtask.
- `forward` kopiert S3-Objekte, legt eigene ungebundene Datei-Datensätze an und ruft `this.create` auf. Sein Fehlerpfad löscht die Kopien bislang ohne Prüfung einer inzwischen bestehenden Nachrichtenzuordnung.
- Meetings erstellen intern Textnachrichten mit `skipNotifications: true`. Dieser Aufruf muss weiterhin funktionieren.
- Installiert sind Feathers und der Knex-Adapter `5.0.40` sowie Knex `3.1.0`. Der Adapter verwendet `params.transaction.trx` sowohl für das Insert als auch den anschließenden `_get`.
- Der installierte Feathers-`eventHook` umschließt die Service-Hooks und emittiert `created` nach deren erfolgreichem Abschluss. Damit kann ein Service-`around.create` den Commit vor dem automatischen Event sicherstellen. Diese Reihenfolge erhält einen Verhaltenstest.
- `backend/test/helpers/memory-db.js` implementiert `transaction` lediglich als direkten Callback; `forUpdate` ist wirkungslos. Damit lassen sich weder Rollback noch Konkurrenz nachweisen. Die vorhandenen Forwarding-Tests ersetzen außerdem `service.create` durch einen Stub.

Die Prüfung erfolgte lesend am Code einschließlich installierter Adapterquellen. Die frühere Sicherheitsreproduktion und die Testzahlen des Maßnahmenplans wurden in diesem Planungsschritt nicht erneut ausgeführt.

## 2. Verbindliche Entwurfsentscheidungen

### Eingaben und Fehlervertrag

`prepareCreateData` dedupliziert gültige `file_ids` mit `Set` unter Erhaltung ihrer ersten Reihenfolge. Die bestehende Schema-Validierung bleibt erhalten; keine Typkonvertierung, kein stilles Entfernen ungültiger Einträge und kein Trimmen von IDs. Fehlende IDs bzw. eine leere Liste bei gültigem Text behalten ihren bisherigen Vertrag. Für den vom Schema bereits erlaubten Dateianhang ohne `content` wird der gespeicherte Inhalt auf `''` gesetzt, damit das bestehende NOT-NULL-Feld erfüllt ist.

Eine fremde, nicht vorhandene oder bereits gebundene Datei führt einheitlich zu `BadRequest` / HTTP 400 mit dem neuen Fehlercode `api.messages.attachments_unavailable`. Die Meldung lautet sinngemäß „Mindestens eine Datei ist nicht verfügbar.“ Fehlerdaten enthalten weder betroffene IDs noch Besitzer, Dateinamen, Zuordnungen oder URLs. Bestehende Authentifizierungs-, Membership- und Schemafehler bleiben erhalten. Adminrechte erlauben keine Übernahme fremder Uploads.

### Transaktionsrahmen

Ein ausschließlich für `messages.create` registrierter Around-Hook öffnet eine Knex-Callback-Transaktion, setzt auf einer aufruflokalen Kopie von `params` den Adapterparameter `transaction: { trx }`, führt `await next()` aus und wartet anschließend auf den tatsächlichen Commit. Fehler werden weitergeworfen; Knex rollt den Callback zurück. Der Hook stellt aufruflokale Parameter im `finally` wieder her und verwirft vorgemerkte Ausgaben bei Fehlern.

Der Rahmen gilt auch für Textnachrichten, damit derselbe Create-Pfad einheitliche Fehlersemantik besitzt. `forward` erhält keinen zusätzlichen äußeren Transaktionsrahmen: Die S3-Kopien entstehen vorher, sein innerer Create-Aufruf besitzt die Transaktion. Aktuelle interne Aufrufer übergeben keine äußere Transaktion. Eine unerwartet übergebene äußere Transaktion wird vor Schreibzugriffen ausdrücklich abgewiesen; sie darf nicht still überschrieben oder vorzeitig bestätigt werden. Allgemeine verschachtelte Transaktionsunterstützung gehört nicht zu AP-01.

Alle Create-Schreibzugriffe und die zum Aufbau des Ergebnisses notwendigen DB-Abfragen erhalten denselben `trx`. Dafür werden Repository-/Hilfsfunktionen gezielt um einen optionalen DB-Parameter ergänzt. Globale `service.options.Model`, Repository-Instanzen oder App-Einstellungen werden während eines Requests nicht umgeschaltet.

Der Adaptervertrag wurde lokal in `node_modules/@feathersjs/knex/lib/adapter.js` geprüft; die [Feathers-Dokumentation zu Transaktionen](https://feathersjs.com/api/databases/knex#transactions) beschreibt die Weitergabe über die Service-Parameter ebenfalls.

### Autorisierte Zuordnung und Ergebnismenge

Nach dem Nachrichteninsert führt eine Repository-Methode innerhalb der Transaktion ein bedingtes Update aus:

```sql
UPDATE files
SET message_id = :message_id, updated_at = :now
WHERE id IN (:unique_file_ids)
  AND user_id = :actor_id
  AND message_id IS NULL
RETURNING *;
```

Dies ist SQL-Pseudocode; die Umsetzung verwendet gebundene Knex-Parameter. Die zurückgegebenen eindeutigen IDs müssen exakt der angeforderten eindeutigen Menge entsprechen. Andernfalls wird vor jeder Signierung abgebrochen und die gesamte Transaktion zurückgerollt.

Nur die zurückgegebenen Zeilen dürfen `result.files`, URL-Signierung und Datei-Suchindexierung speisen. Ihre Ausgabe wird anhand der deduplizierten Eingabereihenfolge stabil sortiert. Der bisherige ungescopte Select entfällt. Der externe Sanitizer entfernt weiterhin `storage_key` und `bucket`; auch Socket-Payloads aus internen Create-Aufrufen müssen diese Grenze einhalten. Dafür wird das vollständig vorbereitete externe Ergebnis als bereinigte Kopie in `context.dispatch` gesetzt, unabhängig von `params.provider`. Der installierte Socket-Transport verwendet diese Ausgabe; interne Aufrufer können ihren bisherigen Ergebnisvertrag behalten.

Für den Konflikt um dieselbe Datei genügt PostgreSQLs `READ COMMITTED`: Ein konkurrierendes Update wartet auf den ersten Schreiber und prüft danach seine WHERE-Bedingung erneut. Nach erfolgreicher erster Zuordnung liefert der zweite Versuch diese Datei nicht mehr zurück und rollt seine Nachricht zurück. Diese Ableitung wird mit echten parallelen Transaktionen geprüft. Siehe [PostgreSQL 17: Read Committed](https://www.postgresql.org/docs/17/transaction-iso.html#XACT-READ-COMMITTED).

Überlappende Mehrdatei-Requests werden ebenfalls getestet. Ein DB-Deadlock oder Lock-Timeout muss vollständig zurückrollen; der Service führt keine automatische Wiederholung des gesamten Create-/Forward-Vorgangs ein. Eine Sortierung der Eingabe allein wird nicht als garantierte SQL-Sperrreihenfolge betrachtet.

### Umfang vor und nach dem Commit

| Operation | Zeitpunkt und Fehlerverhalten |
| --- | --- |
| Nachrichteninsert und Dateizuordnung | Derselbe `trx`; jeder Fehler rollt alles zurück |
| Nachrichten-/Datei-Suchindex | Derselbe `trx`; Fehler rollt die Nachricht zurück |
| Mentions und Benachrichtigungszeilen | Derselbe `trx`; Persistenzfehler werden im transaktionalen Create-Pfad weitergeworfen |
| `channel_members.last_read_at` | Derselbe `trx`; kein fortgeschriebener Lesestand bei Ablehnung |
| Autorendaten, Reply-/Forward-Previews, Dateibereinigung und URL-Signierung | Ergebnis vor dem Commit fertigstellen; notwendige DB-Abfragen verwenden `trx`; Fehler rollt zurück |
| Automatisches `messages created` | Erst nach abgeschlossenem Commit; bisheriger Eventname und Channel-Routing bleiben erhalten |
| Notification-Events und Push | Benachrichtigungszeilen bis zum Commit aufruflokal vormerken, erst danach an den vorhandenen Dispatcher übergeben |

Die Signierung erzeugt vor dem Commit noch keine externe Ausgabe. Signierte URLs dürfen weder geloggt noch an den Dispatcher übergeben werden. So führt ein Signierungs- oder Previewfehler zu einem echten Rollback statt zu einer Fehlermeldung nach bereits erfolgter Speicherung.

Das Einreihen nach dem Commit ist gegen Fehler abzusichern und zu protokollieren; ein Dispatcher-/Pushfehler darf den gespeicherten Create-Vorgang nicht nachträglich als gescheitert ausgeben. Der vorhandene Dispatcher bleibt bestehen. AP-01 garantiert die Commit-Reihenfolge, aber keine dauerhafte oder exakt einmalige Push-/Socket-Zustellung. Ein Prozessabbruch zwischen Commit und Ausgabe bleibt ohne Outbox ein dokumentiertes Zustellungsfenster.

### Forwarding und Kompensation

Die Kopien gehören weiterhin dem weiterleitenden Benutzer und werden über denselben autorisierten Create-Pfad zugeordnet. Quellzugriff, Zielkanalrechte, Forward-Metadaten, Vorschauen und Voice-Dateimetadaten bleiben erhalten.

Die Kompensation entfernt ausschließlich die für diesen Forward-Versuch erzeugten und weiterhin ungebundenen Datei-Datensätze des Forwarders. Dafür dient ein bedingtes `DELETE ... RETURNING`; S3-Löschungen verwenden nur die damit sicher freigegebenen Objektschlüssel. Eine bereits gebundene Kopie darf auch bei einem nachgelagerten Fehler oder unklarem Commit-Ausgang nicht gelöscht werden. Ist die DB-Prüfung nicht möglich, werden keine möglicherweise gebundenen S3-Objekte gelöscht; der Fehler wird protokolliert.

Auch das Fenster „S3-Kopie erfolgreich, Datei-Insert fehlgeschlagen“ wird berücksichtigt: erzeugte Objektschlüssel werden bereits nach erfolgreichem Kopieren erfasst. Nur nachweislich ungebundene bzw. sicher nicht persistierte Kopien werden kompensiert. DB- und S3-Fehler werden getrennt behandelt, ohne den ursprünglichen Create-Fehler zu verdecken.

## 3. Umsetzung in fünf aufeinander aufbauenden Schritten

| Schritt | Konkrete Arbeit | Ergebnis |
| --- | --- | --- |
| 1. Regression und PG-Testbasis | Externe Create-Sicherheitsfälle auf dem tatsächlichen registrierten Service ergänzen; isolierte PostgreSQL-Fixture und gezielten Integrationseinstieg anlegen | Die fremde Datei-Reproduktion schlägt am Ausgangscode als Regressionstest fehl; Lock-/Rollback-Tests verwenden echte PostgreSQL-Verbindungen |
| 2. Atomarer Create-Pfad | Deduplizierung, Around-Transaktion, Repository-Update mit `RETURNING` und einheitlichen Fehler ergänzen; unsicheren Select entfernen | Eigene freie Uploads funktionieren; ungültige Mengen werden vollständig zurückgerollt |
| 3. Nachgelagerte Arbeit | Create-Hooks und Preview-Abfragen an `trx` binden; transaktionale Notification-Persistenz von Dispatcher-Ausgabe trennen; Ausgabe erst nach Commit | Suchindex, Mentions, Benachrichtigungen und Lesestand bleiben bei Fehlern konsistent; keine vorzeitigen Events |
| 4. Forwarding und Transport | Echten inneren Create-Aufruf testen; Kompensation absichern; REST/JWT und Socket.IO einschließlich Event-Payloads prüfen | Interne und externe Pfade halten dieselben Dateigrenzen ein |
| 5. Gesamtprüfung und Übergabe | Relevante Regressionen vollständig ausführen; Fehlervertrag, Transaktionsumfang, Kompensation und Prüfgrenzen dokumentieren | AP-01 erst nach erfüllten Abnahmekriterien abschließen |

Die Schritte bilden ein zusammengehöriges Sicherheitspaket. Eine Teilkorrektur des Selects allein gilt nicht als Abschluss.

## 4. Geplante Dateizuständigkeiten

| Dateien/Bereich | Geplante Änderung |
| --- | --- |
| `backend/src/services/messages/messages.js` | Create-Hook-Reihenfolge, Transaktionsrahmen anbinden, sichere Dateiergebnisse, Preview-DB-Weitergabe, Forward-Kompensation |
| `backend/src/services/messages/messages.create-transaction.js` (neu) | Kleiner nachrichtenspezifischer Around-Hook mit Commit-/Rollback- und Dispatcher-Grenze |
| `backend/src/domains/messages/service.js` | Datei-IDs deduplizieren, fachlichen Fehler bei unvollständiger autorisierter Menge auslösen |
| `backend/src/domains/messages/repository.js` | Atomare Dateizuordnung und bedingte Bereinigung; optionale DB-Weitergabe für Create-relevante Reads |
| `backend/src/hooks/parse-mentions.js`, `is-channel-member.js`, `check-permission.js` | Den Create-Transaktionsclient für Mentions und Zugriffsprüfungen verwenden; keine zweite Poolverbindung während des Create-Aufrufs benötigen |
| `backend/src/hooks/create-notifications.js` | Transaktionsclient, Weitergabe von Persistenzfehlern im Create-Pfad, verzögerte Dispatcher-Übergabe; `skipNotifications` erhalten |
| `backend/src/lib/i18n-messages.js`, `frontend/src/lib/api-error-messages.js` | Neuen generischen Fehlercode auf Deutsch und Englisch ergänzen |
| `backend/test/messages.domain.test.js`, `messages.forward.test.js`, `service-boundary.authz.test.js`, `create-notifications.hook.test.js`, `socket-contract.test.js` | Passende bestehende Tests erweitern |
| `backend/integration/messages-create.postgres.test.js` (neu) | Reale Service-, Konkurrenz-, Rollback-, Commit- und Transporttests |
| `backend/test/helpers/postgres-test-db.js` (neu) | Isolierte Testdatenbank mit echten Migrationen und begrenztem Cleanup |
| `package.json`, `backend/package.json` | Gezielten PostgreSQL-Testeinstieg samt `:rtk`-Varianten ergänzen; mit AP-03/AP-06 koordinieren |
| `docs/security-service-access-matrix.md`, `docs/engineering-playbook.md` | Dateigrenze und reproduzierbaren Prüfbefehl samt Testdatenbank-Voraussetzungen beschreiben |

`messages.schema.js`, `storage.js`, `file-response.js`, `search-index.js` und `channels.js` werden hinsichtlich der Verträge geprüft und nur bei nachgewiesenem Bedarf geändert. Insbesondere akzeptieren die Suchindexfunktionen bereits einen DB-Client. Der Dispatcher und der Reminder-Prozessor aus AP-02 benötigen für den vorgesehenen Ansatz keinen Umbau.

Eine Produktionsmigration ist nach dem geprüften Schema nicht erforderlich: `files.id` ist Primärschlüssel und `message_id` bereits nullable mit Fremdschlüssel. Alte Migrationen und bestehende Nachrichtenzuordnungen werden nicht verändert. Bereits ausgegebene signierte URLs werden durch die Codekorrektur nicht rückwirkend ungültig.

## 5. Regressionen und Abnahmebelege

| Testgruppe | Verpflichtende Fälle und Prüfaussagen |
| --- | --- |
| Gültige Eingaben | Ein bzw. mehrere eigene freie Uploads; nur Datei ohne Text gemäß bestehendem Schema; Text ohne Dateien; doppelte IDs erzeugen genau einen Anhang je ID |
| Ungültige Dateien | Fremd ungebunden, fremd gebunden, eigene bereits gebunden, nicht vorhanden, gemischte Listen; identischer Fehlervertrag, keine fremden Metadaten oder Signierungen |
| Vollständiger Rollback | Fehler nach Nachrichteninsert, nach Datei-Update und bei Suche, Mentions, Notification-Insert, Lesestand, Preview bzw. Signierung; neue Nachricht fehlt, Datei- und Nebenzeilen entsprechen dem Ausgangszustand |
| Konkurrenz | Zwei unabhängige Verbindungen/Creates mit derselben Datei, auch in unterschiedlichen Zielkanälen; synchronisierte Überlappung statt nur sequenzieller Aufrufe; genau ein Erfolg ohne injizierten Zusatzfehler, keine Nachricht des Verlierers |
| Mehrdatei-Konkurrenz | Überlappende Mengen in umgekehrter Eingabereihenfolge sowie zunächst blockierender Request mit anschließendem Rollback; keine Teilzuordnungen, keine dauerhaften Hänger |
| Commit und Events | Commit vorübergehend an einer Barriere anhalten: noch kein `created`, Notification-Event, Push oder Dispatcher-Enqueue; nach Commit gespeicherte Daten über unabhängige Verbindung im Event-Listener sichtbar |
| Commitfehler | Echter erst beim Commit ausgelöster PG-Fehler, z. B. nur in der Fixture eingerichteter verzögerter Constraint-Trigger; kompletter Rollback und keinerlei Ausgaben |
| Nach Commit | Dispatcher-Enqueue und Push gezielt fehlschlagen lassen; Nachricht und Zuordnungen bleiben bestehen, der Create-Aufruf wird dadurch nicht zum Fehler |
| REST und Socket.IO | Echte JWT-Authentifizierung über lokale Testtransporte; fehlendes/ungültiges Token, fehlende Membership, fehlendes Senderecht, fremde Datei und Erfolgsfall; Event-Routing und bereinigte Payloads auch für interne Creates |
| Forwarding | Mit/ohne Dateien, mehrere Kopien, Voice-Metadaten, Quell-/Zielrechte, fehlgeschlagener Create/Commit, Fehler beim Kopieren/Datei-Insert; Originale unverändert, nur sichere Kopien kompensiert |
| Bestehende Verträge | Replies und Forward-Previews, `skipNotifications` aus Meetings, Admin-/DM-Sonderregeln sowie bestehende Read-/Patch-/Remove-Pfade |

Für Signierungstests dienen ausschließlich synthetische Zugangsdaten und `https://storage.invalid`. S3-Kopieren/-Löschen und externer Push werden an ihren Grenzen ersetzt. PostgreSQL, der Nachrichtenadapter, Hook-Reihenfolge und Authentifizierung der Transporttests bleiben real.

## 6. Testumgebung und Befehle

Die PG-Fixture erhält eine ausdrücklich konfigurierte Testinstanz von PostgreSQL 17. Sie erzeugt pro Lauf eine neue Datenbank mit eindeutigem Namen `nebulynk_test_ap01_<runid>`, wendet die Repository-Migrationen an und legt minimale Benutzer-, Rollen-, Channel- und Datei-Fixtures an. Der konfigurierte Zugang benötigt dafür Datenbank-Erstellungsrechte ausschließlich auf dieser isolierten Instanz. Verbindungen und Testserver werden im `finally` geschlossen; Cleanup darf nur die nachweislich in diesem Lauf erzeugte Datenbank betreffen.

Es gibt keinen Fallback auf `backend/.env`, `knexfile.js` oder die Entwicklerdatenbank. Das bestehende `e2e:reset-db` wird nicht als Setup verwendet. Fehlende Testkonfiguration oder PostgreSQL führt beim Integrationseinstieg zu einem klaren Fehler statt übersprungenen grünen Tests. Konkurrenztests erhalten mehrere Poolverbindungen, Barrieren und begrenzte Timeouts.

Neue Integrationstests liegen unter `backend/integration/`, damit der bestehende Unit-Test-Glob `test/**/*.test.js` nicht plötzlich eine Datenbank voraussetzt. Vorgesehene Scripts:

- Backend: `test:integration` und `test:integration:rtk` für die PostgreSQL-Suite.
- Root: `test:backend:integration` und `test:backend:integration:rtk` als Workspace-Einstiege.
- Normale Varianten enthalten keine RTK-Abhängigkeit. Neue Testabhängigkeiten werden nur bei Bedarf ergänzt; `pg`, Knex und die Servertransporte sind bereits vorhanden.

Geplanter Pflichtprüfumfang nach Umsetzung, jeweils vom Repository-Root:

```powershell
rtk npm run test:backend:integration
rtk npm run test:backend
rtk npm run lint
rtk npm run i18n:check
rtk npm run test:frontend
rtk npm run build:frontend
```

Zusätzlich den bestehenden Browser-Kernpfad für Upload/Senden/Forwarding mit isolierter E2E-Datenbank prüfen, soweit vorhanden, und bei geändertem UI-Verhalten passend ergänzen. `rtk npm run ci` bleibt der bevorzugte breitere Abschlusslauf bei verfügbaren Docker-/Garage-Voraussetzungen; sein aktueller Umfang ersetzt weder die neue PG-Suite noch einen Browserlauf.

Für Node-/Vitest-/Playwright-Prozessstarts gelten die lokalen Vorgaben zum vorgesehenen Ausführungsweg außerhalb der Sandbox. Tatsächliche Ergebnisse, nicht verfügbare Infrastruktur und eventuelle `spawn EPERM`-Fallbacks werden getrennt dokumentiert. In diesem Planungsschritt wurden keine Tests, Migrationen oder Container gestartet.

## 7. Abschluss und Grenzen

AP-01 kann abgeschlossen werden, sobald die fünf Abnahmepunkte des Maßnahmenplans durch erfolgreiche Regressionen einschließlich PostgreSQL und Transport-/Eventprüfungen belegt sind. Die Übergabe nennt Änderungen, den neuen Fehlercode, Transaktionsumfang, Verhalten nach Commit, Forward-Kompensation und tatsächlich ausgeführte Befehle. Der Maßnahmenplan bleibt bis dahin auf **Offen**.

AP-03 kann die gezielte Testinfrastruktur anschließend vereinheitlichen; AP-06 kann den neuen Integrationseinstieg in seine gemeinsamen Prüfgruppen aufnehmen. AP-01 wartet darauf nicht. Release, Deployment, globale Service-Extraktion, ein Outbox-System und automatische Reparatur historischer Daten sind nicht Bestandteil dieses Plans.
