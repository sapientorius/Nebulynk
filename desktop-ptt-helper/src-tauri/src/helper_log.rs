//! Bounded local diagnostics. Never call this with keyboard events, keys or client payloads.
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const FILE_LIMIT: u64 = 1024 * 1024;
const RECORD_LIMIT: usize = 4096;
const FILES: [&str; 3] = ["helper.log", "helper.log.1", "helper.log.2"];
static LOGGER: OnceLock<BoundedLogger> = OnceLock::new();

pub fn initialize(directory: PathBuf) {
    let legacy = std::env::temp_dir()
        .join("NebulynkPttHelper")
        .join("helper.log");
    let _ = LOGGER.set(BoundedLogger::new(directory, &legacy));
}

pub fn log(message: &str) {
    if let Some(logger) = LOGGER.get() {
        logger.append(message);
    }
}

struct BoundedLogger {
    // None permanently disables this logger after any I/O error, without affecting PTT.
    directory: Mutex<Option<PathBuf>>,
}

fn regular_file_size(path: &Path) -> io::Result<Option<u64>> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_file() => Ok(Some(meta.len())),
        Ok(_) => Err(io::Error::other("Log path is not a regular file")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn prepare(directory: &Path, legacy: &Path) -> io::Result<()> {
    // Do not traverse a replacement of our old temporary directory.
    if let Some(parent) = legacy.parent() {
        match fs::symlink_metadata(parent) {
            Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => {
                if regular_file_size(legacy)?.is_some() {
                    fs::remove_file(legacy)?;
                }
            }
            Ok(_) => return Err(io::Error::other("Unsafe legacy log directory")),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    fs::create_dir_all(directory)?;
    let meta = fs::symlink_metadata(directory)?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err(io::Error::other("Unsafe log directory"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(directory, fs::Permissions::from_mode(0o700))?;
    }
    for name in FILES {
        let path = directory.join(name);
        if let Some(size) = regular_file_size(&path)? {
            if size > FILE_LIMIT {
                fs::remove_file(&path)?;
            } else {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
                }
            }
        }
    }
    Ok(())
}

fn record(message: &str) -> Vec<u8> {
    let prefix = format!("[{}] ", chrono::Utc::now().to_rfc3339());
    let mut line = prefix;
    for character in message.chars() {
        let character = if character.is_control() {
            ' '
        } else {
            character
        };
        if line.len() + character.len_utf8() + 1 > RECORD_LIMIT {
            break;
        }
        line.push(character);
    }
    line.push('\n');
    line.into_bytes()
}

impl BoundedLogger {
    fn new(directory: PathBuf, legacy: &Path) -> Self {
        let ready = prepare(&directory, legacy).is_ok();
        Self {
            directory: Mutex::new(ready.then_some(directory)),
        }
    }

    fn append(&self, message: &str) {
        let Ok(mut state) = self.directory.lock() else {
            return;
        };
        let Some(directory) = state.as_ref() else {
            return;
        };
        if Self::write(directory, &record(message)).is_err() {
            *state = None;
        }
    }

    fn write(directory: &Path, line: &[u8]) -> io::Result<()> {
        let path = directory.join(FILES[0]);
        let size = regular_file_size(&path)?.unwrap_or(0);
        if size + line.len() as u64 > FILE_LIMIT {
            let older = directory.join(FILES[2]);
            if regular_file_size(&older)?.is_some() {
                fs::remove_file(&older)?;
            }
            let previous = directory.join(FILES[1]);
            if regular_file_size(&previous)?.is_some() {
                fs::rename(previous, older)?;
            }
            if size > 0 {
                fs::rename(&path, directory.join(FILES[1]))?;
            }
        }
        let mut options = OpenOptions::new();
        options.create(true).append(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        options.open(path)?.write_all(line)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("nebulynk-log-test-{}", cuid2::create_id()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn logger(&self) -> BoundedLogger {
            BoundedLogger::new(self.0.join("logs"), &self.0.join("legacy/helper.log"))
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn rotation_happens_before_the_next_record_exceeds_limit() {
        let fixture = Fixture::new();
        let logger = fixture.logger();
        let dir = fixture.0.join("logs");
        fs::write(dir.join(FILES[0]), vec![b'x'; FILE_LIMIT as usize - 1]).unwrap();
        logger.append("next");
        assert_eq!(
            fs::metadata(dir.join(FILES[1])).unwrap().len(),
            FILE_LIMIT - 1
        );
        assert!(fs::read_to_string(dir.join(FILES[0]))
            .unwrap()
            .contains("next"));
    }

    #[test]
    fn concurrent_long_running_output_stays_bounded() {
        let fixture = Fixture::new();
        let logger = Arc::new(fixture.logger());
        let threads: Vec<_> = (0..8)
            .map(|_| {
                let logger = logger.clone();
                std::thread::spawn(move || {
                    for _ in 0..300 {
                        logger.append(&"diagnostic ".repeat(1000));
                    }
                })
            })
            .collect();
        for thread in threads {
            thread.join().unwrap();
        }
        let mut total = 0;
        for name in FILES {
            let bytes = fs::read(fixture.0.join("logs").join(name)).unwrap();
            assert!(bytes.len() as u64 <= FILE_LIMIT);
            for line in bytes.split_inclusive(|b| *b == b'\n') {
                assert!(line.len() <= RECORD_LIMIT);
            }
            total += bytes.len() as u64;
        }
        assert!(total <= 3 * FILE_LIMIT);
    }

    #[test]
    fn removes_only_known_oversized_and_legacy_files() {
        let fixture = Fixture::new();
        fs::create_dir(fixture.0.join("legacy")).unwrap();
        let legacy = fixture.0.join("legacy/helper.log");
        fs::write(&legacy, vec![b'x'; FILE_LIMIT as usize + 1]).unwrap();
        let logger = fixture.logger();
        assert!(!legacy.exists());
        let directory = fixture.0.join("logs");
        for name in FILES {
            fs::write(directory.join(name), vec![b'x'; FILE_LIMIT as usize + 1]).unwrap();
        }
        fs::write(directory.join("unrelated.txt"), "keep").unwrap();
        drop(logger);
        let logger = fixture.logger();
        logger.append("ready");
        assert_eq!(
            fs::read_to_string(directory.join("unrelated.txt")).unwrap(),
            "keep"
        );
        assert!(!directory.join(FILES[1]).exists());
        assert!(!directory.join(FILES[2]).exists());
    }

    #[test]
    fn write_and_rotation_errors_disable_further_output() {
        for fail_rotation in [false, true] {
            let fixture = Fixture::new();
            let logger = fixture.logger();
            let dir = fixture.0.join("logs");
            let obstruction = dir.join(if fail_rotation { FILES[2] } else { FILES[0] });
            if fail_rotation {
                fs::write(dir.join(FILES[0]), vec![b'x'; FILE_LIMIT as usize]).unwrap();
            }
            fs::create_dir(&obstruction).unwrap();
            logger.append("fails");
            assert!(logger.directory.lock().unwrap().is_none());
            fs::remove_dir(obstruction).unwrap();
            logger.append("must stay disabled");
            assert!(logger.directory.lock().unwrap().is_none());
        }
    }

    #[test]
    fn records_are_utf8_bounded_and_cannot_inject_lines() {
        let line = record(&"🦀\n\r\t".repeat(2000));
        assert!(line.len() <= RECORD_LIMIT);
        let line = String::from_utf8(line).unwrap();
        assert_eq!(line.matches('\n').count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn log_permissions_are_private() {
        use std::os::unix::fs::PermissionsExt;
        let fixture = Fixture::new();
        let logger = fixture.logger();
        logger.append("ready");
        assert_eq!(
            fs::metadata(fixture.0.join("logs"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(fixture.0.join("logs/helper.log"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}
