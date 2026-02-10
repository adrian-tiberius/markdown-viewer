import type {
  MarkdownDocument,
  TocEntry,
} from '../domain';

export class DocumentWorkspaceState {
  private currentDocument: MarkdownDocument | null = null;
  private disposed = false;

  setDisposed(disposed: boolean): void {
    this.disposed = disposed;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  currentDocumentValue(): MarkdownDocument | null {
    return this.currentDocument;
  }

  currentDocumentPath(): string | null {
    return this.currentDocument?.path ?? null;
  }

  currentDocumentSource(): string | null {
    return this.currentDocument?.source ?? null;
  }

  currentTocEntries(): TocEntry[] {
    return this.currentDocument?.toc ?? [];
  }

  setCurrentDocument(document: MarkdownDocument): void {
    this.currentDocument = document;
  }

  clearCurrentDocument(): void {
    this.currentDocument = null;
  }
}
