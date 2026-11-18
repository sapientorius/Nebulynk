//! Bounded loopback WebSocket transport, independent of Tauri and native capture.
use crate::pairing::{Deadline, Moment, TokenBucket};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, Weak};
use std::time::{Duration, Instant};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, watch, OwnedSemaphorePermit, Semaphore};
use tokio_tungstenite::accept_hdr_async_with_config;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::Message;
use url::Url;

pub const MAX_WS_TEXT_FRAME_BYTES: usize = 64 * 1024;
const INITIAL_TIMEOUT: Duration = Duration::from_secs(5);
const WRITE_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_UNAUTHORIZED: usize = 16;
const MAX_AUTHORIZED: usize = 16;
const MAX_AUTHORIZED_PER_ORIGIN: usize = 8;
const QUEUE_SIZE: usize = 64;

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Envelope {
    #[serde(rename = "type")]
    pub message_type: String,
    pub payload: Option<Value>,
}

pub fn parse_text_envelope(text: &str) -> Result<Envelope, (&'static str, &'static str)> {
    if text.len() > MAX_WS_TEXT_FRAME_BYTES {
        return Err(("message_too_large", "The helper message is too large."));
    }
    serde_json::from_str(text)
        .map_err(|_| ("invalid_json", "The helper only accepts JSON messages."))
}

pub fn normalize_origin(origin: &str) -> Result<String, String> {
    if origin.len() > 2048 {
        return Err("Invalid origin.".into());
    }
    let parsed = Url::parse(origin.trim()).map_err(|_| "Invalid origin.".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Only http and https origins can pair with the local helper.".into());
    }
    Ok(parsed.origin().ascii_serialization())
}

pub fn normalize_request_origin_header(request: &Request) -> Result<String, String> {
    let origin = request
        .headers()
        .get("origin")
        .ok_or("WebSocket Origin header is required for helper pairing.")?
        .to_str()
        .map_err(|_| "WebSocket Origin header must be valid ASCII.")?;
    normalize_origin(origin)
}

pub fn normalize_hello_origin(
    request_origin: &str,
    payload_origin: &str,
) -> Result<String, String> {
    let normalized = normalize_origin(payload_origin)?;
    if normalized != request_origin {
        return Err("WebSocket Origin header must match the hello origin.".into());
    }
    Ok(normalized)
}

pub fn error_payload(code: &str, message: &str) -> Value {
    json!({"type":"error","payload":{"code":code,"message":message}})
}

#[derive(Clone)]
pub enum OutboundMessage {
    Json(Value),
    Close(Option<Value>),
}

#[derive(Default)]
struct AuthorizedCounts {
    total: usize,
    origins: HashMap<String, usize>,
}

struct HubInner {
    unauthorized: Arc<Semaphore>,
    authorized: Mutex<AuthorizedCounts>,
    peers: Mutex<HashMap<u64, Weak<Control>>>,
    next: AtomicU64,
}

#[derive(Clone)]
pub struct ConnectionHub(Arc<HubInner>);

struct AuthorizationLease {
    hub: Arc<HubInner>,
    origin: String,
}
impl Drop for AuthorizationLease {
    fn drop(&mut self) {
        let mut counts = self.hub.authorized.lock().unwrap();
        counts.total -= 1;
        if let Some(count) = counts.origins.get_mut(&self.origin) {
            *count -= 1;
            if *count == 0 {
                counts.origins.remove(&self.origin);
            }
        }
    }
}

struct Lifecycle {
    initial: Option<OwnedSemaphorePermit>,
    authorization: Option<AuthorizationLease>,
    deadline: Option<Deadline>,
    pairing_epoch: Option<String>,
}

struct Control {
    id: u64,
    hub: Arc<HubInner>,
    origin: OnceLock<String>,
    closed: AtomicBool,
    authorized: AtomicBool,
    charged: AtomicBool,
    closing: watch::Sender<bool>,
    final_payload: Mutex<Option<Value>>,
    life: Mutex<Lifecycle>,
}

