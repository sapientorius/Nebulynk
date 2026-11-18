//! macOS observes keyboard input; it never reserves or suppresses the key.
use crate::ptt::PttEvent;

pub(crate) fn key_code(code: &str) -> Option<u16> {
    Some(match code {
        "KeyA" => 0,
        "KeyS" => 1,
        "KeyD" => 2,
        "KeyF" => 3,
        "KeyH" => 4,
        "KeyG" => 5,
        "KeyZ" => 6,
        "KeyX" => 7,
        "KeyC" => 8,
        "KeyV" => 9,
        "IntlBackslash" => 10,
        "KeyB" => 11,
        "KeyQ" => 12,
        "KeyW" => 13,
        "KeyE" => 14,
        "KeyR" => 15,
        "KeyY" => 16,
        "KeyT" => 17,
        "Digit1" => 18,
        "Digit2" => 19,
        "Digit3" => 20,
        "Digit4" => 21,
        "Digit6" => 22,
        "Digit5" => 23,
        "Equal" => 24,
        "Digit9" => 25,
        "Digit7" => 26,
        "Minus" => 27,
        "Digit8" => 28,
        "Digit0" => 29,
        "BracketRight" => 30,
        "KeyO" => 31,
        "KeyU" => 32,
        "BracketLeft" => 33,
        "KeyI" => 34,
        "KeyP" => 35,
        "Enter" => 36,
        "KeyL" => 37,
        "KeyJ" => 38,
        "Quote" => 39,
        "KeyK" => 40,
        "Semicolon" => 41,
        "Backslash" => 42,
        "Comma" => 43,
        "Slash" => 44,
        "KeyN" => 45,
        "KeyM" => 46,
        "Period" => 47,
        "Tab" => 48,
        "Space" => 49,
        "Backquote" => 50,
        "Backspace" => 51,
        "Escape" => 53,
        "MetaRight" => 54,
        "MetaLeft" => 55,
        "ShiftLeft" => 56,
        "AltLeft" => 58,
        "ControlLeft" => 59,
        "ShiftRight" => 60,
        "AltRight" => 61,
        "ControlRight" => 62,
        "NumpadDecimal" => 65,
        "NumpadMultiply" => 67,
        "NumpadAdd" => 69,
        "NumLock" => 71,
        "NumpadDivide" => 75,
        "NumpadEnter" => 76,
        "NumpadSubtract" => 78,
        "NumpadEqual" => 81,
        "Numpad0" => 82,
        "Numpad1" => 83,
        "Numpad2" => 84,
        "Numpad3" => 85,
        "Numpad4" => 86,
        "Numpad5" => 87,
        "Numpad6" => 88,
        "Numpad7" => 89,
        "Numpad8" => 91,
        "Numpad9" => 92,
        "F1" => 122,
        "F2" => 120,
        "F3" => 99,
        "F4" => 118,
        "F5" => 96,
        "F6" => 97,
        "F7" => 98,
        "F8" => 100,
        "F9" => 101,
        "F10" => 109,
        "F11" => 103,
        "F12" => 111,
        "F13" => 105,
        "F14" => 107,
        "F15" => 113,
        "F16" => 106,
        "F17" => 64,
        "F18" => 79,
        "F19" => 80,
        "F20" => 90,
        "Home" => 115,
        "PageUp" => 116,
        "Delete" => 117,
        "End" => 119,
        "PageDown" => 121,
        "ArrowLeft" => 123,
        "ArrowRight" => 124,
        "ArrowDown" => 125,
        "ArrowUp" => 126,
        // Fn/Globe, media and unsupported PC keys do not have reliable hold semantics.
        _ => return None,
    })
}

#[derive(Default)]
pub(crate) struct HoldState {
    pressed: bool,
    armed: bool,
}

impl HoldState {
    pub fn reset(&mut self, physically_pressed: bool) -> Option<PttEvent> {
        let release = self.pressed.then_some(PttEvent::Up);
        self.pressed = false;
        self.armed = !physically_pressed;
        release
    }

    pub fn update(&mut self, down: bool, repeat: bool) -> Option<PttEvent> {
        if !down {
            self.armed = true;
            return if std::mem::take(&mut self.pressed) {
                Some(PttEvent::Up)
            } else {
                None
            };
        }
        if !self.armed || repeat || self.pressed {
            return None;
        }
        self.pressed = true;
        Some(PttEvent::Down)
    }
}

#[cfg(target_os = "macos")]
pub mod native;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn physical_codes_include_iso_keys_and_distinct_modifiers() {
        assert_eq!(key_code("KeyY"), Some(16));
        assert_eq!(key_code("KeyZ"), Some(6));
        assert_eq!(key_code("IntlBackslash"), Some(10));
        for (left, right) in [
            ("ShiftLeft", "ShiftRight"),
            ("ControlLeft", "ControlRight"),
            ("AltLeft", "AltRight"),
            ("MetaLeft", "MetaRight"),
        ] {
            assert_ne!(key_code(left), key_code(right));
        }
        for code in [
            "CapsLock",
            "Fn",
            "F21",
            "Insert",
            "AudioVolumeUp",
            "",
            "KeyAA",
        ] {
            assert_eq!(key_code(code), None);
        }
    }

    #[test]
    fn repeats_and_unmatched_releases_never_duplicate_events() {
        let mut hold = HoldState::default();
        hold.reset(false);
        assert_eq!(hold.update(false, false), None);
        assert_eq!(hold.update(true, false), Some(PttEvent::Down));
        assert_eq!(hold.update(true, true), None);
        assert_eq!(hold.update(true, false), None);
        assert_eq!(hold.update(false, false), Some(PttEvent::Up));
        assert_eq!(hold.update(false, false), None);
    }

    #[test]
    fn reset_releases_and_requires_a_fresh_press_after_rebinding_or_failure() {
        let mut hold = HoldState::default();
        hold.reset(false);
        assert_eq!(hold.update(true, false), Some(PttEvent::Down));
        assert_eq!(hold.reset(true), Some(PttEvent::Up));
        assert_eq!(hold.update(true, true), None);
        assert_eq!(hold.update(true, false), None);
        assert_eq!(hold.update(false, false), None);
        assert_eq!(hold.update(true, false), Some(PttEvent::Down));
        assert_eq!(hold.reset(false), Some(PttEvent::Up));
    }
}
