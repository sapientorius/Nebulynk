# AP-03: Übergabe

Stand: 8. September 2026. AP-03A, AP-03B und AP-03C sind im vereinbarten Umfang umgesetzt und lokal verifiziert. Die UI-Laufzeitumstellung umfasst MessageInput mit Drafts/Uploads, MeetingView und ChannelHeader. Weitere Altprüfungen sind einzeln in der [Vertragsmatrix](AP_03_TEST_CONTRACTS.md) ausgewiesen.

## Umsetzung und fachliche Korrekturen

- `eslint.config.mjs` ersetzt die Syntax-Wrapper durch ESLint 9, JavaScript Recommended und Vue Essential. Backend, Frontend, Tests einschließlich Integration/E2E, Migrationen, Konfiguration und eigene Scripts werden geprüft. Node, Browser und Worker erhalten passende Globals. Generierte Build-Ausgaben und vendorte öffentliche Assets sind ausgeschlossen; eigene Übersetzungsmodule bleiben enthalten. Root- und Workspace-Einstiege verwenden dieselben Regeln, ohne Formatierungsvorgaben.
- Vitest führt getrennte Projekte `node` und `components` aus. Die 28 Komponentenfälle rendern Vue-SFCs mit jsdom, Vue Test Utils, echtem Pinia, Memory-Router, Übersetzungen und Naive-UI-Providern. Markdown-/Linkify-Interop bleibt in beiden Projekten aktiv. `test:frontend` umfasst beide Projekte; `test:frontend:components` führt ausschließlich die DOM-Tests aus. Beide besitzen RTK-Entsprechungen.
- Der vorhandene PostgreSQL-Harness verlangt zusätzlich `NEBULYNK_TEST_POSTGRES_ISOLATED=true`. URL und Migrationsziel werden vor Verbindungsaufnahme geprüft. Der kompatible Datenbankpräfix `nebulynk_test_ap01_` bleibt erhalten. Es gibt keinen Fallback auf die Anwendungsdatenbank. Neue Tests prüfen Cleanup bei Migrations-/Testfehlern, unveränderte Admin-Datenbank, private Membership und alle drei Historienpolicies. Einzel-, Batch- und Channel-Zugriff werden mit echtem SQL verglichen; Query-Erfassung beginnt erst nach den Fixtures.
- Der neue GitHub-Job `postgres-integration` verwendet PostgreSQL 17 und denselben Befehl `npm run test:backend:integration`, ohne Skip bei fehlender Konfiguration. Branch-Protection-Einstellungen wurden nicht verändert.

Die Analyse und Laufzeittests deckten drei konkrete Anwendungsfehler auf: Ein während des Channel-Wechsels abgeschlossener direkter Upload landete im falschen Draft; jetzt wird die ursprüngliche Channel-ID vor dem Await festgehalten. Zwei bereits implementierte Primary-Admin-Transferaktionen fehlten im zurückgegebenen Store und sind nun erreichbar, mit Erfolgs-/Fehlerregression. Bereits verwendete Icons in MeetingView und MeetingSummaryPanel waren nicht als Komponenten registriert und sind nun registriert. Weitere Lint-Korrekturen entfernen ungenutzte Bindungen und identische doppelte Übersetzungsschlüssel oder präzisieren Globals/Cleanup-Kommentare. Öffentliche API-/Eventverträge und Migrationen bleiben erhalten.

## Laufzeitabdeckung und Grenzen

| Suite | Nachgewiesene Verträge |
| --- | --- |
| `MessageInput.component.test.js` | Drafts bei Channel-Wechsel und laufendem Send; Fehler/Retry; Schreibsperren; Dateiauswahl, Paste und AppView-Drop; tatsächlicher SD-/HD-Uploadpayload; Upload/Channel-Race; URL- und Listener-Cleanup unter Erhalt benötigter Draft-Ressourcen |
| `MeetingView.component.test.js` | Vier Statusvarianten und Aktionsrequests; Endefehler; Artefaktverfügbarkeit/Zugriffssperre; Share-Sichtbarkeit/Maximierung/Chat; echte Routerwechsel und Cleanup; Einladungen/Fehler/Retry; Such-Timer und Resize-Listener |
| `ChannelHeader.component.test.js` | Desktop-/Mobilmenüs; Meetings-/Historienpanel-Events; Call-Sichtbarkeit; Meetingplanung mit Request und Navigation; Historienpolicy speichern und erneute Berechtigungsprüfung; Summary-Preset und Auswahlmodus |
| PostgreSQL-Erweiterungen | Startmitglied, späteres/ehemaliges/aktuelles Mitglied, tatsächlicher Teilnehmer, nur Eingeladener und Außenstehender über alle drei Policies; private Channel-Mitgliedschaft; getrennte Ergebnis- und Query-Budget-Prüfung |

Alle 61 ursprünglichen UI-Quelldateien mit 180 Testverträgen sind inventarisiert; die [JSON-Begleitdatei](AP_03_TEST_CONTRACTS.json) bewahrt ihre Assertions. Sieben ersetzte Testfälle wurden entfernt, darunter die vollständig ersetzten Dateien FileUpload und MessageInputDraftPersistence. Die 59 verbleibenden Dateien tragen ausdrücklich `static source contract` in ihren Suite-Namen. Ein statischer Treffer zählt nicht als ausgeführtes Benutzerverhalten. Noch nicht vollständig umgestellte Verträge, einschließlich zusätzlicher Varianten innerhalb der drei Schwerpunktkomponenten, bleiben in der Matrix einzeln als `deferred-runtime` benannt.

