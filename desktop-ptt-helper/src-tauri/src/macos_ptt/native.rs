//! CoreGraphics/CoreFoundation ABI. All tap/runloop pointers stay on their owning thread.
use super::{key_code, HoldState};
use crate::ptt::{DesktopPttBindingRequest, DesktopPttBindingStatus, NativePttEvent, PttEvent};
use std::ffi::c_void;
use std::ptr::null_mut;
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, SystemTime};

type Ref = *mut c_void;
type TapCallback = unsafe extern "C" fn(Ref, u32, Ref, Ref) -> Ref;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightListenEventAccess() -> bool;
    fn CGRequestListenEventAccess() -> bool;
    fn CGEventTapCreate(
        location: u32,
        place: u32,
        options: u32,
        mask: u64,
        callback: TapCallback,
        info: Ref,
    ) -> Ref;
    fn CGEventTapEnable(tap: Ref, enable: bool);
    fn CGEventTapIsEnabled(tap: Ref) -> bool;
    fn CGEventGetIntegerValueField(event: Ref, field: u32) -> i64;
    fn CGEventSourceKeyState(state: i32, key: u16) -> bool;
}
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    static kCFRunLoopDefaultMode: Ref;
    fn CFMachPortCreateRunLoopSource(allocator: Ref, port: Ref, order: isize) -> Ref;
    fn CFMachPortInvalidate(port: Ref);
    fn CFRunLoopGetCurrent() -> Ref;
    fn CFRunLoopAddSource(runloop: Ref, source: Ref, mode: Ref);
    fn CFRunLoopRemoveSource(runloop: Ref, source: Ref, mode: Ref);
    fn CFRunLoopRunInMode(mode: Ref, seconds: f64, return_after_source: bool) -> i32;
    fn CFRelease(object: Ref);
}
#[link(name = "Carbon", kind = "framework")]
extern "C" {
    fn IsSecureEventInputEnabled() -> bool;
}

pub fn permission_granted() -> bool {
    unsafe { CGPreflightListenEventAccess() }
}
pub fn request_permission() -> bool {
    unsafe { CGRequestListenEventAccess() }
}

enum Command {
    Bind(
        DesktopPttBindingRequest,
        u64,
        mpsc::Sender<DesktopPttBindingStatus>,
    ),
    Shutdown,
}

pub struct MacosPttService {
    commands: mpsc::Sender<Command>,
    status: Arc<Mutex<DesktopPttBindingStatus>>,
}

impl MacosPttService {
    pub fn new(callback: Arc<dyn Fn(NativePttEvent) + Send + Sync + 'static>) -> Self {
        let (commands, receive) = mpsc::channel();
        let status = Arc::new(Mutex::new(DesktopPttBindingStatus::default()));
        let thread_status = status.clone();
        std::thread::spawn(move || {
            let mut state = Box::new(TapState {
                callback,
                status: thread_status,
                request: None,
                generation: 0,
                key: None,
                hold: HoldState::default(),
                tap: null_mut(),
                source: null_mut(),
            });
            // macOS monotonic clocks can stop during sleep. Wall time also detects
            // suspension; a backwards clock adjustment conservatively releases PTT.
            let mut last_tick = SystemTime::now();
            loop {
                let mut shutdown = false;
                while let Ok(command) = receive.try_recv() {
                    match command {
                        Command::Bind(request, generation, response) => {
                            state.release();
                            state.generation = generation;
                            state.key = request
                                .key_code
                                .as_deref()
                                .and_then(|key| key_code(key.trim()));
                            state.request = Some(request);
                            state.destroy_tap();
                            state.refresh();
                            let _ = response.send(state.status.lock().unwrap().clone());
                        }
                        Command::Shutdown => {
                            shutdown = true;
                            break;
                        }
                    }
                }
                if shutdown {
                    break;
                }
                // A stalled runloop (including sleep) invalidates an in-flight hold.
                if last_tick.elapsed().unwrap_or(Duration::MAX) > Duration::from_millis(500) {
                    state.release();
                }
                state.refresh();
                last_tick = SystemTime::now();
                if state.source.is_null() {
                    std::thread::sleep(Duration::from_millis(50));
                } else {
                    unsafe {
                        CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.05, false);
                    }
                }
            }
            state.release();
            state.destroy_tap();
        });
        Self { commands, status }
    }

    pub fn set_binding(
        &self,
        request: DesktopPttBindingRequest,
        generation: u64,
    ) -> DesktopPttBindingStatus {
        let (send, receive) = mpsc::channel();
        let key = request.key_code.clone();
        if self
            .commands
            .send(Command::Bind(request, generation, send))
            .is_ok()
        {
            if let Ok(status) = receive.recv_timeout(Duration::from_secs(2)) {
                return status;
            }
        }
        // Queue a clear after a timed-out bind so it cannot later activate silently.
        let (discard, _) = mpsc::channel();
        let _ = self.commands.send(Command::Bind(
            DesktopPttBindingRequest {
                key_code: None,
                mode: Some("live".into()),
                allow_pass_through: Some(true),
                platform_strategy: None,
            },
            generation,
            discard,
        ));
        let status = DesktopPttBindingStatus::unsupported(
            key,
            true,
            "macos-input-thread-unavailable".into(),
        );
        *self.status.lock().unwrap() = status.clone();
        status
    }

    pub fn current_status(&self) -> DesktopPttBindingStatus {
        self.status.lock().unwrap().clone()
    }
    pub fn shutdown(&self) {
        let _ = self.commands.send(Command::Shutdown);
    }
}
impl Drop for MacosPttService {
    fn drop(&mut self) {
        self.shutdown();
    }
}

