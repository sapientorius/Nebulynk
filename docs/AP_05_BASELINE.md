# AP-05: Gemessene lokale Basislast

Datum: 8. September 2026. Ausgangsstand: d545d5e plus AP-05-Arbeitsstand; Anwendung 0.5.1.

**Die 100-Nutzer-Stufe verfehlt ausschließlich das Anmeldeziel:** p95 3.793 ms bei einer Grenze von 2.000 ms. Deshalb wurden 500 und 1.000 gleichzeitige Nutzer nicht gestartet. Die Messung ist vollständig, das Kapazitätsziel ist nicht bestanden.

Während der fünfminütigen Messphase wurden 30.000 Nachrichtenereignisse ohne Zustellfehler geprüft. Es gab keine unerwarteten Request-Fehler und keine fehlenden oder doppelten persistierten Nachrichten. 360 gesendete Nachrichten umfassen 60 aus dem Warm-up und 300 aus der Messphase.

Reproduktion: `npm run benchmark:runtime` (alternativ `npm run benchmark:runtime:rtk`). Kein Quick-Modus. Der Runner erzeugt und entfernt ausschließlich sein eigenes Compose-Projekt. Anmeldung maximal zehn Nutzer/s, 60 Sekunden Warm-up und 300 Sekunden Messung; Details im [Betriebsrunbook](runtime-operations.md).

Rohdaten liegen lokal unter `output/ap05/nebulynk-ap05-c37396ffc326/`; die nachfolgende Tabelle wurde direkt aus runtime-results.json und telemetry.json erzeugt. Fünf weitere Entwicklercontainer liefen während der Messung weiter (host-containers.jsonl). Sonstige Host-Last wurde nicht isoliert oder vollständig quantifiziert. Docker-VM-Zuteilung ist keine reservierte Rechenkapazität.

## Separater Meeting-Historienlauf

Der korrigierte unabhängige Lauf `nebulynk-ap05-bf8cc7c39ccb` erreichte mit 100 parallelen Requests, zehn Sekunden Warm-up und 60 Sekunden Messung **10.832 erfolgreiche Requests, null Fehler, 179,46 Requests/s, p50 515,17 ms und p95 913,21 ms**. Reproduktion: `node scripts/run-runtime-verification.mjs history`. Rohdaten und Telemetrie: `output/ap05/nebulynk-ap05-bf8cc7c39ccb/`.

Dieser separate Stack enthält die vorhandene Meeting-Historienfixture (1.000 Meetings und 1.000 Channel-Mitglieder), ohne die zusätzliche 100.000-Nachrichten-Runtime-Fixture. Ein vorheriger Historienlauf im vollständigen Runtime-Stack enthielt erwartete 403 durch eine falsche Persona-Auswahl und wird deshalb nicht als gültiges Leistungsergebnis gewertet. Der Runner verwendet jetzt für jede Policy autorisierte Personas; globale Suche ohne Quellchannel-Mitgliedschaft verwendet den Fixture-Administrator. Die Zugriffskontrolle wurde nicht geändert.

Am Ende des ersten vollständigen Laufs entstand eine einzelne Telemetrielücke, weil der Generator zwischen Docker-Containerauflistung und stats beendet wurde. Die Runtime-Rohdaten und vorherigen Ressourcensamples sind vollständig erhalten. Der Runner behandelt diese Containerwechsel inzwischen gezielt; der korrigierte Historienlauf schloss einschließlich Telemetrie und Cleanup erfolgreich ab.

KI, echte Push-/Mail-Zustellung und Medienlast waren deaktiviert. Das Login-IP-Limit wurde ausschließlich im isolierten Stack auf 10.000 erhöht. Kein Nachweis für Video-/Egress-Kapazität, Mehrinstanzbetrieb oder produktionsrepräsentatives Sizing. Höhere Laststufen bleiben offen.

---

## Maschinell ausgewertete Runtime-Messung

Project: nebulynk-ap05-c37396ffc326
Started: 2026-09-08T15:45:53.033Z
Mode: full baseline
Warm-up / measurement per stage: 60s / 300s

## Environment

Docker 29.7.2; Docker Desktop; kernel 6.6.87.2-microsoft-standard-WSL2.
Docker allocation: 8 CPUs, 15.39 GiB RAM. No additional container limits.
Node: v22.23.1. PostgreSQL: PostgreSQL 17.8 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit. Backend pool: min 2, max 10.
Fixture: 1,000 load users, 10 channels, 100,000 historical messages; additionally 1,001 meeting-history users, 1,000 meetings, 1,000 meeting messages.
Other running local containers are listed in host-containers.jsonl. This is a local workstation measurement, not production sizing.

## Measured stages

| Users | Target passed | Operations/s | Error rate | Missing events | Persistence errors |
| --- | --- | --- | --- | --- | --- |
| 100 | false | 7.81 | 0.00% | 0 | 0 |

| Users | Operation | Samples | p50 ms | p95 ms |
| --- | --- | --- | --- | --- |
| 100 | login | 100 | 3010.31 | 3793.46 |
| 100 | session | 200 | 41.38 | 128.54 |
| 100 | timeline | 1994 | 18.01 | 54.39 |
| 100 | send | 300 | 104.40 | 209.20 |
| 100 | reconnect | 50 | 48.17 | 89.38 |
| 100 | event | 30000 | 101.83 | 202.27 |

Login/session samples cover initial admission; timeline/send/reconnect/event samples cover the measurement window. Throughput counts timeline, send and reconnect operations. Stage targets: login p95 <= 2s; timeline/send/event p95 <= 1s; errors < 1%; no missing events or persistence errors. Higher stages are not started after a failed target.

## Resource observations

Samples include initial login, the runtime stage and the separate history benchmark. Docker CPU 100% equals one logical CPU.

| Container role | Samples | CPU p95 % | CPU peak % | Peak RAM MiB |
| --- | --- | --- | --- | --- |
| backend | 38 | 126.03 | 130.04 | 297.80 |
| postgres | 38 | 208.32 | 209.11 | 167.30 |
| redis | 38 | 0.60 | 0.69 | 3.52 |
| garage | 38 | 0.15 | 0.17 | 5.21 |
| generator | 37 | 47.16 | 52.40 | 68.48 |

PostgreSQL peak connections: 11; peak active queries (including the sampler): 3; peak waiting locks: 0.
Observed database deltas: 96634 commits, 0 rollbacks, 95 blocks read, 6884788 buffer hits.

## Limits and evidence

See runtime-results.json for samples/errors, telemetry.json for timestamped resource/database observations, container-config.json for actual container limits/images, and meeting-history.txt for the separate history run.
Inactive integrations: AI, mail, push, LiveKit/media, platform update scheduler (NODE_ENV=test). No WebRTC, video, transcription-provider or egress capacity claim.