impl Control {
    fn close(&self, payload: Option<Value>) {
        let mut final_payload = self.final_payload.lock().unwrap();
        if !self.closed.swap(true, Ordering::SeqCst) {
            *final_payload = payload;
            drop(final_payload);
            self.closing.send_replace(true);
        }
    }
    fn finish(&self) {
        self.close(None);
        let mut life = self.life.lock().unwrap();
        life.initial.take();
        life.authorization.take();
        life.deadline = None;
        self.authorized.store(false, Ordering::SeqCst);
        self.hub.peers.lock().unwrap().remove(&self.id);
    }
}

struct FinishGuard(Option<Arc<Control>>);
impl Drop for FinishGuard {
    fn drop(&mut self) {
        if let Some(control) = self.0.take() {
            control.finish();
        }
    }
}

pub struct AuthorizationReservation {
    peer: Arc<Control>,
    lease: Option<AuthorizationLease>,
}
impl AuthorizationReservation {
    pub fn commit(mut self) -> Result<(), String> {
        let mut life = self.peer.life.lock().unwrap();
        if self.peer.closed.load(Ordering::SeqCst) {
            return Err("The pairing connection has closed.".into());
        }
        if life.authorization.is_some() {
            return Err("Connection is already authorized.".into());
        }
        life.authorization = self.lease.take();
        life.deadline = None;
        self.peer.authorized.store(true, Ordering::SeqCst);
        life.initial.take();
        Ok(())
    }
}

#[derive(Clone)]
pub struct ConnectionSender {
    control: Arc<Control>,
    sender: mpsc::Sender<OutboundMessage>,
}

impl std::fmt::Debug for ConnectionSender {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ConnectionSender")
            .field("id", &self.id())
            .field("live", &self.is_live())
            .finish()
    }
}

impl ConnectionSender {
    pub fn id(&self) -> u64 {
        self.control.id
    }
    pub fn is_live(&self) -> bool {
        !self.control.closed.load(Ordering::SeqCst)
    }
    pub fn is_authorized(&self) -> bool {
        self.is_live() && self.control.authorized.load(Ordering::SeqCst)
    }
    pub fn charge_attempt(&self) -> bool {
        !self.control.charged.swap(true, Ordering::SeqCst)
    }
    pub fn pairing_epoch(&self) -> Option<String> {
        self.control.life.lock().unwrap().pairing_epoch.clone()
    }
    pub fn mark_pairing(&self, epoch: &str) -> Result<(), String> {
        let mut life = self.control.life.lock().unwrap();
        if !self.is_live()
            || life
                .pairing_epoch
                .as_deref()
                .is_some_and(|old| old != epoch)
        {
            return Err("pairing_expired".into());
        }
        life.pairing_epoch = Some(epoch.into());
        Ok(())
    }
    pub fn pending(&self, deadline: Deadline) -> Result<(), String> {
        let mut life = self.control.life.lock().unwrap();
        if !self.is_live() {
            return Err("The pairing connection has closed.".into());
        }
        life.deadline = Some(deadline);
        Ok(())
    }
    pub fn reserve_authorization(&self) -> Result<AuthorizationReservation, String> {
        if !self.is_live() || self.is_authorized() {
            return Err("Invalid authorization transition.".into());
        }
        let origin = self
            .control
            .origin
            .get()
            .ok_or("Missing connection origin.")?
            .clone();
        let mut counts = self.control.hub.authorized.lock().unwrap();
        if counts.total >= MAX_AUTHORIZED
            || counts.origins.get(&origin).copied().unwrap_or(0) >= MAX_AUTHORIZED_PER_ORIGIN
        {
            return Err("The helper connection limit has been reached.".into());
        }
        counts.total += 1;
        *counts.origins.entry(origin.clone()).or_default() += 1;
        Ok(AuthorizationReservation {
            peer: self.control.clone(),
            lease: Some(AuthorizationLease {
                hub: self.control.hub.clone(),
                origin,
            }),
        })
    }
    pub fn send(&self, message: OutboundMessage) -> Result<(), ()> {
        if let OutboundMessage::Close(payload) = message {
            self.control.close(payload);
            return Ok(());
        }
        if !self.is_live() {
            return Err(());
        }
        if let OutboundMessage::Json(value) = &message {
            if value.to_string().len() > MAX_WS_TEXT_FRAME_BYTES {
                self.control.close(None);
                return Err(());
            }
        }
        self.sender.try_send(message).map_err(|_| {
            self.control.close(None);
        })
    }
    pub fn close_error(&self, code: &str) {
        let _ = self.send(OutboundMessage::Close(Some(error_payload(code, code))));
    }
}

