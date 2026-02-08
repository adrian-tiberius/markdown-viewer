export interface WordCountRules {
  includeLinks: boolean;
  includeCode: boolean;
  includeFrontMatter: boolean;
}

export interface TocEntry {
  level: number;
  id: string;
  text: string;
}

export interface MarkdownDocument {
  path: string;
  title: string;
  source: string;
  html: string;
  toc: TocEntry[];
  wordCount: number;
  readingTimeMinutes: number;
}

export interface RenderPreferences {
  performanceMode: boolean;
  wordCountRules: WordCountRules;
}
