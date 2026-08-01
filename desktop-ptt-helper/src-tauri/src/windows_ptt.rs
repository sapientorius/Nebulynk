use serde::{Deserialize, Serialize};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPttBindingRequest {
    pub key_code: Option<String>,
    pub mode: Option<String>,
    pub allow_pass_through: Option<bool>,
    pub platform_strategy: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPttBindingStatus {
    pub mode: String,
    pub key_code: Option<String>,
    pub is_global: bool,
    pub uses_native_hook: bool,
    pub uses_raw_input: bool,
    pub allow_pass_through: bool,
    pub platform: String,
    pub reason: Option<String>,
}

impl Default for DesktopPttBindingStatus {
    fn default() -> Self {
        Self {
            mode: "focused-only".to_string(),
            key_code: None,
            is_global: false,
            uses_native_hook: false,
            uses_raw_input: false,
            allow_pass_through: true,
            platform: platform_name().to_string(),
            reason: None,
        }
    }
}

impl DesktopPttBindingStatus {
    pub fn unsupported(key_code: Option<String>, allow_pass_through: bool, reason: String) -> Self {
        Self {
            mode: "unsupported".to_string(),
            key_code,
            is_global: false,
            uses_native_hook: false,
            uses_raw_input: false,
            allow_pass_through,
            platform: platform_name().to_string(),
            reason: Some(reason),
        }
    }

    pub fn global_raw_input(key_code: String, allow_pass_through: bool) -> Self {
        Self {
            mode: "global-raw-input".to_string(),
            key_code: Some(key_code),
            is_global: true,
            uses_native_hook: false,
            uses_raw_input: true,
            allow_pass_through,
            platform: platform_name().to_string(),
            reason: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PttEvent {
    Down,
    Up,
}

fn platform_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "windows"
    }

    #[cfg(target_os = "macos")]
    {
        "macos"
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        "linux"
    }
}

#[derive(Clone)]
pub struct WindowsPttService {
    status: Arc<Mutex<DesktopPttBindingStatus>>,
    #[cfg(target_os = "windows")]
    command_tx: Option<mpsc::Sender<WindowsPttCommand>>,
    #[cfg(not(target_os = "windows"))]
    command_tx: Option<()>,
    fallback_reason: Option<String>,
}

impl WindowsPttService {
    pub fn new(callback: Arc<dyn Fn(PttEvent) + Send + Sync + 'static>) -> Self {
        let status = Arc::new(Mutex::new(DesktopPttBindingStatus::default()));

        #[cfg(target_os = "windows")]
        {
            match windows::spawn_windows_ptt_thread(callback, status.clone()) {
                Ok(command_tx) => Self {
                    status,
                    command_tx: Some(command_tx),
                    fallback_reason: None,
                },
                Err(reason) => {
                    *status.lock().unwrap() = DesktopPttBindingStatus::unsupported(None, true, reason.clone());
                    Self {
                        status,
                        command_tx: None,
                        fallback_reason: Some(reason),
                    }
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            let reason = "Windows Raw Input is only available on Windows.".to_string();
            *status.lock().unwrap() = DesktopPttBindingStatus::unsupported(None, true, reason.clone());
            Self {
                status,
                command_tx: None,
                fallback_reason: Some(reason),
            }
        }
    }

    pub fn set_binding(&self, request: DesktopPttBindingRequest) -> DesktopPttBindingStatus {
        if let Some(reason) = self.fallback_reason.clone() {
            let allow_pass_through = request.allow_pass_through.unwrap_or(true);
            let status = DesktopPttBindingStatus::unsupported(request.key_code.clone(), allow_pass_through, reason);
            *self.status.lock().unwrap() = status.clone();
            return status;
        }

        #[cfg(target_os = "windows")]
        {
            let Some(command_tx) = self.command_tx.as_ref() else {
                return self.status.lock().unwrap().clone();
            };
            let (response_tx, response_rx) = mpsc::channel();
            let request_key_code = request.key_code.clone();
            let request_allow_pass_through = request.allow_pass_through.unwrap_or(true);
            if command_tx
                .send(WindowsPttCommand::SetBinding {
                    request,
                    response_tx,
                })
                .is_err()
            {
                let status = DesktopPttBindingStatus::unsupported(
                    None,
                    true,
                    "Windows Raw Input thread is no longer available.".to_string(),
                );
                *self.status.lock().unwrap() = status.clone();
                return status;
            }

            if !windows::notify_command_pending() {
                let status = DesktopPttBindingStatus::unsupported(
                    request_key_code.clone(),
                    request_allow_pass_through,
                    "Windows Raw Input helper window is not ready to receive binding updates.".to_string(),
                );
                *self.status.lock().unwrap() = status.clone();
                return status;
            }

            match response_rx.recv_timeout(Duration::from_secs(2)) {
                Ok(status) => {
                    *self.status.lock().unwrap() = status.clone();
                    status
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    let status = DesktopPttBindingStatus::unsupported(
                        request_key_code,
                        request_allow_pass_through,
                        "Windows Raw Input binding update timed out.".to_string(),
                    );
                    *self.status.lock().unwrap() = status.clone();
                    status
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    let status = DesktopPttBindingStatus::unsupported(
                        None,
                        true,
                        "Windows Raw Input binding response channel closed.".to_string(),
                    );
                    *self.status.lock().unwrap() = status.clone();
                    status
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            self.status.lock().unwrap().clone()
        }
    }

    pub fn current_status(&self) -> DesktopPttBindingStatus {
        self.status.lock().unwrap().clone()
    }

    pub fn shutdown(&self) {
        #[cfg(target_os = "windows")]
        if let Some(command_tx) = self.command_tx.as_ref() {
            if command_tx.send(WindowsPttCommand::Shutdown).is_ok() {
                let _ = windows::notify_command_pending();
            }
        }
    }
}

impl Drop for WindowsPttService {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(target_os = "windows")]
enum WindowsPttCommand {
    SetBinding {
        request: DesktopPttBindingRequest,
        response_tx: mpsc::Sender<DesktopPttBindingStatus>,
    },
    Shutdown,
}

#[cfg(target_os = "windows")]
mod windows {
    use super::{
        DesktopPttBindingRequest, DesktopPttBindingStatus, PttEvent, WindowsPttCommand,
    };
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, Arc, Mutex, OnceLock};
    use std::thread;
    use std::time::Duration;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::Input::{
        GetRawInputData, RegisterRawInputDevices, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER, RID_INPUT,
        RIDEV_INPUTSINK, RIM_TYPEKEYBOARD,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_ADD, VK_APPS, VK_BACK, VK_CAPITAL, VK_CONTROL, VK_DECIMAL, VK_DIVIDE,
        VK_ESCAPE, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_MENU, VK_MULTIPLY, VK_NUMLOCK,
        VK_NUMPAD0, VK_NUMPAD1, VK_NUMPAD2, VK_NUMPAD3, VK_NUMPAD4, VK_NUMPAD5, VK_NUMPAD6,
        VK_NUMPAD7, VK_NUMPAD8, VK_NUMPAD9, VK_OEM_1, VK_OEM_102, VK_OEM_2, VK_OEM_3, VK_OEM_4,
        VK_OEM_5, VK_OEM_6, VK_OEM_7, VK_OEM_COMMA, VK_OEM_MINUS, VK_OEM_PERIOD, VK_OEM_PLUS,
        VK_PAUSE, VK_RCONTROL, VK_RETURN, VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SCROLL, VK_SHIFT,
        VK_SNAPSHOT, VK_SPACE, VK_SUBTRACT, VK_TAB,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, PostMessageW,
        PostQuitMessage, RegisterClassW, TranslateMessage, CS_HREDRAW, CS_VREDRAW, HWND_MESSAGE,
        MSG, WM_APP, WM_DESTROY, WM_INPUT, WNDCLASSW,
    };

    const WINDOW_CLASS_NAME: &str = "NebulynkWindowsRawInputPttHelper";
    const WM_APP_COMMAND: u32 = WM_APP + 1;
    const WM_APP_SHUTDOWN: u32 = WM_APP + 2;

    static THREAD_STATE: OnceLock<Mutex<ThreadState>> = OnceLock::new();
    static IS_PRESSED: AtomicBool = AtomicBool::new(false);

    #[derive(Default)]
    struct ThreadState {
        hwnd: isize,
        current_binding: Option<ActiveBinding>,
        command_rx: Option<mpsc::Receiver<WindowsPttCommand>>,
        callback: Option<Arc<dyn Fn(PttEvent) + Send + Sync + 'static>>,
    }

    #[derive(Debug, Clone)]
    struct ActiveBinding {
        matcher: WindowsPttKeyMatcher,
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum WindowsPttKeyMatcher {
        VirtualKey(u16),
        ScanCode { make_code: u16, is_extended: bool },
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    struct RawKeyboardEvent {
        virtual_key: u16,
        make_code: u16,
        is_extended: bool,
        is_key_up: bool,
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum RawPttAction {
        Down,
        Up,
    }

    pub fn spawn_windows_ptt_thread(
        callback: Arc<dyn Fn(PttEvent) + Send + Sync + 'static>,
        status: Arc<Mutex<DesktopPttBindingStatus>>,
    ) -> Result<mpsc::Sender<WindowsPttCommand>, String> {
        let (command_tx, command_rx) = mpsc::channel::<WindowsPttCommand>();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

        thread::spawn(move || {
            let mut ready_tx = Some(ready_tx);
            let result = run_thread(command_rx, callback, &mut ready_tx);
            if let Err(error) = result {
                if let Some(ready_tx) = ready_tx.take() {
                    let _ = ready_tx.send(Err(error.clone()));
                }
                *status.lock().unwrap() = DesktopPttBindingStatus::unsupported(None, true, error);
            }
        });

        match ready_rx.recv() {
            Ok(Ok(())) => Ok(command_tx),
            Ok(Err(error)) => Err(error),
            Err(_) => Err("Windows Raw Input helper thread failed to report readiness.".to_string()),
        }
    }

    fn run_thread(
        command_rx: mpsc::Receiver<WindowsPttCommand>,
        callback: Arc<dyn Fn(PttEvent) + Send + Sync + 'static>,
        ready_tx: &mut Option<mpsc::Sender<Result<(), String>>>,
    ) -> Result<(), String> {
        THREAD_STATE.get_or_init(|| Mutex::new(ThreadState::default()));
        {
            let mut state = THREAD_STATE.get().unwrap().lock().map_err(|error| error.to_string())?;
            state.command_rx = Some(command_rx);
            state.callback = Some(callback);
            state.current_binding = None;
        }

        let hwnd = create_hidden_window()?;
        {
            let mut state = THREAD_STATE.get().unwrap().lock().map_err(|error| error.to_string())?;
            state.hwnd = hwnd as isize;
        }
        register_raw_input_keyboard(hwnd)?;
        if let Some(ready_tx) = ready_tx.take() {
            let _ = ready_tx.send(Ok(()));
        }

        let mut message = std::mem::MaybeUninit::<MSG>::zeroed();
        loop {
            let result = unsafe { GetMessageW(message.as_mut_ptr(), null_mut(), 0, 0) };
            if result <= 0 {
                break;
            }
            unsafe {
                TranslateMessage(message.as_ptr());
                DispatchMessageW(message.as_ptr());
            }
        }

        Ok(())
    }

    fn create_hidden_window() -> Result<HWND, String> {
        let class_name: Vec<u16> = WINDOW_CLASS_NAME.encode_utf16().chain([0]).collect();
        let instance = unsafe { GetModuleHandleW(null_mut()) };
        if instance.is_null() {
            return Err(std::io::Error::last_os_error().to_string());
        }

        let window_class = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(window_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: instance,
            hIcon: null_mut(),
            hCursor: null_mut(),
            hbrBackground: null_mut(),
            lpszMenuName: null_mut(),
            lpszClassName: class_name.as_ptr(),
        };

        let atom = unsafe { RegisterClassW(&window_class) };
        if atom == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }

        let hwnd = unsafe {
            CreateWindowExW(
                0,
                class_name.as_ptr(),
                class_name.as_ptr(),
                0,
                0,
                0,
                0,
                0,
                HWND_MESSAGE,
                null_mut(),
                instance,
                null_mut(),
            )
        };

        if hwnd.is_null() {
            return Err(std::io::Error::last_os_error().to_string());
        }

        Ok(hwnd)
    }

    fn register_raw_input_keyboard(hwnd: HWND) -> Result<(), String> {
        let device = RAWINPUTDEVICE {
            usUsagePage: 0x01,
            usUsage: 0x06,
            dwFlags: RIDEV_INPUTSINK,
            hwndTarget: hwnd,
        };
        let result = unsafe {
            RegisterRawInputDevices(
                &device,
                1,
                std::mem::size_of::<RAWINPUTDEVICE>() as u32,
            )
        };
        if result == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    }

    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        message: u32,
        _w_param: WPARAM,
        l_param: LPARAM,
    ) -> LRESULT {
        match message {
            WM_INPUT => {
                handle_raw_input(l_param as _);
                DefWindowProcW(hwnd, message, _w_param, l_param)
            }
            WM_APP_COMMAND => {
                handle_pending_commands();
                0
            }
            WM_APP_SHUTDOWN => {
                DestroyWindow(hwnd);
                0
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                0
            }
            _ => DefWindowProcW(hwnd, message, _w_param, l_param),
        }
    }

    fn handle_pending_commands() {
        let mut pending = Vec::new();
        if let Some(state_lock) = THREAD_STATE.get() {
            if let Ok(state) = state_lock.lock() {
                if let Some(command_rx) = state.command_rx.as_ref() {
                    while let Ok(command) = command_rx.try_recv() {
                        pending.push(command);
                    }
                }
            }
        }

        for command in pending {
            match command {
                WindowsPttCommand::SetBinding { request, response_tx } => {
                    let status = apply_binding_command(request);
                    let _ = response_tx.send(status);
                }
                WindowsPttCommand::Shutdown => {
                    if let Some(state_lock) = THREAD_STATE.get() {
                        if let Ok(state) = state_lock.lock() {
                            if state.hwnd != 0 {
                                unsafe {
                                    PostMessageW(state.hwnd as HWND, WM_APP_SHUTDOWN, 0, 0);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    pub(super) fn notify_command_pending() -> bool {
        let Some(state_lock) = THREAD_STATE.get() else {
            return false;
        };
        let Ok(state) = state_lock.lock() else {
            return false;
        };
        if state.hwnd == 0 {
            return false;
        }

        unsafe { PostMessageW(state.hwnd as HWND, WM_APP_COMMAND, 0, 0) != 0 }
    }

    fn apply_binding_command(request: DesktopPttBindingRequest) -> DesktopPttBindingStatus {
        let normalized_mode = match request.mode.as_deref().map(str::trim) {
            Some("ptt") => "ptt",
            Some("vad") => "vad",
            _ => "live",
        };
        let allow_pass_through = request.allow_pass_through.unwrap_or(true);

        if normalized_mode != "ptt" {
            clear_active_binding();
            return DesktopPttBindingStatus::default();
        }

        let Some(key_code) = request.key_code.as_deref().map(str::trim).filter(|value| !value.is_empty()) else {
            clear_active_binding();
            return DesktopPttBindingStatus::default();
        };

        let Some(matcher) = resolve_windows_ptt_key(key_code) else {
            clear_active_binding();
            return DesktopPttBindingStatus::unsupported(
                Some(key_code.to_string()),
                allow_pass_through,
                "This push-to-talk key does not support desktop-global binding on Windows.".to_string(),
            );
        };

        if let Some(state_lock) = THREAD_STATE.get() {
            if let Ok(mut state) = state_lock.lock() {
                state.current_binding = Some(ActiveBinding {
                    matcher,
                });
            }
        }
        IS_PRESSED.store(false, Ordering::SeqCst);

        DesktopPttBindingStatus::global_raw_input(key_code.to_string(), allow_pass_through)
    }

    fn clear_active_binding() {
        if let Some(state_lock) = THREAD_STATE.get() {
            if let Ok(mut state) = state_lock.lock() {
                state.current_binding = None;
            }
        }
        IS_PRESSED.store(false, Ordering::SeqCst);
    }

    fn handle_raw_input(raw_input_handle: windows_sys::Win32::UI::Input::HRAWINPUT) {
        let Some(event) = read_raw_keyboard_event(raw_input_handle) else {
            return;
        };

        let Some(state_lock) = THREAD_STATE.get() else {
            return;
        };
        let Ok(state) = state_lock.lock() else {
            return;
        };
        let Some(binding) = state.current_binding.as_ref() else {
            return;
        };
        let callback = state.callback.as_ref().cloned();
        let matcher = binding.matcher;
        drop(state);

        let Some(action) = resolve_raw_keyboard_action(matcher, event) else {
            return;
        };

        if let Some(callback) = callback {
            match action {
                RawPttAction::Down => {
                    callback(PttEvent::Down);
                    spawn_release_fallback(callback, matcher);
                }
                RawPttAction::Up => callback(PttEvent::Up),
            }
        }
    }

    fn read_raw_keyboard_event(
        raw_input_handle: windows_sys::Win32::UI::Input::HRAWINPUT,
    ) -> Option<RawKeyboardEvent> {
        let mut raw_input = std::mem::MaybeUninit::<RAWINPUT>::zeroed();
        let mut data_size = std::mem::size_of::<RAWINPUT>() as u32;
        let status = unsafe {
            GetRawInputData(
                raw_input_handle,
                RID_INPUT,
                raw_input.as_mut_ptr() as _,
                &mut data_size,
                std::mem::size_of::<RAWINPUTHEADER>() as u32,
            )
        };

        if status == u32::MAX || status == 0 {
            return None;
        }

        let raw_input = unsafe { raw_input.assume_init() };
        if raw_input.header.dwType != RIM_TYPEKEYBOARD {
            return None;
        }

        let keyboard = unsafe { raw_input.data.keyboard };
        Some(RawKeyboardEvent {
            virtual_key: keyboard.VKey,
            make_code: keyboard.MakeCode,
            is_extended: (keyboard.Flags as u32 & windows_sys::Win32::UI::WindowsAndMessaging::RI_KEY_E0) != 0,
            is_key_up: (keyboard.Flags as u32 & windows_sys::Win32::UI::WindowsAndMessaging::RI_KEY_BREAK) != 0,
        })
    }

    fn resolve_raw_keyboard_action(
        key_matcher: WindowsPttKeyMatcher,
        event: RawKeyboardEvent,
    ) -> Option<RawPttAction> {
        if !key_matcher.matches(event) {
            return None;
        }

        if event.is_key_up {
            if IS_PRESSED.swap(false, Ordering::SeqCst) {
                Some(RawPttAction::Up)
            } else {
                None
            }
        } else if !IS_PRESSED.swap(true, Ordering::SeqCst) {
            Some(RawPttAction::Down)
        } else {
            None
        }
    }

    fn spawn_release_fallback(
        callback: Arc<dyn Fn(PttEvent) + Send + Sync + 'static>,
        matcher: WindowsPttKeyMatcher,
    ) {
        let release_virtual_keys = matcher_release_virtual_keys(matcher);
        if release_virtual_keys.is_empty() {
            return;
        }

        thread::spawn(move || {
            for _ in 0..3_000 {
                if !IS_PRESSED.load(Ordering::SeqCst) {
                    return;
                }

                thread::sleep(Duration::from_millis(10));
                if release_virtual_keys
                    .iter()
                    .any(|virtual_key| is_virtual_key_pressed(*virtual_key))
                {
                    continue;
                }

                if IS_PRESSED
                    .compare_exchange(true, false, Ordering::SeqCst, Ordering::SeqCst)
                    .is_ok()
                {
                    callback(PttEvent::Up);
                }
                return;
            }
        });
    }

    fn matcher_release_virtual_keys(matcher: WindowsPttKeyMatcher) -> Vec<i32> {
        match matcher {
            WindowsPttKeyMatcher::VirtualKey(virtual_key) => vec![i32::from(virtual_key)],
            WindowsPttKeyMatcher::ScanCode {
                make_code: 0x2A,
                is_extended: false,
            } => vec![i32::from(VK_LSHIFT), i32::from(VK_SHIFT)],
            WindowsPttKeyMatcher::ScanCode {
                make_code: 0x36,
                is_extended: false,
            } => vec![i32::from(VK_RSHIFT), i32::from(VK_SHIFT)],
            WindowsPttKeyMatcher::ScanCode {
                make_code: 0x1D,
                is_extended: false,
            } => vec![i32::from(VK_LCONTROL), i32::from(VK_CONTROL)],
            WindowsPttKeyMatcher::ScanCode {
                make_code: 0x1D,
                is_extended: true,
            } => vec![i32::from(VK_RCONTROL), i32::from(VK_CONTROL)],
            WindowsPttKeyMatcher::ScanCode {
                make_code: 0x38,
                is_extended: false,
            } => vec![i32::from(VK_LMENU), i32::from(VK_MENU)],
            WindowsPttKeyMatcher::ScanCode {
                make_code: 0x38,
                is_extended: true,
            } => vec![i32::from(VK_RMENU), i32::from(VK_MENU)],
            _ => Vec::new(),
        }
    }

    fn is_virtual_key_pressed(virtual_key: i32) -> bool {
        unsafe { (GetAsyncKeyState(virtual_key) as u16 & 0x8000) != 0 }
    }

    impl WindowsPttKeyMatcher {
        fn matches(self, event: RawKeyboardEvent) -> bool {
            match self {
                Self::VirtualKey(virtual_key) => event.virtual_key == virtual_key,
                Self::ScanCode {
                    make_code,
                    is_extended,
                } => event.make_code == make_code && event.is_extended == is_extended,
            }
        }
    }

    fn resolve_windows_ptt_key(key_code: &str) -> Option<WindowsPttKeyMatcher> {
        let key_code = key_code.trim();
        if key_code.is_empty() {
            return None;
        }

        if let Some(suffix) = key_code.strip_prefix("Key") {
            let bytes = suffix.as_bytes();
            if bytes.len() == 1 && bytes[0].is_ascii_alphabetic() {
                return Some(WindowsPttKeyMatcher::VirtualKey(bytes[0].to_ascii_uppercase() as u16));
            }
        }

        if let Some(suffix) = key_code.strip_prefix("Digit") {
            let bytes = suffix.as_bytes();
            if bytes.len() == 1 && bytes[0].is_ascii_digit() {
                return Some(WindowsPttKeyMatcher::VirtualKey(bytes[0] as u16));
            }
        }

        if let Some(suffix) = key_code.strip_prefix('F') {
            if let Ok(number) = suffix.parse::<u16>() {
                if (1..=24).contains(&number) {
                    return Some(WindowsPttKeyMatcher::VirtualKey(0x70 + number - 1));
                }
            }
        }

        let virtual_key = match key_code {
            "Space" => Some(VK_SPACE),
            "Tab" => Some(VK_TAB),
            "Enter" => Some(VK_RETURN),
            "Escape" => Some(VK_ESCAPE),
            "Backspace" => Some(VK_BACK),
            "CapsLock" => Some(VK_CAPITAL),
            "NumLock" => Some(VK_NUMLOCK),
            "ScrollLock" => Some(VK_SCROLL),
            "PrintScreen" => Some(VK_SNAPSHOT),
            "Pause" => Some(VK_PAUSE),
            "ContextMenu" => Some(VK_APPS),
            "MetaLeft" | "OSLeft" => Some(VK_LWIN),
            "MetaRight" | "OSRight" => Some(VK_RWIN),
            "Minus" => Some(VK_OEM_MINUS),
            "Equal" => Some(VK_OEM_PLUS),
            "BracketLeft" => Some(VK_OEM_4),
            "BracketRight" => Some(VK_OEM_6),
            "Backslash" => Some(VK_OEM_5),
            "IntlBackslash" => Some(VK_OEM_102),
            "Semicolon" => Some(VK_OEM_1),
            "Quote" => Some(VK_OEM_7),
            "Backquote" => Some(VK_OEM_3),
            "Comma" => Some(VK_OEM_COMMA),
            "Period" => Some(VK_OEM_PERIOD),
            "Slash" => Some(VK_OEM_2),
            "Numpad0" => Some(VK_NUMPAD0),
            "Numpad1" => Some(VK_NUMPAD1),
            "Numpad2" => Some(VK_NUMPAD2),
            "Numpad3" => Some(VK_NUMPAD3),
            "Numpad4" => Some(VK_NUMPAD4),
            "Numpad5" => Some(VK_NUMPAD5),
            "Numpad6" => Some(VK_NUMPAD6),
            "Numpad7" => Some(VK_NUMPAD7),
            "Numpad8" => Some(VK_NUMPAD8),
            "Numpad9" => Some(VK_NUMPAD9),
            "NumpadAdd" => Some(VK_ADD),
            "NumpadSubtract" => Some(VK_SUBTRACT),
            "NumpadMultiply" => Some(VK_MULTIPLY),
            "NumpadDivide" => Some(VK_DIVIDE),
            "NumpadDecimal" => Some(VK_DECIMAL),
            _ => None,
        };

        if let Some(virtual_key) = virtual_key {
            return Some(WindowsPttKeyMatcher::VirtualKey(virtual_key));
        }

        match key_code {
            "Insert" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x52,
                is_extended: true,
            }),
            "Delete" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x53,
                is_extended: true,
            }),
            "Home" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x47,
                is_extended: true,
            }),
            "End" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x4F,
                is_extended: true,
            }),
            "PageUp" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x49,
                is_extended: true,
            }),
            "PageDown" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x51,
                is_extended: true,
            }),
            "ArrowUp" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x48,
                is_extended: true,
            }),
            "ArrowDown" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x50,
                is_extended: true,
            }),
            "ArrowLeft" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x4B,
                is_extended: true,
            }),
            "ArrowRight" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x4D,
                is_extended: true,
            }),
            "ShiftLeft" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x2A,
                is_extended: false,
            }),
            "ShiftRight" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x36,
                is_extended: false,
            }),
            "ControlLeft" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x1D,
                is_extended: false,
            }),
            "ControlRight" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x1D,
                is_extended: true,
            }),
            "AltLeft" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x38,
                is_extended: false,
            }),
            "AltRight" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x38,
                is_extended: true,
            }),
            "NumpadEnter" => Some(WindowsPttKeyMatcher::ScanCode {
                make_code: 0x1C,
                is_extended: true,
            }),
            _ => None,
        }
    }

    #[cfg(test)]
    mod tests {
        use super::{
            resolve_raw_keyboard_action, resolve_windows_ptt_key, RawKeyboardEvent, RawPttAction,
            WindowsPttKeyMatcher,
        };

        #[test]
        fn resolves_common_windows_ptt_keys() {
            assert_eq!(
                resolve_windows_ptt_key("KeyV"),
                Some(WindowsPttKeyMatcher::VirtualKey(0x56))
            );
            assert_eq!(
                resolve_windows_ptt_key("Digit7"),
                Some(WindowsPttKeyMatcher::VirtualKey(0x37))
            );
            assert_eq!(
                resolve_windows_ptt_key("Space"),
                Some(WindowsPttKeyMatcher::VirtualKey(0x20))
            );
            assert_eq!(
                resolve_windows_ptt_key("F24"),
                Some(WindowsPttKeyMatcher::VirtualKey(0x87))
            );
        }

        #[test]
        fn resolves_scan_code_modifiers() {
            assert_eq!(
                resolve_windows_ptt_key("ShiftLeft"),
                Some(WindowsPttKeyMatcher::ScanCode {
                    make_code: 0x2A,
                    is_extended: false,
                })
            );
            assert_eq!(
                resolve_windows_ptt_key("AltRight"),
                Some(WindowsPttKeyMatcher::ScanCode {
                    make_code: 0x38,
                    is_extended: true,
                })
            );
            assert_eq!(
                resolve_windows_ptt_key("ArrowDown"),
                Some(WindowsPttKeyMatcher::ScanCode {
                    make_code: 0x50,
                    is_extended: true,
                })
            );
        }

        #[test]
        fn emits_press_and_release_once() {
            let matcher = WindowsPttKeyMatcher::VirtualKey(0x20);
            let down = RawKeyboardEvent {
                virtual_key: 0x20,
                make_code: 0x39,
                is_extended: false,
                is_key_up: false,
            };
            let up = RawKeyboardEvent {
                is_key_up: true,
                ..down
            };

            assert_eq!(
                resolve_raw_keyboard_action(matcher, down),
                Some(RawPttAction::Down)
            );
            assert_eq!(resolve_raw_keyboard_action(matcher, down), None);
            assert_eq!(
                resolve_raw_keyboard_action(matcher, up),
                Some(RawPttAction::Up)
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{DesktopPttBindingStatus, WindowsPttService};
    use std::sync::Arc;

    #[test]
    fn fallback_status_is_unsupported_off_windows() {
        let service = WindowsPttService::new(Arc::new(|_| {}));
        let status: DesktopPttBindingStatus = service.current_status();
        #[cfg(not(target_os = "windows"))]
        assert_eq!(status.mode, "unsupported");
        #[cfg(target_os = "windows")]
        assert_ne!(status.platform, "linux");
    }
}
