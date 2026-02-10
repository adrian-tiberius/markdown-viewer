use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use markdown_viewer_application::error::MarkdownViewerError;
use markdown_viewer_application::ports::MarkdownWatchService;
use notify::event::ModifyKind;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use crate::file_repository::resolve_path_input;

#[cfg(test)]
const POLL_INTERVAL_MS: u64 = 40;
#[cfg(not(test))]
const POLL_INTERVAL_MS: u64 = 1200;

pub struct MarkdownFileWatchService {
    active_watcher: Mutex<Option<ActiveWatcher>>,
}

struct ActiveWatcher {
    _watched_file: PathBuf,
    _watched_dir: PathBuf,
    _watcher: Option<RecommendedWatcher>,
    poll_stop_sender: Option<Sender<()>>,
    poll_thread: Option<JoinHandle<()>>,
}

impl MarkdownFileWatchService {
    pub fn new() -> Self {
        Self {
            active_watcher: Mutex::new(None),
        }
    }

    fn try_start_native_watcher(
        &self,
        watched_file: &Path,
        watched_dir: &Path,
        on_changed: Arc<dyn Fn(String) + Send + Sync>,
    ) -> Option<RecommendedWatcher> {
        let file_for_event = watched_file.to_path_buf();
        let callback = move |result: notify::Result<notify::Event>| {
            let Ok(event) = result else {
                return;
            };
            if !should_emit_reload(&event) {
                return;
            }
            if affects_watched_file(&event.paths, &file_for_event) {
                on_changed(file_for_event.to_string_lossy().into_owned());
            }
        };

        let mut watcher = match notify::recommended_watcher(callback) {
            Ok(watcher) => watcher,
            Err(_) => return None,
        };

        if watcher
            .watch(watched_dir, RecursiveMode::NonRecursive)
            .is_err()
        {
            return None;
        }

        Some(watcher)
    }

    fn start_poll_fallback(
        &self,
        watched_file: PathBuf,
        on_changed: Arc<dyn Fn(String) + Send + Sync>,
    ) -> (Sender<()>, JoinHandle<()>) {
        let (stop_sender, stop_receiver) = mpsc::channel::<()>();
        let file_for_thread = watched_file.clone();
        let callback_for_thread = Arc::clone(&on_changed);

        let thread = thread::spawn(move || {
            let mut last_metadata = read_metadata_signature(&file_for_thread);
            loop {
                match stop_receiver.recv_timeout(Duration::from_millis(POLL_INTERVAL_MS)) {
                    Ok(()) | Err(RecvTimeoutError::Disconnected) => break,
                    Err(RecvTimeoutError::Timeout) => {
                        let current_metadata = read_metadata_signature(&file_for_thread);
                        if current_metadata != last_metadata {
                            last_metadata = current_metadata;
                            callback_for_thread(file_for_thread.to_string_lossy().into_owned());
                        }
                    }
                }
            }
        });

        (stop_sender, thread)
    }

    fn start_poll_fallback_if_needed(
        &self,
        native_watcher_started: bool,
        watched_file: PathBuf,
        on_changed: Arc<dyn Fn(String) + Send + Sync>,
    ) -> (Option<Sender<()>>, Option<JoinHandle<()>>) {
        if native_watcher_started {
            return (None, None);
        }

        let (stop_sender, poll_thread) = self.start_poll_fallback(watched_file, on_changed);
        (Some(stop_sender), Some(poll_thread))
    }
}

impl Default for MarkdownFileWatchService {
    fn default() -> Self {
        Self::new()
    }
}