DOM-Tests kontrollieren Requests an der API-Grenze; ausgewählte schwere Kindkomponenten sind gestubbt, die fachlichen Stores und Handler der untersuchten Elternkomponente werden ausgeführt. Naive-UI-Auswahlen verwenden teilweise deren öffentliche Update-Events. Screensharing im Browser nutzt den bestehenden Fake-LiveKit-Adapter und einen Canvas-MediaStream. Dies prüft Browserinteraktion und Zustandswechsel, liefert aber keinen Nachweis für echte Kamera-/Mikrofonhardware, Desktop-Capture oder LiveKit-Medientransport.

## Tatsächlich ausgeführte Prüfungen

Die lokalen Läufe nutzten Windows/PowerShell sowie ausschließlich für AP-03 erzeugte PostgreSQL-17-, Redis-7- und MinIO-Container. Die Browserumgebung hatte eine eigene E2E-Datenbank und synthetische Medien-/SMTP-Konfiguration. Entwicklerdienste und deren Daten wurden nicht als Reset-Ziel verwendet.

| Prüfung | Ergebnis |
| --- | --- |
| `npm run lint` und `npm run lint:rtk` | Erfolgreich, gleicher Regel- und Dateiumfang |
| `npm run test:backend` | 617 erfolgreich |
| `npm run test:frontend` und `npm run test:frontend:rtk` | 699 erfolgreich, einschließlich 28 DOM-Fällen |
| `npm run test:frontend:components` | 28 erfolgreich in drei Dateien |
| `npm run test:backend:integration` mit expliziter URL/Isolierung | 78 erfolgreich, keine übersprungen; alle 69 AP-01/AP-02-Regressionen erhalten |
| `npm run ci` | Erfolgreich: Dokploy, Lint, i18n, Backend/Frontend, Produktionsbuild, Plesk-Paketprüfung/-Tests und Garage-Integration |
| Fokussierter Playwright-Abnahmelauf, Chromium, ein Worker, keine Retries | 11 erfolgreich |
| Vier temporäre Negativkontrollen | Alle vier erwartungsgemäß fehlgeschlagen |
| `git diff --check` | Erfolgreich |

Shell-Aufrufe wurden gemäß Repository-Vorgabe mit `rtk` umschlossen; die normalen npm-Scripts selbst benötigen kein RTK. Der RTK-Paritätslauf prüfte Frontend und Lint stichprobenartig. PostgreSQL und Browser-E2E sind weiterhin separate Gates außerhalb des bestehenden lokalen `ci`-Aggregats; dessen Neuordnung gehört AP-06.

Die elf Browserfälle umfassen Setup/Login, Einladung annehmen, Messaging/Upload, Dateiweiterleitung, Callstart/Annahme, Beitritt zum laufenden Channel-Meeting, nachträglichen Historienzugriff samt Policy-Sperre, Meeting-Einladungskarte, Voice-Beitritt/-Verlassen, Drafts nach Reload und den neuen Screensharing-/Navigationsfall. Der lokale fokussierte Config-Wrapper übernimmt die Projektkonfiguration, entfernt jedoch Projektabhängigkeiten, damit nicht sämtliche Onboarding-Tests zusätzlich zum Filter laufen. Die ausgewählten Setup-/Onboarding-Fälle laufen weiterhin zuerst. Für eine Wiederholung mit der normalen Projektkonfiguration sind deren vollständige Projektabhängigkeiten einzuplanen.

Die Lint-Kontrollen übergaben eine undefinierte Variable und ein leeres Vue-`v-if` per stdin unter regulären Anwendungspfaden: jeweils Exitcode 1 mit `no-undef` bzw. `vue/valid-v-if`. Für die UI-Kontrollen erzeugte ein temporäres Vite-Plugin isolierte Quelltextkopien im Testprozess: MessageInputs Submit-Clickhandler wurde entfernt; MeetingViews Scheduled-Cancel-Bedingung wurde auf Active verfälscht. Die zugehörigen Tests scheiterten jeweils mit einer Assertion. Originaldateien wurden dabei nicht verändert. Lokale Kontrollskripte und Protokolle liegen im ignorierten `output/` und gehören nicht zur Anwendung.

## Separater Befund und nur geprüfte Konfiguration

Ein zusätzlich gestarteter breiterer Browserlauf scheiterte bei `returning to the foreground marks a visible source message notification as read`: Die Notification war bereits vor dem erwarteten Foreground-Wechsel gelesen. Bis dahin bestanden 16 Tests; vier nachfolgende Fälle wurden nicht ausgeführt. Dieser Benachrichtigungsfall liegt außerhalb der ausgewählten AP-03-Vertikalen und bleibt offen. Der vollständige Browserbestand wird daher ausdrücklich nicht als erfolgreich gemeldet. Zwei beim Abnahmelauf gefundene Testprobleme wurden behoben: Login wartet nun auf abgeschlossene Channel-Navigation und sichtbaren Composer; der Meeting-Beitritt wird auf den Meeting-Header statt einen mehrdeutigen Buttontext gescopt.

Der neue GitHub-Job wurde lokal am YAML und am identischen Integrationsbefehl geprüft, aber nicht auf GitHub ausgeführt. Ein vollständiger grüner GitHub-Workflow ist damit nicht nachgewiesen. Es gab keine Produktionsmigration, Versionsanhebung, Veröffentlichung oder Komponentenextraktion aus AP-04.
