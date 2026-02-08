use markdown_viewer_application::models::{
    MarkdownDocumentOutput, RenderPreferencesInput, TocEntryOutput, WordCountRulesInput,
};
use serde::Deserialize;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TocEntryDto {
    pub level: u8,
    pub id: String,
    pub text: String,
}

impl From<TocEntryOutput> for TocEntryDto {
    fn from(value: TocEntryOutput) -> Self {
        Self {
            level: value.level,
            id: value.id,
            text: value.text,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDocumentDto {
    pub path: String,
    pub title: String,
    pub source: String,
    pub html: String,
    pub toc: Vec<TocEntryDto>,
    pub word_count: usize,
    pub reading_time_minutes: u16,
}

impl From<MarkdownDocumentOutput> for MarkdownDocumentDto {
    fn from(value: MarkdownDocumentOutput) -> Self {
        Self {
            path: value.path,
            title: value.title,
            source: value.source,
            html: value.html,
            toc: value.toc.into_iter().map(TocEntryDto::from).collect(),
            word_count: value.word_count,
            reading_time_minutes: value.reading_time_minutes,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordCountRulesDto {
    pub include_links: bool,
    pub include_code: bool,
    pub include_front_matter: bool,
}

impl From<WordCountRulesDto> for WordCountRulesInput {
    fn from(value: WordCountRulesDto) -> Self {
        Self {
            include_links: value.include_links,
            include_code: value.include_code,
            include_front_matter: value.include_front_matter,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderPreferencesDto {
    #[serde(default)]
    pub performance_mode: bool,
    #[serde(default)]
    pub word_count_rules: Option<WordCountRulesDto>,
}

impl RenderPreferencesDto {
    pub fn to_application(self) -> RenderPreferencesInput {
        RenderPreferencesInput {
            performance_mode: self.performance_mode,
            word_count_rules: self.word_count_rules.map(Into::into).unwrap_or_default(),
        }
    }
}

pub fn to_render_preferences(value: Option<RenderPreferencesDto>) -> RenderPreferencesInput {
    value
        .map(RenderPreferencesDto::to_application)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use markdown_viewer_application::models::{MarkdownDocumentOutput, TocEntryOutput};

    use crate::dto::{
        to_render_preferences, MarkdownDocumentDto, RenderPreferencesDto, WordCountRulesDto,
    };

    #[test]
    fn to_render_preferences_defaults_when_input_is_none() {
        let preferences = to_render_preferences(None);
        assert!(!preferences.performance_mode);
        assert!(preferences.word_count_rules.include_links);
        assert!(!preferences.word_count_rules.include_code);
        assert!(!preferences.word_count_rules.include_front_matter);
    }

    #[test]
    fn to_render_preferences_maps_all_fields() {
        let preferences = to_render_preferences(Some(RenderPreferencesDto {
            performance_mode: true,
            word_count_rules: Some(WordCountRulesDto {
                include_links: false,
                include_code: true,
                include_front_matter: true,
            }),
        }));

        assert!(preferences.performance_mode);
        assert!(!preferences.word_count_rules.include_links);
        assert!(preferences.word_count_rules.include_code);
        assert!(preferences.word_count_rules.include_front_matter);
    }

    #[test]
    fn markdown_document_conversion_preserves_rendered_and_metadata_fields() {
        let app_output = MarkdownDocumentOutput {
            path: "/tmp/spec.md".to_string(),
            title: "Spec".to_string(),
            source: "# Spec".to_string(),
            html: "<h1 id=\"mdv-spec\">Spec</h1>".to_string(),
            toc: vec![TocEntryOutput {
                level: 1,
                id: "mdv-spec".to_string(),
                text: "Spec".to_string(),
            }],
            word_count: 320,
            reading_time_minutes: 2,
        };

        let dto: MarkdownDocumentDto = app_output.into();

        assert_eq!(dto.path, "/tmp/spec.md");
        assert_eq!(dto.title, "Spec");
        assert_eq!(dto.source, "# Spec");
        assert_eq!(dto.html, "<h1 id=\"mdv-spec\">Spec</h1>");
        assert_eq!(dto.toc.len(), 1);
        assert_eq!(dto.toc[0].id, "mdv-spec");
        assert_eq!(dto.word_count, 320);
        assert_eq!(dto.reading_time_minutes, 2);
    }

    #[test]
    fn render_preferences_dto_to_application_matches_helper_function() {
        let dto = RenderPreferencesDto {
            performance_mode: true,
            word_count_rules: Some(WordCountRulesDto {
                include_links: true,
                include_code: false,
                include_front_matter: true,
            }),
        };

        let direct = dto.to_application();
        let helper = to_render_preferences(Some(dto));

        assert_eq!(direct.performance_mode, helper.performance_mode);
        assert_eq!(
            direct.word_count_rules.include_links,
            helper.word_count_rules.include_links
        );
        assert_eq!(
            direct.word_count_rules.include_code,
            helper.word_count_rules.include_code
        );
        assert_eq!(
            direct.word_count_rules.include_front_matter,
            helper.word_count_rules.include_front_matter
        );
    }
}
