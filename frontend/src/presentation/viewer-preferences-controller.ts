import {
  deriveMeasureWidthMax,
  MEASURE_WIDTH_FALLBACK_MAX,
  MEASURE_WIDTH_MIN,
  measureWidthCssValue,
  reconcileMeasureWidthOnMaxChange,
} from '../application/reader-layout';
import type { ViewerSettings } from '../application/settings';
import type {
  ViewerLayoutState,
  ViewerLayoutStateStore,
  ViewerSettingsStore,
} from '../application/ports';
import type { ViewerUi } from './ui';

type WordCountRuleKey = keyof ViewerSettings['wordCountRules'];

interface ViewerPreferencesControllerDeps {
  ui: Pick<
    ViewerUi,
    | 'workspace'
    | 'toggleLeftSidebarButton'
    | 'toggleRightSidebarButton'
    | 'perfToggle'
    | 'safeToggle'
    | 'themeSelect'
    | 'fontScale'
    | 'lineHeight'
    | 'measureWidth'
    | 'includeLinks'
    | 'includeCode'
    | 'includeFrontMatter'
    | 'tocAutoExpand'
    | 'markdownContent'
    | 'viewerScroll'
  >;
  settingsStore: ViewerSettingsStore;
  layoutStateStore: ViewerLayoutStateStore;
}

export class ViewerPreferencesController {
  private readonly deps: ViewerPreferencesControllerDeps;
  private settings: ViewerSettings;
  private layoutState: ViewerLayoutState;

  constructor(deps: ViewerPreferencesControllerDeps) {
    this.deps = deps;
    this.settings = this.deps.settingsStore.load();
    this.layoutState = this.deps.layoutStateStore.load();
  }

  start(): void {
    this.applySidebarLayout();
    this.refreshMeasureWidthControl({ keepAtMax: true });
    this.applySettingsToControls();
    this.applySettingsToDocument();
  }

  currentSettings(): ViewerSettings {
    return this.settings;
  }

  isSafeModeEnabled(): boolean {
    return this.settings.safeMode;
  }

  setPerformanceMode(enabled: boolean): void {
    this.settings.performanceMode = enabled;
    this.persistSettings();
    this.applySettingsToDocument();
  }

  setSafeMode(enabled: boolean, options: { syncToggleControl?: boolean } = {}): void {
    this.settings.safeMode = enabled;
    if (options.syncToggleControl) {
      this.deps.ui.safeToggle.checked = enabled;
    }
    this.persistSettings();
    this.applySettingsToDocument();
  }

  setTheme(theme: ViewerSettings['theme']): void {
    this.settings.theme = theme;
    this.persistSettings();
    this.applySettingsToDocument();
  }

  setFontScale(value: number): void {
    this.settings.fontScale = value;
    this.persistSettings();
    this.refreshMeasureWidthControl({ keepAtMax: true });
    this.applySettingsToDocument();
  }

  setLineHeight(value: number): void {
    this.settings.lineHeight = value;
    this.persistSettings();
    this.applySettingsToDocument();
  }

  setMeasureWidth(value: number): void {
    this.settings.measureWidth = value;
    this.persistSettings();
    this.applySettingsToDocument();
  }

  setWordCountRule(rule: WordCountRuleKey, enabled: boolean): void {
    this.settings.wordCountRules[rule] = enabled;
    this.persistSettings();
  }

  setTocAutoExpand(enabled: boolean): void {
    this.settings.tocAutoExpand = enabled;
    this.persistSettings();
  }

  isTocAutoExpandEnabled(): boolean {
    return this.settings.tocAutoExpand;
  }

  isTocCollapsed(id: string): boolean {
    return this.settings.tocCollapsed[id] === true;
  }

  setTocCollapsed(id: string, collapsed: boolean): void {
    this.settings.tocCollapsed[id] = collapsed;
  }

  persistTocCollapsedState(): void {
    this.persistSettings();
  }

