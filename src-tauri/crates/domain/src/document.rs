#[derive(Debug, Clone)]
pub struct TocEntry {
    pub level: u8,
    pub id: String,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct RenderedMarkdown {
    pub html: String,
    pub toc: Vec<TocEntry>,
    pub word_count: usize,
    pub reading_time_minutes: u16,
}

#[derive(Debug, Clone, Copy)]
pub struct WordCountRules {
    pub include_links: bool,
    pub include_code: bool,
    pub include_front_matter: bool,
}

impl Default for WordCountRules {
    fn default() -> Self {
        Self {
            include_links: true,
            include_code: false,
            include_front_matter: false,
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct RenderPreferences {
    pub performance_mode: bool,
    pub word_count_rules: WordCountRules,
}

#[cfg(test)]
mod tests {
    use super::{RenderPreferences, WordCountRules};

    #[test]
    fn word_count_rules_default_matches_reader_expectations() {
        let rules = WordCountRules::default();
        assert!(rules.include_links);
        assert!(!rules.include_code);
        assert!(!rules.include_front_matter);
    }

    #[test]
    fn render_preferences_default_is_safe_and_predictable() {
        let preferences = RenderPreferences::default();
        assert!(!preferences.performance_mode);
        assert!(preferences.word_count_rules.include_links);
        assert!(!preferences.word_count_rules.include_code);
        assert!(!preferences.word_count_rules.include_front_matter);
    }
}
