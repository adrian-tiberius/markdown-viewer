use std::path::PathBuf;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum MarkdownViewerError {
    #[error("file does not exist: {0}")]
    FileNotFound(PathBuf),
    #[error("not a markdown file: {0}")]
    NotMarkdown(PathBuf),
    #[error("failed to read file {path}: {reason}")]
    ReadFile { path: PathBuf, reason: String },
    #[error("file watcher error for {path}: {reason}")]
    Watch { path: PathBuf, reason: String },
}
