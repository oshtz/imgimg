// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listeners = vi.hoisted(() => new Map<string, (event: { payload: any }) => void>());
const unlisten = vi.hoisted(() => vi.fn());
const listen = vi.hoisted(() => vi.fn(async (name: string, callback: (event: { payload: any }) => void) => {
  listeners.set(name, callback);
  return unlisten;
}));

vi.mock("@tauri-apps/api/event", () => ({ listen }));

import { useGenerationEvents } from "../useGenerationEvents";

beforeEach(() => {
  listeners.clear();
  listen.mockClear();
  unlisten.mockClear();
});

describe("useGenerationEvents", () => {
  it("subscribes to native generation and queue events", async () => {
    const onEvent = vi.fn();
    renderHook(() => useGenerationEvents({ generationId: null, onEvent }));
    await waitFor(() => expect(listen).toHaveBeenCalledTimes(2));

    act(() => listeners.get("generation-event")?.({ payload: { generationId: "g1", status: "running" } }));
    act(() => listeners.get("queue-event")?.({ payload: { jobId: "j1", state: "queued", position: 1 } }));

    expect(onEvent).toHaveBeenCalledWith({ type: "generation", data: { generationId: "g1", status: "running" } });
    expect(onEvent).toHaveBeenCalledWith({ type: "job", data: { jobId: "j1", state: "queued", position: 1 } });
  });

  it("filters generation events by id", async () => {
    const onEvent = vi.fn();
    renderHook(() => useGenerationEvents({ generationId: "g2", onEvent }));
    await waitFor(() => expect(listen).toHaveBeenCalledTimes(2));
    onEvent.mockClear();
    act(() => listeners.get("generation-event")?.({ payload: { generationId: "g1", status: "running" } }));
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("does not subscribe when disabled", () => {
    renderHook(() => useGenerationEvents({ generationId: null, enabled: false }));
    expect(listen).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount", async () => {
    const { unmount } = renderHook(() => useGenerationEvents({ generationId: null }));
    await waitFor(() => expect(listen).toHaveBeenCalledTimes(2));
    unmount();
    expect(unlisten).toHaveBeenCalledTimes(2);
  });
});
