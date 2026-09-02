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

Browser and PWA users opt in to the local helper from **Voice settings** after
selecting **Push-to-Talk**. Nebulynk does not contact the helper when the site
first opens. Enabling global Push-to-Talk starts the local connection and may
prompt Windows or the browser for access to other apps and services; that
access is needed only for the optional global shortcut. The official helper
will be published on [GitHub Releases](https://github.com/sapientorius/Nebulynk/releases).

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
- [Deploying with Coolify](docs/COOLIFY.md)
- [Deploying with Dokploy](docs/DOKPLOY.md)
- [Deploying with Plesk](docs/PLESK.md)
- [Self-Hosting with Docker](docs/SELF_HOSTING.md)
- [Secure Self-Hosting](docs/security-hardening.md)
- [Platform Update Architecture](docs/PLATFORM_UPDATES.md)
- [Release Process](docs/RELEASING.md)
- [Contributing](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Trademark Policy](TRADEMARKS.md)

## Built with

<p>
  <a href="https://feathersjs.com/"><img src="https://img.shields.io/badge/FeathersJS-404D59?style=for-the-badge&logo=feathers&logoColor=white" alt="FeathersJS"></a>
  <a href="https://vuejs.org/"><img src="https://img.shields.io/badge/Vue.js-4FC08D?style=for-the-badge&logo=vuedotjs&logoColor=white" alt="Vue.js"></a>
  <a href="https://www.naiveui.com/"><img src="https://img.shields.io/badge/Naive%20UI-18A058?style=for-the-badge&logo=naiveui&logoColor=white" alt="Naive UI"></a>
  <a href="https://livekit.io/"><img src="https://img.shields.io/badge/LiveKit-00A2E8?style=for-the-badge&logo=livekit&logoColor=white" alt="LiveKit"></a>
  <a href="https://www.postgresql.org/"><img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"></a>
  <a href="https://redis.io/"><img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis"></a>
</p>

The logos belong to their respective projects and trademark owners and do not imply endorsement or partnership.

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
