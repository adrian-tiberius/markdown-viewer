use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::error::MarkdownViewerError;
use crate::ports::{LinkedFileOpener, PathCanonicalizer};

#[derive(Clone)]
pub struct OpenLinkedFileUseCase {
    path_canonicalizer: Arc<dyn PathCanonicalizer>,
    linked_file_opener: Arc<dyn LinkedFileOpener>,
}

impl OpenLinkedFileUseCase {
    pub fn new(
        path_canonicalizer: Arc<dyn PathCanonicalizer>,
        linked_file_opener: Arc<dyn LinkedFileOpener>,
    ) -> Self {
        Self {
            path_canonicalizer,
            linked_file_opener,
        }
    }

    pub fn execute(
        &self,
        linked_path_input: &str,
        source_document_path_input: &str,
    ) -> Result<(), MarkdownViewerError> {
        let source_document_path = PathBuf::from(source_document_path_input);
        let Some(source_directory) = source_document_path.parent() else {
            return Err(MarkdownViewerError::InvalidSourceDocumentPath(
                source_document_path,
            ));
        };

        let canonical_source_directory = self.path_canonicalizer.canonicalize(source_directory)?;
        let canonical_target_path = self
            .path_canonicalizer
            .canonicalize(Path::new(linked_path_input))?;

        if !canonical_target_path.starts_with(&canonical_source_directory) {
            return Err(MarkdownViewerError::LinkedFileOutsideAllowedDirectory {
                path: canonical_target_path,
                allowed_directory: canonical_source_directory,
            });
        }

        self.linked_file_opener
            .open_detached(&canonical_target_path)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;

    use crate::error::MarkdownViewerError;
    use crate::use_cases::open_linked_file::OpenLinkedFileUseCase;
    use crate::use_cases::test_support::{
        CanonicalizeResponse, StubLinkedFileOpener, StubPathCanonicalizer,
    };

    #[test]
    fn open_linked_file_use_case_allows_targets_in_source_directory_tree() {
        let source_document_path = PathBuf::from("/workspace/docs/main.md");
        let source_directory = PathBuf::from("/workspace/docs");
        let linked_path = PathBuf::from("/workspace/docs/assets/image.svg");
        let canonical_source_directory = PathBuf::from("/canonical/workspace/docs");
        let canonical_linked_path = PathBuf::from("/canonical/workspace/docs/assets/image.svg");

        let canonicalizer = Arc::new(StubPathCanonicalizer::with_responses(vec![
            (
                source_directory.clone(),
                CanonicalizeResponse::Success(canonical_source_directory.clone()),
            ),
            (
                linked_path.clone(),
                CanonicalizeResponse::Success(canonical_linked_path.clone()),
            ),
        ]));
        let opener = Arc::new(StubLinkedFileOpener::ok());
        let use_case = OpenLinkedFileUseCase::new(canonicalizer, Arc::clone(&opener) as Arc<_>);

        use_case
            .execute(
                linked_path.to_string_lossy().as_ref(),
                source_document_path.to_string_lossy().as_ref(),
            )
            .expect("open linked file should succeed");

        let opened = opener
            .opened_paths
            .lock()
            .expect("opened path state should be lockable");
        assert_eq!(opened.as_slice(), [canonical_linked_path]);
    }

    #[test]
    fn open_linked_file_use_case_rejects_targets_outside_source_directory_tree() {
        let source_document_path = PathBuf::from("/workspace/docs/main.md");
        let source_directory = PathBuf::from("/workspace/docs");
        let linked_path = PathBuf::from("/workspace/outside/image.svg");
        let canonical_source_directory = PathBuf::from("/canonical/workspace/docs");
        let canonical_linked_path = PathBuf::from("/canonical/workspace/outside/image.svg");

        let canonicalizer = Arc::new(StubPathCanonicalizer::with_responses(vec![
            (
                source_directory.clone(),
                CanonicalizeResponse::Success(canonical_source_directory.clone()),
            ),
            (
                linked_path.clone(),
                CanonicalizeResponse::Success(canonical_linked_path.clone()),
            ),
        ]));
        let opener = Arc::new(StubLinkedFileOpener::ok());
        let use_case = OpenLinkedFileUseCase::new(canonicalizer, Arc::clone(&opener) as Arc<_>);

        let error = use_case
            .execute(
                linked_path.to_string_lossy().as_ref(),
                source_document_path.to_string_lossy().as_ref(),
            )
            .expect_err("outside linked file should be rejected");

        match error {
            MarkdownViewerError::LinkedFileOutsideAllowedDirectory {
                path,
                allowed_directory,
            } => {
                assert_eq!(path, canonical_linked_path);
                assert_eq!(allowed_directory, canonical_source_directory);
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
        let opened = opener
            .opened_paths
            .lock()
            .expect("opened path state should be lockable");
        assert!(opened.is_empty());
    }

    #[test]
    fn open_linked_file_use_case_propagates_opener_error_after_scope_validation() {
        let source_document_path = PathBuf::from("/workspace/docs/main.md");
        let source_directory = PathBuf::from("/workspace/docs");
        let linked_path = PathBuf::from("/workspace/docs/assets/image.svg");
        let canonical_source_directory = PathBuf::from("/canonical/workspace/docs");
        let canonical_linked_path = PathBuf::from("/canonical/workspace/docs/assets/image.svg");

        let canonicalizer = Arc::new(StubPathCanonicalizer::with_responses(vec![
            (
                source_directory.clone(),
                CanonicalizeResponse::Success(canonical_source_directory),
            ),
            (
                linked_path.clone(),
                CanonicalizeResponse::Success(canonical_linked_path.clone()),
            ),
        ]));
        let opener = Arc::new(StubLinkedFileOpener::fail(
            MarkdownViewerError::OpenLinkedFile {
                path: canonical_linked_path.clone(),
                reason: "launcher unavailable".to_string(),
            },
        ));
        let use_case = OpenLinkedFileUseCase::new(canonicalizer, opener);

        let error = use_case
            .execute(
                linked_path.to_string_lossy().as_ref(),
                source_document_path.to_string_lossy().as_ref(),
            )
            .expect_err("opener error should propagate");

        match error {
            MarkdownViewerError::OpenLinkedFile { path, reason } => {
                assert_eq!(path, canonical_linked_path);
                assert_eq!(reason, "launcher unavailable");
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
    }

    #[test]
    fn open_linked_file_use_case_propagates_canonicalization_error() {
        let source_document_path = PathBuf::from("/workspace/docs/main.md");
        let source_directory = PathBuf::from("/workspace/docs");
        let linked_path = PathBuf::from("/workspace/docs/assets/image.svg");

        let canonicalizer = Arc::new(StubPathCanonicalizer::with_responses(vec![(
            source_directory.clone(),
            CanonicalizeResponse::Fail(MarkdownViewerError::ResolvePath {
                path: source_directory,
                reason: "permission denied".to_string(),
            }),
        )]));
        let opener = Arc::new(StubLinkedFileOpener::ok());
        let use_case = OpenLinkedFileUseCase::new(canonicalizer, opener);

        let error = use_case
            .execute(
                linked_path.to_string_lossy().as_ref(),
                source_document_path.to_string_lossy().as_ref(),
            )
            .expect_err("canonicalization error should propagate");

        match error {
            MarkdownViewerError::ResolvePath { path, reason } => {
                assert_eq!(path, PathBuf::from("/workspace/docs"));
                assert_eq!(reason, "permission denied");
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
    }
}