impl ConnectionHub {
    pub fn new() -> Self {
        Self(Arc::new(HubInner {
            unauthorized: Arc::new(Semaphore::new(MAX_UNAUTHORIZED)),
            authorized: Mutex::new(AuthorizedCounts::default()),
            peers: Mutex::new(HashMap::new()),
            next: AtomicU64::new(1),
        }))
    }
    fn open(
        &self,
    ) -> Option<(
        ConnectionSender,
        mpsc::Receiver<OutboundMessage>,
        FinishGuard,
    )> {
        let permit = self.0.unauthorized.clone().try_acquire_owned().ok()?;
        let id = self.0.next.fetch_add(1, Ordering::SeqCst);
        let (closing, _) = watch::channel(false);
        let control = Arc::new(Control {
            id,
            hub: self.0.clone(),
            origin: OnceLock::new(),
            closed: AtomicBool::new(false),
            authorized: AtomicBool::new(false),
            charged: AtomicBool::new(false),
            closing,
            final_payload: Mutex::new(None),
            life: Mutex::new(Lifecycle {
                initial: Some(permit),
                authorization: None,
                deadline: None,
                pairing_epoch: None,
            }),
        });
        self.0
            .peers
            .lock()
            .unwrap()
            .insert(id, Arc::downgrade(&control));
        let (sender, receiver) = mpsc::channel(QUEUE_SIZE);
        Some((
            ConnectionSender {
                control: control.clone(),
                sender,
            },
            receiver,
            FinishGuard(Some(control)),
        ))
    }
    pub fn close_pairing(&self, code: &str) {
        let peers: Vec<_> = self
            .0
            .peers
            .lock()
            .unwrap()
            .values()
            .filter_map(Weak::upgrade)
            .collect();
        for peer in peers {
            let pairing = peer.life.lock().unwrap().pairing_epoch.is_some();
            if pairing && !peer.authorized.load(Ordering::SeqCst) {
                peer.close(Some(error_payload(code, code)));
            }
        }
    }
    pub fn close(&self, id: u64, code: &str) {
        let peer = self
            .0
            .peers
            .lock()
            .unwrap()
            .get(&id)
            .and_then(Weak::upgrade);
        if let Some(peer) = peer {
            peer.close(Some(error_payload(code, code)));
        }
    }
    #[cfg(test)]
    pub fn test_unauthorized(origin: &str) -> (ConnectionSender, mpsc::Receiver<OutboundMessage>) {
        let hub = Self::new();
        let (sender, receiver, mut guard) = hub.open().unwrap();
        sender.control.origin.set(origin.into()).unwrap();
        // Unit fixtures have no transport task. The sender owns its lifetime.
        guard.0.take();
        (sender, receiver)
    }
    #[cfg(test)]
    pub fn test_sender(origin: &str) -> (ConnectionSender, mpsc::Receiver<OutboundMessage>) {
        let (sender, receiver) = Self::test_unauthorized(origin);
        sender.reserve_authorization().unwrap().commit().unwrap();
        (sender, receiver)
    }
}

