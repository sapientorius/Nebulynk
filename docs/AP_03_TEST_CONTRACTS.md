# AP-03: Inventar der bisherigen UI-Quelltexttests

Alle 61 Ausgangsdateien sind erfasst. Die JSON-Begleitdatei enthält jede bisherige Assertion im ursprünglichen Wortlaut, gruppiert nach Testvertrag. `replaced` bezeichnet entfernte Quelltextprüfungen mit Laufzeitersatz, `static-retained` einen ausdrücklich statischen Strukturvertrag und `deferred-runtime` eine noch nicht auf Laufzeit umgestellte Altprüfung. Letztere zählt nicht als Verhaltensnachweis.

Die kritischen Laufzeitvertikalen liegen in `MessageInput.component.test.js`, `MeetingView.component.test.js` und `ChannelHeader.component.test.js`. MeetingView-Altprüfungen bleiben ergänzend explizit statisch; reine CSS-/Symbolvorgaben sind kein Vertrag für AP-04-Refactorings.

| Ausgangsdatei / Vertrag | Behandlung | Ersatz oder Grenze |
| --- | --- | --- |
| admin-smtp-settings.test.js: adds a dedicated SMTP settings panel with save and test actions | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| admin-smtp-settings.test.js: exposes SMTP API helpers and admin-store bindings | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| AiSettings.test.js: includes provider management and function assignment controls | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| AskMeetingPanel.test.js: owns Ask the Meeting history, citation links, and stable submit control | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| AskMeetingPanel.test.js: submits on Enter while preserving Shift+Enter and composition shortcuts | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| AskMeetingPanel.test.js: uses shared artifact formatting for citation labels | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ChannelHeader.test.js: keeps the meeting call action available for regular and voice channels but not meeting chat channels | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ChannelHeader.test.js: moves secondary mobile actions into a dedicated overflow menu while keeping call primary | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ChannelHeader.test.js: exposes AI summary actions for presets, custom range, and selection mode inside the overflow menus | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ChannelHeader.test.js: groups schedule and past meetings under a shared meetings entry point and keeps past meetings on the shared side panel flow | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ChannelHeader.test.js: keeps leave behind the overflow menu instead of the direct desktop action row | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ChannelHeader.test.js: loads and saves meeting history access for channels and owner-managed groups | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ChannelPastMeetingsPanel.test.js: loads past meetings in 4-item windows and reuses the shared meeting summary card | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ChannelSidebar.test.js: navigates via router instead of mutating channel state directly on sidebar selection | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ChannelSidebar.test.js: uses persisted disclosure sections and keeps header actions separate from toggles | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ChannelSidebar.test.js: limits sidebar meetings and direct messages to compact overview slices | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| ChannelSidebar.test.js: uses a shared item scale for channels, voice channels, and direct messages on every layout | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| DesignSettings.test.js: exposes dedicated per-theme design controls and local reset actions | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| EmojiPicker.integration.test.js: keeps the message input wired to the shared emoji picker select flow | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| EmojiPicker.integration.test.js: keeps message reaction entry points wired to the shared emoji picker | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| EmojiPicker.test.js: does not autofocus its search input in the mobile layout | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| EmojiPicker.test.js: renders a recent section before the regular categories | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| EmojiPicker.test.js: starts without recent emojis when storage is empty and hydrates from storage on open | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| EmojiPicker.test.js: maps stored recent emojis through the shared picker lookup | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| EmojiPicker.test.js: updates MRU order through the picker selection handler | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| FileUpload.test.js: acts as a shared file picker and leaves upload decisions to the composer | replaced | MessageInput.component.test.js: real file input change, paste and AppView drop |
| GifPicker.test.js: uses KLIPY attribution and search placeholder text | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| GifPicker.test.js: keeps the existing store-driven trending and search flow | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| invite-manager-mail-state.test.js: distinguishes sent, failed, and not-configured invite email states | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingActionCard.test.js: clamps the mini summary to two lines and exposes the full text on hover or click | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingActionCard.test.js: hides actions and styles cards whose meeting contents are restricted | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MeetingActionCard.test.js: supports an overview variant that expands cards to the grid width | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingScreenSharePanel.test.js: supports reusable test-id prefixes for meeting and voice share contexts | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingScreenSharePanel.test.js: accepts a generic channel context and compact viewer quality controls | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MeetingSettings.test.js: contains all meeting-related platform settings and saves them together | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingSummaryPanel.test.js: owns summary rendering, stable test IDs, and parent-emitted actions | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingSummaryPanel.test.js: groups share actions into a share menu and lets the parent hide in-app sharing | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingSummaryPanel.test.js: keeps summary generation and degraded coverage state inside the panel | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingSummaryPanel.test.js: uses shared artifact formatting for evidence links and transcript chapter jumps | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingTranscriptPanel.test.js: owns transcript rendering, retry controls, and stable test IDs | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingTranscriptPanel.test.js: keeps transcript generation hints and partial-completeness rendering in the panel | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingTranscriptPanel.test.js: handles highlighted transcript segments and exposes a scroll helper for the view | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingVideoGrid.test.js: attaches participant camera tracks and keeps the camera toggle in the voice store | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingVideoGrid.test.js: supports focused mobile rendering plus desktop incoming video controls | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingVideoGrid.test.js: mirrors only local camera tiles from the video preference | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MemberList.test.js: only shows remove controls for managed membership channels | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MemberList.test.js: guards the remove action method behind the same computed flag | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MemberList.test.js: hides direct-message actions when a guest account is involved and seeds the profile drawer with member data | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MemberList.test.js: uses meeting participants instead of raw channel members in meeting chat context | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MemberList.test.js: hydrates meeting participant profiles with the active channel scope and keeps offline joined participants visible | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MemberList.test.js: treats joined guest meeting participants as online before voice presence arrives | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MemberList.test.js: renders a localized guest badge after guest display names | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageActions.test.js: renders Mattermost-style quick actions with three recent emoji buttons before picker and primary actions | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MessageActions.test.js: keeps picker and quick reactions wired through recent emoji storage and message ops | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageActions.test.js: repeats available actions inside overflow and protects delete with popconfirm | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageActions.test.js: keeps popovers visible to the parent hover lock while menus are open | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageActions.test.js: uses a bottom sheet for message reaction picking on mobile layouts | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MessageActions.test.js: uses a viewport-safe bottom sheet for reminders on mobile layouts | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MessageActions.test.js: keeps the reminder form shared between desktop popover and mobile sheet | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MessageActions.test.js: keeps the hover toolbar spacing modestly roomier without expanding the overflow menu | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MessageActions.test.js: wires message reminders through the reminder store and future-date validation | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageInput.test.js: stages optimizable images inline with SD/HD quality toggles | replaced | MessageInput.component.test.js: image quality, upload paths, cleanup and permission tests |
| MessageInput.test.js: uses SD optimization by default and uploads HD as the original on submit | replaced | MessageInput.component.test.js: image quality, upload paths, cleanup and permission tests |
| MessageInput.test.js: keeps picker, drop, and paste inputs on the same upload path and revokes previews | replaced | MessageInput.component.test.js: image quality, upload paths, cleanup and permission tests |
| MessageInput.test.js: treats archived channels as read-only and uses an archived placeholder | replaced | MessageInput.component.test.js: image quality, upload paths, cleanup and permission tests |
| MessageInput.test.js: uses a mobile bottom sheet for the composer emoji picker | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MessageInput.test.js: shows the GIF button only after the Klipy configuration check succeeds | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageInputDraftPersistence.test.js: wires composer text and pending files through the messages draft store | replaced | MessageInput.component.test.js: channel draft navigation and successful/failed sends |
| MessageInputDraftPersistence.test.js: keeps drafts across channel changes and only clears after a successful submit | replaced | MessageInput.component.test.js: channel draft navigation and successful/failed sends |
| MessageInputReplyFocus.test.js: focuses the textarea on mount, chat switches, and reply intent through one guarded helper | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageInputReplyFocus.test.js: guards autofocus against touch devices, hidden inputs, and read-only composers | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageListMeetingCards.test.js: reloads ended referenced meetings with full detail so inline mini summaries appear on first render | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageListMeetingCards.test.js: shows the reusable pulse loader only for empty initial loads and delays the content reveal | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageListReminders.test.js: loads active reminders when the message list opens and refreshes after the next due reminder | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageMarkdownIntegration.test.js: wires markdown toolbar actions into MessageInput | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageMarkdownIntegration.test.js: renders markdown in MessageRow and keeps MessageList as the timeline container | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageReminderIndicator.test.js: shows a private, accessible alarm indicator only when a reminder is active | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageReminderIndicator.test.js: uses a tooltip and popover with localized timing and a remove action | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageReminderIndicator.test.js: removes through the existing store and refreshes stale reminder state | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageRow.test.js: owns one rendered message row with stable timeline test hooks | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageRow.test.js: keeps row UI concerns in the row while emitting side effects upward | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageRow.test.js: preserves markdown, preview, collapse, and meeting-card rendering behavior | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageRow.test.js: wires private AI summary affordances into row actions and selection mode | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageRow.test.js: renders active reminder metadata for regular and grouped messages | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageRow.test.js: keeps chat images within the available message column | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MessageSummaryCard.test.js: renders private AI timeline artifacts without normal message actions | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| NebulynkLoader.test.js: exposes one reusable loader component with pulse and orbit variants | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| NebulynkLoader.test.js: supports centered layout, accessible labels, and configurable size | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| NebulynkLoader.test.js: keeps both animation keyframes and visual styles in the shared component | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| NotificationsPanel.test.js: uses the shared notification toggle for browser and desktop runtimes | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| NotificationsPanel.test.js: opens message notifications directly on their source message query | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| NotificationsPanel.test.js: opens registration notifications in the registration settings tab | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| platform-updates.test.js: provides the update timeline, acknowledgement, and owner-only risk dialog | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| platform-updates.test.js: renders a per-admin update banner and routes details to the dedicated center | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| platform-updates.test.js: uses private admin endpoints instead of the public platform service | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| PlatformSettings.test.js: includes controls for default language, default meeting language, and auto-away timeout | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ScreenShareChatOverlay.test.js: owns the reusable maximized screen-share chat shell with prefixed test IDs | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ScreenShareChatOverlay.test.js: keeps the previous overlay sizing and mobile adjustment in one place | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ScreenShareControls.test.js: owns prefixed start, active, and stop controls for screen-share headers | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ScreenShareControls.test.js: keeps screen-share side effects in the existing stores | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SettingsReturnOrigin.test.js: opens settings with a safe returnTo query from the current route | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SettingsReturnOrigin.test.js: routes the settings back button through validated chat or meeting targets | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SettingsViewTheme.test.js: exposes theme preference in the general settings form | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| SponsorshipPrompt.test.js: uses a dismissible modal with a safe external sponsorship link | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| system-info.test.js: shows the four storage cards, localized sizes, and stale-state refresh affordance | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| system-info.test.js: keeps System Info private to platform admins and places it directly before Updates | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| system-info.test.js: uses the private storage endpoints and declares both language variants | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| TranscriptionRecordingBanner.test.js: owns compact recording status text, info details, and video restore actions with stable test IDs | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| UserAvatar.test.js: uses theme-aware fallback colors for users without uploaded avatars | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| UserAvatar.test.js: keeps uploaded avatar images filling the avatar frame | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| UserPickerVisibility.test.js: uses the shared directory-only session helpers across picker entry points | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| UserPickerVisibility.test.js: clears stale guest author filters and keeps search author options guest-free | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| UserProfileCard.test.js: replaces manual avatar urls with upload, crop, and remove controls | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| UserProfileCard.test.js: only exposes the direct-message action for member-to-member profiles | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| UserRoleManager.test.js: groups administrative controls in a responsive actions dropdown | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| VideoSettingsContent.test.js: uses processed preview tracks visible background controls | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| VideoSettingsContent.test.js: persists and renders local video mirror preference | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| VideoSettingsContent.test.js: keeps upload, gated generation, global background actions | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| VoiceControls.test.js: supports sidebar and floating presentation variants without changing the control behavior | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| VoiceControls.test.js: shows compact transcription recording state for active meeting calls | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| VoiceControls.test.js: routes call settings through a gear popover with audio and video entry points | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| VoiceMessages.test.js: adds the mic menu and recorder paths to the message composer | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| VoiceMessages.test.js: adds the visible composer send button beside the voice menu trigger | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| VoiceMessages.test.js: keeps the recorder preview explicit before send or text insertion | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| VoiceMessages.test.js: renders voice-message cards with private artifact actions | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| VoiceMessages.test.js: adds a custom audio player without using native controls | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| VoiceSettingsContent.test.js: shows opt-in global PTT guidance only for Windows browser helper candidates | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| AdminView.test.js: switches administration navigation to a mobile drawer layout | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| AppView.right-panel.test.js: routes header actions into a shared right-side panel that can render members or past meetings | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| AppView.search.test.js: mounts the global search dialog and exposes a shared top-bar trigger with keyboard shortcut handling | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| AppView.voice-screen-share.test.js: shows voice-channel screen share controls and a shared panel context | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| AppView.voice-screen-share.test.js: supports hidden and maximized voice share views without replacing normal chat by default | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingInviteView.test.js: loads invite metadata and supports guest acceptance into a meeting session | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingInviteView.test.js: lets signed-in members open the meeting directly and validates guest display names | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingsOverviewView.test.js: loads dedicated overview buckets and renders meeting action cards in a responsive grid | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingsOverviewView.test.js: keeps cards clickable while join routes through the meeting store and past meetings can load more without losing mini-summary cards | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingView.test.js: does not render the ended-meeting group chat CTA anymore | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingView.test.js: uses a focus layout with overlay chat while screen share is maximized | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MeetingView.test.js: uses an adaptive live stage for video-focused and share-focused meeting layouts | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MeetingView.test.js: uses generic ui store screen share state while preserving meeting behavior | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingView.test.js: animates the share trigger dot only while an active share is hidden | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingView.test.js: offers a publish-quality selector before starting a screen share | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingView.test.js: renders meeting video only for an active connected meeting call | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingView.test.js: moves mobile meeting actions and video management into compact overflow surfaces | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MeetingView.test.js: delegates artifact rendering to focused components while preserving tabs and events | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MeetingView.test.js: keeps the compact ended-meeting artifact menu unchanged while only restyling the header overflow menu | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MeetingView.test.js: shows the compact ended-meeting action menu as a wide mobile bottom sheet | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MeetingView.test.js: keeps store mutations, share side effects, and summary payload assembly in the view | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MeetingView.test.js: shows attended participants, uses ended meeting engagement counts, and prepends a meeting link in shared summaries | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingView.test.js: tracks mobile layout and switches ended-meeting surfaces for evidence navigation | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MeetingView.test.js: delegates member-panel toggling to the shared workspace shell | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| MeetingView.test.js: clears the active meeting context only when navigating away from meeting routes | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingView.test.js: supports scheduled meeting controls, guest links, and ICS downloads | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingView.test.js: hides ended-meeting in-app summary sharing for guest users while keeping the member flow guarded in the view | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| MeetingView.test.js: renders the policy denial state for restricted direct meeting URLs | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| PasswordResetViews.test.js: adds a forgot-password link to the login view | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| PasswordResetViews.test.js: supports a second-factor verification step in the login view | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| PasswordResetViews.test.js: adds a passkey login action to the login view | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| PasswordResetViews.test.js: forgot-password view submits email requests and keeps the success state generic | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| PasswordResetViews.test.js: reset-password view validates tokens, compares passwords, and clears local auth before redirecting | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ScreenShareView.test.js: supports both meeting and voice-channel screen share windows | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SelfRegistrationViews.test.js: shares the animated auth card between login and registration routes | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SelfRegistrationViews.test.js: keeps the auth controls on the dark theme regardless of the platform theme | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| SelfRegistrationViews.test.js: only renders the registration entry point when the public setting enables it | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SelfRegistrationViews.test.js: shows password guidance and handles SMTP-less registration states | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SelfRegistrationViews.test.js: uses activation-specific confirmation copy after a confirmed email link | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SelfRegistrationViews.test.js: provides admin registration and security settings with pending-account actions | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SelfRegistrationViews.test.js: registers public registration and confirmation routes | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SettingsView.test.js: adds a dedicated security tab with a password change form | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SettingsView.test.js: adds a permission-gated archived channels tab with restore actions | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SettingsView.test.js: adds a dedicated video settings tab with camera and background controls | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SettingsView.test.js: switches settings navigation to a mobile drawer layout | static-retained | Nur Struktur/Quelltext, keine Interaktion. |
| SettingsView.test.js: adds a settings-scoped install CTA for supported PWA browsers | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SettingsView.test.js: keeps the notifications toggle available for desktop profiles through the shared settings surface | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| SettingsView.test.js: keeps archived channels out of the sidebar | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ShareTargetView.test.js: registers text, link, and arbitrary file sharing in the web manifest | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| ShareTargetView.test.js: keeps destination selection, permissions, and draft handoff inside the authenticated workspace | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| WorkspaceShell.test.js: keeps channels and meetings under one authenticated parent shell | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| WorkspaceShell.test.js: owns the shared top bar, mobile drawers, and global overlays for both workspace contexts | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
| WorkspaceShell.test.js: reduces the workspace chrome for guest sessions while owning the floating guest voice dock | deferred-runtime | Laufzeitumstellung zurückgestellt; Altprüfung bleibt ausdrücklich statisch. |
