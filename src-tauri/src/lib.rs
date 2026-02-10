use std::path::Path;
use std::sync::Arc;

use markdown_viewer_application::error::MarkdownViewerError;
use markdown_viewer_application::input_ports::{
    LoadMarkdownFileInputPort, WatchMarkdownFileInputPort,
};
use markdown_viewer_application::use_cases::{LoadMarkdownFileUseCase, WatchMarkdownFileUseCase};
use markdown_viewer_infrastructure::comrak_renderer::ComrakMarkdownRenderer;
use markdown_viewer_infrastructure::file_repository::LocalMarkdownFileRepository;
use markdown_viewer_infrastructure::file_watcher::MarkdownFileWatchService;
use markdown_viewer_presentation::dto::{MarkdownDocumentDto, RenderPreferencesDto};
use markdown_viewer_presentation::state::AppState;
use serde::Serialize;
use tauri::Emitter;
use tauri::{AppHandle, State};

const MARKDOWN_FILE_UPDATED_EVENT: &str = "markdown://file-updated";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct MarkdownFileUpdatedEvent {
    path: String,
}

#[tauri::command]
fn pick_markdown_file() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Open Markdown File")
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkd", "mkdn"])
        .pick_file()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn load_markdown_file(
    path: String,
    preferences: Option<RenderPreferencesDto>,
    state: State<'_, AppState>,
) -> Result<MarkdownDocumentDto, String> {
    load_markdown_file_inner(&path, preferences, state.inner())
}

#[tauri::command]
fn start_markdown_watch(
    app_handle: AppHandle,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let app_for_emit = app_handle.clone();
    start_markdown_watch_inner(
        &path,
        state.watch_markdown_file.as_ref(),
        move |event, payload| {
            let _ = app_for_emit.emit(event, payload);
        },
    )
}

#[tauri::command]
fn stop_markdown_watch(state: State<'_, AppState>) -> Result<(), String> {
    stop_markdown_watch_inner(state.watch_markdown_file.as_ref());
    Ok(())
}

#[tauri::command]
fn open_linked_file(path: String, source_document_path: String) -> Result<(), String> {
    open_linked_file_inner(&path, &source_document_path)
}

fn load_markdown_file_inner(
    path: &str,
    preferences: Option<RenderPreferencesDto>,
    state: &AppState,
) -> Result<MarkdownDocumentDto, String> {
    let doc = state
        .load_markdown_file
        .execute(
            path,
            markdown_viewer_presentation::dto::to_render_preferences(preferences),
        )
        .map_err(to_user_error)?;
    Ok(doc.into())
}

fn start_markdown_watch_inner<F>(
    path: &str,
    watch_use_case: &dyn WatchMarkdownFileInputPort,
    emit: F,
) -> Result<(), String>
where
    F: Fn(&str, MarkdownFileUpdatedEvent) + Send + Sync + 'static,
{
    let on_changed = build_watch_callback(emit);
    watch_use_case
        .start(path, on_changed)
        .map_err(to_user_error)
}

fn stop_markdown_watch_inner(watch_use_case: &dyn WatchMarkdownFileInputPort) {
    watch_use_case.stop();
}

fn open_linked_file_inner(path: &str, source_document_path: &str) -> Result<(), String> {
    open_linked_file_with(path, source_document_path, |target_path| {
        open::that_detached(target_path)
    })
}

fn open_linked_file_with<F>(
    path: &str,
    source_document_path: &str,
    open_target: F,
) -> Result<(), String>
where
    F: Fn(&Path) -> Result<(), std::io::Error>,
{
    let source_document = std::path::PathBuf::from(source_document_path);
    let source_directory = source_document.parent().ok_or_else(|| {
        format!("Unable to determine source directory for {source_document_path}")
    })?;
    let source_directory = std::fs::canonicalize(source_directory)
        .map_err(|error| format!("Unable to resolve source directory: {error}"))?;

    let target_path = std::path::PathBuf::from(path);
    let target_path = std::fs::canonicalize(&target_path)
        .map_err(|error| format!("Unable to resolve linked file path: {error}"))?;

    if !target_path.starts_with(&source_directory) {
        return Err(format!(
            "Linked file is outside allowed directory: {}",
            source_directory.display()
        ));
    }

    open_target(&target_path).map_err(|error| {
        format!(
            "Failed to open linked file {}: {error}",
            target_path.display()
        )
    })
}

