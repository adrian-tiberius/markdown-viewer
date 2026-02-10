import { describe, expect, it } from 'vitest';

import { createE2eRuntimeAdapters } from './e2e-runtime';

describe('e2e-runtime', () => {
  it('loads seeded markdown fixtures and records gateway calls', async () => {
    const runtime = createE2eRuntimeAdapters();
    runtime.control.setDocument({
      path: '/tmp/specs/alpha.md',
      source: '# Alpha',
      html: '<h1 id="mdv-alpha">Alpha</h1>',
      toc: [{ level: 1, id: 'mdv-alpha', text: 'Alpha' }],
      wordCount: 1,
      readingTimeMinutes: 1,
    });
    runtime.control.setPickMarkdownFileResult('/tmp/specs/alpha.md');

    await expect(runtime.gateway.pickMarkdownFile()).resolves.toBe('/tmp/specs/alpha.md');
    await expect(
      runtime.gateway.loadMarkdownFile('/tmp/specs/alpha.md', {
        performanceMode: false,
        wordCountRules: {
          includeLinks: true,
          includeCode: false,
          includeFrontMatter: false,
        },
      })
    ).resolves.toMatchObject({
      path: '/tmp/specs/alpha.md',
      title: 'alpha.md',
    });

    const snapshot = runtime.control.snapshot();
    expect(snapshot.calls.gateway.pickedFileCount).toBe(1);
    expect(snapshot.calls.gateway.loadRequests).toHaveLength(1);
    expect(snapshot.calls.gateway.loadRequests[0]).toMatchObject({
      path: '/tmp/specs/alpha.md',
      preferences: {
        performanceMode: false,
      },
    });
  });

  it('emits file update, open path, and drag drop events to listeners', async () => {
    const runtime = createE2eRuntimeAdapters();
    const fileUpdatedPaths: string[] = [];
    const openPaths: string[] = [];
    const dragDropEvents: string[] = [];

    const offFileUpdated = await runtime.gateway.onMarkdownFileUpdated((event) => {
      fileUpdatedPaths.push(event.path);
    });
    const offOpenPath = await runtime.gateway.onOpenPathRequested((path) => {
      openPaths.push(path);
    });
    const offDragDrop = await runtime.gateway.onDragDrop((event) => {
      dragDropEvents.push(`${event.type}:${event.paths.join(',')}`);
    });

    runtime.control.emitFileUpdated('/tmp/specs/alpha.md');
    runtime.control.emitOpenPath('/tmp/specs/beta.md');
    runtime.control.emitDragDrop({
      type: 'drop',
      paths: ['/tmp/specs/alpha.md'],
    });

    expect(fileUpdatedPaths).toEqual(['/tmp/specs/alpha.md']);
    expect(openPaths).toEqual(['/tmp/specs/beta.md']);
    expect(dragDropEvents).toEqual(['drop:/tmp/specs/alpha.md']);

    offFileUpdated();
    offOpenPath();
    offDragDrop();
  });

  it('supports updater, app version, diagnostics, and launch path lifecycle', async () => {
    const runtime = createE2eRuntimeAdapters();
    runtime.control.setAppVersion('1.2.3-e2e');
    runtime.control.setUpdateResult({ status: 'update-installed', version: '9.9.9' });
    runtime.control.setLaunchOpenPath('/tmp/specs/launch.md');

    await runtime.externalUrlOpener.openExternalUrl('https://example.com');
    await runtime.externalUrlOpener.openExternalPath('/tmp/specs/sample.txt', '/tmp/specs/main.md');
    await runtime.diagnosticsReportWriter.saveReport('diag.json', '{"ok":true}');

    await expect(runtime.appVersionProvider.getAppVersion()).resolves.toBe('1.2.3-e2e');
    await expect(runtime.updateService.checkForUpdates()).resolves.toEqual({
      status: 'update-installed',
      version: '9.9.9',
    });
    await expect(runtime.gateway.consumeLaunchOpenPath()).resolves.toBe('/tmp/specs/launch.md');
    await expect(runtime.gateway.consumeLaunchOpenPath()).resolves.toBeNull();

    const snapshot = runtime.control.snapshot();
    expect(snapshot.calls.external.urls).toEqual(['https://example.com']);
    expect(snapshot.calls.external.paths).toEqual([
      {
        path: '/tmp/specs/sample.txt',
        sourceDocumentPath: '/tmp/specs/main.md',
      },
    ]);
    expect(snapshot.calls.updater.checks).toBe(1);
    expect(snapshot.diagnosticsReports).toEqual([
      {
        fileName: 'diag.json',
        content: '{"ok":true}',
      },
    ]);
  });
});
