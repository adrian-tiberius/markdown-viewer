use std::path::{Path, PathBuf};

use markdown_viewer_application::error::MarkdownViewerError;
use markdown_viewer_application::ports::{LinkedFileOpener, PathCanonicalizer};

pub struct StdPathCanonicalizer;

impl StdPathCanonicalizer {
    pub fn new() -> Self {
        Self
    }
}

impl Default for StdPathCanonicalizer {
    fn default() -> Self {
        Self::new()
    }
}

impl PathCanonicalizer for StdPathCanonicalizer {
    fn canonicalize(&self, path: &Path) -> Result<PathBuf, MarkdownViewerError> {
        std::fs::canonicalize(path).map_err(|error| MarkdownViewerError::ResolvePath {
            path: path.to_path_buf(),
            reason: error.to_string(),
        })
    }
}

pub struct DetachedLinkedFileOpener;

impl DetachedLinkedFileOpener {
    pub fn new() -> Self {
        Self
    }
}

impl Default for DetachedLinkedFileOpener {
    fn default() -> Self {
        Self::new()
    }
}

impl LinkedFileOpener for DetachedLinkedFileOpener {
    fn open_detached(&self, path: &Path) -> Result<(), MarkdownViewerError> {
        open_detached_with(path, |target_path| open::that_detached(target_path))
    }
}

fn open_detached_with<F>(path: &Path, open_target: F) -> Result<(), MarkdownViewerError>
where
    F: Fn(&Path) -> Result<(), std::io::Error>,
{
    open_target(path).map_err(|error| MarkdownViewerError::OpenLinkedFile {
        path: path.to_path_buf(),
        reason: error.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::{SystemTime, UNIX_EPOCH};

    use markdown_viewer_application::error::MarkdownViewerError;
    use markdown_viewer_application::ports::PathCanonicalizer;

    use super::{open_detached_with, StdPathCanonicalizer};

    fn create_temp_file(prefix: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be monotonic after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("{prefix}-{suffix}.txt"));
        std::fs::write(&path, "fixture").expect("temp file should be writable");
        path
    }

    #[test]
    fn path_canonicalizer_resolves_existing_paths() {
        let file_path = create_temp_file("mdv-canonicalize");
        let canonicalizer = StdPathCanonicalizer::new();

        let canonical = canonicalizer
            .canonicalize(&file_path)
            .expect("canonicalization should succeed");

        assert_eq!(
            canonical,
            std::fs::canonicalize(&file_path).expect("std canonicalize should succeed")
        );
        let _ = std::fs::remove_file(file_path);
    }

    #[test]
    fn path_canonicalizer_maps_failures_to_resolve_path_error() {
        let canonicalizer = StdPathCanonicalizer::new();
        let missing = PathBuf::from("/tmp/does-not-exist-mdv-linked-file-opener");

        let error = canonicalizer
            .canonicalize(&missing)
            .expect_err("missing path should fail");

        match error {
            MarkdownViewerError::ResolvePath { path, reason } => {
                assert_eq!(path, missing);
                assert!(!reason.is_empty());
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
    }

    #[test]
    fn open_detached_with_invokes_target_opener() {
        let target = PathBuf::from("/tmp/target.txt");
        let opened = Arc::new(Mutex::new(Vec::<PathBuf>::new()));
        let opened_capture = Arc::clone(&opened);

        let result = open_detached_with(&target, move |path: &Path| {
            opened_capture
                .lock()
                .expect("opened path state should be lockable")
                .push(path.to_path_buf());
            Ok(())
        });

        assert!(result.is_ok());
        let opened = opened.lock().expect("opened path state should be lockable");
        assert_eq!(opened.as_slice(), [target]);
    }

    #[test]
    fn open_detached_with_maps_failures_to_open_linked_file_error() {
        let target = PathBuf::from("/tmp/target.txt");
        let called = Arc::new(AtomicBool::new(false));
        let called_capture = Arc::clone(&called);

        let error = open_detached_with(&target, move |_| {
            called_capture.store(true, Ordering::Relaxed);
            Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "permission denied",
            ))
        })
        .expect_err("open should fail");

        assert!(called.load(Ordering::Relaxed));
        match error {
            MarkdownViewerError::OpenLinkedFile { path, reason } => {
                assert_eq!(path, target);
                assert!(reason.contains("permission denied"));
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
    }
}
