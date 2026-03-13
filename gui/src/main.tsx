import "./i18n/i18n";
import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import App from "./App";
import "./index.css";
import { persistor, store } from "./redux/store";

function AppCrashFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div
      style={{
        padding: 32,
        fontFamily: "system-ui, sans-serif",
        maxWidth: 600,
        margin: "0 auto",
      }}
    >
      <h1 style={{ color: "#dc2626" }}>Something went wrong</h1>
      <p style={{ color: "#666" }}>
        CodIn encountered an unexpected error. Please try reloading.
      </p>
      <pre
        style={{
          background: "#f5f5f5",
          padding: 16,
          borderRadius: 8,
          overflow: "auto",
          fontSize: 13,
        }}
      >
        {error.message}
      </pre>
      <button
        onClick={resetErrorBoundary}
        style={{
          padding: "8px 24px",
          background: "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        Reload App
      </button>
    </div>
  );
}

(async () => {
  const container = document.getElementById("root") as HTMLElement;

  // Create React root
  const root = ReactDOM.createRoot(container);

  root.render(
    <React.StrictMode>
      <ErrorBoundary
        FallbackComponent={AppCrashFallback}
        onReset={() => window.location.reload()}
      >
        <Provider store={store}>
          <PersistGate loading={null} persistor={persistor}>
            <App />
          </PersistGate>
        </Provider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
})();
