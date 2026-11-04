use serde::{Deserialize, Serialize};

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

    #[cfg(target_os = "windows")]
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

#[cfg(target_os = "macos")]
pub use crate::macos_ptt::native::MacosPttService as PttService;
#[cfg(not(target_os = "macos"))]
pub use crate::windows_ptt::WindowsPttService as PttService;
