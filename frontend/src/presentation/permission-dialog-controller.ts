import type { ViewerUi } from './ui';

interface PermissionDialogControllerDeps {
  ui: Pick<
    ViewerUi,
    | 'permissionDialog'
    | 'permissionTitle'
    | 'permissionMessage'
    | 'permissionTarget'
    | 'permissionAllowButton'
  >;
}

export interface PermissionRequestOptions {
  title: string;
  message: string;
  target: string;
  allowLabel?: string;
}

export class PermissionDialogController {
  private readonly deps: PermissionDialogControllerDeps;
  private resolver: ((allowed: boolean) => void) | null = null;

  constructor(deps: PermissionDialogControllerDeps) {
    this.deps = deps;
  }

  request(options: PermissionRequestOptions): Promise<boolean> {
    if (this.resolver) {
      this.resolve(false);
    }

    const { ui } = this.deps;
    ui.permissionTitle.textContent = options.title;
    ui.permissionMessage.textContent = options.message;
    ui.permissionTarget.textContent = options.target;
    ui.permissionAllowButton.textContent = options.allowLabel ?? 'Allow';
    ui.permissionDialog.classList.add('visible');
    ui.permissionDialog.setAttribute('aria-hidden', 'false');

    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
      ui.permissionAllowButton.focus();
    });
  }

  resolve(allowed: boolean): void {
    const resolver = this.resolver;
    if (!resolver) {
      return;
    }
    this.resolver = null;

    const { ui } = this.deps;
    ui.permissionDialog.classList.remove('visible');
    ui.permissionDialog.setAttribute('aria-hidden', 'true');
    ui.permissionAllowButton.textContent = 'Allow';
    resolver(allowed);
  }

  close(): void {
    if (this.resolver) {
      this.resolve(false);
      return;
    }

    const { ui } = this.deps;
    ui.permissionDialog.classList.remove('visible');
    ui.permissionDialog.setAttribute('aria-hidden', 'true');
    ui.permissionAllowButton.textContent = 'Allow';
  }

  isVisible(): boolean {
    return this.deps.ui.permissionDialog.classList.contains('visible');
  }
}
