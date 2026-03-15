import React from "react";

interface ErrorBoundaryProps {
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showStack: boolean;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showStack: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught render error:", error, errorInfo);
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showStack: false,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, showStack } = this.state;

      return (
        <div className="bg-codin-bg-surface border-codin-border m-2 rounded-lg border p-4">
          {/* Header */}
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4 text-red-400"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h3 className="text-codin-fg text-sm font-semibold">
              Something went wrong
            </h3>
          </div>

          {/* Error message */}
          <p className="text-codin-fg-secondary mb-3 text-xs">
            {error?.message || "An unexpected error occurred."}
          </p>

          {/* Stack trace (collapsible) */}
          {(error?.stack || errorInfo?.componentStack) && (
            <div className="mb-3">
              <button
                onClick={() => this.setState({ showStack: !showStack })}
                className="text-codin-fg-muted hover:text-codin-fg-secondary mb-1 text-[10px] transition-colors"
              >
                {showStack ? "Hide" : "Show"} details
              </button>
              {showStack && (
                <pre className="bg-codin-bg scrollbar-thin max-h-40 overflow-auto rounded-md p-2 text-[10px] leading-relaxed text-red-400/80">
                  {error?.stack}
                  {errorInfo?.componentStack}
                </pre>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={this.handleRetry}
              className="bg-codin-indigo-600 hover:bg-codin-indigo-500 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors"
            >
              Retry
            </button>
            <a
              href="https://github.com/AyanTech-Labs/CodIn/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="text-codin-indigo-400 hover:text-codin-indigo-300 text-xs transition-colors"
            >
              Report issue
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