impl MarkdownWatchService for MarkdownFileWatchService {
    fn start(
        &self,
        path_input: &str,
        on_changed: Arc<dyn Fn(String) + Send + Sync>,
    ) -> Result<(), MarkdownViewerError> {
        let watched_file = resolve_path_input(path_input)?;
        let watched_dir = watched_file
            .parent()
            .ok_or_else(|| MarkdownViewerError::Watch {
                path: watched_file.clone(),
                reason: "cannot watch a file without a parent directory".to_string(),
            })?
            .to_path_buf();

        self.stop();

        let watcher =
            self.try_start_native_watcher(&watched_file, &watched_dir, Arc::clone(&on_changed));
        let (poll_stop_sender, poll_thread) =
            self.start_poll_fallback_if_needed(watcher.is_some(), watched_file.clone(), on_changed);

        let mut slot = self
            .active_watcher
            .lock()
            .map_err(|_| MarkdownViewerError::Watch {
                path: watched_file.clone(),
                reason: "internal watcher state is poisoned".to_string(),
            })?;

        *slot = Some(ActiveWatcher {
            _watched_file: watched_file,
            _watched_dir: watched_dir,
            _watcher: watcher,
            poll_stop_sender,
            poll_thread,
        });

        Ok(())
    }

    fn stop(&self) {
        let active = match self.active_watcher.lock() {
            Ok(mut slot) => slot.take(),
            Err(_) => None,
        };

        if let Some(mut active) = active {
            if let Some(stop_sender) = active.poll_stop_sender.take() {
                let _ = stop_sender.send(());
            }
            if let Some(handle) = active.poll_thread.take() {
                let _ = handle.join();
            }
        }
    }
}

impl Drop for MarkdownFileWatchService {
    fn drop(&mut self) {
        self.stop();
    }
}

fn read_metadata_signature(path: &Path) -> Option<(u64, u128)> {
    let metadata = fs::metadata(path).ok()?;
    let size = metadata.len();
    let modified = metadata.modified().ok()?;
    let modified_nanos = modified
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_nanos();

    Some((size, modified_nanos))
}

fn affects_watched_file(paths: &[PathBuf], watched_file: &Path) -> bool {
    let watched_parent = watched_file.parent();
    let watched_name = watched_file.file_name();

    paths.iter().any(|candidate| {
        if paths_equal_for_watch(candidate, watched_file) {
            return true;
        }

        match (
            candidate.parent(),
            candidate.file_name(),
            watched_parent,
            watched_name,
        ) {
            (Some(candidate_parent), Some(candidate_name), Some(parent), Some(name)) => {
                paths_equal_for_watch(candidate_parent, parent)
                    && file_names_equal_for_watch(candidate_name, name)
            }
            _ => false,
        }
    })
}

fn paths_equal_for_watch(left: &Path, right: &Path) -> bool {
    #[cfg(windows)]
    {
        case_insensitive_os_str_eq(left.as_os_str(), right.as_os_str())
    }
    #[cfg(not(windows))]
    {
        left == right
    }
}

fn file_names_equal_for_watch(left: &OsStr, right: &OsStr) -> bool {
    #[cfg(windows)]
    {
        case_insensitive_os_str_eq(left, right)
    }
    #[cfg(not(windows))]
    {
        left == right
    }
}

#[cfg(windows)]
fn case_insensitive_os_str_eq(left: &OsStr, right: &OsStr) -> bool {
    left.to_string_lossy().to_lowercase() == right.to_string_lossy().to_lowercase()
}

