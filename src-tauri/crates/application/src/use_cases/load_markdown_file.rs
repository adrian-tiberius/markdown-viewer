use std::path::Path;
use std::sync::Arc;

use crate::error::MarkdownViewerError;
use crate::models::{MarkdownDocumentOutput, RenderPreferencesInput, TocEntryOutput};
use crate::ports::{MarkdownFileRepository, MarkdownRenderer};

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

fn title_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .map(|stem| stem.replace(['_', '-'], " "))
        .unwrap_or_else(|| "Markdown".to_string())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::atomic::Ordering;
    use std::sync::Arc;

    use markdown_viewer_domain::document::{RenderedMarkdown, TocEntry};

    use crate::error::MarkdownViewerError;
    use crate::models::RenderPreferencesInput;
    use crate::use_cases::load_markdown_file::LoadMarkdownFileUseCase;
    use crate::use_cases::test_support::{sample_preferences, StubRenderer, StubRepository};

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
}
