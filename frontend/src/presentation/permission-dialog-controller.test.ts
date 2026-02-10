// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { PermissionDialogController } from './permission-dialog-controller';

function setup() {
  document.body.innerHTML = `
    <section id="permission-dialog" aria-hidden="true">
      <h2 id="permission-title"></h2>
      <p id="permission-message"></p>
      <code id="permission-target"></code>
      <button id="permission-allow">Allow</button>
    </section>
  `;

  const permissionDialog = document.querySelector<HTMLElement>('#permission-dialog')!;
  const permissionTitle = document.querySelector<HTMLElement>('#permission-title')!;
  const permissionMessage = document.querySelector<HTMLElement>('#permission-message')!;
  const permissionTarget = document.querySelector<HTMLElement>('#permission-target')!;
  const permissionAllowButton = document.querySelector<HTMLButtonElement>('#permission-allow')!;

  const controller = new PermissionDialogController({
    ui: {
      permissionDialog,
      permissionTitle,
      permissionMessage,
      permissionTarget,
      permissionAllowButton,
    },
  });

  return {
    controller,
    permissionDialog,
    permissionTitle,
    permissionMessage,
    permissionTarget,
    permissionAllowButton,
  };
}

describe('permission-dialog-controller (presentation)', () => {
  it('renders request content and resolves with the selected decision', async () => {
    const context = setup();

    const pending = context.controller.request({
      title: 'Open External Link',
      message: 'Open outside the app?',
      target: 'https://example.com',
      allowLabel: 'Open Link',
    });

    expect(context.permissionDialog.classList.contains('visible')).toBe(true);
    expect(context.permissionDialog.getAttribute('aria-hidden')).toBe('false');
    expect(context.permissionTitle.textContent).toBe('Open External Link');
    expect(context.permissionMessage.textContent).toBe('Open outside the app?');
    expect(context.permissionTarget.textContent).toBe('https://example.com');
    expect(context.permissionAllowButton.textContent).toBe('Open Link');

    context.controller.resolve(true);
    await expect(pending).resolves.toBe(true);
    expect(context.permissionDialog.classList.contains('visible')).toBe(false);
    expect(context.permissionDialog.getAttribute('aria-hidden')).toBe('true');
    expect(context.permissionAllowButton.textContent).toBe('Allow');
  });

  it('cancels an active request when close is called', async () => {
    const context = setup();

    const pending = context.controller.request({
      title: 'Open File',
      message: 'Open with system app?',
      target: '/tmp/file.txt',
    });

    context.controller.close();
    await expect(pending).resolves.toBe(false);
    expect(context.permissionDialog.classList.contains('visible')).toBe(false);
  });
});
