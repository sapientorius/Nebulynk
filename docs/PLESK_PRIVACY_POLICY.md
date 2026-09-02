# Privacy Policy — Nebulynk Plesk Extension

**Last updated:** September 1, 2026  
**Policy URL:** https://nebulynk.net/plesk-privacy-policy

This Privacy Policy explains how personal data may be processed in connection
with the Nebulynk Plesk Extension and a Nebulynk instance deployed through that
extension. It is written for administrators, organizations, and users of
self-hosted installations.

The Nebulynk Plesk Extension is deployment software. It installs and manages a
self-hosted Nebulynk workspace on a Plesk Obsidian server. It is not a hosted
Nebulynk service and does not, by itself, create a Nebulynk account with the
publisher or upload workspace content to the publisher.

## 1. Publisher and contact

The publisher's current legal and contact details are provided in the
[Nebulynk Imprint](https://nebulynk.net/imprint).

For privacy requests concerning processing carried out by the Nebulynk
publisher, please use the contact details provided in that Imprint. The Imprint
is the authoritative source for the publisher's name, postal address, and any
data protection officer or privacy contact details.

## 2. Scope and responsibilities

This Policy distinguishes between several systems and roles:

1. **The Plesk Extension.** The Extension runs inside the Plesk
   administration environment and performs local deployment and management
   operations.
2. **The self-hosted Nebulynk instance.** The instance runs on the server
   selected by the Plesk administrator and includes the Nebulynk application,
   database, object storage, cache, and real-time media services.
3. **The Plesk and infrastructure providers.** Plesk, the server or hosting
   provider, Docker, package registries, backup providers, and network
   operators may process technical data under their own responsibilities and
   privacy notices.
4. **Optional external providers.** SMTP, AI, GIF, and browser push providers
   receive data only when the operator enables and configures the relevant
   feature.

For data stored or generated inside a self-hosted Nebulynk instance, the
organization or person operating the instance determines the purposes and
means of processing. That operator is generally responsible for informing
users, selecting lawful purposes and retention periods, handling data-subject
requests, and configuring external providers. The Nebulynk publisher does not
have routine access to the instance's database, files, messages, recordings, or
credentials merely because the software is installed.

The publisher is not automatically the operator's data processor solely because
it publishes or distributes the software. If the publisher later provides
hosting, managed operations, or support that involves access to personal data,
the parties must assess and document their roles and contractual obligations
separately where required by applicable law.

## 3. Processing by the Plesk Extension

### 3.1 Plesk administration data

The Extension is intended for Plesk administrators. Plesk controls the
administrator's authentication, panel session, permissions, and panel-level
logging. The Extension does not establish a separate publisher account for the
Plesk administrator.

To present and validate the deployment configuration, the Extension can access
Plesk domain information, including an active domain's display name, hostname,
and internal Plesk identifier. It also checks local hosting, TLS certificate,
DNS resolution, Nginx, Docker, and related prerequisites.

The Extension stores deployment metadata in Plesk's local extension settings,
including, as applicable:

- the selected domain and its internal identifier;
- the local edge port;
- deployment status and proxy status;
- the installed Nebulynk version and Extension release; and
- fixed local deployment paths and the Docker Compose project name.

This information is used to configure, start, stop, update, inspect, and remove
the local deployment. It is not routinely transmitted to the Nebulynk
publisher.

### 3.2 Local deployment files and logs

During installation or update, the Extension copies its bundled source to the
server and creates local configuration and data below:

```text
/opt/nebulynk-plesk/.env
/opt/nebulynk-plesk/source
/opt/nebulynk-plesk/data/postgres
/opt/nebulynk-plesk/data/redis
/opt/nebulynk-plesk/data/garage-meta
/opt/nebulynk-plesk/data/garage-data
```

The generated environment file contains configuration and secrets such as
database credentials, storage credentials, authentication secrets, LiveKit
credentials, and keys used to protect configured provider credentials. These
files remain on the deployment server and are managed by the Plesk/server
operator.

When an administrator requests container status or recent logs, output may be
held temporarily in the Plesk administrator's session and displayed in the
Plesk panel. Docker and application logs remain subject to the local Plesk,
server, hosting, and backup configuration. Logs can contain technical details
and, depending on the service and event, identifiers or other information
written by the application.

The Extension does not include an application-content upload function,
advertising tracker, or publisher account telemetry endpoint.

### 3.3 Installation and build connections

The first installation and later rebuilds can make outbound connections to
Docker image registries, including Docker Hub, and to the npm package registry.
Those services may receive standard connection data such as the server IP
address, date and time, request headers, requested images or packages, and
security or diagnostic information. The build process does not send Nebulynk
workspace messages, files, recordings, or database contents to those services.

The respective providers' terms and privacy notices apply to those
connections. The server operator is responsible for reviewing the providers,
network routes, and any proxy or security-monitoring systems used by the host.

## 4. Data processed by a self-hosted Nebulynk instance

The exact data processed depends on the features enabled and the information
users and administrators enter. A Nebulynk instance may process the following
categories:

### 4.1 Accounts, identity, and access

- email address and display name;
- profile information, avatar references, language, status, and status expiry;
- roles, memberships, invitations, guest-account information, and permissions;
- password-derived authentication data, browser sessions, refresh tokens, and
  CSRF-protection data;
- two-factor authentication data, recovery codes, passkey metadata, and
  security re-authentication data; and
- account, invitation, verification, activation, and administrative timestamps.

### 4.2 Collaboration content

- channels, direct messages, message text, replies, forwards, reactions,
  mentions, pins, topics, and descriptions;
- reminders, notifications, message snippets, and related activity metadata;
- uploaded files, filenames, MIME types, sizes, storage references, avatars,
  video backgrounds, and other media; and
- search documents and indexes derived from authorized workspace content.

### 4.3 Meetings and media

When meeting features are used, the instance may process meeting titles,
participants, room and presence information, audio, video, screen sharing,
meeting chat, recording metadata, recordings, transcripts, transcript
segments, summaries, action items, and related meeting artifacts.

Audio and video are transmitted through the configured LiveKit service. In the
standard Plesk deployment, LiveKit, PostgreSQL, Redis, and Garage object storage
run on the same server and recordings are stored in the local Garage data
directories. A modified deployment or external storage configuration may route
data elsewhere.

### 4.4 Technical and security information

Depending on the reverse proxy, Plesk, hosting provider, and application log
configuration, the system may process:

- IP addresses or forwarded client addresses used for security controls and
  rate limiting;
- browser and device information such as the User-Agent;
- request, connection, session, error, and event timestamps;
- authentication, access-control, audit, and security events;
- error messages, stack traces, service status, and diagnostic output; and
- necessary browser cookies and local browser storage used for authentication,
  preferences, push subscriptions, and interface state.

The Extension itself does not set advertising or cross-site tracking cookies.
Plesk, the website hosting this Policy, browsers, reverse proxies, and external
providers may have their own cookies or logging practices.

## 5. Optional external services and disclosures

The operator chooses whether these features are enabled. If enabled, the
relevant service provider may receive the data required to provide that
feature, together with standard technical connection data.

### 5.1 Email and SMTP

If SMTP is configured, the instance can send invitations, account-confirmation
messages, password-reset messages, security notices, and other operational
emails. The configured SMTP service may receive recipient addresses, sender
information, message content, links, and delivery metadata. SMTP credentials
are stored in the instance configuration and are not provided to the Nebulynk
publisher through the Extension.

### 5.2 AI providers

Nebulynk uses a bring-your-own-key model. An administrator may configure
OpenAI, Mistral, Anthropic, OpenRouter, or an OpenAI-compatible or self-hosted
endpoint. Depending on the enabled function, the instance may send:

- audio or meeting recordings for transcription;
- transcripts or meeting content for summaries and action items;
- selected messages or other workspace context for summaries or contextual
  answers; and
- prompts or input media for other enabled AI features.

The selected provider's terms, privacy practices, retention settings, and
international-transfer mechanisms apply to that processing. A custom endpoint
may be operated by the organization itself or by another provider. The
operator must choose providers and models appropriate for the data involved.

AI provider credentials are stored by the instance in protected configuration.
They are not sent to the Nebulynk publisher by the Extension.

### 5.3 GIF search

If the optional Klipy integration is configured, searches, featured-content
requests, selected GIF identifiers, and related requests may be sent to Klipy.
Klipy's service may also deliver media URLs that are subsequently loaded by the
browser. Klipy's own terms and privacy notice apply.

### 5.4 Browser push notifications

If browser push notifications are enabled, the instance stores a browser push
subscription for the relevant user and sends notifications through the browser
push service associated with that subscription. The push service may receive
the subscription endpoint, cryptographic subscription data, delivery metadata,
and notification content such as an event type, display name, short message
snippet, or link.

### 5.5 Nebulynk update and security information

The deployed application can periodically request signed release and security
information from the Nebulynk update services. The production update feed is
queried at `https://updates.nebulynk.net/v1/` and a lightweight availability
request is made to `https://update.nebulynk.net/`.

The update requests are designed not to include an instance identifier or the
installed version. The update servers can nevertheless receive normal network
information, including the source IP address, request time, User-Agent, and
HTTP cache metadata such as an ETag. The feed response and update state are
cached locally by the instance. The update subsystem is informational; it does
not automatically install or deploy an update.

The update services may retain standard server logs according to their hosting
and security configuration. The applicable hosting details and retention period
must be documented before this Policy is published as a final notice.

## 6. Purposes and legal bases

The Extension and the self-hosted application use data to:

- install, configure, operate, secure, maintain, update, and troubleshoot the
  software;
- authenticate users and enforce permissions;
- provide collaboration, file, meeting, notification, and optional AI
  features requested by the operator or users;
- send operational and security-related communications when configured;
- prevent abuse, investigate failures, and protect the availability and
  integrity of the system; and
- respond to support, security, licensing, or privacy requests sent to the
  publisher.

Because Nebulynk is self-hosted and used internationally, this Policy does not
assign one universal legal basis to every installation. Where a legal basis is
required, the relevant controller must select the basis applicable in its
jurisdiction, which may include performance of a requested service or
agreement, compliance with a legal obligation, consent, or a legitimate
interest in security and administration. The operator of each instance is
responsible for making that assessment for its users.

## 7. International transfers and recipients

Data may be accessible to or transferred through the Plesk/server provider,
backup provider, Docker or package registry, SMTP provider, AI provider, Klipy,
browser push service, update-service host, or another provider selected by the
operator. These providers may be located in countries different from the
operator or the affected users.

No single transfer mechanism or list of countries applies to every deployment.
The instance operator must review the location, terms, security measures, and
transfer safeguards of each enabled provider and put any required contractual
arrangements in place.

The Nebulynk publisher does not sell or rent self-hosted workspace content for
advertising purposes.

## 8. Retention, deletion, and backups

The publisher does not maintain a central copy of the workspace content of a
self-hosted installation. Retention of instance data is controlled by the
operator's configuration, deletion processes, server storage, logs, and
backups. The operator must define and communicate retention periods suitable
for its use case and applicable law.

For the Plesk deployment:

- stopping or normally uninstalling the Extension is data-preserving;
- updating or rebuilding the Extension is intended to preserve the deployment
  data; and
- the explicitly confirmed **Delete all data** action stops the local stack and
  deletes `/opt/nebulynk-plesk`, including the generated environment file,
  source, PostgreSQL, Redis, and Garage data, after safety checks succeed.

External backups, provider-side copies, SMTP messages, AI-provider data, GIF
provider data, browser push data, server logs, and other independent copies may
remain subject to the retention policies of their respective operators.

## 9. Security

Nebulynk and the Plesk Extension include security measures appropriate to a
self-hosted deployment, including HTTPS/TLS integration through Plesk,
authenticated sessions, CSRF protection, role and membership checks, rate
limiting, encrypted provider secrets, signed file URLs, passkeys or two-factor
authentication where enabled, restricted local service bindings, and protected
file permissions.

No software can guarantee absolute security. The Plesk and instance operators
are responsible for trusted installation packages, server access, firewall and
TLS configuration, provider selection, secret management, updates, monitoring,
and tested backups.

## 10. Privacy requests and user rights

For processing controlled by the Nebulynk publisher, use the contact details in
the [Nebulynk Imprint](https://nebulynk.net/imprint). We may need to verify the
identity and authority of the requester before responding. Rights available to
you depend on applicable law and may include access, correction, deletion,
restriction, objection, data portability, and withdrawal of consent where
processing is based on consent.

For messages, files, accounts, meetings, recordings, and other data inside a
self-hosted instance, contact the organization or administrator operating that
instance. For Plesk panel data, server logs, backups, or provider-side data,
contact the relevant Plesk, hosting, backup, or external service provider.

Where applicable, you may also lodge a complaint with the data-protection
authority or other supervisory body responsible for your location.

## 11. Website visits

This Policy is published on `nebulynk.net`. Processing that occurs when you
visit the website itself—including hosting logs, cookies, analytics, contact
forms, or embedded content—is governed by the website's general Privacy Policy
and the configuration of its hosting provider.

This Extension Policy does not make claims about website analytics, cookies, or
hosting logs that have not been verified.

## 12. Changes to this Policy

We may update this Policy when the Extension, the update services, or the
documented data flows change. The current version and its effective date will
be published at:

https://nebulynk.net/plesk-privacy-policy