fn should_emit_reload(event: &notify::Event) -> bool {
    matches!(
        event.kind,
        EventKind::Create(_)
            | EventKind::Remove(_)
            | EventKind::Modify(ModifyKind::Data(_))
            | EventKind::Modify(ModifyKind::Name(_))
    )
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use notify::event::{CreateKind, DataChange, ModifyKind, RemoveKind, RenameMode};
    use notify::{Event, EventKind};

    use super::{
        affects_watched_file, read_metadata_signature, should_emit_reload, MarkdownFileWatchService,
    };

    fn temp_path(prefix: &str, extension: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be monotonic after epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("{prefix}-{suffix}.{extension}"))
    }

    #[test]
    fn affects_watched_file_matches_exact_and_same_name_in_same_directory() {
        let watched = PathBuf::from("/tmp/spec.md");
        assert!(affects_watched_file(
            &[PathBuf::from("/tmp/spec.md")],
            &watched
        ));
        assert!(affects_watched_file(&[watched.clone()], &watched));
        assert!(!affects_watched_file(
            &[PathBuf::from("/tmp/other.md")],
            &watched
        ));
        assert!(!affects_watched_file(
            &[PathBuf::from("/var/spec.md")],
            &watched
        ));
    }

    #[cfg(windows)]
    #[test]
    fn affects_watched_file_is_case_insensitive_on_windows() {
        let watched = PathBuf::from(r"C:\Docs\Spec.md");
        assert!(affects_watched_file(
            &[PathBuf::from(r"c:\docs\spec.md")],
            &watched
        ));
    }

    #[cfg(windows)]
    #[test]
    fn affects_watched_file_matches_non_ascii_name_on_windows() {
        let watched = PathBuf::from(r"C:\Docs\Café.md");
        assert!(affects_watched_file(
            &[PathBuf::from(r"c:\docs\CAFÉ.md")],
            &watched
        ));
    }

    #[cfg(not(windows))]
    #[test]
    fn affects_watched_file_is_case_sensitive_on_non_windows() {
        let watched = PathBuf::from("/tmp/Spec.md");
        assert!(!affects_watched_file(
            &[PathBuf::from("/tmp/spec.md")],
            &watched
        ));
    }

    #[test]
    fn should_emit_reload_filters_event_kinds() {
        let create_event = Event {
            kind: EventKind::Create(CreateKind::Any),
            paths: Vec::new(),
            attrs: Default::default(),
        };
        let remove_event = Event {
            kind: EventKind::Remove(RemoveKind::Any),
            paths: Vec::new(),
            attrs: Default::default(),
        };
        let data_modify_event = Event {
            kind: EventKind::Modify(ModifyKind::Data(DataChange::Any)),
            paths: Vec::new(),
            attrs: Default::default(),
        };
        let name_modify_event = Event {
            kind: EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
            paths: Vec::new(),
            attrs: Default::default(),
        };
        let ignored_event = Event {
            kind: EventKind::Any,
            paths: Vec::new(),
            attrs: Default::default(),
        };

        assert!(should_emit_reload(&create_event));
        assert!(should_emit_reload(&remove_event));
        assert!(should_emit_reload(&data_modify_event));
        assert!(should_emit_reload(&name_modify_event));
        assert!(!should_emit_reload(&ignored_event));
    }

    #[test]
    fn start_poll_fallback_if_needed_skips_polling_when_native_watcher_exists() {
        let service = MarkdownFileWatchService::new();
        let callback: Arc<dyn Fn(String) + Send + Sync> = Arc::new(|_| {});

        let (stop_sender, poll_thread) =
            service.start_poll_fallback_if_needed(true, PathBuf::from("/tmp/unused.md"), callback);

        assert!(stop_sender.is_none());
        assert!(poll_thread.is_none());
    }

    #[test]
    fn start_poll_fallback_if_needed_starts_polling_when_native_watcher_missing() {
        let service = MarkdownFileWatchService::new();
        let temp_file = temp_path("mdv-watch", "md");
        fs::write(&temp_file, "initial").expect("temp markdown should be writable");
        let callback: Arc<dyn Fn(String) + Send + Sync> = Arc::new(|_| {});

        let (stop_sender, poll_thread) =
            service.start_poll_fallback_if_needed(false, temp_file.clone(), callback);
        assert!(stop_sender.is_some());
        assert!(poll_thread.is_some());

        if let Some(sender) = stop_sender {
            let _ = sender.send(());
        }
        if let Some(thread) = poll_thread {
            let _ = thread.join();
        }

        let _ = fs::remove_file(temp_file);
    }

    #[test]
    fn metadata_signature_changes_after_file_update() {
        let temp_file = temp_path("mdv-meta", "md");
        fs::write(&temp_file, "initial").expect("temp markdown should be writable");

        let before = read_metadata_signature(&temp_file).expect("metadata should be available");
        std::thread::sleep(Duration::from_millis(50));
        fs::write(&temp_file, "updated content").expect("temp markdown should be writable");
        let after = read_metadata_signature(&temp_file).expect("metadata should be available");

        assert_ne!(before, after);
        let _ = fs::remove_file(temp_file);
    }
}