fn build_watch_callback<F>(emit: F) -> Arc<dyn Fn(String) + Send + Sync>
where
    F: Fn(&str, MarkdownFileUpdatedEvent) + Send + Sync + 'static,
{
    Arc::new(move |path: String| {
        emit(
            MARKDOWN_FILE_UPDATED_EVENT,
            MarkdownFileUpdatedEvent { path },
        );
    })
}

fn to_user_error(error: MarkdownViewerError) -> String {
    error.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let repository = Arc::new(LocalMarkdownFileRepository::new());
    let renderer = Arc::new(ComrakMarkdownRenderer::new());
    let watch_service = Arc::new(MarkdownFileWatchService::new());
    let load_use_case: Arc<dyn LoadMarkdownFileInputPort> =
        Arc::new(LoadMarkdownFileUseCase::new(repository, renderer));
    let watch_use_case: Arc<dyn WatchMarkdownFileInputPort> =
        Arc::new(WatchMarkdownFileUseCase::new(watch_service));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .manage(AppState::new(load_use_case, watch_use_case))
        .invoke_handler(tauri::generate_handler![
            pick_markdown_file,
            load_markdown_file,
            start_markdown_watch,
            stop_markdown_watch,
            open_linked_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::{SystemTime, UNIX_EPOCH};

    use markdown_viewer_application::ports::MarkdownWatchService;
    use markdown_viewer_application::use_cases::{
        LoadMarkdownFileUseCase, WatchMarkdownFileUseCase,
    };

    use super::{
        load_markdown_file_inner, open_linked_file_with, start_markdown_watch_inner,
        stop_markdown_watch_inner, AppState, ComrakMarkdownRenderer, LocalMarkdownFileRepository,
        MarkdownFileUpdatedEvent, MarkdownViewerError, RenderPreferencesDto,
        MARKDOWN_FILE_UPDATED_EVENT,
    };

    struct TestWatchService {
        fail_on_start: bool,
        started_path: Mutex<Option<String>>,
        stop_called: AtomicBool,
    }

    impl TestWatchService {
        fn new(fail_on_start: bool) -> Self {
            Self {
                fail_on_start,
                started_path: Mutex::new(None),
                stop_called: AtomicBool::new(false),
            }
        }
    }

    impl MarkdownWatchService for TestWatchService {
        fn start(
            &self,
            path_input: &str,
            on_changed: Arc<dyn Fn(String) + Send + Sync>,
        ) -> Result<(), MarkdownViewerError> {
            self.started_path
                .lock()
                .expect("watch start state should be lockable")
                .replace(path_input.to_string());

            if self.fail_on_start {
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

    fn make_state_for_load() -> AppState {
        let repository = Arc::new(LocalMarkdownFileRepository::new());
        let renderer = Arc::new(ComrakMarkdownRenderer::new());
        let watch_service = Arc::new(TestWatchService::new(false));
        let load_use_case = Arc::new(LoadMarkdownFileUseCase::new(repository, renderer));
        let watch_use_case = Arc::new(WatchMarkdownFileUseCase::new(watch_service));
        AppState::new(load_use_case, watch_use_case)
    }

    fn write_temp_markdown(contents: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be monotonic after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("mdv-command-wiring-{suffix}.md"));
        std::fs::write(&path, contents).expect("temp markdown file should be writable");
        path
    }

    fn create_temp_dir(prefix: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be monotonic after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("{prefix}-{suffix}"));
        std::fs::create_dir_all(&path).expect("temp directory should be creatable");
        path
    }

    #[test]
    fn load_markdown_file_inner_returns_document_dto() {
        let state = make_state_for_load();
        let path = write_temp_markdown("# Command Test\n\nHello world");
        let path_input = path.to_string_lossy().into_owned();

        let result = load_markdown_file_inner(
            &path_input,
            Some(RenderPreferencesDto {
                performance_mode: true,
                word_count_rules: None,
            }),
            &state,
        )
        .expect("load should succeed");

        assert_eq!(result.path, path_input);
        assert_eq!(result.title, "Command Test");
        assert!(result.html.contains("<h1"));
        assert!(result.word_count >= 3);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn start_markdown_watch_inner_emits_event_with_expected_payload_shape() {
        let watch_service = Arc::new(TestWatchService::new(false));
        let watch_use_case = WatchMarkdownFileUseCase::new(Arc::clone(&watch_service) as Arc<_>);
        let emitted = Arc::new(Mutex::new(Vec::<(String, String)>::new()));
        let emitted_capture = Arc::clone(&emitted);

        start_markdown_watch_inner("/tmp/live.md", &watch_use_case, move |event, payload| {
            emitted_capture
                .lock()
                .expect("event capture should be lockable")
                .push((event.to_string(), payload.path));
        })
        .expect("watch should start");

        let emitted = emitted.lock().expect("event capture should be lockable");
        assert_eq!(emitted.len(), 1);
        assert_eq!(emitted[0].0, MARKDOWN_FILE_UPDATED_EVENT);
        assert_eq!(emitted[0].1, "/tmp/live.md");
        assert_eq!(
            watch_service
                .started_path
                .lock()
                .expect("watch start state should be lockable")
                .as_deref(),
            Some("/tmp/live.md")
        );
    }

    #[test]
    fn start_markdown_watch_inner_maps_errors_to_user_message() {
        let watch_service = Arc::new(TestWatchService::new(true));
        let watch_use_case = WatchMarkdownFileUseCase::new(watch_service);
        let emit_called = Arc::new(AtomicBool::new(false));
        let emit_called_capture = Arc::clone(&emit_called);

        let error = start_markdown_watch_inner("/tmp/fail.md", &watch_use_case, move |_, _| {
            emit_called_capture.store(true, Ordering::Relaxed);
        })
        .expect_err("watch should fail");

        assert!(error.contains("file watcher error for /tmp/fail.md: watch failure"));
        assert!(!emit_called.load(Ordering::Relaxed));
    }

    #[test]
    fn stop_markdown_watch_inner_delegates_to_watch_use_case() {
        let watch_service = Arc::new(TestWatchService::new(false));
        let watch_use_case = WatchMarkdownFileUseCase::new(Arc::clone(&watch_service) as Arc<_>);

        stop_markdown_watch_inner(&watch_use_case);

        assert!(watch_service.stop_called.load(Ordering::Relaxed));
    }

    #[test]
    fn watch_event_payload_serializes_with_camel_case_path_field() {
        let payload = MarkdownFileUpdatedEvent {
            path: "/tmp/doc.md".to_string(),
        };
        let json =
            serde_json::to_value(payload).expect("payload should serialize to a JSON object");
        assert_eq!(json["path"], "/tmp/doc.md");
    }

    #[test]
    fn open_linked_file_with_allows_targets_in_source_directory_tree() {
        let root = create_temp_dir("mdv-open-allowed");
        let source = root.join("main.md");
        let assets_dir = root.join("assets");
        let target = assets_dir.join("note.txt");
        std::fs::create_dir_all(&assets_dir).expect("assets dir should be creatable");
        std::fs::write(&source, "# Source").expect("source markdown should be writable");
        std::fs::write(&target, "linked").expect("target file should be writable");

        let opened = Arc::new(Mutex::new(Vec::<PathBuf>::new()));
        let opened_capture = Arc::clone(&opened);
        let result = open_linked_file_with(
            target.to_string_lossy().as_ref(),
            source.to_string_lossy().as_ref(),
            move |path: &Path| {
                opened_capture
                    .lock()
                    .expect("opened paths should be lockable")
                    .push(path.to_path_buf());
                Ok(())
            },
        );

        assert!(result.is_ok());
        let opened = opened.lock().expect("opened paths should be lockable");
        assert_eq!(opened.len(), 1);
        assert_eq!(
            opened[0],
            std::fs::canonicalize(target).expect("target should canonicalize")
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn open_linked_file_with_rejects_targets_outside_source_directory_tree() {
        let root = create_temp_dir("mdv-open-restricted");
        let source_dir = root.join("docs");
        let source = source_dir.join("main.md");
        let outside = root.join("outside.txt");
        std::fs::create_dir_all(&source_dir).expect("source dir should be creatable");
        std::fs::write(&source, "# Source").expect("source markdown should be writable");
        std::fs::write(&outside, "outside").expect("outside file should be writable");

        let open_called = Arc::new(AtomicBool::new(false));
        let open_called_capture = Arc::clone(&open_called);
        let result = open_linked_file_with(
            outside.to_string_lossy().as_ref(),
            source.to_string_lossy().as_ref(),
            move |_| {
                open_called_capture.store(true, Ordering::Relaxed);
                Ok(())
            },
        );

        let error = result.expect_err("outside target should be rejected");
        assert!(error.contains("outside allowed directory"));
        assert!(!open_called.load(Ordering::Relaxed));

        let _ = std::fs::remove_dir_all(root);
    }
}
