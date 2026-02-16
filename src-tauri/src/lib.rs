use std::path::Path;
use std::sync::{Arc, Mutex};

use markdown_viewer_application::error::MarkdownViewerError;
use markdown_viewer_application::input_ports::{
    LoadMarkdownFileInputPort, OpenLinkedFileInputPort, WatchMarkdownFileInputPort,
};
use markdown_viewer_application::use_cases::{
    LoadMarkdownFileUseCase, OpenLinkedFileUseCase, WatchMarkdownFileUseCase,
};
use markdown_viewer_infrastructure::comrak_renderer::ComrakMarkdownRenderer;
use markdown_viewer_infrastructure::file_repository::{
    is_markdown_file, resolve_path_input, LocalMarkdownFileRepository,
};
use markdown_viewer_infrastructure::file_watcher::MarkdownFileWatchService;
use markdown_viewer_infrastructure::linked_file_opener::{
    DetachedLinkedFileOpener, StdPathCanonicalizer,
};
use markdown_viewer_presentation::dto::{MarkdownDocumentDto, RenderPreferencesDto};
use markdown_viewer_presentation::state::AppState;
use serde::Serialize;
use tauri::Emitter;
use tauri::{AppHandle, Manager, State};

const MARKDOWN_FILE_UPDATED_EVENT: &str = "markdown://file-updated";
const MARKDOWN_OPEN_PATH_EVENT: &str = "markdown://open-path";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct MarkdownFileUpdatedEvent {
    path: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct MarkdownOpenPathEvent {
    path: String,
}

struct LaunchOpenPathState {
    open_path: Mutex<Option<String>>,
}

impl LaunchOpenPathState {
    fn new(open_path: Option<String>) -> Self {
        Self {
            open_path: Mutex::new(open_path),
        }
    }

    fn take(&self) -> Option<String> {
        self.open_path
            .lock()
            .ok()
            .and_then(|mut guarded| guarded.take())
    }
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
fn open_linked_file(
    path: String,
    source_document_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .open_linked_file
        .execute(&path, &source_document_path)
        .map_err(to_user_error)
}

#[tauri::command]
fn consume_launch_open_path(state: State<'_, LaunchOpenPathState>) -> Option<String> {
    state.take()
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

fn first_markdown_path_from_args(args: &[String], cwd: Option<&Path>) -> Option<String> {
    for arg in args.iter().skip(1) {
        if let Some(path) = markdown_path_from_arg(arg, cwd) {
            return Some(path);
        }
    }
    None
}

#[cfg(any(target_os = "macos", target_os = "ios", test))]
fn first_markdown_path_from_urls(urls: &[tauri::Url]) -> Option<String> {
    for url in urls {
        if url.scheme() != "file" {
            continue;
        }

        let Ok(path) = url.to_file_path() else {
            continue;
        };
        let path_input = path.to_string_lossy();
        if let Some(resolved) = markdown_path_from_arg(path_input.as_ref(), None) {
            return Some(resolved);
        }
    }
    None
}

fn markdown_path_from_arg(arg: &str, cwd: Option<&Path>) -> Option<String> {
    let trimmed = arg.trim();
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return None;
    }

    if let Ok(path) = resolve_path_input(trimmed) {
        if is_markdown_file(&path) {
            return Some(path.to_string_lossy().into_owned());
        }
    }

    let cwd = cwd?;
    let joined = cwd.join(trimmed);
    let joined_string = joined.to_string_lossy().into_owned();
    if let Ok(path) = resolve_path_input(&joined_string) {
        if is_markdown_file(&path) {
            return Some(path.to_string_lossy().into_owned());
        }
    }

    None
}

fn emit_open_path_event(app_handle: &AppHandle, path: String) {
    let _ = app_handle.emit(MARKDOWN_OPEN_PATH_EVENT, MarkdownOpenPathEvent { path });
}

fn to_user_error(error: MarkdownViewerError) -> String {
    error.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_args: Vec<String> = std::env::args().collect();
    let startup_cwd = std::env::current_dir().ok();
    let startup_open_path = first_markdown_path_from_args(&startup_args, startup_cwd.as_deref());

    let repository = Arc::new(LocalMarkdownFileRepository::new());
    let renderer = Arc::new(ComrakMarkdownRenderer::new());
    let watch_service = Arc::new(MarkdownFileWatchService::new());
    let path_canonicalizer = Arc::new(StdPathCanonicalizer::new());
    let linked_file_opener = Arc::new(DetachedLinkedFileOpener::new());
    let load_use_case: Arc<dyn LoadMarkdownFileInputPort> =
        Arc::new(LoadMarkdownFileUseCase::new(repository, renderer));
    let watch_use_case: Arc<dyn WatchMarkdownFileInputPort> =
        Arc::new(WatchMarkdownFileUseCase::new(watch_service));
    let open_linked_file_use_case: Arc<dyn OpenLinkedFileInputPort> = Arc::new(
        OpenLinkedFileUseCase::new(path_canonicalizer, linked_file_opener),
    );

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Some(path) = first_markdown_path_from_args(&args, Some(Path::new(&cwd))) {
                emit_open_path_event(app, path);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
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
        .manage(LaunchOpenPathState::new(startup_open_path))
        .manage(AppState::new(
            load_use_case,
            watch_use_case,
            open_linked_file_use_case,
        ))
        .invoke_handler(tauri::generate_handler![
            pick_markdown_file,
            load_markdown_file,
            start_markdown_watch,
            stop_markdown_watch,
            open_linked_file,
            consume_launch_open_path
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = _event {
            if let Some(path) = first_markdown_path_from_urls(&urls) {
                emit_open_path_event(_app_handle, path);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::{SystemTime, UNIX_EPOCH};

    use markdown_viewer_application::input_ports::OpenLinkedFileInputPort;
    use markdown_viewer_application::ports::MarkdownWatchService;
    use markdown_viewer_application::use_cases::{
        LoadMarkdownFileUseCase, OpenLinkedFileUseCase, WatchMarkdownFileUseCase,
    };
    use markdown_viewer_infrastructure::linked_file_opener::{
        DetachedLinkedFileOpener, StdPathCanonicalizer,
    };

    use super::{
        first_markdown_path_from_args, first_markdown_path_from_urls, load_markdown_file_inner,
        markdown_path_from_arg, start_markdown_watch_inner, stop_markdown_watch_inner, AppState,
        ComrakMarkdownRenderer, LocalMarkdownFileRepository, MarkdownFileUpdatedEvent,
        MarkdownViewerError, RenderPreferencesDto, MARKDOWN_FILE_UPDATED_EVENT,
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
        let path_canonicalizer = Arc::new(StdPathCanonicalizer::new());
        let linked_file_opener = Arc::new(DetachedLinkedFileOpener::new());
        let load_use_case = Arc::new(LoadMarkdownFileUseCase::new(repository, renderer));
        let watch_use_case = Arc::new(WatchMarkdownFileUseCase::new(watch_service));
        let open_linked_file_use_case: Arc<dyn OpenLinkedFileInputPort> = Arc::new(
            OpenLinkedFileUseCase::new(path_canonicalizer, linked_file_opener),
        );
        AppState::new(load_use_case, watch_use_case, open_linked_file_use_case)
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

    fn write_temp_file(extension: &str, contents: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be monotonic after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("mdv-command-wiring-{suffix}.{extension}"));
        std::fs::write(&path, contents).expect("temp fixture should be writable");
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
    fn markdown_path_from_arg_resolves_relative_paths_from_working_directory() {
        let markdown = write_temp_markdown("# launch arg");
        let parent = markdown
            .parent()
            .expect("temp markdown should have parent directory");
        let file_name = markdown
            .file_name()
            .expect("temp markdown should have file name")
            .to_string_lossy()
            .into_owned();

        let resolved = markdown_path_from_arg(&file_name, Some(parent))
            .expect("relative markdown arg should resolve");
        assert_eq!(
            resolved,
            markdown
                .canonicalize()
                .expect("temp markdown should canonicalize")
                .to_string_lossy()
                .into_owned()
        );

        let _ = std::fs::remove_file(markdown);
    }

    #[test]
    fn first_markdown_path_from_args_uses_first_valid_markdown_candidate() {
        let text = write_temp_file("txt", "ignore");
        let markdown = write_temp_markdown("# use this");
        let args = vec![
            "markdown-viewer".to_string(),
            text.to_string_lossy().into_owned(),
            markdown.to_string_lossy().into_owned(),
        ];

        let resolved = first_markdown_path_from_args(&args, None)
            .expect("first valid markdown launch arg should resolve");
        assert_eq!(
            resolved,
            markdown
                .canonicalize()
                .expect("temp markdown should canonicalize")
                .to_string_lossy()
                .into_owned()
        );

        let _ = std::fs::remove_file(text);
        let _ = std::fs::remove_file(markdown);
    }

    #[test]
    fn first_markdown_path_from_urls_uses_first_valid_file_url_candidate() {
        let text = write_temp_file("txt", "ignore");
        let markdown = write_temp_markdown("# use this");
        let urls = vec![
            tauri::Url::parse("https://example.com/readme.md")
                .expect("test url should parse correctly"),
            tauri::Url::from_file_path(&text).expect("text file url should build"),
            tauri::Url::from_file_path(&markdown).expect("markdown file url should build"),
        ];

        let resolved = first_markdown_path_from_urls(&urls)
            .expect("first valid markdown file url should resolve");
        assert_eq!(
            resolved,
            markdown
                .canonicalize()
                .expect("temp markdown should canonicalize")
                .to_string_lossy()
                .into_owned()
        );

        let _ = std::fs::remove_file(text);
        let _ = std::fs::remove_file(markdown);
    }
}
