use std::sync::Arc;

use markdown_viewer_application::input_ports::{
    LoadMarkdownFileInputPort, WatchMarkdownFileInputPort,
};

pub struct AppState {
    pub load_markdown_file: Arc<dyn LoadMarkdownFileInputPort>,
    pub watch_markdown_file: Arc<dyn WatchMarkdownFileInputPort>,
}

impl AppState {
    pub fn new(
        load_markdown_file: Arc<dyn LoadMarkdownFileInputPort>,
        watch_markdown_file: Arc<dyn WatchMarkdownFileInputPort>,
    ) -> Self {
        Self {
            load_markdown_file,
            watch_markdown_file,
        }
    }
}
