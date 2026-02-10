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
    #[error("invalid source document path: {0}")]
    InvalidSourceDocumentPath(PathBuf),
    #[error("failed to resolve path {path}: {reason}")]
    ResolvePath { path: PathBuf, reason: String },
    #[error("linked file is outside allowed directory: {allowed_directory} (target: {path})")]
    LinkedFileOutsideAllowedDirectory {
        path: PathBuf,
        allowed_directory: PathBuf,
    },
    #[error("failed to open linked file {path}: {reason}")]
    OpenLinkedFile { path: PathBuf, reason: String },
}
