use super::*;
use crate::ptt::DesktopPttBindingStatus;
use crate::{
    commit_pairing_approval, handshake_admission, hash_pairing_token, normalize_hello_origin,
    process_hello, register_session, validate_hello_protocol, HelloPayload, PersistedHelperState,
    RuntimeState, TrustedOriginRecord,
};
use std::sync::atomic::AtomicUsize;
use tokio_tungstenite::tungstenite::protocol::frame::{
    coding::{Data, OpCode},
    Frame,
};
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Error};
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

const ORIGIN: &str = "https://chat.example";
type Client = WebSocketStream<MaybeTlsStream<TcpStream>>;

struct MemoryBackend {
    state: Mutex<RuntimeState>,
    accepted_hellos: AtomicUsize,
    registrations: AtomicUsize,
}
impl MemoryBackend {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(RuntimeState::from_persisted(
                PersistedHelperState::default(),
                DesktopPttBindingStatus::default(),
            )),
            accepted_hellos: AtomicUsize::new(0),
            registrations: AtomicUsize::new(0),
        })
    }
    fn trust(&self, origin: &str) {
        self.state
            .lock()
            .unwrap()
            .persisted
            .trusted_origins
            .push(TrustedOriginRecord {
                origin: origin.into(),
                token_hash: hash_pairing_token("valid"),
                approved_key_code: Some("KeyV".into()),
                approved_at: String::new(),
                last_client_kind: "browser".into(),
            });
    }
    fn start(&self) {
        self.state
            .lock()
            .unwrap()
            .pairing
            .start(Moment::now())
            .unwrap();
    }
}
impl Backend for MemoryBackend {
    fn handshake(&self, origin: &str, peer: &ConnectionSender) -> Result<(), u16> {
        handshake_admission(&mut self.state.lock().unwrap(), origin, peer, Moment::now())
    }
    fn connected(&self, origin: &str, peer: ConnectionSender) -> Result<u64, String> {
        self.registrations.fetch_add(1, Ordering::SeqCst);
        register_session(&mut self.state.lock().unwrap(), origin, peer)
    }
    fn message(&self, id: u64, origin: &str, envelope: Envelope) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();
        if envelope.message_type == "hello" {
            let payload: HelloPayload =
                serde_json::from_value(envelope.payload.unwrap()).map_err(|e| e.to_string())?;
            validate_hello_protocol(&payload)?;
            normalize_hello_origin(origin, &payload.origin)?;
            if let Some((peer, authorized)) = process_hello(&mut state, id, origin, &payload)? {
                self.accepted_hellos.fetch_add(1, Ordering::SeqCst);
                if authorized {
                    peer.send(OutboundMessage::Json(json!({"type":"hello_ack"})))
                        .unwrap();
                }
            }
        } else if envelope.message_type == "flood" {
            let peer = state.sessions[&id].sender.clone();
            let message = json!({"type":"test","payload":"x".repeat(60_000)});
            for _ in 0..10000 {
                if peer.send(OutboundMessage::Json(message.clone())).is_err() {
                    break;
                }
            }
        } else {
            state.sessions[&id]
                .sender
                .send(OutboundMessage::Json(json!({"type":"pong"})))
                .map_err(|_| "closed")?;
        }
        Ok(())
    }
    fn disconnected(&self, id: u64) {
        let mut state = self.state.lock().unwrap();
        crate::release_transmission(&mut state);
        state.pairing.remove_connection(id);
        state.sessions.remove(&id);
    }
}

