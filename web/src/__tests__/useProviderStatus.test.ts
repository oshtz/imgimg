// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Mock the client module
vi.mock("../client", () => ({
  getProviderStatus: vi.fn(),
}));

import { getProviderStatus } from "../client";
import { useProviderStatus } from "../useProviderStatus";
import type { ProviderStatus } from "../api";

const mockGetProviderStatus = getProviderStatus as ReturnType<typeof vi.fn>;

function makeStatus(overrides?: Partial<ProviderStatus>): ProviderStatus {
  return {
    comfyui: { available: true, instances: [], healthyCount: 0, totalCount: 0 },
    openrouter: { available: false, hasApiKey: false },
    replicate: { available: true, hasApiKey: true },
    fal: { available: false, hasApiKey: false },
    kie: { available: false, hasApiKey: false },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useProviderStatus", () => {
  it("starts with null status and not loading when fetchOnMount is false", () => {
    const { result } = renderHook(() =>
      useProviderStatus({ apiBaseUrl: "http://localhost", fetchOnMount: false })
    );
    expect(result.current.status).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("fetches status on mount when fetchOnMount is true", async () => {
    const status = makeStatus();
    mockGetProviderStatus.mockResolvedValue(status);

    const { result } = renderHook(() =>
      useProviderStatus({ apiBaseUrl: "http://localhost", fetchOnMount: true })
    );

    await waitFor(() => {
      expect(result.current.status).toEqual(status);
    });
    expect(result.current.loading).toBe(false);
  });

  it("sets error on fetch failure", async () => {
    mockGetProviderStatus.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useProviderStatus({ apiBaseUrl: "http://localhost", fetchOnMount: true })
    );

    await waitFor(() => {
      expect(result.current.error).toBe("Network error");
    });
    expect(result.current.status).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("sets generic error for non-Error throws", async () => {
    mockGetProviderStatus.mockRejectedValue("string error");

    const { result } = renderHook(() =>
      useProviderStatus({ apiBaseUrl: "http://localhost", fetchOnMount: true })
    );

    await waitFor(() => {
      expect(result.current.error).toBe("Failed to fetch provider status");
    });
  });

  it("refresh() fetches new status", async () => {
    const status = makeStatus();
    mockGetProviderStatus.mockResolvedValue(status);

    const { result } = renderHook(() =>
      useProviderStatus({ apiBaseUrl: "http://localhost" })
    );

    expect(result.current.status).toBeNull();

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.status).toEqual(status);
  });

  describe("isEngineAvailable", () => {
    it("returns true for all engines when status is null", () => {
      const { result } = renderHook(() =>
        useProviderStatus({ apiBaseUrl: "http://localhost" })
      );
      expect(result.current.isEngineAvailable("comfyui")).toBe(true);
      expect(result.current.isEngineAvailable("replicate")).toBe(true);
      expect(result.current.isEngineAvailable("fal")).toBe(true);
      expect(result.current.isEngineAvailable("openrouter")).toBe(true);
      expect(result.current.isEngineAvailable("kie")).toBe(true);
    });

    it("returns correct availability after status is loaded", async () => {
      const status = makeStatus({
        comfyui: { available: true, instances: [], healthyCount: 1, totalCount: 1 },
        replicate: { available: true, hasApiKey: true },
        fal: { available: false, hasApiKey: false },
        openrouter: { available: false, hasApiKey: false },
        kie: { available: true, hasApiKey: true },
      });
      mockGetProviderStatus.mockResolvedValue(status);

      const { result } = renderHook(() =>
        useProviderStatus({ apiBaseUrl: "http://localhost", fetchOnMount: true })
      );

      await waitFor(() => {
        expect(result.current.status).not.toBeNull();
      });

      expect(result.current.isEngineAvailable("comfyui")).toBe(true);
      expect(result.current.isEngineAvailable("replicate")).toBe(true);
      expect(result.current.isEngineAvailable("fal")).toBe(false);
      expect(result.current.isEngineAvailable("openrouter")).toBe(false);
      expect(result.current.isEngineAvailable("kie")).toBe(true);
    });

    it("returns false for fal when fal is null/undefined", async () => {
      const status = makeStatus();
      // Simulate a status where fal is undefined
      (status as any).fal = undefined;
      mockGetProviderStatus.mockResolvedValue(status);

      const { result } = renderHook(() =>
        useProviderStatus({ apiBaseUrl: "http://localhost", fetchOnMount: true })
      );

      await waitFor(() => {
        expect(result.current.status).not.toBeNull();
      });

      expect(result.current.isEngineAvailable("fal")).toBe(false);
    });

    it("returns false for kie when kie is null/undefined", async () => {
      const status = makeStatus();
      (status as any).kie = undefined;
      mockGetProviderStatus.mockResolvedValue(status);

      const { result } = renderHook(() =>
        useProviderStatus({ apiBaseUrl: "http://localhost", fetchOnMount: true })
      );

      await waitFor(() => {
        expect(result.current.status).not.toBeNull();
      });

      expect(result.current.isEngineAvailable("kie")).toBe(false);
    });

    it("defaults to comfyui availability for undefined engine", async () => {
      const status = makeStatus({
        comfyui: { available: false, instances: [], healthyCount: 0, totalCount: 0 },
      });
      mockGetProviderStatus.mockResolvedValue(status);

      const { result } = renderHook(() =>
        useProviderStatus({ apiBaseUrl: "http://localhost", fetchOnMount: true })
      );

      await waitFor(() => {
        expect(result.current.status).not.toBeNull();
      });

      expect(result.current.isEngineAvailable(undefined)).toBe(false);
    });
  });

  it("does not update state when unmounted during successful refresh", async () => {
    let resolvePromise: (v: any) => void;
    mockGetProviderStatus.mockImplementation(() => new Promise((r) => { resolvePromise = r; }));

    const { result, unmount } = renderHook(() =>
      useProviderStatus({ apiBaseUrl: "http://localhost", fetchOnMount: true })
    );

    // Unmount while the fetch is pending
    unmount();

    // Now resolve — state setters should NOT be called (mountedRef.current is false)
    resolvePromise!(makeStatus());
    // No way to check state after unmount, but it shouldn't throw
  });

  it("does not update state when unmounted during failed refresh", async () => {
    let rejectPromise: (e: any) => void;
    mockGetProviderStatus.mockImplementation(() => new Promise((_, r) => { rejectPromise = r; }));

    const { unmount } = renderHook(() =>
      useProviderStatus({ apiBaseUrl: "http://localhost", fetchOnMount: true })
    );

    unmount();

    // Resolve the rejection after unmount
    rejectPromise!(new Error("Network"));
  });

  describe("auto-refresh interval", () => {
    it("periodically calls refresh when autoRefreshMs > 0", async () => {
      vi.useFakeTimers();
      const status = makeStatus();
      mockGetProviderStatus.mockResolvedValue(status);

      renderHook(() =>
        useProviderStatus({ apiBaseUrl: "http://localhost", autoRefreshMs: 5000 })
      );

      // No fetch on mount by default
      expect(mockGetProviderStatus).not.toHaveBeenCalled();

      // Advance past the interval
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockGetProviderStatus).toHaveBeenCalledTimes(1);

      // Another interval tick
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockGetProviderStatus).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("does not set interval when autoRefreshMs is 0", async () => {
      vi.useFakeTimers();
      mockGetProviderStatus.mockResolvedValue(makeStatus());

      renderHook(() =>
        useProviderStatus({ apiBaseUrl: "http://localhost", autoRefreshMs: 0 })
      );

      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      expect(mockGetProviderStatus).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe("api-key-changed event", () => {
    it("refreshes status when api-key-changed event is dispatched", async () => {
      const status = makeStatus();
      mockGetProviderStatus.mockResolvedValue(status);

      renderHook(() =>
        useProviderStatus({ apiBaseUrl: "http://localhost" })
      );

      expect(mockGetProviderStatus).not.toHaveBeenCalled();

      await act(async () => {
        window.dispatchEvent(new Event("api-key-changed"));
      });

      expect(mockGetProviderStatus).toHaveBeenCalled();
    });

    it("cleans up api-key-changed listener on unmount", () => {
      const spy = vi.spyOn(window, "removeEventListener");
      const { unmount } = renderHook(() =>
        useProviderStatus({ apiBaseUrl: "http://localhost" })
      );
      unmount();
      const removedTypes = spy.mock.calls.map((c) => c[0]);
      expect(removedTypes).toContain("api-key-changed");
      spy.mockRestore();
    });
  });
});