pub trait Backend: Send + Sync + 'static {
    fn handshake(&self, origin: &str, peer: &ConnectionSender) -> Result<(), u16>;
    fn connected(&self, origin: &str, peer: ConnectionSender) -> Result<u64, String>;
    fn message(&self, connection: u64, origin: &str, envelope: Envelope) -> Result<(), String>;
    fn disconnected(&self, connection: u64);
}

pub async fn serve(
    listener: TcpListener,
    hub: ConnectionHub,
    backend: Arc<dyn Backend>,
) -> std::io::Result<()> {
    loop {
        let (stream, address) = listener.accept().await?;
        if !address.ip().is_loopback() {
            continue;
        }
        // No task or waiting admission queue is created when the pre-auth pool is full.
        let Some((peer, receiver, guard)) = hub.open() else {
            continue;
        };
        let backend = backend.clone();
        tokio::spawn(async move {
            connection(stream, peer, receiver, guard, backend).await;
        });
    }
}

async fn connection(
    stream: TcpStream,
    peer: ConnectionSender,
    mut receiver: mpsc::Receiver<OutboundMessage>,
    guard: FinishGuard,
    backend: Arc<dyn Backend>,
) {
    let initial_end = tokio::time::Instant::now() + INITIAL_TIMEOUT;
    let initial_wall = Deadline::new(Moment::now(), INITIAL_TIMEOUT);
    let handshake_peer = peer.clone();
    let handshake_backend = backend.clone();
    // The tungstenite callback requires an unboxed HTTP error response.
    #[allow(clippy::result_large_err)]
    let callback =
        move |request: &Request, response: Response| -> Result<Response, ErrorResponse> {
            let reject = |status| {
                Response::builder()
                    .status(status)
                    .body(Some("Request rejected.".into()))
                    .unwrap()
            };
            if request.uri().path() != "/ws" {
                return Err(reject(404));
            }
            let origin = normalize_request_origin_header(request).map_err(|_| reject(403))?;
            handshake_backend
                .handshake(&origin, &handshake_peer)
                .map_err(reject)?;
            handshake_peer
                .control
                .origin
                .set(origin)
                .map_err(|_| reject(403))?;
            Ok(response)
        };
    let config = WebSocketConfig {
        max_message_size: Some(MAX_WS_TEXT_FRAME_BYTES),
        max_frame_size: Some(MAX_WS_TEXT_FRAME_BYTES),
        write_buffer_size: 16 * 1024,
        max_write_buffer_size: 128 * 1024,
        ..WebSocketConfig::default()
    };
    let mut closing = peer.control.closing.subscribe();
    let socket = tokio::select! {
        biased;
        _ = closing.changed() => return,
        result = tokio::time::timeout_at(initial_end, accept_hdr_async_with_config(stream, callback, Some(config))) => {
            match result { Ok(Ok(socket)) => socket, _ => return }
        }
    };
    if !peer.is_live() || initial_wall.expired(Moment::now()) {
        return;
    }
    let origin = peer.control.origin.get().unwrap().clone();
    let open_backend = backend.clone();
    let open_peer = peer.clone();
    let open_origin = origin.clone();
    let id = peer.id();
    let registration =
        tokio::task::spawn_blocking(move || open_backend.connected(&open_origin, open_peer));
    if !matches!(tokio::time::timeout_at(initial_end, registration).await, Ok(Ok(Ok(opened))) if opened == id)
    {
        peer.control.close(None);
        let cleanup = backend.clone();
        let _ = tokio::task::spawn_blocking(move || cleanup.disconnected(id)).await;
        return;
    }
    let (mut writer, mut reader) = socket.split();
    let write_peer = peer.clone();
    let mut write_closing = peer.control.closing.subscribe();
    let mut write_task = tokio::spawn(async move {
        loop {
            if !write_peer.is_live() {
                break;
            }
            tokio::select! {
                biased;
                _ = write_closing.changed() => break,
                message = receiver.recv() => {
                    let Some(OutboundMessage::Json(value)) = message else { break; };
                    if !matches!(tokio::time::timeout(WRITE_TIMEOUT, writer.send(Message::Text(value.to_string()))).await, Ok(Ok(()))) {
                        write_peer.control.close(None); break;
                    }
                }
            }
        }
        let final_payload = write_peer.control.final_payload.lock().unwrap().take();
        let _ = tokio::time::timeout(WRITE_TIMEOUT, async {
            if let Some(value) = final_payload {
                let _ = writer.send(Message::Text(value.to_string())).await;
            }
            let _ = writer.close().await;
        })
        .await;
        write_peer.control.close(None);
    });

    let mut initial_hello: Option<Envelope> = None;
    let mut unauthenticated = TokenBucket::new(20, 5, Instant::now());
    let mut authenticated = TokenBucket::new(600, 60, Instant::now());
    let mut timer = tokio::time::interval(Duration::from_millis(100));
    loop {
        if !peer.is_live() {
            break;
        }
        let frame = tokio::select! {
            biased;
            _ = closing.changed() => break,
            _ = timer.tick() => {
                if initial_hello.is_none() && initial_wall.expired(Moment::now()) { peer.close_error("hello_timeout"); break; }
                let expired = peer.control.life.lock().unwrap().deadline.is_some_and(|d| d.expired(Moment::now()));
                if !peer.is_authorized() && expired { peer.close_error("pairing_expired"); break; }
                continue;
            }
            message = reader.next() => message,
        };
        let Some(Ok(frame)) = frame else {
            break;
        };
        let budget = if peer.is_authorized() {
            &mut authenticated
        } else {
            &mut unauthenticated
        };
        if !budget.take(Instant::now()) {
            peer.close_error("helper_limited");
            break;
        }
        match frame {
            Message::Text(text) => {
                let envelope = match parse_text_envelope(&text) {
                    Ok(envelope) => envelope,
                    Err((code, message)) => {
                        peer.control.close(Some(error_payload(code, message)));
                        break;
                    }
                };
                if let Some(first) = &initial_hello {
                    if envelope.message_type == "hello" {
                        if &envelope == first {
                            continue;
                        }
                        peer.close_error("invalid_hello");
                        break;
                    }
                } else {
                    if envelope.message_type != "hello" || initial_wall.expired(Moment::now()) {
                        peer.close_error("hello_required");
                        break;
                    }
                    initial_hello = Some(envelope.clone());
                }
                if envelope.message_type == "disconnect" {
                    break;
                }
                if envelope.message_type != "hello" && !peer.is_authorized() {
                    peer.close_error("pairing_required");
                    break;
                }
                let message_backend = backend.clone();
                let message_origin = origin.clone();
                let first = envelope.message_type == "hello";
                let task = tokio::task::spawn_blocking(move || {
                    message_backend.message(id, &message_origin, envelope)
                });
                let result = tokio::select! {
                    biased;
                    _ = closing.changed() => break,
                    _ = tokio::time::sleep_until(initial_end), if first => { peer.close_error("hello_timeout"); break; },
                    result = task => result,
                };
                match result {
                    Ok(Ok(())) => {}
                    Ok(Err(error)) => {
                        peer.control
                            .close(Some(error_payload("helper_error", &error)));
                        break;
                    }
                    Err(_) => {
                        peer.close_error("helper_error");
                        break;
                    }
                }
            }
            Message::Close(_) => break,
            Message::Ping(_) | Message::Pong(_) => {}
            _ => {
                peer.close_error("invalid_message");
                break;
            }
        }
    }
    peer.control.close(None);
    // Keep the slot during cleanup too, so delayed backend work cannot grow an unbounded task backlog.
    let cleanup = backend.clone();
    let _ = tokio::task::spawn_blocking(move || cleanup.disconnected(id)).await;
    if tokio::time::timeout(WRITE_TIMEOUT + WRITE_TIMEOUT, &mut write_task)
        .await
        .is_err()
    {
        write_task.abort();
        let _ = write_task.await;
    }
    drop(guard);
}

#[cfg(test)]
#[path = "helper_transport_tests.rs"]
mod tests;
