/**
 * ErrorBoundary — Premium error handling with recovery options.
 * Catches React render errors and displays a professional error UI
 * instead of a white screen.
 */

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Log to console for debugging
    console.error("[CodIn ErrorBoundary]", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const text = `Error: ${error?.message}\n\nStack: ${error?.stack}\n\nComponent: ${errorInfo?.componentStack}`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.iconRow}>
              <span style={styles.icon}>⚠️</span>
            </div>
            <h2 style={styles.title}>Something went wrong</h2>
            <p style={styles.subtitle}>
              CodIn encountered an unexpected error. This is likely a UI
              rendering issue.
            </p>

            {this.state.error && (
              <div style={styles.errorBox}>
                <code style={styles.errorCode}>{this.state.error.message}</code>
              </div>
            )}

            <div style={styles.actions}>
              <button style={styles.primaryBtn} onClick={this.handleReset}>
                🔄 Try Again
              </button>
              <button style={styles.secondaryBtn} onClick={this.handleReload}>
                ♻️ Reload Window
              </button>
              <button style={styles.tertiaryBtn} onClick={this.handleCopyError}>
                📋 Copy Error
              </button>
            </div>

            <p style={styles.hint}>
              If this keeps happening, check the developer console
              (Ctrl+Shift+I) or file a bug report.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    minHeight: 300,
    padding: 32,
    background: "var(--vscode-editor-background, #1e1e2e)",
    color: "var(--vscode-editor-foreground, #cdd6f4)",
    fontFamily: "var(--vscode-font-family, system-ui)",
  },
  card: {
    maxWidth: 480,
    width: "100%",
    textAlign: "center" as const,
    padding: "32px 40px",
    background: "var(--vscode-sideBar-background, #181825)",
    borderRadius: 16,
    border: "1px solid var(--vscode-panel-border, #313244)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
  },
  iconRow: {
    marginBottom: 12,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    margin: "0 0 8px",
    fontSize: 20,
    fontWeight: 700,
  },
  subtitle: {
    margin: "0 0 20px",
    fontSize: 13,
    opacity: 0.7,
    lineHeight: 1.5,
  },
  errorBox: {
    background: "rgba(243, 139, 168, 0.1)",
    border: "1px solid rgba(243, 139, 168, 0.2)",
    borderRadius: 8,
    padding: "12px 16px",
    marginBottom: 20,
    textAlign: "left" as const,
    maxHeight: 120,
    overflow: "auto",
  },
  errorCode: {
    fontSize: 12,
    color: "#f38ba8",
    wordBreak: "break-word" as const,
    lineHeight: 1.4,
  },
  actions: {
    display: "flex",
    gap: 8,
    justifyContent: "center",
    marginBottom: 16,
    flexWrap: "wrap" as const,
  },
  primaryBtn: {
    padding: "10px 20px",
    background: "linear-gradient(135deg, #667eea, #764ba2)",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "10px 20px",
    background: "var(--vscode-input-background, #313244)",
    color: "var(--vscode-input-foreground, #cdd6f4)",
    border: "1px solid var(--vscode-input-border, #45475a)",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  tertiaryBtn: {
    padding: "10px 20px",
    background: "transparent",
    color: "var(--vscode-input-foreground, #cdd6f4)",
    border: "1px solid var(--vscode-input-border, #45475a)",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer",
    opacity: 0.7,
  },
  hint: {
    fontSize: 11,
    opacity: 0.4,
    margin: 0,
  },
};
