import { useState, useCallback, useEffect, useRef } from "react";
import { getProviderStatus } from "./client";
import type { ProviderStatus, ApiBaseUrl } from "./api";

export interface UseProviderStatusOptions {
  /** API base URL */
  apiBaseUrl: ApiBaseUrl;
  /** Whether to fetch status automatically on mount */
  fetchOnMount?: boolean;
  /** Auto-refresh interval in ms (0 = disabled) */
  autoRefreshMs?: number;
}

export interface UseProviderStatusResult {
  /** Current provider status (null if not yet loaded) */
  status: ProviderStatus | null;
  /** Loading state */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Manually refresh the status */
  refresh: () => Promise<void>;
  /** Check if a specific engine is available */
  isEngineAvailable: (engine?: "comfyui" | "openrouter" | "replicate" | "fal" | "kie") => boolean;
}

/**
 * Hook for accessing and refreshing provider status.
 * 
 * Usage:
 * ```tsx
 * const { status, loading, refresh, isEngineAvailable } = useProviderStatus({
 *   apiBaseUrl,
 *   fetchOnMount: true
 * });
 * 
 * // Check if a workflow's provider is available
 * const canUseWorkflow = isEngineAvailable(workflow.engine);
 * ```
 */
export function useProviderStatus(options: UseProviderStatusOptions): UseProviderStatusResult {
  const { apiBaseUrl, fetchOnMount = false, autoRefreshMs = 0 } = options;
  
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const newStatus = await getProviderStatus(apiBaseUrl);
      if (mountedRef.current) {
        setStatus(newStatus);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : "Failed to fetch provider status");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [apiBaseUrl]);

  const isEngineAvailable = useCallback(
    (engine?: "comfyui" | "openrouter" | "replicate" | "fal" | "kie"): boolean => {
      if (!status) return true; // Assume available if not yet loaded
      switch (engine) {
        case "replicate":
          return status.replicate.available;
        case "openrouter":
          return status.openrouter.available;
        case "fal":
          return status.fal?.available ?? false;
        case "kie":
          return status.kie?.available ?? false;
        case "comfyui":
        default:
          return status.comfyui.available;
      }
    },
    [status]
  );

  // Fetch on mount if enabled
  useEffect(() => {
    if (fetchOnMount) {
      void refresh();
    }
  }, [fetchOnMount, refresh]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefreshMs <= 0) return;
    const interval = setInterval(() => {
      void refresh();
    }, autoRefreshMs);
    return () => clearInterval(interval);
  }, [autoRefreshMs, refresh]);

  // Listen for api-key-changed events to refresh immediately
  useEffect(() => {
    const handler = () => { void refresh(); };
    window.addEventListener("api-key-changed", handler);
    return () => window.removeEventListener("api-key-changed", handler);
  }, [refresh]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    status,
    loading,
    error,
    refresh,
    isEngineAvailable
  };
}
