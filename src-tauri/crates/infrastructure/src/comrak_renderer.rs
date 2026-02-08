use std::cmp::max;

use comrak::nodes::{AstNode, NodeValue};
use comrak::{markdown_to_html, parse_document, Anchorizer, Arena, Options};
use markdown_viewer_application::error::MarkdownViewerError;
use markdown_viewer_application::ports::MarkdownRenderer;
use markdown_viewer_domain::document::{
    RenderPreferences, RenderedMarkdown, TocEntry, WordCountRules,
};

const HEADING_ID_PREFIX: &str = "mdv-";
const WORDS_PER_MINUTE: usize = 225;

pub struct ComrakMarkdownRenderer;

impl ComrakMarkdownRenderer {
    pub fn new() -> Self {
        Self
    }
}

impl Default for ComrakMarkdownRenderer {
    fn default() -> Self {
        Self::new()
    }
}

impl MarkdownRenderer for ComrakMarkdownRenderer {
    fn render(
        &self,
        markdown: &str,
        preferences: RenderPreferences,
    ) -> Result<RenderedMarkdown, MarkdownViewerError> {
        let options = markdown_options(preferences);
        let html = markdown_to_html(markdown, &options);

        let arena = Arena::new();
        let root = parse_document(&arena, markdown, &options);
        let toc = build_toc(root);
        let word_count = count_words(root, preferences.word_count_rules);
        let reading_time_minutes = max(1, word_count.div_ceil(WORDS_PER_MINUTE) as u16);

        Ok(RenderedMarkdown {
            html,
            toc,
            word_count,
            reading_time_minutes,
        })
    }
}

fn markdown_options(preferences: RenderPreferences) -> Options<'static> {
    let mut options = Options::default();

    options.extension.strikethrough = true;
    options.extension.tagfilter = true;
    options.extension.table = true;
    options.extension.autolink = true;
    options.extension.tasklist = true;
    options.extension.superscript = true;
    options.extension.header_ids = Some(HEADING_ID_PREFIX.to_string());
    options.extension.footnotes = true;
    options.extension.inline_footnotes = true;
    options.extension.description_lists = true;
    options.extension.front_matter_delimiter = Some("---".to_string());
    options.extension.multiline_block_quotes = true;
    options.extension.alerts = true;
    options.extension.math_dollars = true;
    options.extension.math_code = true;
    options.extension.underline = true;
    options.extension.subscript = true;
    options.extension.spoiler = true;

    // Performance mode keeps syntax support but turns off smart punctuation transforms.
    options.parse.smart = !preferences.performance_mode;
    options.render.escape = true;
    options.render.r#unsafe = false;

    options
}

fn build_toc<'a>(root: &'a AstNode<'a>) -> Vec<TocEntry> {
    let mut anchorizer = Anchorizer::new();
    let mut toc = Vec::new();

    for node in root.descendants() {
        let level = {
            let data = node.data.borrow();
            match &data.value {
                NodeValue::Heading(heading) => heading.level,
                _ => continue,
            }
        };

        let text = heading_text(node);
        if text.is_empty() {
            continue;
        }

        let id = format!("{}{}", HEADING_ID_PREFIX, anchorizer.anchorize(&text));
        toc.push(TocEntry { level, id, text });
    }

    toc
}