struct TapState {
    callback: Arc<dyn Fn(NativePttEvent) + Send + Sync>,
    status: Arc<Mutex<DesktopPttBindingStatus>>,
    request: Option<DesktopPttBindingRequest>,
    generation: u64,
    key: Option<u16>,
    hold: HoldState,
    tap: Ref,
    source: Ref,
}

impl TapState {
    fn emit(&self, event: Option<PttEvent>) {
        if let Some(event) = event {
            (self.callback)(NativePttEvent {
                action: event,
                generation: self.generation,
            });
        }
    }
    fn release(&mut self) {
        let down = self
            .key
            .is_some_and(|key| unsafe { CGEventSourceKeyState(0, key) });
        let event = self.hold.reset(down);
        self.emit(event);
    }

    fn destroy_tap(&mut self) {
        unsafe {
            if !self.source.is_null() {
                CFRunLoopRemoveSource(CFRunLoopGetCurrent(), self.source, kCFRunLoopDefaultMode);
                CFRelease(self.source);
                self.source = null_mut();
            }
            if !self.tap.is_null() {
                CGEventTapEnable(self.tap, false);
                CFMachPortInvalidate(self.tap);
                CFRelease(self.tap);
                self.tap = null_mut();
            }
        }
    }

    fn refresh(&mut self) {
        let request_key = self.request.as_ref().and_then(|r| r.key_code.clone());
        let active = self
            .request
            .as_ref()
            .is_some_and(|r| r.mode.as_deref() == Some("ptt"))
            && request_key
                .as_deref()
                .is_some_and(|key| !key.trim().is_empty());
        let reason = if !active {
            None
        } else if self.key.is_none() {
            Some("macos-key-unsupported")
        } else if !permission_granted() {
            Some("macos-input-monitoring-required")
        } else if unsafe { IsSecureEventInputEnabled() } {
            Some("macos-secure-input")
        } else {
            Some("")
        };
        let status = match reason {
            None => {
                self.release();
                self.destroy_tap();
                DesktopPttBindingStatus::default()
            }
            Some("") => {
                if self.tap.is_null() {
                    // kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionListenOnly.
                    // Observe keyDown (10), keyUp (11), flagsChanged (12), never other input.
                    self.tap = unsafe {
                        CGEventTapCreate(
                            1,
                            0,
                            1,
                            (1 << 10) | (1 << 11) | (1 << 12),
                            event_callback,
                            self as *mut Self as Ref,
                        )
                    };
                    if !self.tap.is_null() {
                        self.source =
                            unsafe { CFMachPortCreateRunLoopSource(null_mut(), self.tap, 0) };
                        if !self.source.is_null() {
                            unsafe {
                                CFRunLoopAddSource(
                                    CFRunLoopGetCurrent(),
                                    self.source,
                                    kCFRunLoopDefaultMode,
                                );
                            }
                            self.release();
                        } else {
                            self.destroy_tap();
                        }
                    }
                }
                if self.tap.is_null() {
                    DesktopPttBindingStatus::unsupported(
                        request_key,
                        true,
                        "macos-event-tap-unavailable".into(),
                    )
                } else if !unsafe { CGEventTapIsEnabled(self.tap) } {
                    self.release();
                    unsafe {
                        CGEventTapEnable(self.tap, true);
                    }
                    DesktopPttBindingStatus::unsupported(
                        request_key,
                        true,
                        "macos-event-tap-restarting".into(),
                    )
                } else {
                    if let Some(key) = self.key {
                        // Recover a lost key-up without starting PTT from polling alone.
                        if !unsafe { CGEventSourceKeyState(0, key) } {
                            let event = self.hold.update(false, false);
                            self.emit(event);
                        }
                    }
                    DesktopPttBindingStatus {
                        mode: "global-native".into(),
                        key_code: request_key,
                        is_global: true,
                        uses_native_hook: true,
                        uses_raw_input: false,
                        allow_pass_through: true,
                        platform: "macos".into(),
                        reason: None,
                    }
                }
            }
            Some(reason) => {
                self.release();
                self.destroy_tap();
                DesktopPttBindingStatus::unsupported(request_key, true, reason.into())
            }
        };
        *self.status.lock().unwrap() = status;
    }
}

unsafe extern "C" fn event_callback(_proxy: Ref, event_type: u32, event: Ref, info: Ref) -> Ref {
    // A Rust unwind must never cross Apple's C callback boundary.
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let state = &mut *(info as *mut TapState);
        if event_type == u32::MAX || event_type == u32::MAX - 1 {
            state.release();
            *state.status.lock().unwrap() = DesktopPttBindingStatus::unsupported(
                state.request.as_ref().and_then(|r| r.key_code.clone()),
                true,
                "macos-event-tap-restarting".into(),
            );
        } else if (10..=12).contains(&event_type) && !event.is_null() {
            // kCGKeyboardEventKeycode = 9, kCGKeyboardEventAutorepeat = 8.
            let key = CGEventGetIntegerValueField(event, 9) as u16;
            if state.key == Some(key) {
                let down = if event_type == 12 {
                    CGEventSourceKeyState(0, key)
                } else {
                    event_type == 10
                };
                let repeat = event_type == 10 && CGEventGetIntegerValueField(event, 8) != 0;
                let action = state.hold.update(down, repeat);
                state.emit(action);
            }
        }
    }));
    // Listen-only tap: always return the original event unchanged.
    event
}
