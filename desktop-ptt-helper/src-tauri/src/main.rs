#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod autostart;
mod helper_log;
#[cfg(any(target_os = "macos", test))]
mod macos_ptt;
mod ptt;
#[cfg(not(target_os = "macos"))]
mod windows_ptt;

use base64::Engine;
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use ptt::{
    DesktopPttBindingRequest, DesktopPttBindingStatus, NativePttEvent, PttEvent, PttService,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::fs::OpenOptions;
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::menu::{MenuBuilder, MenuItem, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent, Wry,
};
use tokio::net::TcpListener;
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio_tungstenite::accept_hdr_async;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use tokio_tungstenite::tungstenite::Message;
use url::Url;

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_ID: &str = "main-tray";
const WS_HOST: &str = "127.0.0.1";
const WS_PORT: u16 = 47641;
const WS_PATH: &str = "/ws";
const WS_PROTOCOL_VERSION: &str = "2";
const MAX_WS_TEXT_FRAME_BYTES: usize = 64 * 1024;
const PAIRING_TOKEN_BYTES: usize = 32;
const STORAGE_FILE_NAME: &str = "helper-state.json";
#[cfg(target_os = "windows")]
const AUTOSTART_REGISTRY_NAME: &str = "Nebulynk PTT Helper";
const EVENT_STATE_CHANGED: &str = "helper:state-changed";
const MENU_STATUS_ID: &str = "status";
const MENU_TRUSTED_SITES_ID: &str = "trusted-sites";
const MENU_OPEN_SETTINGS_ID: &str = "open-settings";
const MENU_TOGGLE_PAUSE_ID: &str = "toggle-pause";
const MENU_QUIT_ID: &str = "quit";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct TrustedOriginRecord {
    origin: String,
    token_hash: String,
    approved_at: String,
    last_client_kind: String,
    #[serde(default)]
    approved_key_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct LastTargetMetadata {
    origin: String,
    session_id: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct PersistedHelperState {
    trusted_origins: Vec<TrustedOriginRecord>,
    paused: bool,
    autostart_enabled: bool,
    last_target: Option<LastTargetMetadata>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingPairingSnapshot {
    request_id: String,
    origin: String,
    client_kind: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActiveSessionSnapshot {
    connection_id: u64,
    origin: String,
    session_id: String,
    client_kind: String,
    route: String,
    base_url: String,
    focused: bool,
    visible: bool,
    authorized: bool,
    is_target: bool,
    last_foreground_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HelperStateSnapshot {
    helper_version: String,
    platform: String,
    beta: bool,
    input_monitoring_granted: bool,
    binding_status: DesktopPttBindingStatus,
    paused: bool,
    autostart_enabled: bool,
    trusted_origins: Vec<TrustedOriginRecord>,
    pending_pairing_requests: Vec<PendingPairingSnapshot>,
    pending_binding_requests: Vec<BindingApprovalRequest>,
    active_sessions: Vec<ActiveSessionSnapshot>,
    current_target_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetStateMessage {
    is_target: bool,
    target_session_id: Option<String>,
}

#[derive(Debug, Clone)]
struct PendingPairingRequest {
    request_id: String,
    connection_id: u64,
    origin: String,
    client_kind: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BindingApprovalRequest {
    request_id: String,
    origin: String,
    key_code: String,
    previous_key_code: Option<String>,
    connection_id: u64,
    revision: u64,
}

#[derive(Debug, Clone)]
struct SessionState {
    connection_id: u64,
    origin: String,
    session_id: String,
    client_kind: String,
    route: String,
    base_url: String,
    focused: bool,
    visible: bool,
    authorized: bool,
    last_foreground_at: Option<String>,
    ptt_config: DesktopPttBindingRequest,
    rejected_binding_key: Option<String>,
    binding_revision: u64,
    sender: UnboundedSender<OutboundMessage>,
}

enum OutboundMessage {
    Json(Value),
    Close(Option<Value>),
}

struct RuntimeState {
    persisted: PersistedHelperState,
    active_binding_request: DesktopPttBindingRequest,
    binding_status: DesktopPttBindingStatus,
    sessions: HashMap<u64, SessionState>,
    pending_pairings: Vec<PendingPairingRequest>,
    next_connection_id: u64,
    next_request_id: u64,
    target_connection_id: Option<u64>,
    binding_target: Option<u64>,
    binding_generation: u64,
    next_binding_revision: u64,
    binding_requests: Vec<BindingApprovalRequest>,
    transmitting: Option<(u64, u64)>,
}

impl RuntimeState {
    fn from_persisted(
        persisted: PersistedHelperState,
        binding_status: DesktopPttBindingStatus,
    ) -> Self {
        Self {
            persisted,
            active_binding_request: default_ptt_request(),
            binding_status,
            sessions: HashMap::new(),
            pending_pairings: Vec::new(),
            next_connection_id: 1,
            next_request_id: 1,
            target_connection_id: None,
            binding_target: None,
            binding_generation: 0,
            next_binding_revision: 0,
            binding_requests: Vec::new(),
            transmitting: None,
        }
    }
}

struct HelperStateHandle {
    app_handle: AppHandle,
    runtime: Mutex<RuntimeState>,
    binding_update: Mutex<()>,
    ptt_service: PttService,
}

struct TrayMenuHandle {
    status: MenuItem<Wry>,
    trusted_sites: MenuItem<Wry>,
    toggle_pause: MenuItem<Wry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HelloPayload {
    protocol_version: Option<String>,
    origin: String,
    session_id: String,
    client_kind: Option<String>,
    pairing_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionStatePayload {
    route: Option<String>,
    focused: Option<bool>,
    visible: Option<bool>,
    base_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Envelope {
    #[serde(rename = "type")]
    message_type: String,
    payload: Option<Value>,
}

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}

fn default_ptt_request() -> DesktopPttBindingRequest {
    DesktopPttBindingRequest {
        key_code: None,
        mode: Some("live".to_string()),
        allow_pass_through: Some(true),
        platform_strategy: Some("auto".to_string()),
    }
}

fn state_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    if !base_dir.exists() {
        fs::create_dir_all(&base_dir).map_err(|error| error.to_string())?;
    }
    Ok(base_dir.join(STORAGE_FILE_NAME))
}

fn append_helper_log(_app: &AppHandle, message: &str) {
    helper_log::log(message);
}

fn load_persisted_state(app: &AppHandle) -> Result<PersistedHelperState, String> {
    let path = state_file_path(app)?;
    if !path.exists() {
        return Ok(PersistedHelperState::default());
    }
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn save_persisted_state(app: &AppHandle, persisted: &PersistedHelperState) -> Result<(), String> {
    let path = state_file_path(app)?;
    let content = serde_json::to_string_pretty(persisted).map_err(|error| error.to_string())?;
    use std::io::Write;
    let temporary = path.with_extension("json.tmp");
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| -> std::io::Result<()> {
        let mut file = options.open(&temporary)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, &path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|error| error.to_string())
}

fn generate_pairing_token() -> String {
    let mut bytes = [0_u8; PAIRING_TOKEN_BYTES];
    rand::rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn hash_pairing_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn normalize_origin(origin: &str) -> Result<String, String> {
    let parsed = Url::parse(origin.trim()).map_err(|error| error.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Only http and https origins can pair with the local helper.".to_string());
    }
    Ok(parsed.origin().ascii_serialization())
}

fn normalize_request_origin_header(request: &Request) -> Result<String, String> {
    let value = request
        .headers()
        .get("origin")
        .ok_or_else(|| "WebSocket Origin header is required for helper pairing.".to_string())?;
    let origin = value
        .to_str()
        .map_err(|_| "WebSocket Origin header must be valid ASCII.".to_string())?;
    normalize_origin(origin)
}

fn validate_hello_protocol(payload: &HelloPayload) -> Result<(), String> {
    match payload.protocol_version.as_deref().map(str::trim) {
        Some(WS_PROTOCOL_VERSION) => Ok(()),
        Some(_) => Err("Unsupported helper protocol version.".to_string()),
        None => Err("Helper protocol version is required.".to_string()),
    }
}

fn normalize_hello_origin(request_origin: &str, payload_origin: &str) -> Result<String, String> {
    let normalized_payload_origin = normalize_origin(payload_origin)?;
    if normalized_payload_origin != request_origin {
        return Err("WebSocket Origin header must match the hello origin.".to_string());
    }
    Ok(normalized_payload_origin)
}

fn normalize_client_kind(client_kind: Option<&str>) -> String {
    match client_kind.map(str::trim) {
        Some("pwa") => "pwa".to_string(),
        _ => "browser".to_string(),
    }
}

fn normalize_route(route: Option<&str>) -> String {
    let trimmed = route.unwrap_or("/").trim();
    if trimmed.is_empty() {
        "/".to_string()
    } else if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    }
}

fn normalize_base_url(base_url: Option<&str>, fallback_origin: &str) -> String {
    let trimmed = base_url.unwrap_or(fallback_origin).trim();
    if trimmed.is_empty() {
        return fallback_origin.to_string();
    }
    match normalize_origin(trimmed) {
        Ok(origin) if origin == fallback_origin => origin,
        _ => fallback_origin.to_string(),
    }
}

fn status_menu_label(status: &DesktopPttBindingStatus, paused: bool) -> String {
    if paused {
        "Status: Paused".to_string()
    } else {
        match status.mode.as_str() {
            "global-raw-input" | "global-native" => format!(
                "Status: Global ({})",
                status.key_code.clone().unwrap_or_else(|| "PTT".to_string())
            ),
            "unsupported" => "Status: Unsupported".to_string(),
            _ => "Status: Focused only".to_string(),
        }
    }
}

fn helper_snapshot(runtime: &RuntimeState) -> HelperStateSnapshot {
    let current_target_session_id = runtime
        .target_connection_id
        .and_then(|connection_id| runtime.sessions.get(&connection_id))
        .map(|session| session.session_id.clone());

    let mut active_sessions = runtime
        .sessions
        .values()
        .map(|session| ActiveSessionSnapshot {
            connection_id: session.connection_id,
            origin: session.origin.clone(),
            session_id: session.session_id.clone(),
            client_kind: session.client_kind.clone(),
            route: session.route.clone(),
            base_url: session.base_url.clone(),
            focused: session.focused,
            visible: session.visible,
            authorized: session.authorized,
            is_target: runtime.target_connection_id == Some(session.connection_id),
            last_foreground_at: session.last_foreground_at.clone(),
        })
        .collect::<Vec<_>>();
    active_sessions.sort_by(|a, b| b.last_foreground_at.cmp(&a.last_foreground_at));

    HelperStateSnapshot {
        helper_version: APP_VERSION.to_string(),
        platform: runtime.binding_status.platform.clone(),
        beta: cfg!(target_os = "macos"),
        input_monitoring_granted: input_monitoring_granted(),
        binding_status: runtime.binding_status.clone(),
        paused: runtime.persisted.paused,
        autostart_enabled: runtime.persisted.autostart_enabled,
        trusted_origins: runtime.persisted.trusted_origins.clone(),
        pending_pairing_requests: runtime
            .pending_pairings
            .iter()
            .map(|request| PendingPairingSnapshot {
                request_id: request.request_id.clone(),
                origin: request.origin.clone(),
                client_kind: request.client_kind.clone(),
                created_at: request.created_at.clone(),
            })
            .collect(),
        pending_binding_requests: runtime.binding_requests.clone(),
        active_sessions,
        current_target_session_id,
    }
}

fn trusted_origin_for<'a>(
    runtime: &'a RuntimeState,
    origin: &str,
) -> Option<&'a TrustedOriginRecord> {
    runtime
        .persisted
        .trusted_origins
        .iter()
        .find(|candidate| candidate.origin == origin)
}

fn is_pairing_token_valid(runtime: &RuntimeState, origin: &str, token: &str) -> bool {
    let Some(record) = trusted_origin_for(runtime, origin) else {
        return false;
    };
    record.token_hash == hash_pairing_token(token)
}

fn current_target_state(runtime: &RuntimeState, connection_id: u64) -> TargetStateMessage {
    let target_session_id = runtime
        .target_connection_id
        .and_then(|target_connection_id| runtime.sessions.get(&target_connection_id))
        .map(|session| session.session_id.clone());

    TargetStateMessage {
        is_target: runtime.target_connection_id == Some(connection_id),
        target_session_id,
    }
}

fn emit_state_changed(app: &AppHandle, helper_state: &HelperStateHandle) -> Result<(), String> {
    let snapshot = {
        let runtime = helper_state
            .runtime
            .lock()
            .map_err(|error| error.to_string())?;
        helper_snapshot(&runtime)
    };
    if let Err(error) = update_tray_menu(app, &snapshot) {
        append_helper_log(app, &format!("tray update failed: {}", error));
    }
    app.emit(EVENT_STATE_CHANGED, snapshot)
        .map_err(|error| error.to_string())
}

fn persist_runtime(app: &AppHandle, helper_state: &HelperStateHandle) -> Result<(), String> {
    let persisted = {
        let runtime = helper_state
            .runtime
            .lock()
            .map_err(|error| error.to_string())?;
        runtime.persisted.clone()
    };
    save_persisted_state(app, &persisted)
}

fn ensure_settings_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        return Ok(window);
    }

    let window =
        WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
            .title("Nebulynk PTT Helper")
            .visible(false)
            .inner_size(860.0, 680.0)
            .min_inner_size(760.0, 560.0)
            .resizable(true)
            .build()
            .map_err(|error| error.to_string())?;

    let window_handle = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_handle.hide();
        }
    });

    Ok(window)
}

fn show_settings_window(app: &AppHandle) -> Result<(), String> {
    let window = ensure_settings_window(app)?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

fn hide_settings_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.hide();
    }
}

fn update_tray_menu(app: &AppHandle, snapshot: &HelperStateSnapshot) -> Result<(), String> {
    let tray_menu = app
        .try_state::<TrayMenuHandle>()
        .ok_or_else(|| "Tray menu handles are not available".to_string())?;
    tray_menu
        .status
        .set_text(status_menu_label(&snapshot.binding_status, snapshot.paused))
        .map_err(|error| error.to_string())?;
    tray_menu
        .trusted_sites
        .set_text(format!(
            "Trusted Sites ({})",
            snapshot.trusted_origins.len()
        ))
        .map_err(|error| error.to_string())?;
    tray_menu
        .toggle_pause
        .set_text(if snapshot.paused {
            "Resume PTT"
        } else {
            "Pause PTT"
        })
        .map_err(|error| error.to_string())
}

fn choose_target_connection(runtime: &RuntimeState) -> Option<u64> {
    let mut sessions = runtime
        .sessions
        .values()
        .filter(|session| session.authorized)
        .collect::<Vec<_>>();
    sessions.sort_by(|left, right| right.last_foreground_at.cmp(&left.last_foreground_at));

    if let Some(focused) = sessions.iter().find(|session| session.focused) {
        return Some(focused.connection_id);
    }

    sessions
        .iter()
        .find(|session| session.last_foreground_at.is_some())
        .map(|session| session.connection_id)
}

fn session_key(session: &SessionState) -> Option<&str> {
    (session.ptt_config.mode.as_deref() == Some("ptt"))
        .then(|| session.ptt_config.key_code.as_deref())
        .flatten()
}

fn binding_block_reason(runtime: &RuntimeState, session: &SessionState) -> Option<&'static str> {
    let key = session_key(session)?;
    if trusted_origin_for(runtime, &session.origin).and_then(|r| r.approved_key_code.as_deref())
        == Some(key)
    {
        return None;
    }
    Some(if session.rejected_binding_key.as_deref() == Some(key) {
        "binding-rejected"
    } else {
        "binding-approval-required"
    })
}

fn sync_binding_requests(runtime: &mut RuntimeState) {
    let mut candidates: HashMap<String, &SessionState> = HashMap::new();
    for session in runtime.sessions.values().filter(|s| s.authorized) {
        if binding_block_reason(runtime, session) != Some("binding-approval-required") {
            continue;
        }
        let rank = |s: &SessionState| {
            (
                Some(s.connection_id) == runtime.target_connection_id,
                s.binding_revision,
                s.connection_id,
            )
        };
        if candidates
            .get(&session.origin)
            .is_none_or(|previous| rank(session) > rank(previous))
        {
            candidates.insert(session.origin.clone(), session);
        }
    }
    runtime.binding_requests.retain(|request| {
        candidates.get(&request.origin).is_some_and(|session| {
            session.connection_id == request.connection_id
                && session.binding_revision == request.revision
                && session_key(session) == Some(request.key_code.as_str())
        })
    });
    for (origin, session) in candidates {
        if runtime.binding_requests.iter().any(|r| r.origin == origin) {
            continue;
        }
        runtime.binding_requests.push(BindingApprovalRequest {
            request_id: cuid2::create_id(),
            origin: origin.clone(),
            key_code: session_key(session).unwrap().to_string(),
            previous_key_code: runtime
                .persisted
                .trusted_origins
                .iter()
                .find(|r| r.origin == origin)
                .and_then(|r| r.approved_key_code.clone()),
            connection_id: session.connection_id,
            revision: session.binding_revision,
        });
    }
    runtime
        .binding_requests
        .sort_by(|a, b| a.origin.cmp(&b.origin));
}

fn binding_request(
    runtime: &RuntimeState,
    request_id: &str,
) -> Result<BindingApprovalRequest, String> {
    let request = runtime
        .binding_requests
        .iter()
        .find(|r| r.request_id == request_id)
        .ok_or_else(|| {
            "The key request changed or expired. Review the current request again.".to_string()
        })?;
    let valid = runtime
        .sessions
        .get(&request.connection_id)
        .is_some_and(|session| {
            session.authorized
                && session.origin == request.origin
                && session.binding_revision == request.revision
                && session_key(session) == Some(request.key_code.as_str())
                && binding_block_reason(runtime, session) == Some("binding-approval-required")
        });
    if !valid {
        return Err("The key request changed or expired. Review the current request again.".into());
    }
    Ok(request.clone())
}

fn proposed_binding_approval(
    runtime: &RuntimeState,
    request_id: &str,
) -> Result<PersistedHelperState, String> {
    let request = binding_request(runtime, request_id)?;
    let mut proposed = runtime.persisted.clone();
    let record = proposed
        .trusted_origins
        .iter_mut()
        .find(|r| r.origin == request.origin)
        .ok_or_else(|| "Pair the site before approving a key.".to_string())?;
    record.approved_key_code = Some(request.key_code);
    Ok(proposed)
}

fn commit_binding_approval(
    runtime: &mut RuntimeState,
    request_id: &str,
    save: impl FnOnce(&PersistedHelperState) -> Result<(), String>,
) -> Result<(), String> {
    let proposed = proposed_binding_approval(runtime, request_id)?;
    save(&proposed)?;
    runtime.persisted = proposed;
    Ok(())
}

fn effective_status(
    runtime: &RuntimeState,
    mut native: DesktopPttBindingStatus,
) -> DesktopPttBindingStatus {
    let reason = if runtime.persisted.paused {
        Some("paused")
    } else {
        runtime
            .target_connection_id
            .and_then(|id| runtime.sessions.get(&id))
            .and_then(|session| binding_block_reason(runtime, session))
    };
    if let Some(reason) = reason {
        let key = runtime
            .target_connection_id
            .and_then(|id| runtime.sessions.get(&id))
            .and_then(session_key)
            .map(str::to_string);
        let platform = native.platform;
        native = DesktopPttBindingStatus {
            key_code: key,
            reason: Some(reason.into()),
            platform,
            ..DesktopPttBindingStatus::default()
        };
    }
    native
}

fn release_transmission(runtime: &mut RuntimeState) {
    if let Some((owner, _)) = runtime.transmitting.take() {
        if let Some(session) = runtime.sessions.get(&owner) {
            send_json(&session.sender, json!({ "type": "ptt_up" }));
        }
    }
}

fn route_ptt_event(runtime: &mut RuntimeState, event: NativePttEvent) {
    if event.action == PttEvent::Up {
        if runtime
            .transmitting
            .is_some_and(|(_, generation)| generation == event.generation)
        {
            release_transmission(runtime);
        }
        return;
    }
    if event.generation != runtime.binding_generation
        || runtime.persisted.paused
        || !runtime.binding_status.is_global
        || runtime.transmitting.is_some()
        || runtime.target_connection_id != runtime.binding_target
    {
        return;
    }
    let Some(id) = runtime.target_connection_id else {
        return;
    };
    let Some(session) = runtime.sessions.get(&id) else {
        return;
    };
    if !session.authorized
        || binding_block_reason(runtime, session).is_some()
        || session_key(session) != runtime.active_binding_request.key_code.as_deref()
        || session_key(session).is_none()
    {
        return;
    }
    send_json(&session.sender, json!({ "type": "ptt_down" }));
    runtime.transmitting = Some((id, event.generation));
}

fn effective_binding_request(runtime: &RuntimeState) -> DesktopPttBindingRequest {
    if runtime.persisted.paused {
        return default_ptt_request();
    }

    let Some(target_connection_id) = runtime.target_connection_id else {
        return default_ptt_request();
    };
    let Some(session) = runtime.sessions.get(&target_connection_id) else {
        return default_ptt_request();
    };

    if !session.authorized || binding_block_reason(runtime, session).is_some() {
        return default_ptt_request();
    }

    let mode = session
        .ptt_config
        .mode
        .as_deref()
        .map(str::trim)
        .unwrap_or("live");
    if mode != "ptt" {
        return default_ptt_request();
    }

    session.ptt_config.clone()
}

fn send_json(sender: &UnboundedSender<OutboundMessage>, value: Value) {
    let _ = sender.send(OutboundMessage::Json(value));
}

fn send_error(sender: &UnboundedSender<OutboundMessage>, code: &str, message: &str) {
    send_json(
        sender,
        json!({
            "type": "error",
            "payload": {
                "code": code,
                "message": message
            }
        }),
    );
}

fn parse_text_envelope(text: &str) -> Result<Envelope, (&'static str, &'static str)> {
    if text.len() > MAX_WS_TEXT_FRAME_BYTES {
        return Err(("message_too_large", "The helper message is too large."));
    }
    serde_json::from_str::<Envelope>(text)
        .map_err(|_| ("invalid_json", "The helper only accepts JSON messages."))
}

fn is_terminal_hello_error(error: &str) -> bool {
    matches!(
        error,
        "WebSocket Origin header must match the hello origin."
            | "Unsupported helper protocol version."
            | "Helper protocol version is required."
            | "Only http and https origins can pair with the local helper."
    )
}

fn remove_duplicate_sessions(
    runtime: &mut RuntimeState,
    current_connection_id: u64,
    origin: &str,
    session_id: &str,
) -> Vec<UnboundedSender<OutboundMessage>> {
    let duplicate_ids = runtime
        .sessions
        .iter()
        .filter(|(connection_id, session)| {
            **connection_id != current_connection_id
                && session.origin == origin
                && session.session_id == session_id
        })
        .map(|(connection_id, _)| *connection_id)
        .collect::<Vec<_>>();

    let mut senders = Vec::with_capacity(duplicate_ids.len());
    for duplicate_id in duplicate_ids {
        if let Some(session) = runtime.sessions.remove(&duplicate_id) {
            senders.push(session.sender);
        }
        runtime
            .pending_pairings
            .retain(|request| request.connection_id != duplicate_id);
        if runtime.target_connection_id == Some(duplicate_id) {
            runtime.target_connection_id = None;
        }
    }

    senders
}

fn revoke_origin_in_runtime(
    runtime: &mut RuntimeState,
    normalized_origin: &str,
) -> Vec<UnboundedSender<OutboundMessage>> {
    runtime
        .persisted
        .trusted_origins
        .retain(|candidate| candidate.origin != normalized_origin);
    runtime
        .pending_pairings
        .retain(|request| request.origin != normalized_origin);
    runtime
        .sessions
        .values_mut()
        .filter(|session| session.origin == normalized_origin)
        .map(|session| {
            session.authorized = false;
            session.focused = false;
            session.last_foreground_at = None;
            session.sender.clone()
        })
        .collect::<Vec<_>>()
}

fn broadcast_target_states(helper_state: &HelperStateHandle) {
    let sessions = {
        let runtime = helper_state.runtime.lock().unwrap();
        runtime
            .sessions
            .values()
            .filter(|session| session.authorized)
            .map(|session| {
                (
                    session.sender.clone(),
                    current_target_state(&runtime, session.connection_id),
                )
            })
            .collect::<Vec<_>>()
    };

    for (sender, target_state) in sessions {
        send_json(
            &sender,
            json!({
                "type": "target_state",
                "payload": target_state
            }),
        );
    }
}

fn session_binding_status(
    runtime: &RuntimeState,
    session: &SessionState,
) -> DesktopPttBindingStatus {
    let reason = if runtime.persisted.paused {
        Some("paused")
    } else {
        binding_block_reason(runtime, session)
    };
    if let Some(reason) = reason {
        return DesktopPttBindingStatus {
            key_code: session_key(session).map(str::to_string),
            reason: Some(reason.into()),
            ..DesktopPttBindingStatus::default()
        };
    }
    if runtime.target_connection_id != Some(session.connection_id) {
        return DesktopPttBindingStatus {
            reason: Some("another-session-active".into()),
            ..DesktopPttBindingStatus::default()
        };
    }
    runtime.binding_status.clone()
}

fn broadcast_binding_status(helper_state: &HelperStateHandle) {
    if let Ok(runtime) = helper_state.runtime.lock() {
        for session in runtime
            .sessions
            .values()
            .filter(|session| session.authorized)
        {
            send_json(
                &session.sender,
                json!({"type":"binding_status", "payload":session_binding_status(&runtime, session)}),
            );
        }
    }
}

// Caller holds binding_update; native callbacks can still acquire runtime.
fn recompute_target_and_binding(
    app: &AppHandle,
    helper_state: &HelperStateHandle,
) -> Result<(), String> {
    let (request, generation, changed) = {
        let mut runtime = helper_state.runtime.lock().map_err(|e| e.to_string())?;
        let target = choose_target_connection(&runtime);
        runtime.target_connection_id = target;
        sync_binding_requests(&mut runtime);
        let request = effective_binding_request(&runtime);
        let changed = request != runtime.active_binding_request || target != runtime.binding_target;
        if changed {
            release_transmission(&mut runtime);
            runtime.binding_generation = runtime
                .binding_generation
                .checked_add(1)
                .expect("Binding generation exhausted");
            runtime.binding_target = target;
            runtime.active_binding_request = request.clone();
            runtime.binding_status = DesktopPttBindingStatus::default();
            runtime.persisted.last_target =
                target
                    .and_then(|id| runtime.sessions.get(&id))
                    .map(|session| LastTargetMetadata {
                        origin: session.origin.clone(),
                        session_id: session.session_id.clone(),
                        updated_at: now_rfc3339(),
                    });
        }
        (request, runtime.binding_generation, changed)
    };
    let native = if changed {
        helper_state.ptt_service.set_binding(request, generation)
    } else {
        helper_state.ptt_service.current_status()
    };
    {
        let mut runtime = helper_state.runtime.lock().map_err(|e| e.to_string())?;
        runtime.binding_status = effective_status(&runtime, native);
        if !runtime.binding_status.is_global {
            release_transmission(&mut runtime);
        }
    }
    let persisted = if changed {
        persist_runtime(app, helper_state)
    } else {
        Ok(())
    };
    broadcast_binding_status(helper_state);
    broadcast_target_states(helper_state);
    emit_state_changed(app, helper_state)?;
    persisted
}

fn register_connection(
    helper_state: &HelperStateHandle,
    sender: UnboundedSender<OutboundMessage>,
) -> Result<u64, String> {
    let mut runtime = helper_state
        .runtime
        .lock()
        .map_err(|error| error.to_string())?;
    let connection_id = runtime.next_connection_id;
    runtime.next_connection_id += 1;
    runtime.sessions.insert(
        connection_id,
        SessionState {
            connection_id,
            origin: String::new(),
            session_id: format!("pending-{connection_id}"),
            client_kind: "browser".to_string(),
            route: "/".to_string(),
            base_url: String::new(),
            focused: false,
            visible: true,
            authorized: false,
            last_foreground_at: None,
            ptt_config: default_ptt_request(),
            rejected_binding_key: None,
            binding_revision: 0,
            sender,
        },
    );
    Ok(connection_id)
}

fn cleanup_connection(
    app: &AppHandle,
    helper_state: &HelperStateHandle,
    connection_id: u64,
) -> Result<(), String> {
    let _update = helper_state
        .binding_update
        .lock()
        .map_err(|error| error.to_string())?;
    {
        let mut runtime = helper_state
            .runtime
            .lock()
            .map_err(|error| error.to_string())?;
        if runtime
            .transmitting
            .is_some_and(|(owner, _)| owner == connection_id)
        {
            release_transmission(&mut runtime);
        }
        runtime.sessions.remove(&connection_id);
        runtime
            .pending_pairings
            .retain(|request| request.connection_id != connection_id);
    }
    recompute_target_and_binding(app, helper_state)
}

fn handle_hello(
    app: &AppHandle,
    helper_state: &HelperStateHandle,
    connection_id: u64,
    normalized_origin: String,
    payload: HelloPayload,
) -> Result<(), String> {
    let _update = helper_state
        .binding_update
        .lock()
        .map_err(|error| error.to_string())?;
    let client_kind = normalize_client_kind(payload.client_kind.as_deref());
    let normalized_session_id = payload.session_id.trim().to_string();

    let maybe_sender;
    let mut maybe_request_id = None;
    let mut target_state = None;
    let mut binding_status = None;
    let mut send_invalid_token_error = false;
    let mut duplicate_senders = Vec::new();

    {
        let mut runtime = helper_state
            .runtime
            .lock()
            .map_err(|error| error.to_string())?;
        let authorized = payload
            .pairing_token
            .as_deref()
            .map(|token| is_pairing_token_valid(&runtime, &normalized_origin, token))
            .unwrap_or(false);
        let trusted_origin_exists = trusted_origin_for(&runtime, &normalized_origin).is_some();

        if authorized {
            {
                let session = runtime
                    .sessions
                    .get_mut(&connection_id)
                    .ok_or_else(|| "Unknown helper connection".to_string())?;
                session.origin = normalized_origin.clone();
                session.session_id = normalized_session_id.clone();
                session.client_kind = client_kind.clone();
                session.base_url = normalized_origin.clone();
                session.authorized = true;
                if session.last_foreground_at.is_none() {
                    session.last_foreground_at = Some(now_rfc3339());
                }
                maybe_sender = session.sender.clone();
            }
            duplicate_senders = remove_duplicate_sessions(
                &mut runtime,
                connection_id,
                &normalized_origin,
                &normalized_session_id,
            );
            runtime
                .pending_pairings
                .retain(|request| request.connection_id != connection_id);
            binding_status = Some(runtime.binding_status.clone());
            target_state = Some(current_target_state(&runtime, connection_id));
        } else {
            {
                let session = runtime
                    .sessions
                    .get_mut(&connection_id)
                    .ok_or_else(|| "Unknown helper connection".to_string())?;
                session.origin = normalized_origin.clone();
                session.session_id = normalized_session_id.clone();
                session.client_kind = client_kind.clone();
                session.base_url = normalized_origin.clone();
                session.authorized = false;
                session.focused = false;
                session.visible = true;
                session.last_foreground_at = None;
                maybe_sender = session.sender.clone();
            }

            if trusted_origin_exists && payload.pairing_token.is_some() {
                send_invalid_token_error = true;
            }

            let request_id = if let Some(existing) = runtime
                .pending_pairings
                .iter()
                .find(|request| request.connection_id == connection_id)
            {
                existing.request_id.clone()
            } else {
                let request_id = format!("pair-{}", runtime.next_request_id);
                runtime.next_request_id += 1;
                runtime.pending_pairings.push(PendingPairingRequest {
                    request_id: request_id.clone(),
                    connection_id,
                    origin: normalized_origin.clone(),
                    client_kind: client_kind.clone(),
                    created_at: now_rfc3339(),
                });
                request_id
            };
            maybe_request_id = Some(request_id);
        }
    }

    let sender = maybe_sender;
    for duplicate_sender in duplicate_senders {
        let _ = duplicate_sender.send(OutboundMessage::Close(Some(json!({
            "type": "error",
            "payload": {
                "code": "session_replaced",
                "message": "A newer helper connection replaced this browser session."
            }
        }))));
    }
    if send_invalid_token_error {
        send_error(
            &sender,
            "invalid_pairing_token",
            "The stored pairing token is no longer valid for this origin.",
        );
    }

    if let Some(request_id) = maybe_request_id {
        send_json(
            &sender,
            json!({
                "type": "pairing_required",
                "payload": {
                    "requestId": request_id
                }
            }),
        );
        emit_state_changed(app, helper_state)?;
        let _ = show_settings_window(app);
        recompute_target_and_binding(app, helper_state)?;
        return Ok(());
    }

    send_json(
        &sender,
        json!({
            "type": "hello_ack",
            "payload": {
                "authorized": true,
                "helperVersion": APP_VERSION,
                "protocolVersion": WS_PROTOCOL_VERSION,
                "bindingStatus": binding_status.unwrap_or_default(),
                "targetState": target_state.unwrap_or(TargetStateMessage {
                    is_target: false,
                    target_session_id: None
                })
            }
        }),
    );

    recompute_target_and_binding(app, helper_state)
}

fn handle_session_state(
    app: &AppHandle,
    helper_state: &HelperStateHandle,
    connection_id: u64,
    payload: SessionStatePayload,
) -> Result<(), String> {
    let _update = helper_state
        .binding_update
        .lock()
        .map_err(|error| error.to_string())?;
    {
        let mut runtime = helper_state
            .runtime
            .lock()
            .map_err(|error| error.to_string())?;
        let session = runtime
            .sessions
            .get_mut(&connection_id)
            .ok_or_else(|| "Unknown helper connection".to_string())?;
        if !session.authorized {
            send_error(
                &session.sender,
                "pairing_required",
                "Pair with the local helper before sending session state.",
            );
            return Ok(());
        }

        session.route = normalize_route(payload.route.as_deref());
        session.base_url = normalize_base_url(payload.base_url.as_deref(), &session.origin);
        session.focused = payload.focused.unwrap_or(false);
        session.visible = payload.visible.unwrap_or(true);
        if session.focused {
            session.last_foreground_at = Some(now_rfc3339());
        } else if session.visible && session.last_foreground_at.is_none() {
            session.last_foreground_at = Some(now_rfc3339());
        }
    }

    recompute_target_and_binding(app, helper_state)
}

fn parse_ptt_config(value: Option<Value>) -> Result<DesktopPttBindingRequest, String> {
    let mut request: DesktopPttBindingRequest =
        serde_json::from_value(value.unwrap_or(Value::Null))
            .map_err(|_| "Invalid PTT configuration.".to_string())?;
    let mode = request.mode.as_deref().unwrap_or("live").trim().to_string();
    if !matches!(mode.as_str(), "live" | "vad" | "ptt") {
        return Err("Invalid PTT mode.".into());
    }
    request.mode = Some(mode.clone());
    request.key_code = if mode == "ptt" {
        let key = request
            .key_code
            .as_deref()
            .map(str::trim)
            .filter(|k| !k.is_empty());
        if let Some(key) = key {
            #[cfg(target_os = "macos")]
            let supported = macos_ptt::key_code(key).is_some();
            #[cfg(target_os = "windows")]
            let supported = windows_ptt::supports_key(key);
            #[cfg(not(any(target_os = "windows", target_os = "macos")))]
            let supported = false;
            if key.len() > 64 || !supported {
                return Err("Unsupported global PTT key.".into());
            }
        }
        key.map(str::to_string)
    } else {
        None
    };
    request.allow_pass_through = Some(true);
    request.platform_strategy = Some("auto".into());
    Ok(request)
}

fn handle_ptt_config(
    app: &AppHandle,
    helper_state: &HelperStateHandle,
    connection_id: u64,
    payload: DesktopPttBindingRequest,
) -> Result<(), String> {
    let _update = helper_state
        .binding_update
        .lock()
        .map_err(|error| error.to_string())?;
    {
        let mut runtime = helper_state
            .runtime
            .lock()
            .map_err(|error| error.to_string())?;
        let session = runtime
            .sessions
            .get_mut(&connection_id)
            .ok_or_else(|| "Unknown helper connection".to_string())?;
        if !session.authorized {
            send_error(
                &session.sender,
                "pairing_required",
                "Pair with the local helper before sending PTT config.",
            );
            return Ok(());
        }
        let changed = session.ptt_config != payload;
        if changed {
            session.rejected_binding_key = None;
            session.ptt_config = payload;
            runtime.next_binding_revision += 1;
            let revision = runtime.next_binding_revision;
            runtime
                .sessions
                .get_mut(&connection_id)
                .unwrap()
                .binding_revision = revision;
        }
        sync_binding_requests(&mut runtime);
    }
    recompute_target_and_binding(app, helper_state)
}

fn handle_disconnect(
    app: &AppHandle,
    helper_state: &HelperStateHandle,
    connection_id: u64,
) -> Result<(), String> {
    if let Ok(runtime) = helper_state.runtime.lock() {
        if let Some(session) = runtime.sessions.get(&connection_id) {
            let _ = session.sender.send(OutboundMessage::Close(None));
        }
    }
    cleanup_connection(app, helper_state, connection_id)
}

fn handle_pairing_approval(
    app: &AppHandle,
    helper_state: &HelperStateHandle,
    request_id: &str,
) -> Result<(), String> {
    let _update = helper_state
        .binding_update
        .lock()
        .map_err(|error| error.to_string())?;
    let (pairing_token, sender, connection_id) = {
        let mut runtime = helper_state
            .runtime
            .lock()
            .map_err(|error| error.to_string())?;
        release_transmission(&mut runtime);
        let index = runtime
            .pending_pairings
            .iter()
            .position(|request| request.request_id == request_id)
            .ok_or_else(|| "Pairing request not found".to_string())?;
        let request = runtime.pending_pairings.remove(index);
        let pairing_token = generate_pairing_token();
        let token_hash = hash_pairing_token(&pairing_token);
        if let Some(existing) = runtime
            .persisted
            .trusted_origins
            .iter_mut()
            .find(|candidate| candidate.origin == request.origin)
        {
            existing.token_hash = token_hash;
            existing.approved_key_code = None;
            existing.approved_at = now_rfc3339();
            existing.last_client_kind = request.client_kind.clone();
        } else {
            runtime.persisted.trusted_origins.push(TrustedOriginRecord {
                origin: request.origin.clone(),
                token_hash,
                approved_key_code: None,
                approved_at: now_rfc3339(),
                last_client_kind: request.client_kind.clone(),
            });
        }
        let session = runtime
            .sessions
            .get_mut(&request.connection_id)
            .ok_or_else(|| "Pairing session is no longer connected".to_string())?;
        session.authorized = true;
        session.last_foreground_at = Some(now_rfc3339());
        (pairing_token, session.sender.clone(), request.connection_id)
    };

    persist_runtime(app, helper_state)?;
    send_json(
        &sender,
        json!({
            "type": "paired",
            "payload": {
                "pairingToken": pairing_token,
                "protocolVersion": WS_PROTOCOL_VERSION,
                "bindingStatus": helper_state.ptt_service.current_status()
            }
        }),
    );

    let target_state = {
        let runtime = helper_state
            .runtime
            .lock()
            .map_err(|error| error.to_string())?;
        current_target_state(&runtime, connection_id)
    };

    send_json(
        &sender,
        json!({
            "type": "hello_ack",
            "payload": {
                "authorized": true,
                "helperVersion": APP_VERSION,
                "protocolVersion": WS_PROTOCOL_VERSION,
                "bindingStatus": helper_state.ptt_service.current_status(),
                "targetState": target_state
            }
        }),
    );

    append_helper_log(app, "site pairing approved");
    hide_settings_window(app);
    emit_state_changed(app, helper_state)?;
    recompute_target_and_binding(app, helper_state)
}

fn handle_pairing_rejection(
    app: &AppHandle,
    helper_state: &HelperStateHandle,
    request_id: &str,
) -> Result<(), String> {
    let _update = helper_state
        .binding_update
        .lock()
        .map_err(|error| error.to_string())?;
    let maybe_sender = {
        let mut runtime = helper_state
            .runtime
            .lock()
            .map_err(|error| error.to_string())?;
        let Some(index) = runtime
            .pending_pairings
            .iter()
            .position(|request| request.request_id == request_id)
        else {
            return Ok(());
        };
        let request = runtime.pending_pairings.remove(index);
        runtime
            .sessions
            .get(&request.connection_id)
            .map(|session| session.sender.clone())
    };

    if let Some(sender) = maybe_sender {
        send_error(
            &sender,
            "pairing_rejected",
            "The local helper rejected this pairing request.",
        );
    }

    append_helper_log(app, "site pairing rejected");
    emit_state_changed(app, helper_state)
}

fn handle_origin_revocation(
    app: &AppHandle,
    helper_state: &HelperStateHandle,
    origin: &str,
) -> Result<(), String> {
    let _update = helper_state
        .binding_update
        .lock()
        .map_err(|error| error.to_string())?;
    let normalized_origin = normalize_origin(origin)?;
    let senders = {
        let mut runtime = helper_state
            .runtime
            .lock()
            .map_err(|error| error.to_string())?;
        release_transmission(&mut runtime);
        revoke_origin_in_runtime(&mut runtime, &normalized_origin)
    };

    for sender in senders {
        send_error(
            &sender,
            "origin_revoked",
            "This Nebulynk origin was revoked from the local helper and must pair again.",
        );
    }

    let persisted = persist_runtime(app, helper_state);
    recompute_target_and_binding(app, helper_state)?;
    append_helper_log(app, "site pairing revoked");
    persisted
}

fn forward_ptt_event(helper_state: &HelperStateHandle, event: NativePttEvent) {
    if let Ok(mut runtime) = helper_state.runtime.lock() {
        route_ptt_event(&mut runtime, event);
    }
}

fn read_socket_path(request: &Request) -> bool {
    request.uri().path() == WS_PATH
}

async fn run_websocket_server(
    app: AppHandle,
    helper_state: Arc<HelperStateHandle>,
) -> Result<(), String> {
    let listener = TcpListener::bind((WS_HOST, WS_PORT))
        .await
        .map_err(|error| error.to_string())?;
    append_helper_log(
        &app,
        &format!(
            "websocket listener bound on ws://{}:{}{}",
            WS_HOST, WS_PORT, WS_PATH
        ),
    );

    loop {
        let (stream, address) = listener.accept().await.map_err(|error| error.to_string())?;
        let app_handle = app.clone();
        let helper_state_handle = helper_state.clone();

        tokio::spawn(async move {
            if !matches!(address.ip(), IpAddr::V4(ipv4) if ipv4.is_loopback())
                && !matches!(address.ip(), IpAddr::V6(ipv6) if ipv6.is_loopback())
            {
                return;
            }

            let valid_path = Arc::new(Mutex::new(true));
            let request_origin = Arc::new(Mutex::new(None::<Result<String, String>>));
            let callback_valid_path = valid_path.clone();
            let callback_request_origin = request_origin.clone();
            let callback = move |request: &Request, response: Response| {
                if let Ok(mut state) = callback_valid_path.lock() {
                    *state = read_socket_path(request);
                }
                if let Ok(mut state) = callback_request_origin.lock() {
                    *state = Some(normalize_request_origin_header(request));
                }
                Ok(response)
            };

            let mut websocket = match accept_hdr_async(stream, callback).await {
                Ok(socket) => socket,
                Err(_) => return,
            };

            if !valid_path.lock().map(|value| *value).unwrap_or(false) {
                let _ = websocket.close(None).await;
                return;
            }

            let websocket_origin = match request_origin.lock().ok().and_then(|value| value.clone())
            {
                Some(Ok(origin)) => origin,
                _ => {
                    let _ = websocket.close(None).await;
                    return;
                }
            };

            let (mut writer, mut reader) = websocket.split();
            let (sender, mut receiver) = unbounded_channel::<OutboundMessage>();
            let connection_id = match register_connection(&helper_state_handle, sender.clone()) {
                Ok(connection_id) => connection_id,
                Err(_) => return,
            };

            let write_task = tokio::spawn(async move {
                while let Some(message) = receiver.recv().await {
                    match message {
                        OutboundMessage::Json(value) => {
                            if writer.send(Message::Text(value.to_string())).await.is_err() {
                                break;
                            }
                        }
                        OutboundMessage::Close(payload) => {
                            if let Some(payload) = payload {
                                let _ = writer.send(Message::Text(payload.to_string())).await;
                            }
                            let _ = writer.close().await;
                            break;
                        }
                    }
                }
            });

            while let Some(frame) = reader.next().await {
                let Ok(frame) = frame else {
                    break;
                };

                match frame {
                    Message::Text(text) => {
                        let envelope = match parse_text_envelope(text.as_str()) {
                            Ok(envelope) => envelope,
                            Err((code, message)) => {
                                send_error(&sender, code, message);
                                continue;
                            }
                        };

                        let result = match envelope.message_type.as_str() {
                            "hello" => serde_json::from_value::<HelloPayload>(
                                envelope.payload.unwrap_or(Value::Null),
                            )
                            .map_err(|error| error.to_string())
                            .and_then(|payload| {
                                validate_hello_protocol(&payload)?;
                                let normalized_origin =
                                    normalize_hello_origin(&websocket_origin, &payload.origin)?;
                                handle_hello(
                                    &app_handle,
                                    &helper_state_handle,
                                    connection_id,
                                    normalized_origin,
                                    payload,
                                )
                            }),
                            "session_state" => serde_json::from_value::<SessionStatePayload>(
                                envelope.payload.unwrap_or(Value::Null),
                            )
                            .map_err(|error| error.to_string())
                            .and_then(|payload| {
                                handle_session_state(
                                    &app_handle,
                                    &helper_state_handle,
                                    connection_id,
                                    payload,
                                )
                            }),
                            "ptt_config" => {
                                parse_ptt_config(envelope.payload).and_then(|payload| {
                                    handle_ptt_config(
                                        &app_handle,
                                        &helper_state_handle,
                                        connection_id,
                                        payload,
                                    )
                                })
                            }
                            "ping" => Ok(()),
                            "disconnect" => {
                                handle_disconnect(&app_handle, &helper_state_handle, connection_id)
                            }
                            _ => {
                                send_error(
                                    &sender,
                                    "unknown_message_type",
                                    "The helper did not recognize this message.",
                                );
                                Ok(())
                            }
                        };

                        if let Err(error) = result {
                            send_error(&sender, "helper_error", &error);
                            if is_terminal_hello_error(&error) {
                                break;
                            }
                        }
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }

            let _ = cleanup_connection(&app_handle, &helper_state_handle, connection_id);
            drop(sender);
            let _ = write_task.await;
        });
    }
}

#[tauri::command]
fn helper_get_state_snapshot(
    helper_state: State<'_, Arc<HelperStateHandle>>,
) -> Result<HelperStateSnapshot, String> {
    let runtime = helper_state
        .runtime
        .lock()
        .map_err(|error| error.to_string())?;
    let mut snapshot = helper_snapshot(&runtime);
    snapshot.autostart_enabled = is_autostart_enabled().unwrap_or(false);
    Ok(snapshot)
}

fn input_monitoring_granted() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos_ptt::native::permission_granted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
fn helper_request_input_monitoring() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(macos_ptt::native::request_permission())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}

#[tauri::command]
async fn helper_approve_pairing(
    app: AppHandle,
    helper_state: State<'_, Arc<HelperStateHandle>>,
    request_id: String,
) -> Result<(), String> {
    let helper_state = helper_state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        handle_pairing_approval(&app, &helper_state, &request_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn helper_reject_pairing(
    app: AppHandle,
    helper_state: State<'_, Arc<HelperStateHandle>>,
    request_id: String,
) -> Result<(), String> {
    let helper_state = helper_state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        handle_pairing_rejection(&app, &helper_state, &request_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn helper_revoke_origin(
    app: AppHandle,
    helper_state: State<'_, Arc<HelperStateHandle>>,
    origin: String,
) -> Result<(), String> {
    let helper_state = helper_state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        handle_origin_revocation(&app, &helper_state, &origin)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn helper_approve_binding(
    app: AppHandle,
    helper_state: State<'_, Arc<HelperStateHandle>>,
    request_id: String,
) -> Result<(), String> {
    let helper_state = helper_state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _update = helper_state
            .binding_update
            .lock()
            .map_err(|e| e.to_string())?;
        {
            let mut runtime = helper_state.runtime.lock().map_err(|e| e.to_string())?;
            // Do not change the live grant until its durable replacement has succeeded.
            commit_binding_approval(&mut runtime, &request_id, |proposed| {
                save_persisted_state(&app, proposed)
            })?;
        }
        append_helper_log(&app, "key approval saved");
        recompute_target_and_binding(&app, &helper_state)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn helper_reject_binding(
    app: AppHandle,
    helper_state: State<'_, Arc<HelperStateHandle>>,
    request_id: String,
) -> Result<(), String> {
    let helper_state = helper_state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _update = helper_state
            .binding_update
            .lock()
            .map_err(|e| e.to_string())?;
        {
            let mut runtime = helper_state.runtime.lock().map_err(|e| e.to_string())?;
            let request = binding_request(&runtime, &request_id)?;
            for session in runtime
                .sessions
                .values_mut()
                .filter(|s| s.origin == request.origin)
            {
                if session_key(session) == Some(request.key_code.as_str()) {
                    session.rejected_binding_key = Some(request.key_code.clone());
                }
            }
            release_transmission(&mut runtime);
        }
        append_helper_log(&app, "key request rejected");
        recompute_target_and_binding(&app, &helper_state)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn helper_revoke_binding(
    app: AppHandle,
    helper_state: State<'_, Arc<HelperStateHandle>>,
    origin: String,
) -> Result<(), String> {
    let helper_state = helper_state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _update = helper_state
            .binding_update
            .lock()
            .map_err(|e| e.to_string())?;
        let origin = normalize_origin(&origin)?;
        {
            let mut runtime = helper_state.runtime.lock().map_err(|e| e.to_string())?;
            release_transmission(&mut runtime);
            let record = runtime
                .persisted
                .trusted_origins
                .iter_mut()
                .find(|r| r.origin == origin)
                .ok_or_else(|| "Unknown paired site.".to_string())?;
            record.approved_key_code = None;
        }
        let persisted = persist_runtime(&app, &helper_state);
        recompute_target_and_binding(&app, &helper_state)?;
        append_helper_log(&app, "key approval revoked");
        persisted
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn helper_set_paused(
    app: AppHandle,
    helper_state: State<'_, Arc<HelperStateHandle>>,
    paused: bool,
) -> Result<(), String> {
    let helper_state = helper_state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _update = helper_state
            .binding_update
            .lock()
            .map_err(|error| error.to_string())?;
        {
            let mut runtime = helper_state
                .runtime
                .lock()
                .map_err(|error| error.to_string())?;
            runtime.persisted.paused = paused;
            if paused {
                release_transmission(&mut runtime);
            }
        }
        let persisted = persist_runtime(&app, &helper_state);
        recompute_target_and_binding(&app, &helper_state)?;
        persisted
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn helper_set_autostart(
    app: AppHandle,
    helper_state: State<'_, Arc<HelperStateHandle>>,
    enabled: bool,
) -> Result<(), String> {
    let helper_state = helper_state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _update = helper_state
            .binding_update
            .lock()
            .map_err(|error| error.to_string())?;
        set_autostart_enabled(&app, enabled)?;
        {
            let mut runtime = helper_state
                .runtime
                .lock()
                .map_err(|error| error.to_string())?;
            runtime.persisted.autostart_enabled = enabled;
        }
        persist_runtime(&app, &helper_state)?;
        emit_state_changed(&app, &helper_state)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn helper_show_settings(app: AppHandle) -> Result<(), String> {
    show_settings_window(&app)
}

fn handle_menu_event(app: &AppHandle, helper_state: &Arc<HelperStateHandle>, menu_id: &str) {
    match menu_id {
        MENU_STATUS_ID | MENU_TRUSTED_SITES_ID | MENU_OPEN_SETTINGS_ID => {
            let _ = show_settings_window(app);
        }
        MENU_TOGGLE_PAUSE_ID => {
            let Ok(_update) = helper_state.binding_update.lock() else {
                return;
            };
            let paused = match helper_state.runtime.lock() {
                Ok(runtime) => !runtime.persisted.paused,
                Err(_) => return,
            };
            if let Ok(mut runtime) = helper_state.runtime.lock() {
                runtime.persisted.paused = paused;
                if paused {
                    release_transmission(&mut runtime);
                }
            }
            let _ = persist_runtime(app, helper_state);
            let _ = recompute_target_and_binding(app, helper_state);
        }
        MENU_QUIT_ID => {
            let Ok(_update) = helper_state.binding_update.lock() else {
                return;
            };
            helper_state.ptt_service.shutdown();
            if let Ok(runtime) = helper_state.runtime.lock() {
                for session in runtime
                    .sessions
                    .values()
                    .filter(|session| session.authorized)
                {
                    send_json(&session.sender, json!({ "type": "ptt_up", "payload": {} }));
                }
            }
            app.exit(0);
        }
        _ => {}
    }
}

fn read_initial_autostart() -> bool {
    is_autostart_enabled().unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn set_autostart_enabled(_app: &AppHandle, enabled: bool) -> Result<(), String> {
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyW, RegDeleteValueW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
        REG_SZ,
    };

    let subkey: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Run"
        .encode_utf16()
        .chain([0])
        .collect();
    let value_name: Vec<u16> = AUTOSTART_REGISTRY_NAME.encode_utf16().chain([0]).collect();
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let executable_value = format!("\"{}\"", executable.display());
    let executable_utf16: Vec<u16> = executable_value.encode_utf16().chain([0]).collect();

    let mut key: HKEY = std::ptr::null_mut();
    let create_status = unsafe { RegCreateKeyW(HKEY_CURRENT_USER, subkey.as_ptr(), &mut key) };
    if create_status != 0 {
        return Err(std::io::Error::from_raw_os_error(create_status as i32).to_string());
    }

    let status = if enabled {
        unsafe {
            RegSetValueExW(
                key,
                value_name.as_ptr(),
                0,
                REG_SZ,
                executable_utf16.as_ptr() as *const u8,
                (executable_utf16.len() * 2) as u32,
            )
        }
    } else {
        unsafe { RegDeleteValueW(key, value_name.as_ptr()) }
    };
    unsafe {
        RegCloseKey(key);
    }

    if status != 0 && !(status == 2 && !enabled) {
        return Err(std::io::Error::from_raw_os_error(status as i32).to_string());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn set_autostart_enabled(_app: &AppHandle, enabled: bool) -> Result<(), String> {
    autostart::set_enabled(enabled)
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn set_autostart_enabled(_app: &AppHandle, _enabled: bool) -> Result<(), String> {
    Err("Autostart is not supported on this platform.".into())
}

#[cfg(target_os = "windows")]
fn is_autostart_enabled() -> Result<bool, String> {
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE,
    };

    let subkey: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Run"
        .encode_utf16()
        .chain([0])
        .collect();
    let value_name: Vec<u16> = AUTOSTART_REGISTRY_NAME.encode_utf16().chain([0]).collect();
    let mut key: HKEY = std::ptr::null_mut();
    let open_status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            0,
            KEY_QUERY_VALUE,
            &mut key,
        )
    };
    if open_status != 0 {
        return Ok(false);
    }

    let mut data_len = 0_u32;
    let query_status = unsafe {
        RegQueryValueExW(
            key,
            value_name.as_ptr(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut data_len,
        )
    };
    unsafe {
        RegCloseKey(key);
    }

    if query_status == 0 {
        Ok(true)
    } else if query_status == 2 {
        Ok(false)
    } else {
        Err(std::io::Error::from_raw_os_error(query_status as i32).to_string())
    }
}

#[cfg(target_os = "macos")]
fn is_autostart_enabled() -> Result<bool, String> {
    autostart::is_enabled()
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn is_autostart_enabled() -> Result<bool, String> {
    Ok(false)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = show_settings_window(app);
        }))
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let app_handle = app.handle().clone();
            if let Ok(directory) = app_handle.path().app_log_dir() {
                helper_log::initialize(directory);
            }
            append_helper_log(
                &app_handle,
                &format!("helper starting version={APP_VERSION}"),
            );
            let mut persisted = load_persisted_state(&app_handle)?;
            persisted.autostart_enabled = read_initial_autostart();

            let helper_state = Arc::new_cyclic(|weak_state| HelperStateHandle {
                app_handle: app_handle.clone(),
                binding_update: Mutex::new(()),
                runtime: Mutex::new(RuntimeState::from_persisted(
                    persisted,
                    DesktopPttBindingStatus::default(),
                )),
                ptt_service: PttService::new({
                    let weak_state = weak_state.clone();
                    Arc::new(move |event| {
                        if let Some(helper_state) = weak_state.upgrade() {
                            forward_ptt_event(&helper_state, event);
                        }
                    })
                }),
            });

            app.manage(helper_state.clone());

            // Native capture can lose/recover permissions without a new browser binding.
            let weak_state = Arc::downgrade(&helper_state);
            thread::spawn(move || loop {
                thread::sleep(std::time::Duration::from_millis(250));
                let Some(state) = weak_state.upgrade() else {
                    break;
                };
                let Ok(_update) = state.binding_update.lock() else {
                    break;
                };
                let native = state.ptt_service.current_status();
                let changed = if let Ok(mut runtime) = state.runtime.lock() {
                    let status = effective_status(&runtime, native);
                    if status != runtime.binding_status {
                        if !status.is_global {
                            release_transmission(&mut runtime);
                        }
                        runtime.binding_status = status;
                        true
                    } else {
                        false
                    }
                } else {
                    false
                };
                if changed {
                    broadcast_binding_status(&state);
                    let _ = emit_state_changed(&state.app_handle, &state);
                }
            });

            let status = MenuItemBuilder::with_id(MENU_STATUS_ID, "Status: Loading").build(app)?;
            let trusted =
                MenuItemBuilder::with_id(MENU_TRUSTED_SITES_ID, "Trusted Sites").build(app)?;
            let open_settings =
                MenuItemBuilder::with_id(MENU_OPEN_SETTINGS_ID, "Open Settings").build(app)?;
            let pause = MenuItemBuilder::with_id(MENU_TOGGLE_PAUSE_ID, "Pause PTT").build(app)?;
            let quit = MenuItemBuilder::with_id(MENU_QUIT_ID, "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&status)
                .item(&trusted)
                .item(&open_settings)
                .item(&pause)
                .separator()
                .item(&quit)
                .build()?;

            app.manage(TrayMenuHandle {
                status: status.clone(),
                trusted_sites: trusted.clone(),
                toggle_pause: pause.clone(),
            });

            let tray_icon = app
                .default_window_icon()
                .cloned()
                .ok_or_else(|| "Helper tray icon is missing from the Tauri bundle.".to_string())?;
            TrayIconBuilder::with_id(TRAY_ID)
                .icon(tray_icon)
                .tooltip(if cfg!(target_os = "macos") {
                    "Nebulynk PTT Helper (Beta)"
                } else {
                    "Nebulynk PTT Helper"
                })
                .menu(&menu)
                .show_menu_on_left_click(false)
                .build(app)?;

            emit_state_changed(&app_handle, &helper_state)?;

            let menu_state = helper_state.clone();
            app.on_menu_event(move |app_handle, event| {
                // Menu callbacks run on the UI thread. Binding operations can wait
                // for native workers, whose notifications need that UI thread.
                let app = app_handle.clone();
                let state = menu_state.clone();
                let id = event.id().as_ref().to_string();
                tauri::async_runtime::spawn_blocking(move || handle_menu_event(&app, &state, &id));
            });

            app.on_tray_icon_event(|app_handle, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    let _ = show_settings_window(app_handle);
                }
            });

            let websocket_state = helper_state.clone();
            let websocket_app_handle = app_handle.clone();
            thread::spawn(move || {
                let runtime = match tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .build()
                {
                    Ok(runtime) => runtime,
                    Err(error) => {
                        append_helper_log(
                            &websocket_app_handle,
                            &format!("failed to create websocket runtime: {}", error),
                        );
                        return;
                    }
                };

                let result = runtime.block_on(run_websocket_server(
                    websocket_app_handle.clone(),
                    websocket_state,
                ));
                if let Err(error) = result {
                    append_helper_log(
                        &websocket_app_handle,
                        &format!("websocket server stopped: {}", error),
                    );
                }
            });

            #[cfg(target_os = "macos")]
            if !input_monitoring_granted() {
                show_settings_window(&app_handle)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            helper_get_state_snapshot,
            helper_approve_pairing,
            helper_reject_pairing,
            helper_revoke_origin,
            helper_approve_binding,
            helper_reject_binding,
            helper_revoke_binding,
            helper_set_paused,
            helper_set_autostart,
            helper_show_settings,
            helper_request_input_monitoring
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nebulynk PTT Helper");
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::{
        choose_target_connection, current_target_state, default_ptt_request,
        effective_binding_request, hash_pairing_token, helper_snapshot, is_pairing_token_valid,
        normalize_base_url, normalize_hello_origin, normalize_origin,
        normalize_request_origin_header, parse_text_envelope, remove_duplicate_sessions,
        revoke_origin_in_runtime, validate_hello_protocol, HelloPayload, OutboundMessage,
        PendingPairingRequest, RuntimeState, SessionState, TrustedOriginRecord,
        MAX_WS_TEXT_FRAME_BYTES,
    };
    use crate::ptt::{DesktopPttBindingRequest, DesktopPttBindingStatus};
    use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver};
    use tokio_tungstenite::tungstenite::handshake::server::Request;

    fn session(connection_id: u64, origin: &str, session_id: &str) -> SessionState {
        session_with_receiver(connection_id, origin, session_id).0
    }

    fn session_with_receiver(
        connection_id: u64,
        origin: &str,
        session_id: &str,
    ) -> (SessionState, UnboundedReceiver<OutboundMessage>) {
        let (sender, _receiver) = unbounded_channel();
        (
            SessionState {
                connection_id,
                origin: origin.to_string(),
                session_id: session_id.to_string(),
                client_kind: "browser".to_string(),
                route: "/channels".to_string(),
                base_url: origin.to_string(),
                focused: false,
                visible: true,
                authorized: true,
                last_foreground_at: None,
                ptt_config: default_ptt_request(),
                rejected_binding_key: None,
                binding_revision: 0,
                sender,
            },
            _receiver,
        )
    }

    fn hello(origin: &str, protocol_version: Option<&str>) -> HelloPayload {
        HelloPayload {
            protocol_version: protocol_version.map(str::to_string),
            origin: origin.to_string(),
            session_id: "session-a".to_string(),
            client_kind: Some("browser".to_string()),
            pairing_token: None,
        }
    }

    #[test]
    fn chooses_last_focused_target_first() {
        let mut runtime =
            RuntimeState::from_persisted(Default::default(), DesktopPttBindingStatus::default());
        let mut first = session(1, "https://one.example", "session-a");
        first.last_foreground_at = Some("2026-06-02T10:00:00Z".to_string());
        let mut second = session(2, "https://two.example", "session-b");
        second.focused = true;
        second.last_foreground_at = Some("2026-06-02T10:01:00Z".to_string());
        runtime.sessions.insert(1, first);
        runtime.sessions.insert(2, second);

        assert_eq!(choose_target_connection(&runtime), Some(2));
    }

    #[test]
    fn falls_back_to_last_foreground_session() {
        let mut runtime =
            RuntimeState::from_persisted(Default::default(), DesktopPttBindingStatus::default());
        let mut first = session(1, "https://one.example", "session-a");
        first.last_foreground_at = Some("2026-06-02T10:00:00Z".to_string());
        let mut second = session(2, "https://two.example", "session-b");
        second.last_foreground_at = Some("2026-06-02T10:01:00Z".to_string());
        runtime.sessions.insert(1, first);
        runtime.sessions.insert(2, second);

        assert_eq!(choose_target_connection(&runtime), Some(2));
    }

    #[test]
    fn derives_effective_binding_from_target_session() {
        let mut runtime =
            RuntimeState::from_persisted(Default::default(), DesktopPttBindingStatus::default());
        let mut target = session(1, "https://one.example", "session-a");
        target.ptt_config = DesktopPttBindingRequest {
            key_code: Some("KeyV".to_string()),
            mode: Some("ptt".to_string()),
            allow_pass_through: Some(true),
            platform_strategy: Some("auto".to_string()),
        };
        runtime.target_connection_id = Some(1);
        runtime.sessions.insert(1, target);

        runtime
            .persisted
            .trusted_origins
            .push(trust("https://one.example", Some("KeyV")));
        let binding = effective_binding_request(&runtime);
        assert_eq!(binding.mode.as_deref(), Some("ptt"));
        assert_eq!(binding.key_code.as_deref(), Some("KeyV"));
    }

    #[test]
    fn paused_helper_clears_the_effective_binding() {
        let mut runtime =
            RuntimeState::from_persisted(Default::default(), DesktopPttBindingStatus::default());
        runtime.persisted.paused = true;
        runtime.target_connection_id = Some(1);
        runtime
            .sessions
            .insert(1, session(1, "https://one.example", "session-a"));

        let binding = effective_binding_request(&runtime);
        assert_eq!(binding.mode.as_deref(), Some("live"));
        assert_eq!(binding.key_code, None);
    }

    #[test]
    fn normalizes_http_and_https_origins_only() {
        assert_eq!(
            normalize_origin("https://chat.example.com/channels").unwrap(),
            "https://chat.example.com"
        );
        assert!(normalize_origin("file:///tmp/index.html").is_err());
    }

    #[test]
    fn normalizes_websocket_origin_header() {
        let request = Request::builder()
            .uri("/ws")
            .header("Origin", "https://chat.example.com/channels")
            .body(())
            .unwrap();

        assert_eq!(
            normalize_request_origin_header(&request).unwrap(),
            "https://chat.example.com"
        );

        let missing_origin = Request::builder().uri("/ws").body(()).unwrap();
        assert!(normalize_request_origin_header(&missing_origin).is_err());
    }

    #[test]
    fn hello_requires_matching_origin_and_protocol() {
        let payload = hello("https://chat.example.com", Some("2"));
        assert!(validate_hello_protocol(&payload).is_ok());
        assert_eq!(
            normalize_hello_origin("https://chat.example.com", &payload.origin).unwrap(),
            "https://chat.example.com"
        );

        let spoofed = hello("https://evil.example.com", Some("2"));
        assert!(normalize_hello_origin("https://chat.example.com", &spoofed.origin).is_err());
        assert!(
            normalize_hello_origin("https://chat.example.com", "file:///tmp/helper.html").is_err()
        );
        assert!(validate_hello_protocol(&hello("https://chat.example.com", Some("1"))).is_err());
        assert!(validate_hello_protocol(&hello("https://chat.example.com", None)).is_err());
    }

    #[test]
    fn text_envelope_parser_rejects_malformed_and_oversized_frames() {
        assert_eq!(
            parse_text_envelope("{not json").unwrap_err().0,
            "invalid_json"
        );
        assert_eq!(
            parse_text_envelope(&"x".repeat(MAX_WS_TEXT_FRAME_BYTES + 1))
                .unwrap_err()
                .0,
            "message_too_large"
        );

        let unknown = parse_text_envelope(r#"{"type":"mystery","payload":{}}"#).unwrap();
        assert_eq!(unknown.message_type, "mystery");
    }

    #[test]
    fn base_url_stays_origin_scoped() {
        assert_eq!(
            normalize_base_url(
                Some("https://chat.example.com/channels/general"),
                "https://chat.example.com"
            ),
            "https://chat.example.com"
        );
        assert_eq!(
            normalize_base_url(Some("https://evil.example.com"), "https://chat.example.com"),
            "https://chat.example.com"
        );
    }

    #[test]
    fn pairing_hashes_are_stable() {
        let first = hash_pairing_token("token-123");
        let second = hash_pairing_token("token-123");
        let third = hash_pairing_token("token-456");
        assert_eq!(first, second);
        assert_ne!(first, third);
    }

    #[test]
    fn pairing_tokens_are_bound_to_the_exact_origin() {
        let mut runtime =
            RuntimeState::from_persisted(Default::default(), DesktopPttBindingStatus::default());
        runtime.persisted.trusted_origins = vec![TrustedOriginRecord {
            origin: "https://chat.example.com".to_string(),
            approved_key_code: None,
            token_hash: hash_pairing_token("token-123"),
            approved_at: "2026-06-02T10:00:00Z".to_string(),
            last_client_kind: "browser".to_string(),
        }];

        assert!(is_pairing_token_valid(
            &runtime,
            "https://chat.example.com",
            "token-123"
        ));
        assert!(!is_pairing_token_valid(
            &runtime,
            "https://other.example.com",
            "token-123"
        ));
        assert!(!is_pairing_token_valid(
            &runtime,
            "https://chat.example.com",
            "token-456"
        ));
    }

    #[test]
    fn duplicate_sessions_for_the_same_browser_window_are_replaced() {
        let mut runtime =
            RuntimeState::from_persisted(Default::default(), DesktopPttBindingStatus::default());
        runtime
            .sessions
            .insert(1, session(1, "https://chat.example.com", "session-a"));
        runtime
            .sessions
            .insert(2, session(2, "https://chat.example.com", "session-a"));
        runtime
            .sessions
            .insert(3, session(3, "https://chat.example.com", "session-b"));

        let duplicate_senders =
            remove_duplicate_sessions(&mut runtime, 2, "https://chat.example.com", "session-a");

        assert_eq!(duplicate_senders.len(), 1);
        assert!(!runtime.sessions.contains_key(&1));
        assert!(runtime.sessions.contains_key(&2));
        assert!(runtime.sessions.contains_key(&3));
    }

    #[test]
    fn revocation_removes_trust_pending_requests_and_active_authorization() {
        let mut runtime =
            RuntimeState::from_persisted(Default::default(), DesktopPttBindingStatus::default());
        runtime.persisted.trusted_origins = vec![
            TrustedOriginRecord {
                origin: "https://chat.example.com".to_string(),
                approved_key_code: None,
                token_hash: hash_pairing_token("token-123"),
                approved_at: "2026-06-02T10:00:00Z".to_string(),
                last_client_kind: "browser".to_string(),
            },
            TrustedOriginRecord {
                origin: "https://other.example.com".to_string(),
                approved_key_code: None,
                token_hash: hash_pairing_token("token-456"),
                approved_at: "2026-06-02T10:00:00Z".to_string(),
                last_client_kind: "browser".to_string(),
            },
        ];
        runtime.pending_pairings.push(PendingPairingRequest {
            request_id: "pair-1".to_string(),
            connection_id: 1,
            origin: "https://chat.example.com".to_string(),
            client_kind: "browser".to_string(),
            created_at: "2026-06-02T10:00:00Z".to_string(),
        });
        runtime
            .sessions
            .insert(1, session(1, "https://chat.example.com", "session-a"));
        runtime
            .sessions
            .insert(2, session(2, "https://other.example.com", "session-b"));

        let revoked_senders = revoke_origin_in_runtime(&mut runtime, "https://chat.example.com");

        assert_eq!(revoked_senders.len(), 1);
        assert_eq!(runtime.persisted.trusted_origins.len(), 1);
        assert_eq!(
            runtime.persisted.trusted_origins[0].origin,
            "https://other.example.com"
        );
        assert!(runtime.pending_pairings.is_empty());
        assert!(!runtime.sessions.get(&1).unwrap().authorized);
        assert!(runtime.sessions.get(&2).unwrap().authorized);
    }

    #[test]
    fn snapshot_marks_target_sessions() {
        let mut runtime =
            RuntimeState::from_persisted(Default::default(), DesktopPttBindingStatus::default());
        runtime.target_connection_id = Some(1);
        runtime
            .sessions
            .insert(1, session(1, "https://one.example", "session-a"));
        runtime.persisted.trusted_origins = vec![TrustedOriginRecord {
            origin: "https://one.example".to_string(),
            approved_key_code: None,
            token_hash: "hash".to_string(),
            approved_at: "2026-06-02T10:00:00Z".to_string(),
            last_client_kind: "browser".to_string(),
        }];

        let snapshot = helper_snapshot(&runtime);
        assert_eq!(
            snapshot.current_target_session_id.as_deref(),
            Some("session-a")
        );
        assert_eq!(snapshot.active_sessions.len(), 1);
        assert!(snapshot.active_sessions[0].is_target);
        let target_state = current_target_state(&runtime, 1);
        assert!(target_state.is_target);
    }

    fn trust(origin: &str, key: Option<&str>) -> TrustedOriginRecord {
        TrustedOriginRecord {
            origin: origin.into(),
            token_hash: hash_pairing_token("token"),
            approved_at: "2026-11-11T00:00:00Z".into(),
            last_client_kind: "browser".into(),
            approved_key_code: key.map(str::to_string),
        }
    }

    fn configured_runtime(
        approved: Option<&str>,
    ) -> (RuntimeState, UnboundedReceiver<OutboundMessage>) {
        let mut runtime =
            RuntimeState::from_persisted(Default::default(), DesktopPttBindingStatus::default());
        runtime
            .persisted
            .trusted_origins
            .push(trust("https://one.example", approved));
        let (mut active, receiver) = session_with_receiver(1, "https://one.example", "one");
        active.ptt_config = DesktopPttBindingRequest {
            mode: Some("ptt".into()),
            key_code: Some("KeyV".into()),
            allow_pass_through: Some(true),
            platform_strategy: Some("auto".into()),
        };
        runtime.sessions.insert(1, active);
        runtime.target_connection_id = Some(1);
        runtime.binding_target = Some(1);
        runtime.binding_generation = 7;
        runtime.active_binding_request = runtime.sessions[&1].ptt_config.clone();
        runtime.binding_status.is_global = true;
        sync_binding_requests(&mut runtime);
        (runtime, receiver)
    }

    fn change_key(runtime: &mut RuntimeState, id: u64, key: &str) {
        runtime.next_binding_revision += 1;
        let session = runtime.sessions.get_mut(&id).unwrap();
        session.ptt_config.key_code = Some(key.into());
        session.binding_revision = runtime.next_binding_revision;
        session.rejected_binding_key = None;
        sync_binding_requests(runtime);
    }

    fn next_type(receiver: &mut UnboundedReceiver<OutboundMessage>) -> String {
        match receiver.try_recv().unwrap() {
            OutboundMessage::Json(value) => value["type"].as_str().unwrap().into(),
            _ => panic!("Expected PTT event"),
        }
    }

    #[test]
    fn legacy_pairings_migrate_without_implicit_key_permission() {
        let persisted: PersistedHelperState = serde_json::from_str(r#"{"trustedOrigins":[{"origin":"https://one.example","tokenHash":"hash","approvedAt":"then","lastClientKind":"browser"}]}"#).unwrap();
        assert_eq!(persisted.trusted_origins[0].approved_key_code, None);
        let (runtime, _) = configured_runtime(None);
        assert_eq!(effective_binding_request(&runtime), default_ptt_request());
        assert!(!effective_status(&runtime, runtime.binding_status.clone()).is_global);
    }

    #[test]
    fn identical_heartbeats_keep_one_stable_request_and_rejection_is_connection_local() {
        let (mut runtime, _) = configured_runtime(None);
        let request = runtime.binding_requests[0].request_id.clone();
        for _ in 0..100 {
            sync_binding_requests(&mut runtime);
        }
        assert_eq!(runtime.binding_requests.len(), 1);
        assert_eq!(runtime.binding_requests[0].request_id, request);
        runtime.sessions.get_mut(&1).unwrap().rejected_binding_key = Some("KeyV".into());
        sync_binding_requests(&mut runtime);
        assert!(runtime.binding_requests.is_empty());
        assert_eq!(
            binding_block_reason(&runtime, &runtime.sessions[&1]),
            Some("binding-rejected")
        );
        let mut replacement = session(2, "https://one.example", "new");
        replacement.ptt_config = runtime.sessions[&1].ptt_config.clone();
        runtime.sessions.remove(&1);
        runtime.sessions.insert(2, replacement);
        sync_binding_requests(&mut runtime);
        assert_eq!(runtime.binding_requests.len(), 1);
        assert_ne!(runtime.binding_requests[0].request_id, request);
    }

    #[test]
    fn rotating_keys_invalidates_all_old_confirmations_and_never_emits_down() {
        let (mut runtime, mut receiver) = configured_runtime(None);
        let mut expired = Vec::new();
        for key in ["KeyA", "KeyB", "KeyC", "KeyV", "KeyA", "KeyV"] {
            expired.push(runtime.binding_requests[0].request_id.clone());
            change_key(&mut runtime, 1, key);
            assert_eq!(runtime.binding_requests.len(), 1);
            route_ptt_event(
                &mut runtime,
                NativePttEvent {
                    action: PttEvent::Down,
                    generation: 7,
                },
            );
        }
        for request in expired {
            assert!(proposed_binding_approval(&runtime, &request).is_err());
        }
        assert!(receiver.try_recv().is_err());
    }

    #[test]
    fn saving_is_required_before_grant_changes_and_only_one_key_survives_restart() {
        let (mut runtime, _) = configured_runtime(Some("KeyA"));
        let request = runtime.binding_requests[0].request_id.clone();
        assert!(
            commit_binding_approval(&mut runtime, &request, |_| Err("disk full".into())).is_err()
        );
        assert_eq!(
            runtime.persisted.trusted_origins[0]
                .approved_key_code
                .as_deref(),
            Some("KeyA")
        );
        assert_eq!(effective_binding_request(&runtime), default_ptt_request());
        let mut saved = String::new();
        commit_binding_approval(&mut runtime, &request, |proposed| {
            saved = serde_json::to_string(proposed).unwrap();
            Ok(())
        })
        .unwrap();
        assert_eq!(
            effective_binding_request(&runtime).key_code.as_deref(),
            Some("KeyV")
        );
        let restored: PersistedHelperState = serde_json::from_str(&saved).unwrap();
        assert_eq!(
            restored.trusted_origins[0].approved_key_code.as_deref(),
            Some("KeyV")
        );
        change_key(&mut runtime, 1, "KeyA");
        assert_eq!(effective_binding_request(&runtime), default_ptt_request());
    }

    #[test]
    fn another_origin_and_a_second_session_cannot_borrow_key_permissions() {
        let (mut runtime, mut receiver) = configured_runtime(Some("KeyV"));
        let (mut second, mut second_receiver) =
            session_with_receiver(2, "https://other.example", "other");
        second.ptt_config = runtime.sessions[&1].ptt_config.clone();
        runtime
            .persisted
            .trusted_origins
            .push(trust("https://other.example", None));
        runtime.sessions.insert(2, second);
        runtime.target_connection_id = Some(2);
        runtime.binding_target = Some(2);
        sync_binding_requests(&mut runtime);
        route_ptt_event(
            &mut runtime,
            NativePttEvent {
                action: PttEvent::Down,
                generation: 7,
            },
        );
        assert!(receiver.try_recv().is_err());
        assert!(second_receiver.try_recv().is_err());
        assert_eq!(runtime.binding_requests[0].origin, "https://other.example");
    }

    #[test]
    fn old_generations_and_duplicate_events_cannot_activate_or_release_a_new_hold() {
        let (mut runtime, mut receiver) = configured_runtime(Some("KeyV"));
        route_ptt_event(
            &mut runtime,
            NativePttEvent {
                action: PttEvent::Down,
                generation: 6,
            },
        );
        assert!(receiver.try_recv().is_err());
        for _ in 0..2 {
            route_ptt_event(
                &mut runtime,
                NativePttEvent {
                    action: PttEvent::Down,
                    generation: 7,
                },
            );
        }
        assert_eq!(next_type(&mut receiver), "ptt_down");
        assert!(receiver.try_recv().is_err());
        route_ptt_event(
            &mut runtime,
            NativePttEvent {
                action: PttEvent::Up,
                generation: 6,
            },
        );
        assert!(receiver.try_recv().is_err());
        assert!(runtime.transmitting.is_some());
        route_ptt_event(
            &mut runtime,
            NativePttEvent {
                action: PttEvent::Up,
                generation: 7,
            },
        );
        assert_eq!(next_type(&mut receiver), "ptt_up");
        assert!(runtime.transmitting.is_none());
    }

    #[test]
    fn every_event_rechecks_pause_pairing_target_and_grant() {
        for guard in 0..5 {
            let (mut runtime, mut receiver) = configured_runtime(Some("KeyV"));
            match guard {
                0 => runtime.persisted.paused = true,
                1 => runtime.sessions.get_mut(&1).unwrap().authorized = false,
                2 => runtime.persisted.trusted_origins[0].approved_key_code = None,
                3 => runtime.target_connection_id = None,
                _ => {
                    change_key(&mut runtime, 1, "KeyB");
                }
            }
            route_ptt_event(
                &mut runtime,
                NativePttEvent {
                    action: PttEvent::Down,
                    generation: 7,
                },
            );
            assert!(receiver.try_recv().is_err());
        }
    }

    #[test]
    fn release_cleanup_and_native_status_refresh_preserve_the_approval_gate() {
        let (mut runtime, mut receiver) = configured_runtime(Some("KeyV"));
        route_ptt_event(
            &mut runtime,
            NativePttEvent {
                action: PttEvent::Down,
                generation: 7,
            },
        );
        assert_eq!(next_type(&mut receiver), "ptt_down");
        change_key(&mut runtime, 1, "KeyB");
        let status = effective_status(&runtime, runtime.binding_status.clone());
        assert_eq!(status.reason.as_deref(), Some("binding-approval-required"));
        assert!(!status.is_global);
        release_transmission(&mut runtime);
        assert_eq!(next_type(&mut receiver), "ptt_up");
        assert!(runtime.transmitting.is_none());
    }

    #[test]
    fn config_normalization_rejects_arbitrary_keys_and_never_enables_suppression() {
        let request = parse_ptt_config(Some(json!({"mode":"ptt","keyCode":"KeyV","allowPassThrough":false,"platformStrategy":"hook"}))).unwrap();
        assert_eq!(request.allow_pass_through, Some(true));
        assert_eq!(request.platform_strategy.as_deref(), Some("auto"));
        assert!(parse_ptt_config(Some(
            json!({"mode":"ptt","keyCode":"arbitrary client payload"})
        ))
        .is_err());
        assert!(parse_ptt_config(Some(json!({"mode":"unknown"}))).is_err());
    }
}
