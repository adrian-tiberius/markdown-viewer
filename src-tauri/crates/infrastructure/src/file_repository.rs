use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use markdown_viewer_application::error::MarkdownViewerError;
use markdown_viewer_application::ports::MarkdownFileRepository;

const MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "mkdn"];

pub struct LocalMarkdownFileRepository;

impl LocalMarkdownFileRepository {
    pub fn new() -> Self {
        Self
    }
}

impl Default for LocalMarkdownFileRepository {
    fn default() -> Self {
        Self::new()
    }
}

impl MarkdownFileRepository for LocalMarkdownFileRepository {
    fn read(&self, path_input: &str) -> Result<(PathBuf, String), MarkdownViewerError> {
        let canonical_path = resolve_path_input(path_input)?;
        if !is_markdown_file(&canonical_path) {
            return Err(MarkdownViewerError::NotMarkdown(canonical_path));
        }

        let content = fs::read_to_string(&canonical_path).map_err(|source| {
            MarkdownViewerError::ReadFile {
                path: canonical_path.clone(),
                reason: source.to_string(),
            }
        })?;

        Ok((canonical_path, content))
    }
}

pub fn resolve_path_input(path_input: &str) -> Result<PathBuf, MarkdownViewerError> {
    if let Ok(uri) = url::Url::parse(path_input) {
        if uri.scheme() == "file" {
            let as_path = uri
                .to_file_path()
                .map_err(|_| MarkdownViewerError::FileNotFound(PathBuf::from(path_input)))?;
            return canonicalize_existing_path(&as_path);
        }
    }

    canonicalize_existing_path(Path::new(path_input))
}

pub fn canonicalize_existing_path(path: &Path) -> Result<PathBuf, MarkdownViewerError> {
    let canonical_path = path.canonicalize().map_err(|source| {
        if source.kind() == ErrorKind::NotFound {
            MarkdownViewerError::FileNotFound(path.to_path_buf())
        } else {
            MarkdownViewerError::ReadFile {
                path: path.to_path_buf(),
                reason: source.to_string(),
            }
        }
    })?;

    if !canonical_path.is_file() {
        return Err(MarkdownViewerError::FileNotFound(path.to_path_buf()));
    }

    Ok(canonical_path)
}

pub fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            MARKDOWN_EXTENSIONS
                .iter()
                .any(|candidate| extension.eq_ignore_ascii_case(candidate))
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use markdown_viewer_application::error::MarkdownViewerError;

    use super::{canonicalize_existing_path, is_markdown_file, resolve_path_input};

    fn temp_path(prefix: &str, extension: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be monotonic after epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("{prefix}-{suffix}.{extension}"))
    }

    #[test]
    fn markdown_extension_check_is_case_insensitive() {
        assert!(is_markdown_file(PathBuf::from("/tmp/spec.md").as_path()));
        assert!(is_markdown_file(
            PathBuf::from("/tmp/spec.MARKDOWN").as_path()
        ));
        assert!(!is_markdown_file(PathBuf::from("/tmp/spec.txt").as_path()));
    }

    #[test]
    fn resolve_path_input_supports_file_url_for_existing_files() {
        let file = temp_path("mdv-repo", "md");
        fs::write(&file, "# Test").expect("temp markdown should be writable");
        let file_url = url::Url::from_file_path(&file)
            .expect("temp path should convert to file URL")
            .to_string();

        let resolved = resolve_path_input(&file_url).expect("file URL should resolve");
        let expected = file
            .canonicalize()
            .expect("temp markdown should canonicalize");
        assert_eq!(resolved, expected);

        let _ = fs::remove_file(file);
    }

    #[test]
    fn canonicalize_existing_path_rejects_directories() {
        let dir = std::env::temp_dir();
        let error =
            canonicalize_existing_path(&dir).expect_err("directories are not valid markdown files");

        match error {
            MarkdownViewerError::FileNotFound(path) => {
                assert_eq!(path, dir);
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
    }
}
