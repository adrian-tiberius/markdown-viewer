use std::fs;
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use markdown_viewer_application::use_cases::WatchMarkdownFileUseCase;
use markdown_viewer_infrastructure::file_watcher::MarkdownFileWatchService;

fn temp_markdown_path() -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock should be monotonic after epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("mdv-watch-flow-{suffix}.md"))
}

struct WatchScopeGuard<'a> {
    use_case: &'a WatchMarkdownFileUseCase,
}

impl Drop for WatchScopeGuard<'_> {
    fn drop(&mut self) {
        self.use_case.stop();
    }
}

fn wait_for_expected_event(
    rx: &mpsc::Receiver<String>,
    expected_path: &str,
    timeout: Duration,
) -> Result<(), String> {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        let now = std::time::Instant::now();
        if now >= deadline {
            return Err(format!(
                "timed out waiting for watcher event for path `{expected_path}`"
            ));
        }

        let remaining = deadline.saturating_duration_since(now);
        match rx.recv_timeout(remaining) {
            Ok(changed) if changed == expected_path => return Ok(()),
            Ok(_) => continue,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                return Err(format!(
                    "timed out waiting for watcher event for path `{expected_path}`"
                ))
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err("watcher channel disconnected unexpectedly".to_string())
            }
        }
    }
}

#[test]
fn watch_use_case_emits_event_when_file_changes_on_disk() {
    let path = temp_markdown_path();
    fs::write(&path, "# Initial\n").expect("temp markdown should be writable");

    let watch_service = Arc::new(MarkdownFileWatchService::new());
    let use_case = WatchMarkdownFileUseCase::new(watch_service);
    let (tx, rx) = mpsc::channel::<String>();
    let callback = Arc::new(move |changed_path: String| {
        let _ = tx.send(changed_path);
    });

    use_case
        .start(
            path.to_str().expect("temp markdown path should be utf-8"),
            callback,
        )
        .expect("watch should start");
    let _guard = WatchScopeGuard {
        use_case: &use_case,
    };

    // Allow watcher registration to settle, then clear any startup noise.
    thread::sleep(Duration::from_millis(120));
    while rx.try_recv().is_ok() {}

    let expected = path
        .canonicalize()
        .expect("temp markdown should canonicalize")
        .to_string_lossy()
        .into_owned();

    thread::sleep(Duration::from_millis(60));
    fs::write(&path, "# Updated once\n").expect("temp markdown update should be writable");
    wait_for_expected_event(&rx, &expected, Duration::from_secs(5))
        .expect("watch callback should fire after first file update");

    while rx.try_recv().is_ok() {}

    thread::sleep(Duration::from_millis(60));
    fs::write(&path, "# Updated twice\n").expect("temp markdown update should be writable");
    wait_for_expected_event(&rx, &expected, Duration::from_secs(5))
        .expect("watch callback should fire after second file update");

    let _ = fs::remove_file(path);
}
