use std::path::PathBuf;
use std::sync::Arc;

use markdown_viewer_domain::document::{RenderPreferences, RenderedMarkdown};

use crate::error::MarkdownViewerError;

pub trait MarkdownFileRepository: Send + Sync {
    fn read(&self, path_input: &str) -> Result<(PathBuf, String), MarkdownViewerError>;
}

pub trait MarkdownRenderer: Send + Sync {
    fn render(
        &self,
        markdown: &str,
        preferences: RenderPreferences,
    ) -> Result<RenderedMarkdown, MarkdownViewerError>;
}

pub trait MarkdownWatchService: Send + Sync {
    fn start(
        &self,
        path_input: &str,
        on_changed: Arc<dyn Fn(String) + Send + Sync>,
    ) -> Result<(), MarkdownViewerError>;

    fn stop(&self);
}
