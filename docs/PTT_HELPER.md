# PTT Helper for Windows and macOS

The optional local PTT Helper lets Nebulynk browser and PWA sessions use
Push-to-Talk while another application is active. Your assigned key retains its
normal behavior: Shift still capitalizes letters and letters/Space still type.
Choose a suitable non-text key if those side effects are undesirable.

## Downloads

Use the download linked in **Voice settings > Push-to-Talk**. Official platform
releases include these separately versioned Helper 0.2.0 installers:

| Platform | Installer | Status |
| --- | --- | --- |
| macOS, Apple Silicon (M-series) | `nebulynk-ptt-helper_0.2.0_macos-beta_aarch64.dmg` | Beta |
| macOS, Intel | `nebulynk-ptt-helper_0.2.0_macos-beta_x86_64.dmg` | Beta |
| Windows, 64-bit | `nebulynk-ptt-helper_0.2.0_windows_x86_64.msi` | Windows helper |

On a Mac, **Apple menu > About This Mac** shows either an Apple chip or an Intel
processor. The macOS deployment target is **macOS 13 or later**. Native CI builds
run on macOS 15; compatibility with other versions and actual keyboard/permission
behavior require device testing. The platform release itself remains stable;
the Beta label applies to the Mac helper.

Every installer has a `.sha256` file. To check a Mac download, run
`shasum -a 256 -c INSTALLER.dmg.sha256` in its download directory. The
`ptt-helper-assets.json` release asset records helper/platform versions, source
commit, CPU architecture, Beta status, size and SHA-256 checksum.

## Install the macOS Beta

1. Download the DMG for your Mac, open it and drag **Nebulynk PTT Helper** into
   **Applications**. Eject the disk image, then start the app from Applications.
2. This Beta has a free **ad-hoc signature**. It has no Apple Developer ID and
   is **not notarized by Apple**. If macOS blocks its first launch, go to
   **System Settings > Privacy & Security**, find the message for this app and
   choose **Open Anyway** if you trust the download. Confirm the subsequent
   app-specific dialog. The wording may differ by macOS version; see
   [Apple's instructions](https://support.apple.com/en-us/102445).
3. In the helper settings, click **Allow Input Monitoring**, then enable
   **Nebulynk PTT Helper** under **Privacy & Security > Input Monitoring**.
   Restart the helper if macOS requests it. See
   [Apple's Input Monitoring guide](https://support.apple.com/guide/mac-help/control-access-to-input-monitoring-on-mac-mchl4cedafb6/mac).
4. Keep the helper running in the menu bar. In Nebulynk, choose **Voice settings
   > Push-to-Talk**, set your key and enable **global Push-to-Talk**.
5. Approve the exact Nebulynk site in the helper's pairing window. Join a voice
   channel/call and test holding and releasing your key, then repeat while
   another app is active.

There is no need to disable Gatekeeper globally or purchase an Apple developer
account. The separate microphone permission belongs to the browser; this helper
observes the configured PTT key and does not record audio. Background keyboard
access stays off until you opt in and approve pairing.

## Helper controls and recovery

- Open settings from the menu bar/tray icon. Closing the settings window keeps
  the helper running. **Pause PTT** stops forwarding; **Quit** ends the helper.
- **Start at login** is optional and defaults to off. On macOS, install in
  `/Applications` first. The helper manages only its own per-user LaunchAgent
  at `~/Library/LaunchAgents/net.nebulynk.desktop-ptt-helper.plist`. System login
  item restrictions can override automatic startup.
- Each Nebulynk origin needs approval. Trusted sites can be revoked in the
  helper. When multiple paired windows are open, the last active Nebulynk
  window owns PTT; only one receives transmit events.
- If permissions are missing or revoked, the UI explains that global capture
  is unavailable. Focused-window PTT remains available. After restoring access,
  release the assigned key and press it again; restart the helper if requested.
- Installing a newer ad-hoc build can require granting Input Monitoring again.
  Install the replacement in the same Applications location and check its
  permissions rather than assuming the previous permission carries over.
- macOS Secure Input (for example a protected password field) can temporarily
  suspend global capture. The helper reports this and releases its transmit
  state. Fn/Globe, media keys, PC-only keys and function keys beyond F20 are not
  offered as reliable Mac global hold bindings. Some F-keys require changing
  the keyboard's standard-function-key setting.
- Disconnecting, losing capture, changing the active target, pausing or leaving
  voice must release transmission. Manually muting the microphone continues to
  take precedence over PTT.

## Pre-release tester checklist

The first macOS Beta needs a device acceptance report before the release tag.
CI verifies native builds and pure state/keyboard tests; it does not grant
interactive privacy permissions or prove global PTT on a real desktop.

Record the source commit, helper version, installer SHA-256, CPU, macOS version,
keyboard layout and browser version. Test Safari and a Chromium browser, plus
the installed PWA where supported. Mark each item passed/failed/not tested:

- Download using a browser, install from DMG, follow first-launch approval and
  grant Input Monitoring. Verify the menu icon and settings window.
- Pair/decline/revoke a site. Enable/disable the browser opt-in and confirm no
  helper connection occurs before opt-in.
- Hold and release ShiftLeft/ShiftRight, a letter, Space and a suitable F-key.
  Repeat with another active app and a focused message input. Normal typing,
  capitalization and Enter submission remain available; repeats produce no
  duplicate activation sounds.
- Switch between two Nebulynk windows; pause, mute, leave voice, disconnect the
  helper, quit/restart it and put the Mac to sleep/wake it while holding a key.
  No case may leave the microphone transmitting after release or cleanup.
- Revoke/re-grant Input Monitoring, enter a Secure Input field and install a
  replacement ad-hoc build. Check accurate status and recovery instructions.
- Enable login startup, sign out/in, then disable it and repeat. Check no
  duplicate helper is started.

Practical Mac acceptance is **pending** until the tester records results.
Testing one CPU architecture does not establish device coverage for the other;
report those limits explicitly. Recheck the final release candidate after any
functional changes and check the actual public download after publication.

## Building and test candidates

From the repository root, install Node 22.12+ dependencies with `npm ci` and
install a Rust toolchain plus the platform's Tauri prerequisites. Use:

```bash
npm run dev:desktop:ptt-helper
npm run build:desktop:ptt-helper
# On macOS:
npm run build:macos --workspace=desktop-ptt-helper
cargo test --locked --manifest-path desktop-ptt-helper/src-tauri/Cargo.toml
```

The **Build PTT Helper** Actions workflow can be run manually against a branch
or tag. It uploads three `ptt-helper-*` Actions artifacts with installers,
checksums and per-platform metadata; a manual run does not publish a release.
Required full CI calls the same workflow. Download a candidate from its Actions
run for the tester; never describe a local cross-platform type check as a Mac
runtime test.

Test the Mac candidate against a Nebulynk test installation built from the same
feature branch or the 0.9.0 release candidate. A published 0.8.1 frontend still
limits the browser helper to Windows and cannot opt in on macOS. Use a separate
test deployment; [staging images](STAGING.md) can be prepared from the candidate
branch. The helper installer alone does not update the browser frontend.

Standard GitHub-hosted runners are free for public repositories; private
repositories use the account's included usage and billing rules. Builds do not
need Apple certificates, notarization credentials or an Apple subscription.
