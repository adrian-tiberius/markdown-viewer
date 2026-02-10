use std::sync::Arc;

use crate::error::MarkdownViewerError;
use crate::ports::MarkdownWatchService;

#[derive(Clone)]
pub struct WatchMarkdownFileUseCase {
    watch_service: Arc<dyn MarkdownWatchService>,
}

impl WatchMarkdownFileUseCase {
    pub fn new(watch_service: Arc<dyn MarkdownWatchService>) -> Self {
        Self { watch_service }
    }

    pub fn start(
        &self,
        path_input: &str,
        on_changed: Arc<dyn Fn(String) + Send + Sync>,
    ) -> Result<(), MarkdownViewerError> {
        self.watch_service.start(path_input, on_changed)
    }

    pub fn stop(&self) {
        self.watch_service.stop();
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};

    use crate::error::MarkdownViewerError;
    use crate::use_cases::test_support::StubWatchService;
    use crate::use_cases::watch_markdown_file::WatchMarkdownFileUseCase;

    #[test]
    fn watch_use_case_delegates_start_and_stop() {
        let watch_service = Arc::new(StubWatchService::new(false));
        let use_case = WatchMarkdownFileUseCase::new(Arc::clone(&watch_service) as Arc<_>);
        let changed_path = Arc::new(Mutex::new(None::<String>));
        let changed_path_for_callback = Arc::clone(&changed_path);

        use_case
            .start(
                "/tmp/live.md",
                Arc::new(move |path| {
                    changed_path_for_callback
                        .lock()
                        .expect("callback state should be lockable")
                        .replace(path);
                }),
            )
            .expect("watch start should succeed");
        use_case.stop();

        assert_eq!(
            watch_service
                .started_path
                .lock()
                .expect("watch start state should be lockable")
                .as_deref(),
            Some("/tmp/live.md")
        );
        assert_eq!(
            changed_path
                .lock()
                .expect("callback state should be lockable")
                .as_deref(),
            Some("/tmp/live.md")
        );
        assert!(watch_service
            .stop_called
            .load(std::sync::atomic::Ordering::Relaxed));
    }

    #[test]
    fn watch_use_case_propagates_start_error() {
        let watch_service = Arc::new(StubWatchService::new(true));
        let use_case = WatchMarkdownFileUseCase::new(watch_service);

        let error = use_case
            .start("/tmp/fail.md", Arc::new(|_| {}))
            .expect_err("watch start should fail");

        match error {
            MarkdownViewerError::Watch { path, reason } => {
                assert_eq!(path, PathBuf::from("/tmp/fail.md"));
                assert_eq!(reason, "watch failure");
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
    }
}
