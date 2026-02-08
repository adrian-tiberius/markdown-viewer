use std::sync::Arc;

use crate::error::MarkdownViewerError;
use crate::models::{MarkdownDocumentOutput, RenderPreferencesInput, TocEntryOutput};
use crate::ports::{MarkdownFileRepository, MarkdownRenderer, MarkdownWatchService};

#[derive(Clone)]
pub struct LoadMarkdownFileUseCase {
    repository: Arc<dyn MarkdownFileRepository>,
    renderer: Arc<dyn MarkdownRenderer>,
}

impl LoadMarkdownFileUseCase {
    pub fn new(
        repository: Arc<dyn MarkdownFileRepository>,
        renderer: Arc<dyn MarkdownRenderer>,
    ) -> Self {
        Self {
            repository,
            renderer,
        }
    }

    pub fn execute(
        &self,
        path_input: &str,
        preferences: RenderPreferencesInput,
    ) -> Result<MarkdownDocumentOutput, MarkdownViewerError> {
        let (path, source) = self.repository.read(path_input)?;
        let rendered = self.renderer.render(&source, preferences.into())?;
        let title = rendered
            .toc
            .first()
            .map(|entry| entry.text.clone())
            .unwrap_or_else(|| title_from_path(&path));

        Ok(MarkdownDocumentOutput {
            path: path.to_string_lossy().into_owned(),
            title,
            source,
            html: rendered.html,
            toc: rendered
                .toc
                .into_iter()
                .map(|entry| TocEntryOutput {
                    level: entry.level,
                    id: entry.id,
                    text: entry.text,
                })
                .collect(),
            word_count: rendered.word_count,
            reading_time_minutes: rendered.reading_time_minutes,
        })
    }
}

