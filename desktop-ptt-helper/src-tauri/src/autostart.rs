//! LaunchAgent only for the current user; no privileged service or shell command.
#[cfg(target_os = "macos")]
fn path() -> Result<std::path::PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or("Home directory is unavailable")?;
    Ok(std::path::PathBuf::from(home)
        .join("Library/LaunchAgents/net.nebulynk.desktop-ptt-helper.plist"))
}

#[cfg(any(target_os = "macos", test))]
fn launch_agent(executable: &str) -> String {
    let escaped = executable
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;");
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>net.nebulynk.desktop-ptt-helper</string>
<key>ProgramArguments</key><array><string>{escaped}</string></array>
<key>RunAtLoad</key><true/>
<key>ProcessType</key><string>Interactive</string>
</dict></plist>
"#
    )
}

#[cfg(target_os = "macos")]
pub fn set_enabled(enabled: bool) -> Result<(), String> {
    let path = path()?;
    if enabled {
        let executable = std::env::current_exe().map_err(|e| e.to_string())?;
        if !executable.starts_with("/Applications") {
            return Err("Move the helper to /Applications before enabling start at login.".into());
        }
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        // Atomic replacement avoids following an existing plist symlink.
        let temporary = path.with_extension("plist.tmp");
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        use std::io::Write;
        let result = file
            .write_all(launch_agent(&executable.to_string_lossy()).as_bytes())
            .and_then(|_| file.sync_all())
            .and_then(|_| std::fs::rename(&temporary, &path));
        if result.is_err() {
            let _ = std::fs::remove_file(&temporary);
        }
        result.map_err(|e| e.to_string())
    } else {
        match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(target_os = "macos")]
pub fn is_enabled() -> Result<bool, String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    match std::fs::read_to_string(path()?) {
        Ok(contents) => Ok(contents == launch_agent(&executable.to_string_lossy())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn executable_is_one_xml_escaped_argument() {
        let xml = super::launch_agent(
            "/Applications/Nebulynk & <test> 'Helper'.app/Contents/MacOS/helper",
        );
        assert!(xml.contains("Nebulynk &amp; &lt;test&gt; &apos;Helper&apos;.app"));
        assert_eq!(xml.matches("<array>").count(), 1);
        assert!(!xml.contains("KeepAlive"));
    }
}