  collapseTocEntries(entryIds: string[]): void {
    for (const id of entryIds) {
      this.settings.tocCollapsed[id] = true;
    }
    this.persistSettings();
  }

  expandAllTocEntries(): void {
    this.settings.tocCollapsed = {};
    this.persistSettings();
  }

  clearSafeModeForRecovery(): void {
    this.setSafeMode(false, { syncToggleControl: true });
  }

  activateSafeMode(): void {
    this.setSafeMode(true, { syncToggleControl: true });
  }

  toggleSidebar(side: 'left' | 'right'): void {
    if (side === 'left') {
      this.layoutState.leftSidebarCollapsed = !this.layoutState.leftSidebarCollapsed;
    } else {
      this.layoutState.rightSidebarCollapsed = !this.layoutState.rightSidebarCollapsed;
    }
    this.persistLayoutState();
    this.applySidebarLayout();
    this.refreshMeasureWidthControl({ keepAtMax: true });
    this.applySettingsToDocument();
  }

  handleWindowResize(): void {
    this.refreshMeasureWidthControl({ keepAtMax: true });
    this.applySettingsToDocument();
  }

  handleWorkspaceTransitionEnd(event: TransitionEvent): void {
    if (event.propertyName !== 'grid-template-columns') {
      return;
    }
    this.handleWindowResize();
  }

  private applySettingsToControls(): void {
    const { ui } = this.deps;
    ui.perfToggle.checked = this.settings.performanceMode;
    ui.safeToggle.checked = this.settings.safeMode;
    ui.themeSelect.value = this.settings.theme;
    ui.fontScale.value = this.settings.fontScale.toString();
    ui.lineHeight.value = this.settings.lineHeight.toString();
    ui.measureWidth.min = MEASURE_WIDTH_MIN.toString();
    ui.measureWidth.value = this.settings.measureWidth.toString();
    ui.includeLinks.checked = this.settings.wordCountRules.includeLinks;
    ui.includeCode.checked = this.settings.wordCountRules.includeCode;
    ui.includeFrontMatter.checked = this.settings.wordCountRules.includeFrontMatter;
    ui.tocAutoExpand.checked = this.settings.tocAutoExpand;
  }

  private refreshMeasureWidthControl(options: { keepAtMax: boolean }): void {
    const { ui } = this.deps;
    const previousMax = this.currentMeasureWidthMax();
    const nextMax = this.calculateMeasureWidthMaxForLayout();

    ui.measureWidth.min = MEASURE_WIDTH_MIN.toString();
    ui.measureWidth.max = nextMax.toString();

    const nextSetting = reconcileMeasureWidthOnMaxChange({
      currentWidth: this.settings.measureWidth,
      previousMax,
      nextMax,
      keepAtMax: options.keepAtMax,
    });
    if (nextSetting !== this.settings.measureWidth) {
      this.settings.measureWidth = nextSetting;
      this.persistSettings();
    }
    ui.measureWidth.value = this.settings.measureWidth.toString();
  }

  private calculateMeasureWidthMaxForLayout(): number {
    const scrollWidth = this.deps.ui.viewerScroll.clientWidth;
    const viewportWidth = this.currentViewportWidthPx();
    const availableWidth = scrollWidth > 0 ? Math.min(scrollWidth, viewportWidth) : viewportWidth;
    const articleStyle = window.getComputedStyle(this.deps.ui.markdownContent);
    const paddingLeft = this.parsePx(articleStyle.paddingLeft);
    const paddingRight = this.parsePx(articleStyle.paddingRight);
    const chWidth = this.measureCharacterWidthPx(articleStyle);
    return deriveMeasureWidthMax({
      availableWidthPx: availableWidth,
      horizontalPaddingPx: paddingLeft + paddingRight,
      chWidthPx: chWidth,
      fallbackMax: MEASURE_WIDTH_FALLBACK_MAX,
    });
  }

