use super::*;
use tokio::sync::mpsc::Receiver;

fn pending() -> (
    RuntimeState,
    ConnectionSender,
    Receiver<OutboundMessage>,
    String,
) {
    let origin = "https://chat.example";
    let (peer, receiver) = ConnectionHub::test_unauthorized(origin);
    let mut state =
        RuntimeState::from_persisted(Default::default(), DesktopPttBindingStatus::default());
    state.pairing.start(Moment::now()).unwrap();
    let id = register_session(&mut state, origin, peer.clone()).unwrap();
    let hello = HelloPayload {
        protocol_version: Some("2".into()),
        origin: origin.into(),
        session_id: "session".into(),
        client_kind: None,
        pairing_token: None,
    };
    process_hello(&mut state, id, origin, &hello)
        .unwrap()
        .unwrap();
    let request = state.pairing.requests[0].request_id.clone();
    (state, peer, receiver, request)
}

#[test]
fn pairing_save_failure_never_authorizes_or_discards_the_reviewed_request() {
    let (mut state, peer, _receiver, request) = pending();
    assert!(commit_pairing_approval(&mut state, &request, |_| Err("disk full".into())).is_err());
    assert!(!peer.is_authorized());
    assert!(!state.sessions[&peer.id()].authorized);
    assert!(state.persisted.trusted_origins.is_empty());
    assert!(state.pairing.validate(&request, Moment::now()).is_ok());
    assert!(state.pairing.active(Moment::now()));
}

#[test]
fn saved_pairing_ends_mode_and_restart_preserves_token_but_grants_no_key_automatically() {
    let (mut state, peer, _receiver, request) = pending();
    let mut saved = String::new();
    let (token, _, _) = commit_pairing_approval(&mut state, &request, |proposed| {
        assert!(!peer.is_authorized());
        saved = serde_json::to_string(proposed).unwrap();
        Ok(())
    })
    .unwrap();
    assert!(peer.is_authorized());
    assert!(state.sessions[&peer.id()].authorized);
    assert!(!state.pairing.active(Moment::now()));
    assert!(state.pairing.requests.is_empty());
    let restored = RuntimeState::from_persisted(
        serde_json::from_str(&saved).unwrap(),
        DesktopPttBindingStatus::default(),
    );
    assert!(is_pairing_token_valid(
        &restored,
        "https://chat.example",
        &token
    ));
    assert_eq!(
        restored.persisted.trusted_origins[0].approved_key_code,
        None
    );
    assert!(!restored.pairing.active(Moment::now()));
}

#[test]
fn stale_or_disconnected_confirmations_do_not_write_or_authorize() {
    for change in ["disconnect", "stop", "new-mode", "request-expiry"] {
        let (mut state, peer, _receiver, request) = pending();
        match change {
            "disconnect" => peer.close_error("closed"),
            "stop" => state.pairing.stop(),
            "new-mode" => {
                state.pairing.stop();
                state.pairing.start(Moment::now()).unwrap();
            }
            _ => {
                state
                    .pairing
                    .tick(Moment::now().later(std::time::Duration::from_secs(61)));
            }
        }
        assert!(commit_pairing_approval(&mut state, &request, |_| panic!(
            "stale consent must never be saved"
        ))
        .is_err());
        assert!(!peer.is_authorized());
        assert!(state.persisted.trusted_origins.is_empty());
    }
}

#[test]
fn disconnect_while_saving_never_activates_capture_and_saved_pairing_still_ends_mode() {
    let (mut state, peer, _receiver, request) = pending();
    assert!(commit_pairing_approval(&mut state, &request, |_| {
        peer.close_error("disconnected");
        Ok(())
    })
    .is_err());
    assert!(!peer.is_authorized());
    assert!(!state.sessions[&peer.id()].authorized);
    assert!(!state.pairing.active(Moment::now()));
    assert_eq!(state.persisted.trusted_origins.len(), 1);
    assert_eq!(state.persisted.trusted_origins[0].approved_key_code, None);
}

#[test]
fn upgrade_preserves_previously_saved_token_and_key_without_persisting_pairing_mode() {
    let old = json!({"trustedOrigins":[{"origin":"https://chat.example","tokenHash":hash_pairing_token("old-token"),
        "approvedAt":"2026-11-11T12:00:00Z","lastClientKind":"browser","approvedKeyCode":"ShiftLeft"}],"paused":false});
    let persisted: PersistedHelperState = serde_json::from_value(old).unwrap();
    let mut state = RuntimeState::from_persisted(persisted, DesktopPttBindingStatus::default());
    assert!(is_pairing_token_valid(
        &state,
        "https://chat.example",
        "old-token"
    ));
    assert_eq!(
        state.persisted.trusted_origins[0]
            .approved_key_code
            .as_deref(),
        Some("ShiftLeft")
    );
    state.pairing.start(Moment::now()).unwrap();
    let saved = serde_json::to_value(&state.persisted).unwrap();
    assert!(saved.get("pairingModeActive").is_none());
    let restarted = RuntimeState::from_persisted(
        serde_json::from_value(saved).unwrap(),
        DesktopPttBindingStatus::default(),
    );
    assert!(!restarted.pairing.active(Moment::now()));
}

#[test]
fn closed_transport_cannot_receive_a_delayed_native_press_while_cleanup_is_pending() {
    let (mut state, peer, mut receiver, request) = pending();
    commit_pairing_approval(&mut state, &request, |_| Ok(())).unwrap();
    state.persisted.trusted_origins[0].approved_key_code = Some("KeyV".into());
    state.sessions.get_mut(&peer.id()).unwrap().ptt_config = DesktopPttBindingRequest {
        key_code: Some("KeyV".into()),
        mode: Some("ptt".into()),
        ..default_ptt_request()
    };
    state.active_binding_request = state.sessions[&peer.id()].ptt_config.clone();
    state.target_connection_id = Some(peer.id());
    state.binding_target = Some(peer.id());
    state.binding_generation = 7;
    state.binding_status.is_global = true;
    while receiver.try_recv().is_ok() {}
    peer.close_error("write_timeout");
    route_ptt_event(
        &mut state,
        NativePttEvent {
            action: PttEvent::Down,
            generation: 7,
        },
    );
    assert!(receiver.try_recv().is_err());
    assert!(state.transmitting.is_none());
}
