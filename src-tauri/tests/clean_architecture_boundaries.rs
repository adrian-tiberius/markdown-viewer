use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use regex::Regex;
use toml::Value;

const DEPENDENCY_SECTIONS: [&str; 3] = ["dependencies", "dev-dependencies", "build-dependencies"];

fn manifest(path: &str) -> Value {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let manifest_path = root.join(path);
    let manifest = fs::read_to_string(&manifest_path).unwrap_or_else(|error| {
        panic!(
            "failed to read manifest {}: {error}",
            manifest_path.display()
        )
    });

    manifest.parse::<Value>().unwrap_or_else(|error| {
        panic!(
            "failed to parse manifest {}: {error}",
            manifest_path.display()
        )
    })
}

fn dependency_names(manifest: &Value) -> BTreeSet<String> {
    let mut dependencies = BTreeSet::new();

    let Some(manifest_table) = manifest.as_table() else {
        return dependencies;
    };

    extend_dependency_names_from_sections(manifest_table, &mut dependencies);

    if let Some(target_table) = manifest_table.get("target").and_then(Value::as_table) {
        for target_config in target_table.values() {
            if let Some(target_config_table) = target_config.as_table() {
                extend_dependency_names_from_sections(target_config_table, &mut dependencies);
            }
        }
    }

    dependencies
}

fn extend_dependency_names_from_sections(
    table: &toml::map::Map<String, Value>,
    out: &mut BTreeSet<String>,
) {
    for section in DEPENDENCY_SECTIONS {
        if let Some(dependencies_table) = table.get(section).and_then(Value::as_table) {
            for (dependency_key, dependency_value) in dependencies_table {
                out.insert(dependency_name(dependency_key, dependency_value));
            }
        }
    }
}

fn dependency_name(dependency_key: &str, dependency_value: &Value) -> String {
    dependency_value
        .as_table()
        .and_then(|dependency_table| dependency_table.get("package"))
        .and_then(Value::as_str)
        .unwrap_or(dependency_key)
        .to_string()
}

fn local_markdown_dependencies(manifest: &Value) -> BTreeSet<String> {
    dependency_names(manifest)
        .into_iter()
        .filter(|name| name.starts_with("markdown_viewer_"))
        .collect()
}

fn assert_forbidden_dependencies_absent(
    crate_name: &str,
    manifest: &Value,
    forbidden_dependencies: &[&str],
) {
    let dependencies = dependency_names(manifest);
    for forbidden in forbidden_dependencies {
        assert!(
            !dependencies.contains(*forbidden),
            "{crate_name} should not depend on `{forbidden}`"
        );
    }
}

fn collect_rust_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut stack = vec![root.to_path_buf()];

    while let Some(path) = stack.pop() {
        let entries = fs::read_dir(&path)
            .unwrap_or_else(|error| panic!("failed to read directory {}: {error}", path.display()));

        for entry in entries {
            let entry = entry.expect("directory entry should be readable");
            let entry_path = entry.path();
            let file_type = entry
                .file_type()
                .expect("directory entry file type should be readable");
            if file_type.is_dir() {
                stack.push(entry_path);
            } else if entry_path.extension().and_then(|ext| ext.to_str()) == Some("rs") {
                files.push(entry_path);
            }
        }
    }

    files.sort();
    files
}

fn assert_forbidden_import_patterns_absent(
    layer_name: &str,
    source_root: &str,
    forbidden_patterns: &[&str],
) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join(source_root);
    let rust_files = collect_rust_files(&root);
    assert!(
        !rust_files.is_empty(),
        "{layer_name} should contain Rust source files under {}",
        root.display()
    );

    let compiled_patterns: Vec<(String, Regex)> = forbidden_patterns
        .iter()
        .map(|pattern| {
            let regex = Regex::new(pattern).unwrap_or_else(|error| {
                panic!("invalid forbidden import regex `{pattern}`: {error}")
            });
            ((*pattern).to_string(), regex)
        })
        .collect();

    for file in rust_files {
        let source = fs::read_to_string(&file)
            .unwrap_or_else(|error| panic!("failed to read source {}: {error}", file.display()));
        for (pattern, regex) in &compiled_patterns {
            assert!(
                !regex.is_match(&source),
                "{layer_name} should not import pattern `{pattern}` (found in {})",
                file.display()
            );
        }
    }
}

