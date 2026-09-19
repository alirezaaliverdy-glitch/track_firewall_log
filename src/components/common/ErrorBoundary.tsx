import { Component, type ErrorInfo, type ReactNode } from "react";
import { logRuntimeError } from "@/lib/runtimeLogging";

type ErrorBoundaryProps = {
  children: ReactNode;
  title?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logRuntimeError("Panel render failed", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mb-4 rounded-lg border border-red-900/70 bg-red-950/30 p-4 text-left">
          <h2 className="text-sm font-semibold text-red-200">{this.props.title ?? "Panel unavailable"}</h2>
          <p className="mt-1 text-xs text-red-300/80">
            This panel could not render. The rest of the firewall analyzer is still available.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="mt-3 rounded border border-red-800 px-2 py-1 text-xs font-medium text-red-100 hover:bg-red-950/50"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
