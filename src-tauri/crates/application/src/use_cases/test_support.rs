use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use markdown_viewer_domain::document::{
    RenderPreferences as DomainRenderPreferences, RenderedMarkdown,
};

use crate::error::MarkdownViewerError;
use crate::models::{RenderPreferencesInput, WordCountRulesInput};
use crate::ports::{
    LinkedFileOpener, MarkdownFileRepository, MarkdownRenderer, MarkdownWatchService,
    PathCanonicalizer,
};

pub(super) fn clone_error(error: &MarkdownViewerError) -> MarkdownViewerError {
    match error {
        MarkdownViewerError::FileNotFound(path) => MarkdownViewerError::FileNotFound(path.clone()),
        MarkdownViewerError::NotMarkdown(path) => MarkdownViewerError::NotMarkdown(path.clone()),
        MarkdownViewerError::ReadFile { path, reason } => MarkdownViewerError::ReadFile {
            path: path.clone(),
            reason: reason.clone(),
        },
        MarkdownViewerError::Watch { path, reason } => MarkdownViewerError::Watch {
            path: path.clone(),
            reason: reason.clone(),
        },
        MarkdownViewerError::InvalidSourceDocumentPath(path) => {
            MarkdownViewerError::InvalidSourceDocumentPath(path.clone())
        }
        MarkdownViewerError::ResolvePath { path, reason } => MarkdownViewerError::ResolvePath {
            path: path.clone(),
            reason: reason.clone(),
        },
        MarkdownViewerError::LinkedFileOutsideAllowedDirectory {
            path,
            allowed_directory,
        } => MarkdownViewerError::LinkedFileOutsideAllowedDirectory {
            path: path.clone(),
            allowed_directory: allowed_directory.clone(),
        },
        MarkdownViewerError::OpenLinkedFile { path, reason } => {
            MarkdownViewerError::OpenLinkedFile {
                path: path.clone(),
                reason: reason.clone(),
            }
        }
    }
}

pub(super) struct StubRepository {
    path: PathBuf,
    source: String,
    error: Option<MarkdownViewerError>,
    pub(super) last_input: Mutex<Option<String>>,
}

impl StubRepository {
    pub(super) fn ok(path: PathBuf, source: impl Into<String>) -> Self {
        Self {
            path,
            source: source.into(),
            error: None,
            last_input: Mutex::new(None),
        }
    }

    pub(super) fn fail(error: MarkdownViewerError) -> Self {
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
            return Err(clone_error(error));
        }
        Ok((self.path.clone(), self.source.clone()))
    }
}

pub(super) struct StubRenderer {
    rendered: RenderedMarkdown,
    error: Option<MarkdownViewerError>,
    pub(super) called: AtomicBool,
    pub(super) last_markdown: Mutex<Option<String>>,
    pub(super) last_preferences: Mutex<Option<DomainRenderPreferences>>,
}

impl StubRenderer {
    pub(super) fn ok(rendered: RenderedMarkdown) -> Self {
        Self {
            rendered,
            error: None,
            called: AtomicBool::new(false),
            last_markdown: Mutex::new(None),
            last_preferences: Mutex::new(None),
        }
    }

    pub(super) fn fail(error: MarkdownViewerError) -> Self {
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
            return Err(clone_error(error));
        }
        Ok(self.rendered.clone())
    }
}

pub(super) struct StubWatchService {
    should_fail: bool,
    pub(super) started_path: Mutex<Option<String>>,
    pub(super) stop_called: AtomicBool,
}

impl StubWatchService {
    pub(super) fn new(should_fail: bool) -> Self {
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

pub(super) enum CanonicalizeResponse {
    Success(PathBuf),
    Fail(MarkdownViewerError),
}

pub(super) struct StubPathCanonicalizer {
    responses: Vec<(PathBuf, CanonicalizeResponse)>,
}

impl StubPathCanonicalizer {
    pub(super) fn with_responses(responses: Vec<(PathBuf, CanonicalizeResponse)>) -> Self {
        Self { responses }
    }
}

impl PathCanonicalizer for StubPathCanonicalizer {
    fn canonicalize(&self, path: &Path) -> Result<PathBuf, MarkdownViewerError> {
        for (candidate, response) in &self.responses {
            if path == candidate {
                return match response {
                    CanonicalizeResponse::Success(mapped) => Ok(mapped.clone()),
                    CanonicalizeResponse::Fail(error) => Err(clone_error(error)),
                };
            }
        }
        Ok(path.to_path_buf())
    }
}

pub(super) struct StubLinkedFileOpener {
    pub(super) opened_paths: Mutex<Vec<PathBuf>>,
    fail_error: Option<MarkdownViewerError>,
}

impl StubLinkedFileOpener {
    pub(super) fn ok() -> Self {
        Self {
            opened_paths: Mutex::new(Vec::new()),
            fail_error: None,
        }
    }

    pub(super) fn fail(error: MarkdownViewerError) -> Self {
        Self {
            opened_paths: Mutex::new(Vec::new()),
            fail_error: Some(error),
        }
    }
}

impl LinkedFileOpener for StubLinkedFileOpener {
    fn open_detached(&self, path: &Path) -> Result<(), MarkdownViewerError> {
        self.opened_paths
            .lock()
            .expect("opened path state should be lockable")
            .push(path.to_path_buf());
        if let Some(error) = &self.fail_error {
            return Err(clone_error(error));
        }
        Ok(())
    }
}

pub(super) fn sample_preferences() -> RenderPreferencesInput {
    RenderPreferencesInput {
        performance_mode: true,
        word_count_rules: WordCountRulesInput {
            include_links: false,
            include_code: true,
            include_front_matter: true,
        },
    }
}
