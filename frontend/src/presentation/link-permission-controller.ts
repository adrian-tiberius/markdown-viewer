import { isLinkedFileOutsideScopeError } from '../application/link-navigation';
import type { ExternalUrlOpener } from '../application/ports';
import { errorToMessage } from './error-utils';
import type { PermissionRequestOptions } from './permission-dialog-controller';
import { PermissionDialogController } from './permission-dialog-controller';

interface LinkPermissionControllerDeps {
  permissionDialogController: PermissionDialogController;
  externalUrlOpener: ExternalUrlOpener;
  openMarkdownInNewTab: (path: string) => Promise<void>;
  onErrorBanner: (message: string) => void;
  isDisposed: () => boolean;
}

export class LinkPermissionController {
  private readonly deps: LinkPermissionControllerDeps;

  constructor(deps: LinkPermissionControllerDeps) {
    this.deps = deps;
  }

  async requestExternalUrlPermission(url: string): Promise<void> {
    const allow = await this.requestPermission({
      title: 'Open External Link',
      message: 'This will open your browser or default external handler.',
      target: url,
      allowLabel: 'Open Link',
    });
    if (!allow || this.deps.isDisposed()) {
      return;
    }

    try {
      await this.deps.externalUrlOpener.openExternalUrl(url);
    } catch (error) {
      this.deps.onErrorBanner(`Unable to open external link: ${errorToMessage(error)}`);
    }
  }

  async requestMarkdownLinkPermission(path: string): Promise<void> {
    const allow = await this.requestPermission({
      title: 'Open Linked Markdown',
      message: 'Open this linked markdown document in a new tab in this window?',
      target: path,
      allowLabel: 'Open Tab',
    });
    if (!allow || this.deps.isDisposed()) {
      return;
    }

    await this.deps.openMarkdownInNewTab(path);
  }

  async requestLocalFilePermission(path: string, sourceDocumentPath: string): Promise<void> {
    const allow = await this.requestPermission({
      title: 'Open Linked File',
      message: 'Open this file with your system default application?',
      target: path,
      allowLabel: 'Open File',
    });
    if (!allow || this.deps.isDisposed()) {
      return;
    }

    try {
      await this.deps.externalUrlOpener.openExternalPath(path, sourceDocumentPath);
    } catch (error) {
      const message = errorToMessage(error);
      if (isLinkedFileOutsideScopeError(message)) {
        this.deps.onErrorBanner(
          'Linked file can only be opened when it is in the same folder or a subfolder of the current markdown document.'
        );
        return;
      }
      this.deps.onErrorBanner(`Unable to open linked file: ${message}`);
    }
  }

  private async requestPermission(options: PermissionRequestOptions): Promise<boolean> {
    return this.deps.permissionDialogController.request(options);
  }
}
