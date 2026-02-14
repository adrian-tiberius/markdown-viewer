use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use serde_json::Value;

fn tauri_config() -> Value {
    let config_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
    let raw = fs::read_to_string(&config_path)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", config_path.display()));
    serde_json::from_str(&raw)
        .unwrap_or_else(|error| panic!("failed to parse {}: {error}", config_path.display()))
}

#[test]
fn bundle_registers_markdown_file_association() {
    let config = tauri_config();
    let associations = config["bundle"]["fileAssociations"]
        .as_array()
        .expect("bundle.fileAssociations should be configured");

    let markdown_association = associations
        .iter()
        .find(|association| {
            association["ext"]
                .as_array()
                .is_some_and(|ext| ext.iter().any(|value| value.as_str() == Some("md")))
        })
        .expect("markdown association should include the md extension");

    let ext = markdown_association["ext"]
        .as_array()
        .expect("markdown association ext should be an array")
        .iter()
        .map(|value| value.as_str().expect("extension should be a string"))
        .collect::<BTreeSet<_>>();

    assert_eq!(
        ext,
        BTreeSet::from(["markdown", "md", "mdown", "mkd", "mkdn"])
    );
    assert_eq!(
        markdown_association["mimeType"].as_str(),
        Some("text/markdown")
    );
    assert_eq!(markdown_association["role"].as_str(), Some("Viewer"));
}