struct Server {
    url: String,
    hub: ConnectionHub,
    backend: Arc<MemoryBackend>,
    task: tokio::task::JoinHandle<std::io::Result<()>>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
impl Server {
    async fn new() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("ws://{}/ws", listener.local_addr().unwrap());
        let hub = ConnectionHub::new();
        let backend = MemoryBackend::new();
        let task = tokio::spawn(serve(listener, hub.clone(), backend.clone()));
        Self {
            url,
            hub,
            backend,
            task,
        }
    }
    async fn connect(&self, origin: Option<&str>, path: &str) -> Result<Client, Error> {
        let url = self.url.replace("/ws", path);
        let mut request = url.into_client_request().unwrap();
        if let Some(origin) = origin {
            request
                .headers_mut()
                .insert("origin", origin.parse().unwrap());
        }
        connect_async(request).await.map(|(client, _)| client)
    }
    async fn clean(&self) {
        tokio::time::timeout(Duration::from_secs(6), async {
            loop {
                if self.hub.0.peers.lock().unwrap().is_empty()
                    && self.backend.state.lock().unwrap().sessions.is_empty()
                {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .expect("connection resources were not released");
        assert_eq!(
            self.hub.0.unauthorized.available_permits(),
            MAX_UNAUTHORIZED
        );
        assert_eq!(self.hub.0.authorized.lock().unwrap().total, 0);
    }
}
fn hello(origin: &str, token: Option<&str>) -> Message {
    Message::Text(json!({"type":"hello","payload":{"protocolVersion":"2","origin":origin,"sessionId":"test-session","pairingToken":token}}).to_string())
}
async fn read(client: &mut Client) -> Value {
    let frame = tokio::time::timeout(Duration::from_secs(3), client.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    serde_json::from_str(&frame.into_text().unwrap()).unwrap()
}
async fn auth(server: &Server, origin: &str) -> Client {
    let mut client = server.connect(Some(origin), "/ws").await.unwrap();
    client.send(hello(origin, Some("valid"))).await.unwrap();
    assert_eq!(read(&mut client).await["type"], "hello_ack");
    client
}
async fn eventually_closed(client: &mut Client) {
    tokio::time::timeout(Duration::from_secs(7), async {
        while let Some(Ok(frame)) = client.next().await {
            if frame.is_close() {
                return;
            }
        }
    })
    .await
    .expect("slow connection was not closed");
}

#[tokio::test]
async fn unknown_origins_and_bad_paths_are_rejected_before_upgrade_without_metadata() {
    let server = Server::new().await;
    for (origin, path, status) in [
        (Some(ORIGIN), "/ws", 403),
        (None, "/ws", 403),
        (Some("file:///tmp/a"), "/ws", 403),
        (Some(ORIGIN), "/wrong", 404),
    ] {
        match server.connect(origin, path).await {
            Err(Error::Http(response)) => {
                assert_eq!(response.status().as_u16(), status);
                let body = String::from_utf8(response.body().clone().unwrap_or_default()).unwrap();
                assert_eq!(body, "Request rejected.");
                assert!(!response.headers().contains_key("server"));
            }
            other => panic!("Unexpected upgrade: {other:?}"),
        }
    }
    server.clean().await;
    assert_eq!(server.backend.registrations.load(Ordering::SeqCst), 0);
    assert_eq!(server.backend.accepted_hellos.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn valid_tokens_reconnect_without_mode_or_pairing_budget_but_invalid_tokens_cannot() {
    let server = Server::new().await;
    server.backend.trust(ORIGIN);
    for _ in 0..12 {
        let mut client = auth(&server, ORIGIN).await;
        client.close(None).await.unwrap();
        server.clean().await;
    }
    for token in [None, Some("invalid")] {
        let mut client = server.connect(Some(ORIGIN), "/ws").await.unwrap();
        client.send(hello(ORIGIN, token)).await.unwrap();
        assert_eq!(
            read(&mut client).await["payload"]["code"],
            if token.is_some() {
                "invalid_pairing_token"
            } else {
                "pairing_mode_closed"
            }
        );
        eventually_closed(&mut client).await;
        server.clean().await;
        assert!(server
            .backend
            .state
            .lock()
            .unwrap()
            .pairing
            .requests
            .is_empty());
    }
    assert_eq!(
        server
            .backend
            .state
            .lock()
            .unwrap()
            .persisted
            .trusted_origins[0]
            .approved_key_code
            .as_deref(),
        Some("KeyV")
    );
}

#[tokio::test]
async fn hello_origin_must_match_and_identical_repeats_are_silent_changed_repeats_close() {
    let server = Server::new().await;
    server.backend.trust(ORIGIN);
    let mut client = auth(&server, ORIGIN).await;
    client.send(hello(ORIGIN, Some("valid"))).await.unwrap();
    assert!(
        tokio::time::timeout(Duration::from_millis(150), client.next())
            .await
            .is_err()
    );
    assert_eq!(server.backend.accepted_hellos.load(Ordering::SeqCst), 1);
    client
        .send(hello("https://other.example", Some("valid")))
        .await
        .unwrap();
    assert_eq!(read(&mut client).await["payload"]["code"], "invalid_hello");
    eventually_closed(&mut client).await;
    server.clean().await;
    let mut client = server.connect(Some(ORIGIN), "/ws").await.unwrap();
    client
        .send(hello("https://other.example", Some("valid")))
        .await
        .unwrap();
    eventually_closed(&mut client).await;
    server.clean().await;
}

#[tokio::test]
async fn one_pending_per_origin_and_four_total_do_not_replace_existing_requests() {
    let server = Server::new().await;
    server.backend.start();
    let mut clients = Vec::new();
    for i in 0..4 {
        let origin = format!("https://{i}.example");
        let mut client = server.connect(Some(&origin), "/ws").await.unwrap();
        client.send(hello(&origin, None)).await.unwrap();
        assert_eq!(read(&mut client).await["type"], "pairing_required");
        clients.push(client);
    }
    let ids: Vec<_> = server
        .backend
        .state
        .lock()
        .unwrap()
        .pairing
        .requests
        .iter()
        .map(|r| r.request_id.clone())
        .collect();
    assert!(server
        .connect(Some("https://0.example"), "/ws")
        .await
        .is_err());
    assert!(server
        .connect(Some("https://extra.example"), "/ws")
        .await
        .is_err());
    assert_eq!(
        ids,
        server
            .backend
            .state
            .lock()
            .unwrap()
            .pairing
            .requests
            .iter()
            .map(|r| r.request_id.clone())
            .collect::<Vec<_>>()
    );
    server.backend.state.lock().unwrap().pairing.stop();
    server.hub.close_pairing("pairing_mode_closed");
    for client in &mut clients {
        eventually_closed(client).await;
    }
    server.clean().await;
}

#[tokio::test]
async fn cancel_expiry_rejection_and_success_close_only_unconfirmed_pairing_connections() {
    for action in ["cancel", "expiry", "reject", "save"] {
        let server = Server::new().await;
        server.backend.trust(ORIGIN);
        let mut existing = auth(&server, ORIGIN).await;
        server.backend.start();
        let mut pending = server
            .connect(Some("https://new.example"), "/ws")
            .await
            .unwrap();
        pending
            .send(hello("https://new.example", None))
            .await
            .unwrap();
        let request = read(&mut pending).await["payload"]["requestId"]
            .as_str()
            .unwrap()
            .to_string();
        // A known-origin socket still trying a token is not a pairing candidate.
        let mut reconnect = server.connect(Some(ORIGIN), "/ws").await.unwrap();
        {
            let mut state = server.backend.state.lock().unwrap();
            match action {
                "reject" => {
                    let rejected = state.pairing.reject(&request, Moment::now()).unwrap();
                    server.hub.close(rejected.connection_id, "pairing_rejected");
                }
                "save" => {
                    let (_, peer, _) =
                        commit_pairing_approval(&mut state, &request, |_| Ok(())).unwrap();
                    assert!(peer.is_authorized());
                }
                "expiry" => {
                    assert!(
                        state
                            .pairing
                            .tick(Moment::now().later(Duration::from_secs(121)))
                            .0
                    );
                }
                _ => state.pairing.stop(),
            }
        }
        if action != "reject" {
            server.hub.close_pairing("pairing_expired");
        }
        if action != "save" {
            eventually_closed(&mut pending).await;
        }
        assert!(server
            .backend
            .state
            .lock()
            .unwrap()
            .pairing
            .validate(&request, Moment::now())
            .is_err());
        if action == "reject" {
            assert!(server
                .connect(Some("https://new.example"), "/ws")
                .await
                .is_err());
        }
        existing
            .send(Message::Text(json!({"type":"ping"}).to_string()))
            .await
            .unwrap();
        assert_eq!(read(&mut existing).await["type"], "pong");
        reconnect.send(hello(ORIGIN, Some("valid"))).await.unwrap();
        assert_eq!(read(&mut reconnect).await["type"], "hello_ack");
        existing.close(None).await.unwrap();
        reconnect.close(None).await.unwrap();
        if action == "save" {
            pending.close(None).await.unwrap();
        }
        server.clean().await;
    }
}

#[tokio::test]
async fn admission_rechecks_epoch_and_request_expiry_at_hello_and_confirmation() {
    let server = Server::new().await;
    server.backend.start();
    let mut old = server.connect(Some(ORIGIN), "/ws").await.unwrap();
    server.backend.state.lock().unwrap().pairing.stop();
    server.backend.start();
    old.send(hello(ORIGIN, None)).await.unwrap();
    eventually_closed(&mut old).await;
    assert!(server
        .backend
        .state
        .lock()
        .unwrap()
        .pairing
        .requests
        .is_empty());
    server.clean().await;
    let mut pending = server.connect(Some(ORIGIN), "/ws").await.unwrap();
    pending.send(hello(ORIGIN, None)).await.unwrap();
    let request = read(&mut pending).await["payload"]["requestId"]
        .as_str()
        .unwrap()
        .to_string();
    {
        let mut state = server.backend.state.lock().unwrap();
        state
            .pairing
            .tick(Moment::now().later(Duration::from_secs(61)));
        assert!(commit_pairing_approval(&mut state, &request, |_| panic!(
            "must not save stale consent"
        ))
        .is_err());
        assert!(state.persisted.trusted_origins.is_empty());
    }
    pending.close(None).await.unwrap();
    server.clean().await;
}

#[tokio::test]
async fn transport_bounds_initial_connections_and_releases_slots_after_first_hello_timeout() {
    let server = Server::new().await;
    let address = server
        .url
        .trim_start_matches("ws://")
        .trim_end_matches("/ws");
    let mut sockets = Vec::new();
    for _ in 0..MAX_UNAUTHORIZED {
        sockets.push(TcpStream::connect(address).await.unwrap());
    }
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(server.hub.0.unauthorized.available_permits(), 0);
    let mut extra = server.connect(Some(ORIGIN), "/ws").await;
    assert!(extra.is_err());
    // Partial HTTP handshakes count towards exactly the same five-second budget.
    use tokio::io::AsyncWriteExt;
    sockets[0].write_all(b"GET /ws HTTP/1.1\r\n").await.unwrap();
    tokio::time::sleep(Duration::from_millis(5100)).await;
    server.clean().await;
    server.backend.trust(ORIGIN);
    let mut waiting = server.connect(Some(ORIGIN), "/ws").await.unwrap();
    eventually_closed(&mut waiting).await;
    server.clean().await;
    // Retain ownership of the surplus result until this point as an extra cleanup check.
    if let Ok(client) = &mut extra {
        client.close(None).await.unwrap();
    }
}

#[tokio::test]
async fn authorized_limits_do_not_displace_existing_sessions_and_are_origin_scoped() {
    let server = Server::new().await;
    server.backend.trust(ORIGIN);
    server.backend.trust("https://second.example");
    let mut clients = Vec::new();
    for origin in [ORIGIN, "https://second.example"] {
        for _ in 0..8 {
            clients.push(auth(&server, origin).await);
        }
        if clients.len() == 8 {
            let mut ninth = server.connect(Some(origin), "/ws").await.unwrap();
            ninth.send(hello(origin, Some("valid"))).await.unwrap();
            assert_eq!(read(&mut ninth).await["payload"]["code"], "helper_limited");
            eventually_closed(&mut ninth).await;
            assert_eq!(server.hub.0.authorized.lock().unwrap().total, 8);
        }
    }
    assert_eq!(server.hub.0.authorized.lock().unwrap().total, 16);
    server.backend.trust("https://third.example");
    let mut extra = server
        .connect(Some("https://third.example"), "/ws")
        .await
        .unwrap();
    extra
        .send(hello("https://third.example", Some("valid")))
        .await
        .unwrap();
    assert_eq!(read(&mut extra).await["payload"]["code"], "helper_limited");
    eventually_closed(&mut extra).await;
    clients[0]
        .send(Message::Text(json!({"type":"ping"}).to_string()))
        .await
        .unwrap();
    assert_eq!(read(&mut clients[0]).await["type"], "pong");
    assert_eq!(server.hub.0.authorized.lock().unwrap().total, 16);
    for client in &mut clients {
        client.close(None).await.unwrap();
    }
    server.clean().await;
}

#[tokio::test]
async fn large_frames_fragmented_messages_and_message_floods_are_closed_and_cleaned_up() {
    for case in ["frame", "fragment", "rate", "slow-reader"] {
        let server = Server::new().await;
        server.backend.trust(ORIGIN);
        let mut client = auth(&server, ORIGIN).await;
        match case {
            "frame" => {
                client
                    .send(Message::Text("x".repeat(MAX_WS_TEXT_FRAME_BYTES + 1)))
                    .await
                    .unwrap();
            }
            "fragment" => {
                client
                    .send(Message::Frame(Frame::message(
                        vec![b'x'; 35_000],
                        OpCode::Data(Data::Text),
                        false,
                    )))
                    .await
                    .unwrap();
                client
                    .send(Message::Frame(Frame::message(
                        vec![b'x'; 35_000],
                        OpCode::Data(Data::Continue),
                        true,
                    )))
                    .await
                    .unwrap();
            }
            "rate" => {
                for _ in 0..70 {
                    let _ = client.send(hello(ORIGIN, Some("valid"))).await;
                }
            }
            _ => {
                client
                    .send(Message::Text(json!({"type":"flood"}).to_string()))
                    .await
                    .unwrap();
                // Do not read while the server floods its bounded output queue.
                server.clean().await;
            }
        }
        eventually_closed(&mut client).await;
        server.clean().await;
    }
}

#[test]
fn bounded_queue_overflow_and_abandoned_authorization_reservations_release_resources() {
    let hub = ConnectionHub::new();
    let (peer, _receiver, guard) = hub.open().unwrap();
    peer.control.origin.set(ORIGIN.into()).unwrap();
    {
        let _reservation = peer.reserve_authorization().unwrap();
        assert_eq!(hub.0.authorized.lock().unwrap().total, 1);
    }
    assert_eq!(hub.0.authorized.lock().unwrap().total, 0);
    for _ in 0..QUEUE_SIZE {
        peer.send(OutboundMessage::Json(json!({"type":"test"})))
            .unwrap();
    }
    assert!(peer
        .send(OutboundMessage::Json(json!({"type":"overflow"})))
        .is_err());
    assert!(!peer.is_live());
    assert!(peer.reserve_authorization().is_err());
    drop(guard);
    assert_eq!(hub.0.unauthorized.available_permits(), MAX_UNAUTHORIZED);
    assert!(hub.0.peers.lock().unwrap().is_empty());
}

#[tokio::test]
async fn unauthorized_message_burst_is_bounded_without_duplicate_requests_or_responses() {
    let server = Server::new().await;
    server.backend.start();
    let mut client = server.connect(Some(ORIGIN), "/ws").await.unwrap();
    client.send(hello(ORIGIN, None)).await.unwrap();
    assert_eq!(read(&mut client).await["type"], "pairing_required");
    for _ in 0..5 {
        client.send(hello(ORIGIN, None)).await.unwrap();
    }
    assert_eq!(read(&mut client).await["payload"]["code"], "helper_limited");
    eventually_closed(&mut client).await;
    server.clean().await;
    assert_eq!(server.backend.accepted_hellos.load(Ordering::SeqCst), 1);
}