  private currentViewportWidthPx(): number {
    const visualViewportWidth = window.visualViewport?.width;
    if (
      typeof visualViewportWidth === 'number' &&
      Number.isFinite(visualViewportWidth) &&
      visualViewportWidth > 0
    ) {
      return visualViewportWidth;
    }

    if (Number.isFinite(window.innerWidth) && window.innerWidth > 0) {
      return window.innerWidth;
    }

    const documentWidth = document.documentElement.clientWidth;
    if (Number.isFinite(documentWidth) && documentWidth > 0) {
      return documentWidth;
    }

    return this.deps.ui.viewerScroll.clientWidth;
  }

  private measureCharacterWidthPx(articleStyle: CSSStyleDeclaration): number {
    const probe = document.createElement('span');
    probe.textContent = '0';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.whiteSpace = 'pre';
    probe.style.fontFamily = articleStyle.fontFamily || 'serif';
    probe.style.fontSize = articleStyle.fontSize || '16px';
    probe.style.fontWeight = articleStyle.fontWeight || '400';
    probe.style.fontStyle = articleStyle.fontStyle || 'normal';

    this.deps.ui.viewerScroll.append(probe);
    const measured = probe.getBoundingClientRect().width;
    probe.remove();
    if (Number.isFinite(measured) && measured > 0) {
      return measured;
    }

    const fallbackFontSize = this.parsePx(articleStyle.fontSize) || 16;
    return fallbackFontSize * 0.5;
  }

  private parsePx(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private currentMeasureWidthMax(): number {
    const parsed = Number.parseFloat(this.deps.ui.measureWidth.max);
    if (!Number.isFinite(parsed) || parsed < MEASURE_WIDTH_MIN) {
      return MEASURE_WIDTH_FALLBACK_MAX;
    }
    return parsed;
  }

  private applySidebarLayout(): void {
    const { ui } = this.deps;
    const leftCollapsed = this.layoutState.leftSidebarCollapsed;
    const rightCollapsed = this.layoutState.rightSidebarCollapsed;

    ui.workspace.classList.toggle('left-collapsed', leftCollapsed);
    ui.workspace.classList.toggle('right-collapsed', rightCollapsed);

    this.updateSidebarToggleButton(ui.toggleLeftSidebarButton, {
      collapsed: leftCollapsed,
      expandedLabel: 'Hide Outline',
      collapsedLabel: 'Show Outline',
    });
    this.updateSidebarToggleButton(ui.toggleRightSidebarButton, {
      collapsed: rightCollapsed,
      expandedLabel: 'Hide Reading',
      collapsedLabel: 'Show Reading',
    });
  }

  private updateSidebarToggleButton(
    button: HTMLButtonElement,
    options: { collapsed: boolean; expandedLabel: string; collapsedLabel: string }
  ): void {
    const label = options.collapsed ? options.collapsedLabel : options.expandedLabel;
    button.textContent = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-expanded', String(!options.collapsed));
    button.classList.toggle('active', !options.collapsed);
  }

  private applySettingsToDocument(): void {
    document.documentElement.dataset.theme = this.settings.theme;
    document.documentElement.classList.toggle('performance-mode', this.settings.performanceMode);
    document.documentElement.classList.toggle('safe-mode', this.settings.safeMode);
    document.documentElement.style.setProperty(
      '--reader-font-scale',
      this.settings.fontScale.toString()
    );
    document.documentElement.style.setProperty(
      '--reader-line-height',
      this.settings.lineHeight.toString()
    );
    document.documentElement.style.setProperty(
      '--reader-measure-width',
      measureWidthCssValue(this.settings.measureWidth, this.currentMeasureWidthMax())
    );
  }

  private persistSettings(): void {
    this.deps.settingsStore.save(this.settings);
  }

  private persistLayoutState(): void {
    this.deps.layoutStateStore.save(this.layoutState);
  }
}
