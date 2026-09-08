# AP-04 – Umsetzung und Prüfstand

Stand: 8. September 2026. Gesamtstatus: **umgesetzt und lokal technisch abgenommen**. Kein Release, keine Migration,
keine neuen Abhängigkeiten und keine AP-05-Lebenszyklusänderungen.

## Teilpakete

| Teilpaket | Stand | Noch erforderlich |
| --- | --- | --- |
| AP-04C | Transport, Session und Endpunktgruppen eingebunden; kompatible aktive API-Fassade einschließlich SMTP; technisch abgenommen | Keine AP-04-Arbeit offen |
| AP-04A | Meeting-Flächen, Header-Aktionen, Sicherheitsformulare sowie Store-Runtimes eingebunden und geprüft; technisch abgenommen | Keine AP-04-Arbeit offen |
| AP-04B | Vollständige Komposition und sämtliche Domain-Module eingebunden; Service-, PostgreSQL- und Browser-Verträge geprüft; technisch abgenommen | Keine AP-04-Arbeit offen |

Die vom Nutzer ausdrücklich freigegebene Kompositionsfassung wurde unverändert
nach `backend/src/services/meetings/meetings.js` übernommen. Die abschließenden
Prüfungen unten liefen gegen die tatsächlich eingebundene Datei, **ohne
Test-Loader oder Ersatzimplementierung**. Der zuvor offene Freigabeschritt ist
damit erledigt.

## Änderungen und Verhaltenskorrekturen

- API: Kompositionsfactory, Axios-Transport, instanzbezogene Session, drei
  Endpunktgruppen, weiterhin gemeinsamer Plattformcache je normalisierter URL.
  HTTP-Fassade, Optionen, Refresh-Flags, Fehlerformen und Desktop-Kontextwechsel
  bleiben erhalten.
- Meeting-UI: Route und vier fachliche Oberflächen/Dialoge, wiederverwendete
  Video-/Screenshare-/Artefakt-/Chat-Komponenten, unveränderte Labels und Selektoren.
  Aktivierungs- und Evidenzgenerationen verhindern verspätete Kontextwechsel.
- Header: Gruppen-, Settings-/Archiv-, Planungs-, Summary- und Verlassen-Aktionen.
  Die Verlassen-Runtime lebt unabhängig vom geöffneten Menü bis zur Navigation.
- Settings: Passwort, Zwei-Faktor und Passkeys besitzen ihre eigenen Formulare;
  Tabwechsel erhalten Formularzustand und bisherige Ladevorgänge.
- Stores: Klingeln und Einladungstimeouts sind pro Store isoliert. Reset/Dispose
  invalidieren auch noch laufende Einladungsantworten. LiveKit-Callbacks verwenden
  explizite Zustandsaktionen; Verbindungs- und Mikrofonabläufe bleiben im Store.
- Backend: Anwendungsfälle für Join, Erstellung/Planung, Einladungen/Gastlinks,
  Metadaten/Umplanung, Abschluss und Artefaktaktionen; getrennte Read-/Access-
  Dienste, SQL-Repository und benannte Adapter. Feathers behält Registrierung,
  Authentifizierung, Validierung und Dispatch. Commit → Voice → `joined` sowie
  Abschlusszustand und Fehler nach Commit sind mit PostgreSQL abgesichert.

## Tatsächliche Verifikation

| Prüfung | Ergebnis |
| --- | --- |
| `rtk npm run lint` | bestanden |
| `rtk npm run test:backend` | 621 bestanden im abschließenden CI-Lauf |
| `rtk npm run test:frontend` | 697 bestanden |
| `rtk npm run build:frontend` | bestanden |
| `rtk npm run ci` | bestanden, einschließlich Build, Paketprüfung und Garage-Proxyintegration |
| `rtk npm run test:backend:integration` | 89 bestanden, 0 übersprungen; isolierter PostgreSQL-Container auf localhost:55404 |
| Browserabnahme mit Fake-LiveKit | 14/14 bestanden im abschließenden Lauf gegen die eingebundene Komposition, ohne automatische Retries |

