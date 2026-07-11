// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  getWorkspaceState: vi.fn(),
  saveWorkspaceState: vi.fn(),
}));

vi.mock("../../tauri-api", () => ({
  isTauri: () => true,
  getWorkspaceState: tauri.getWorkspaceState,
  saveWorkspaceState: tauri.saveWorkspaceState,
}));

import { useDurableWorkspaceState } from "../useDurableWorkspaceState";

beforeEach(() => {
  localStorage.clear();
  tauri.getWorkspaceState.mockReset();
  tauri.saveWorkspaceState.mockReset().mockResolvedValue(undefined);
});

describe("useDurableWorkspaceState", () => {
  it("prefers durable state over an old localStorage value", async () => {
    localStorage.setItem("legacy", JSON.stringify(["old"]));
    tauri.getWorkspaceState.mockResolvedValue(["durable"]);

    const { result } = renderHook(() =>
      useDurableWorkspaceState("iterate_threads", "legacy", [] as string[]),
    );

    await waitFor(() => expect(result.current[0]).toEqual(["durable"]));
    expect(localStorage.getItem("legacy")).toBe(JSON.stringify(["old"]));
  });

  it("migrates legacy state only after the SQLite write succeeds", async () => {
    localStorage.setItem("legacy", JSON.stringify({ track: "saved" }));
    tauri.getWorkspaceState.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useDurableWorkspaceState("audio_metadata", "legacy", {} as Record<string, string>),
    );

    await waitFor(() => {
      expect(tauri.saveWorkspaceState).toHaveBeenCalledWith("audio_metadata", { track: "saved" });
    });
    expect(result.current[0]).toEqual({ track: "saved" });
    expect(localStorage.getItem("legacy")).toBeNull();
  });

  it("debounces subsequent edits into durable storage", async () => {
    vi.useFakeTimers();
    tauri.getWorkspaceState.mockResolvedValue(["initial"]);
    const { result } = renderHook(() =>
      useDurableWorkspaceState("iterate_threads", "legacy", [] as string[]),
    );

    await act(async () => { await Promise.resolve(); });
    expect(result.current[0]).toEqual(["initial"]);
    tauri.saveWorkspaceState.mockClear();

    act(() => result.current[1](["changed"]));
    await act(async () => { vi.advanceTimersByTime(250); await Promise.resolve(); });

    expect(tauri.saveWorkspaceState).toHaveBeenCalledWith("iterate_threads", ["changed"]);
    vi.useRealTimers();
  });
});
