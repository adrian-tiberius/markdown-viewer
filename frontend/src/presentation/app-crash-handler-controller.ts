import { errorToMessage } from './error-utils';

interface AppCrashHandlerControllerDeps {
  currentDocumentSource: () => string | null;
  onCrash: (reason: string, detail: string, source: string | null) => void;
}

export class AppCrashHandlerController {
  private readonly deps: AppCrashHandlerControllerDeps;
  private windowErrorHandler: ((event: ErrorEvent) => void) | null = null;
  private unhandledRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

  constructor(deps: AppCrashHandlerControllerDeps) {
    this.deps = deps;
  }

  install(): void {
    if (!this.windowErrorHandler) {
      this.windowErrorHandler = (event) => {
        this.deps.onCrash(
          'Runtime error detected',
          event.message,
          this.deps.currentDocumentSource()
        );
      };
      window.addEventListener('error', this.windowErrorHandler);
    }

    if (!this.unhandledRejectionHandler) {
      this.unhandledRejectionHandler = (event) => {
        this.deps.onCrash(
          'Unhandled promise rejection',
          errorToMessage(event.reason),
          this.deps.currentDocumentSource()
        );
      };
      window.addEventListener('unhandledrejection', this.unhandledRejectionHandler);
    }
  }

  dispose(): void {
    if (this.windowErrorHandler) {
      window.removeEventListener('error', this.windowErrorHandler);
      this.windowErrorHandler = null;
    }

    if (this.unhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this.unhandledRejectionHandler);
      this.unhandledRejectionHandler = null;
    }
  }
}
