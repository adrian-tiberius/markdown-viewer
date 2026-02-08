use markdown_viewer_domain::document::{
    RenderPreferences as DomainRenderPreferences, WordCountRules as DomainWordCountRules,
};

#[derive(Debug, Clone)]
pub struct TocEntryOutput {
    pub level: u8,
    pub id: String,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct MarkdownDocumentOutput {
    pub path: String,
    pub title: String,
    pub source: String,
    pub html: String,
    pub toc: Vec<TocEntryOutput>,
    pub word_count: usize,
    pub reading_time_minutes: u16,
}

#[derive(Debug, Clone, Copy)]
pub struct WordCountRulesInput {
    pub include_links: bool,
    pub include_code: bool,
    pub include_front_matter: bool,
}

impl Default for WordCountRulesInput {
    fn default() -> Self {
        Self {
            include_links: true,
            include_code: false,
            include_front_matter: false,
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct RenderPreferencesInput {
    pub performance_mode: bool,
    pub word_count_rules: WordCountRulesInput,
}

impl From<WordCountRulesInput> for DomainWordCountRules {
    fn from(value: WordCountRulesInput) -> Self {
        Self {
            include_links: value.include_links,
            include_code: value.include_code,
            include_front_matter: value.include_front_matter,
        }
    }
}

impl From<RenderPreferencesInput> for DomainRenderPreferences {
    fn from(value: RenderPreferencesInput) -> Self {
        Self {
            performance_mode: value.performance_mode,
            word_count_rules: value.word_count_rules.into(),
        }
    }
}
