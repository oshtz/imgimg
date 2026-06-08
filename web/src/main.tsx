import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

function AppErrorFallback({ error, resetErrorBoundary }: { error: unknown; resetErrorBoundary: () => void }) {
  const message = error instanceof Error ? error.message : "An unexpected error occurred.";
  return (
    <div className="flex h-screen items-center justify-center bg-black text-zinc-100">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center">
        <div className="mb-4 text-4xl">⚠</div>
        <h1 className="mb-2 text-lg font-semibold">Something went wrong</h1>
        <p className="mb-4 text-sm text-zinc-400">
          {message}
        </p>
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="rounded-lg bg-zinc-600 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function AppLoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-black text-zinc-100">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-500" />
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary FallbackComponent={AppErrorFallback} onReset={() => window.location.reload()}>
      <Suspense fallback={<AppLoadingFallback />}>
        <App />
      </Suspense>
    </ErrorBoundary>
    <Toaster
      position="bottom-right"
      theme="system"
      richColors
      closeButton
    />
  </React.StrictMode>
);