fn title_from_path(path: &std::path::Path) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .map(|stem| stem.replace(['_', '-'], " "))
        .unwrap_or_else(|| "Markdown".to_string())
}

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
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};

    use markdown_viewer_domain::document::{
        RenderPreferences as DomainRenderPreferences, RenderedMarkdown, TocEntry,
    };

    use crate::error::MarkdownViewerError;
    use crate::models::{RenderPreferencesInput, WordCountRulesInput};
    use crate::ports::{MarkdownFileRepository, MarkdownRenderer, MarkdownWatchService};
    use crate::use_cases::{LoadMarkdownFileUseCase, WatchMarkdownFileUseCase};

    struct StubRepository {
        path: PathBuf,
        source: String,
        error: Option<MarkdownViewerError>,
        last_input: Mutex<Option<String>>,
    }

    impl StubRepository {
        fn ok(path: PathBuf, source: impl Into<String>) -> Self {
            Self {
                path,
                source: source.into(),
                error: None,
                last_input: Mutex::new(None),
            }
        }

        fn fail(error: MarkdownViewerError) -> Self {
            Self {
                path: PathBuf::new(),
                source: String::new(),
                error: Some(error),
                last_input: Mutex::new(None),
            }
        }
    }

    impl MarkdownFileRepository for StubRepository {
        fn read(&self, path_input: &str) -> Result<(PathBuf, String), MarkdownViewerError> {
            self.last_input
                .lock()
                .expect("repository call state should be lockable")
                .replace(path_input.to_string());
            if let Some(error) = &self.error {
                return Err(match error {
                    MarkdownViewerError::FileNotFound(path) => {
                        MarkdownViewerError::FileNotFound(path.clone())
                    }
                    MarkdownViewerError::NotMarkdown(path) => {
                        MarkdownViewerError::NotMarkdown(path.clone())
                    }
                    MarkdownViewerError::ReadFile { path, reason } => {
                        MarkdownViewerError::ReadFile {
                            path: path.clone(),
                            reason: reason.clone(),
                        }
                    }
                    MarkdownViewerError::Watch { path, reason } => MarkdownViewerError::Watch {
                        path: path.clone(),
                        reason: reason.clone(),
                    },
                });
            }
            Ok((self.path.clone(), self.source.clone()))
        }
    }

    struct StubRenderer {
        rendered: RenderedMarkdown,
        error: Option<MarkdownViewerError>,
        called: AtomicBool,
        last_markdown: Mutex<Option<String>>,
        last_preferences: Mutex<Option<DomainRenderPreferences>>,
    }

    impl StubRenderer {
        fn ok(rendered: RenderedMarkdown) -> Self {
            Self {
                rendered,
                error: None,
                called: AtomicBool::new(false),
                last_markdown: Mutex::new(None),
                last_preferences: Mutex::new(None),
            }
        }

        fn fail(error: MarkdownViewerError) -> Self {
            Self {
                rendered: RenderedMarkdown {
                    html: String::new(),
                    toc: Vec::new(),
                    word_count: 0,
                    reading_time_minutes: 0,
                },
                error: Some(error),
                called: AtomicBool::new(false),
                last_markdown: Mutex::new(None),
                last_preferences: Mutex::new(None),
            }
        }
    }

    impl MarkdownRenderer for StubRenderer {
        fn render(
            &self,
            markdown: &str,
            preferences: DomainRenderPreferences,
        ) -> Result<RenderedMarkdown, MarkdownViewerError> {
            self.called.store(true, Ordering::Relaxed);
            self.last_markdown
                .lock()
                .expect("renderer markdown state should be lockable")
                .replace(markdown.to_string());
            self.last_preferences
                .lock()
                .expect("renderer preferences state should be lockable")
                .replace(preferences);
            if let Some(error) = &self.error {
                return Err(match error {
                    MarkdownViewerError::FileNotFound(path) => {
                        MarkdownViewerError::FileNotFound(path.clone())
                    }
                    MarkdownViewerError::NotMarkdown(path) => {
                        MarkdownViewerError::NotMarkdown(path.clone())
                    }
                    MarkdownViewerError::ReadFile { path, reason } => {
                        MarkdownViewerError::ReadFile {
                            path: path.clone(),
                            reason: reason.clone(),
                        }
                    }
                    MarkdownViewerError::Watch { path, reason } => MarkdownViewerError::Watch {
                        path: path.clone(),
                        reason: reason.clone(),
                    },
                });
            }
            Ok(self.rendered.clone())
        }
    }

    struct StubWatchService {
        should_fail: bool,
        started_path: Mutex<Option<String>>,
        stop_called: AtomicBool,
    }

    impl StubWatchService {
        fn new(should_fail: bool) -> Self {
            Self {
                should_fail,
                started_path: Mutex::new(None),
                stop_called: AtomicBool::new(false),
            }
        }
    }

    impl MarkdownWatchService for StubWatchService {
        fn start(
            &self,
            path_input: &str,
            on_changed: Arc<dyn Fn(String) + Send + Sync>,
        ) -> Result<(), MarkdownViewerError> {
            self.started_path
                .lock()
                .expect("watch state should be lockable")
                .replace(path_input.to_string());
            if self.should_fail {
                return Err(MarkdownViewerError::Watch {
                    path: PathBuf::from(path_input),
                    reason: "watch failure".to_string(),
                });
            }
            on_changed(path_input.to_string());
            Ok(())
        }

        fn stop(&self) {
            self.stop_called.store(true, Ordering::Relaxed);
        }
    }

    fn sample_preferences() -> RenderPreferencesInput {
        RenderPreferencesInput {
            performance_mode: true,
            word_count_rules: WordCountRulesInput {
                include_links: false,
                include_code: true,
                include_front_matter: true,
            },
        }
    }

    #[test]
    fn load_use_case_prefers_first_toc_heading_for_title() {
        let repository = Arc::new(StubRepository::ok(
            PathBuf::from("/tmp/notes.md"),
            "# intro markdown",
        ));
        let renderer = Arc::new(StubRenderer::ok(RenderedMarkdown {
            html: "<h1 id=\"mdv-overview\">Overview</h1>".to_string(),
            toc: vec![TocEntry {
                level: 1,
                id: "mdv-overview".to_string(),
                text: "Overview".to_string(),
            }],
            word_count: 3,
            reading_time_minutes: 1,
        }));
        let use_case = LoadMarkdownFileUseCase::new(repository, Arc::clone(&renderer) as Arc<_>);

        let document = use_case
            .execute("/tmp/notes.md", sample_preferences())
            .expect("load should succeed");

        assert_eq!(document.title, "Overview");
        assert_eq!(document.path, "/tmp/notes.md");
        assert_eq!(document.source, "# intro markdown");
        assert!(renderer.called.load(Ordering::Relaxed));
        assert_eq!(
            renderer
                .last_markdown
                .lock()
                .expect("renderer markdown state should be lockable")
                .as_deref(),
            Some("# intro markdown")
        );
    }

    #[test]
    fn load_use_case_uses_path_stem_when_toc_is_empty() {
        let repository = Arc::new(StubRepository::ok(
            PathBuf::from("/tmp/engineering-notes_v2.md"),
            "no headings here",
        ));
        let renderer = Arc::new(StubRenderer::ok(RenderedMarkdown {
            html: "<p>no headings</p>".to_string(),
            toc: Vec::new(),
            word_count: 2,
            reading_time_minutes: 1,
        }));
        let use_case = LoadMarkdownFileUseCase::new(repository, renderer);

        let document = use_case
            .execute("/tmp/engineering-notes_v2.md", sample_preferences())
            .expect("load should succeed");

        assert_eq!(document.title, "engineering notes v2");
    }

    #[test]
    fn load_use_case_returns_repository_error_without_calling_renderer() {
        let repo_error = MarkdownViewerError::FileNotFound(PathBuf::from("/tmp/missing.md"));
        let repository = Arc::new(StubRepository::fail(repo_error));
        let renderer = Arc::new(StubRenderer::ok(RenderedMarkdown {
            html: "<p>unused</p>".to_string(),
            toc: Vec::new(),
            word_count: 0,
            reading_time_minutes: 1,
        }));
        let use_case = LoadMarkdownFileUseCase::new(repository, Arc::clone(&renderer) as Arc<_>);

        let error = use_case
            .execute("/tmp/missing.md", RenderPreferencesInput::default())
            .expect_err("load should fail");

        match error {
            MarkdownViewerError::FileNotFound(path) => {
                assert_eq!(path, PathBuf::from("/tmp/missing.md"));
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
        assert!(!renderer.called.load(Ordering::Relaxed));
    }

    #[test]
    fn load_use_case_propagates_renderer_error() {
        let repository = Arc::new(StubRepository::ok(PathBuf::from("/tmp/ok.md"), "content"));
        let renderer_error = MarkdownViewerError::ReadFile {
            path: PathBuf::from("/tmp/ok.md"),
            reason: "render failed".to_string(),
        };
        let renderer = Arc::new(StubRenderer::fail(renderer_error));
        let use_case = LoadMarkdownFileUseCase::new(repository, renderer);

        let error = use_case
            .execute("/tmp/ok.md", RenderPreferencesInput::default())
            .expect_err("load should fail");

        match error {
            MarkdownViewerError::ReadFile { path, reason } => {
                assert_eq!(path, PathBuf::from("/tmp/ok.md"));
                assert_eq!(reason, "render failed");
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
    }

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
        assert!(watch_service.stop_called.load(Ordering::Relaxed));
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