fn heading_text<'a>(node: &'a AstNode<'a>) -> String {
    let mut text = String::new();

    for descendant in node.descendants().skip(1) {
        match &descendant.data.borrow().value {
            NodeValue::Text(value) => {
                text.push_str(value);
                text.push(' ');
            }
            NodeValue::Code(code) => {
                text.push_str(&code.literal);
                text.push(' ');
            }
            NodeValue::Math(math) => {
                text.push_str(&math.literal);
                text.push(' ');
            }
            NodeValue::LineBreak | NodeValue::SoftBreak => {
                text.push(' ');
            }
            _ => {}
        }
    }

    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn count_words<'a>(root: &'a AstNode<'a>, rules: WordCountRules) -> usize {
    let mut count = 0_usize;

    for node in root.descendants() {
        let data = node.data.borrow();
        match &data.value {
            NodeValue::Text(value) => {
                if !rules.include_links && has_link_ancestor(node) {
                    continue;
                }
                count += word_len(value);
            }
            NodeValue::Code(code) if rules.include_code => {
                if !rules.include_links && has_link_ancestor(node) {
                    continue;
                }
                count += word_len(&code.literal);
            }
            NodeValue::CodeBlock(code_block) if rules.include_code => {
                count += word_len(&code_block.literal);
            }
            NodeValue::Math(math) if rules.include_code => {
                count += word_len(&math.literal);
            }
            NodeValue::FrontMatter(front_matter) if rules.include_front_matter => {
                count += word_len(front_matter);
            }
            _ => {}
        }
    }

    count
}

fn has_link_ancestor<'a>(node: &'a AstNode<'a>) -> bool {
    node.ancestors().skip(1).any(|ancestor| {
        let data = ancestor.data.borrow();
        matches!(data.value, NodeValue::Link(..) | NodeValue::Image(..))
    })
}

fn word_len(content: &str) -> usize {
    content.split_whitespace().count()
}

#[cfg(test)]
mod tests {
    use markdown_viewer_application::ports::MarkdownRenderer;
    use markdown_viewer_domain::document::{RenderPreferences, WordCountRules};

    use crate::comrak_renderer::ComrakMarkdownRenderer;

    #[test]
    fn generates_unique_ids_for_duplicate_headings() {
        let renderer = ComrakMarkdownRenderer::new();
        let rendered = renderer
            .render(
                "# Title\n\n## Title\n\n### Title\n",
                RenderPreferences::default(),
            )
            .expect("renderer should work");

        assert_eq!(rendered.toc.len(), 3);
        assert_eq!(rendered.toc[0].id, "mdv-title");
        assert_eq!(rendered.toc[1].id, "mdv-title-1");
        assert_eq!(rendered.toc[2].id, "mdv-title-2");
    }

    #[test]
    fn reading_time_is_at_least_one_minute() {
        let renderer = ComrakMarkdownRenderer::new();
        let rendered = renderer
            .render("small file", RenderPreferences::default())
            .expect("renderer should work");
        assert_eq!(rendered.reading_time_minutes, 1);
    }

    #[test]
    fn can_exclude_links_and_code_from_word_count() {
        let renderer = ComrakMarkdownRenderer::new();
        let markdown = "Text [link words](https://example.com) `code words`";
        let rendered = renderer
            .render(
                markdown,
                RenderPreferences {
                    performance_mode: false,
                    word_count_rules: WordCountRules {
                        include_links: false,
                        include_code: false,
                        include_front_matter: false,
                    },
                },
            )
            .expect("renderer should work");

        assert_eq!(rendered.word_count, 1);
    }

    #[test]
    fn renders_nested_list_and_code_blocks_consistently() {
        let renderer = ComrakMarkdownRenderer::new();
        let markdown =
            "1. Parent\n   - [ ] child task\n\n      ```rust\n      let x = 1;\n      ```";
        let rendered = renderer
            .render(markdown, RenderPreferences::default())
            .expect("renderer should work");

        assert!(rendered.html.contains("<ol>"));
        assert!(rendered.html.contains("<input type=\"checkbox\""));
        assert!(rendered.html.contains("<code class=\"language-rust\">"));
    }

    #[test]
    fn keeps_adjacent_footnote_references_in_output() {
        let renderer = ComrakMarkdownRenderer::new();
        let markdown = "One[^a][^b]\n\n[^a]: A\n[^b]: B";
        let rendered = renderer
            .render(markdown, RenderPreferences::default())
            .expect("renderer should work");

        assert!(rendered.html.contains("footnote-ref"));
        assert!(rendered.html.contains("fn-a"));
        assert!(rendered.html.contains("fn-b"));
    }
}
