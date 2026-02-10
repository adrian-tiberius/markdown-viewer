use std::sync::Arc;

use markdown_viewer_application::input_ports::{
    LoadMarkdownFileInputPort, OpenLinkedFileInputPort, WatchMarkdownFileInputPort,
};

pub struct AppState {
    pub load_markdown_file: Arc<dyn LoadMarkdownFileInputPort>,
    pub watch_markdown_file: Arc<dyn WatchMarkdownFileInputPort>,
    pub open_linked_file: Arc<dyn OpenLinkedFileInputPort>,
}

impl AppState {
    pub fn new(
        load_markdown_file: Arc<dyn LoadMarkdownFileInputPort>,
        watch_markdown_file: Arc<dyn WatchMarkdownFileInputPort>,
        open_linked_file: Arc<dyn OpenLinkedFileInputPort>,
    ) -> Self {
        Self {
            load_markdown_file,
            watch_markdown_file,
            open_linked_file,
        }
    }
}