#[test]
fn crate_dependency_graph_follows_clean_architecture() {
    let domain_manifest = manifest("crates/domain/Cargo.toml");
    let application_manifest = manifest("crates/application/Cargo.toml");
    let presentation_manifest = manifest("crates/presentation/Cargo.toml");
    let infrastructure_manifest = manifest("crates/infrastructure/Cargo.toml");
    let app_manifest = manifest("Cargo.toml");

    assert_eq!(
        local_markdown_dependencies(&domain_manifest),
        BTreeSet::new(),
        "domain should not depend on any local markdown_viewer crates"
    );
    assert_eq!(
        local_markdown_dependencies(&application_manifest),
        BTreeSet::from([String::from("markdown_viewer_domain")]),
        "application should only depend on domain"
    );
    assert_eq!(
        local_markdown_dependencies(&presentation_manifest),
        BTreeSet::from([String::from("markdown_viewer_application")]),
        "presentation should only depend on application"
    );
    assert_eq!(
        local_markdown_dependencies(&infrastructure_manifest),
        BTreeSet::from([
            String::from("markdown_viewer_application"),
            String::from("markdown_viewer_domain"),
        ]),
        "infrastructure should only depend on application and domain"
    );
    assert_eq!(
        local_markdown_dependencies(&app_manifest),
        BTreeSet::from([
            String::from("markdown_viewer_application"),
            String::from("markdown_viewer_infrastructure"),
            String::from("markdown_viewer_presentation"),
        ]),
        "app should wire application, infrastructure, and presentation"
    );
}

#[test]
fn inner_layers_do_not_depend_on_framework_crates() {
    let domain_manifest = manifest("crates/domain/Cargo.toml");
    let application_manifest = manifest("crates/application/Cargo.toml");
    let presentation_manifest = manifest("crates/presentation/Cargo.toml");

    let forbidden_dependencies = ["tauri", "rfd", "notify", "comrak"];
    assert_forbidden_dependencies_absent("domain", &domain_manifest, &forbidden_dependencies);
    assert_forbidden_dependencies_absent(
        "application",
        &application_manifest,
        &forbidden_dependencies,
    );
    assert_forbidden_dependencies_absent(
        "presentation",
        &presentation_manifest,
        &forbidden_dependencies,
    );
}

#[test]
fn inner_layers_do_not_import_framework_modules() {
    let forbidden_import_patterns = [
        r"\btauri\s*::",
        r"\brfd\s*::",
        r"\bnotify\s*::",
        r"\bcomrak\s*::",
    ];

    assert_forbidden_import_patterns_absent(
        "domain",
        "crates/domain/src",
        &forbidden_import_patterns,
    );
    assert_forbidden_import_patterns_absent(
        "application",
        "crates/application/src",
        &forbidden_import_patterns,
    );
    assert_forbidden_import_patterns_absent(
        "presentation",
        "crates/presentation/src",
        &forbidden_import_patterns,
    );
}

#[test]
fn inner_core_layers_do_not_import_io_or_runtime_modules() {
    let forbidden_import_patterns = [
        r"\bstd\s*::\s*fs\b",
        r"\bstd\s*::\s*io\b",
        r"\bstd\s*::\s*net\b",
        r"\bstd\s*::\s*thread\b",
        r"\bstd\s*::\s*\{[^}]*\bfs\b",
        r"\bstd\s*::\s*\{[^}]*\bio\b",
        r"\bstd\s*::\s*\{[^}]*\bnet\b",
        r"\bstd\s*::\s*\{[^}]*\bthread\b",
        r"\btokio\s*::\s*fs\b",
        r"\btokio\s*::\s*io\b",
        r"\btokio\s*::\s*net\b",
        r"\btokio\s*::\s*task\b",
        r"\btokio\s*::\s*\{[^}]*\bfs\b",
        r"\btokio\s*::\s*\{[^}]*\bio\b",
        r"\btokio\s*::\s*\{[^}]*\bnet\b",
        r"\btokio\s*::\s*\{[^}]*\btask\b",
    ];

    assert_forbidden_import_patterns_absent(
        "domain",
        "crates/domain/src",
        &forbidden_import_patterns,
    );
    assert_forbidden_import_patterns_absent(
        "application",
        "crates/application/src",
        &forbidden_import_patterns,
    );
}
