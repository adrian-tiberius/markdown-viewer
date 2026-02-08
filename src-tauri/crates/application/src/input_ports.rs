use std::sync::Arc;

use crate::error::MarkdownViewerError;
use crate::models::{MarkdownDocumentOutput, RenderPreferencesInput};
use crate::use_cases::{LoadMarkdownFileUseCase, WatchMarkdownFileUseCase};

pub trait LoadMarkdownFileInputPort: Send + Sync {
    fn execute(
        &self,
        path_input: &str,
        preferences: RenderPreferencesInput,
    ) -> Result<MarkdownDocumentOutput, MarkdownViewerError>;
}

impl LoadMarkdownFileInputPort for LoadMarkdownFileUseCase {
    fn execute(
        &self,
        path_input: &str,
        preferences: RenderPreferencesInput,
    ) -> Result<MarkdownDocumentOutput, MarkdownViewerError> {
        LoadMarkdownFileUseCase::execute(self, path_input, preferences)
    }
}

pub trait WatchMarkdownFileInputPort: Send + Sync {
    fn start(
        &self,
        path_input: &str,
        on_changed: Arc<dyn Fn(String) + Send + Sync>,
    ) -> Result<(), MarkdownViewerError>;

    fn stop(&self);
}

impl WatchMarkdownFileInputPort for WatchMarkdownFileUseCase {
    fn start(
        &self,
        path_input: &str,
        on_changed: Arc<dyn Fn(String) + Send + Sync>,
    ) -> Result<(), MarkdownViewerError> {
        WatchMarkdownFileUseCase::start(self, path_input, on_changed)
    }

    fn stop(&self) {
        WatchMarkdownFileUseCase::stop(self);
    }
}