Die Browserauswahl umfasst Setup/Login, Einladung, Messaging, mobile Navigation,
Channel-Verlassen, Call-Start/-Beitritt, retroaktive Historienpolicy, Meeting-
Benachrichtigungen, Gäste, das Öffnen von Meetings, Voice-Indikatoren,
Screenshare-Navigation und Passwortwechsel. PostgreSQL, Redis und S3 liefen in
separaten AP-04-Testcontainern. Der Testdatenbank-Harness legt pro Suite eine eigene
Datenbank an und entfernt sie danach. Die Entwicklerdatenbank wurde nicht
zurückgesetzt. Lokale Browserartefakte: `output/playwright/ap04-focused`;
Laufprotokoll: `output/ap04-e2e.log`.
Die drei temporären AP-04-Testcontainer wurden nach der Verifikation entfernt.

Während der vorbereitenden Verifikation hatte ein Browserlauf 13/14 Erfolge und
einen CSRF-403 im bestehenden `getAuthFromBrowserSession`-Testhelfer; der
Wiederholungslauf bestand. Nach Übernahme der Backend-Komposition fehlten einmal
die Voice-Controls beim Beitritt aus der Meeting-Benachrichtigung (10 bestanden,
1 fehlgeschlagen, 3 wegen serieller Abhängigkeit nicht ausgeführt). Der erneute
Lauf mit Fehler-Traces bestand mit 14/14; die Anwendung wurde dazwischen nicht
geändert. Die Ursache dieser intermittierenden Beobachtung ist nicht geklärt;
der Fehllauf bleibt in `output/ap04-e2e-first-final.log` dokumentiert.
Ein zunächst verspäteter `MessageList`/`EmojiPicker`-Import beim DOM-Testabbau wurde
durch einen expliziten Leaf-Modulmock im Composer-Test isoliert. MessageInput
selbst wurde strukturell nicht verändert. In der CI meldet eine Plesk-Prüfung
weiterhin ihren expliziten Linux-Docker-Skip (7 bestanden, 1 übersprungen); die
separate Garage-Integration bestand.

Nach der endgültigen Einbindung wurde außerdem eine verbliebene Backend-
Quelltextprüfung durch einen Laufzeitvertrag für registrierte Methoden,
Schema-Validierung und Aktions-Dispatch ersetzt. Der Source-Message-Test stellt
explizit sicher, dass ein externer `provider` nicht in den internen Request
weitergereicht wird. Diese Anpassung ist in der AP-03-Testmatrix nachgeführt.

## Testmatrix und Grenzen

`AP_03_TEST_CONTRACTS.md` und die JSON-Begleitdatei verfolgen den Ersatz der
betroffenen MeetingView-/ChannelHeader-/Security-/SMTP-Quelltextprüfungen.
Historische Assertions bleiben in der Matrix erhalten. Methodennamen und die
frühere Platzierung von Zustand sind keine weiterhin geltenden Verhaltensverträge.
Die DOM-Tests verwenden die echten neuen Unterkomponenten und ersetzen nur schwere
Blattkomponenten bzw. externe Medienadapter. Es gibt keinen Pixelvergleich.

Der bekannte Notification-Foreground-Fehler aus AP-03 ist ein separater offener
Punkt und wurde in dieser Browserauswahl nicht erneut ausgeführt. Fake-LiveKit
bestätigt UI-Verhalten, keine reale Medienübertragung oder Egress-Verfügbarkeit.

AP-04A, AP-04B und AP-04C sind anhand ihrer dokumentierten Grenzen und der
erfolgreichen Abschlussprüfungen einzeln sowie gemeinsam technisch abgenommen.
Die oben genannten intermittierenden Browserbeobachtungen, der separate AP-03-
Foreground-Befund und reale Medienübertragung bleiben ausdrücklich ausgewiesene
Grenzen dieses Nachweises.
