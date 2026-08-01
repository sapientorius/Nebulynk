# Nebulynk

**A self-hosted home for your team's conversations, calls, meetings, and
AI-assisted follow-up.**

Nebulynk brings the everyday flow of teamwork into one place: focused chat,
voice and video meetings, files, search, notifications, and optional AI tools
that help turn conversations into useful next steps. It is built for teams that
want modern collaboration without giving up control over their data,
infrastructure, or AI-provider choices.

## Why Nebulynk?

### The full core product, without artificial feature gates

Collaboration should not feel like a collection of locked doors. Nebulynk keeps
its core communication, meeting, and AI-assisted workflows together instead of
splitting the everyday product behind artificial feature tiers. Within the free
production uses permitted by the license, teams get the same core experience
they would use every day.

### AI on your terms

Nebulynk uses a bring-your-own-key (BYOK) model for AI features. Choose the
provider and models that fit your requirements, keep credentials under your
control, and use AI where it is genuinely useful: transcription, meeting
summaries, searchable follow-up, and contextual answers about past meetings.

### Self-hosted from the start

Run Nebulynk in infrastructure you control, with your own application,
database, object storage, media stack, and provider configuration. The project
ships with Docker-based deployment resources and is designed for practical
self-hosting rather than as an afterthought.

### Built for real teams

- Channels, direct messages, files, search, reminders, and notifications for
  day-to-day communication.
- Voice, video, screen sharing, and scheduled meetings in the same workspace.
- Roles, permissions, invites, guest access, passkeys, and two-factor
  authentication for controlled collaboration.
- Browser and PWA access, plus an optional Windows helper for global
  push-to-talk.

## A fair, transparent source-available model

Nebulynk is source available under the Business Source License 1.1 (BSL 1.1).
The source can be inspected, learned from, and self-hosted, while the licensing
model protects the project from being repackaged as an unpartnered commercial
Nebulynk-specific hosting or managed service. It is **not** an Open Source
license; [LICENSE](LICENSE) contains the complete, binding terms and the free
production-use conditions.

## Quick Start

```bash
npm ci
npm run dev
```

The optional Windows push-to-talk helper requires a Rust and Cargo toolchain:

```bash
npm run dev:desktop:ptt-helper
```

> **Update notice for existing installations:** `v0.2.0` is the first release
> with signed in-app update and security notices for platform administrators.
> Installations on `v0.1.0` must update once manually. The standard production
> source is [`sapientorius/Nebulynk`](https://github.com/sapientorius/Nebulynk)
> on the protected `stable` branch. Use an immutable `vX.Y.Z` tag when a
> deployment must remain pinned to one exact release. `main` is not a
> supported production channel. The update center is informational and never
> installs or deploys an update.

## Documentation

- [Product Overview](docs/PROJECT_BRIEF.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Self-Hosting with Docker and Coolify](docs/SELF_HOSTING.md)
- [Secure Self-Hosting](docs/security-hardening.md)
- [Platform Update Architecture](docs/PLATFORM_UPDATES.md)
- [Release Process](docs/RELEASING.md)
- [Contributing](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Trademark Policy](TRADEMARKS.md)

## Quality Checks

```bash
npm run lint
npm run test:backend
npm run test:frontend
npm run build:frontend
npm run test:e2e
npm run ci
```

## License and Trademarks

The source is available under the Business Source License 1.1. The license does
not grant rights to the Nebulynk name or visual identity; see
[TRADEMARKS.md](TRADEMARKS.md) for permitted use.
