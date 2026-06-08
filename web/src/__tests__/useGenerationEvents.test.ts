// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock tauri-api with toggleable isTauri
const mockIsTauriFlag = vi.hoisted(() => ({ value: false }));
vi.mock("../tauri-api", () => ({ isTauri: () => mockIsTauriFlag.value }));

// Mock client's getSessionId
vi.mock("../client", () => ({
  getSessionId: () => "test-session-id",
}));

// MockEventSource implementation
class MockEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onopen: ((e: Event) => void) | null = null;
  url: string;
  readyState = 0;
  listeners: Record<string, Function[]> = {};

  static instances: MockEventSource[] = [];

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: Function) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(fn);
  }

  removeEventListener(_type: string, _fn: Function) {}

  close() {
    this.readyState = 2;
  }

  // Helper: simulate an SSE event
  _emit(type: string, data: any) {
    const event = { data: JSON.stringify(data) } as MessageEvent;
    const fns = this.listeners[type] ?? [];
    for (const fn of fns) {
      fn(event);
    }
  }

  // Helper: trigger error
  _triggerError() {
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }
}

vi.stubGlobal("EventSource", MockEventSource);

// Mock Tauri event API
type TauriListener = (event: { payload: any }) => void;
const tauriListeners: Record<string, TauriListener[]> = {};
const tauriUnlisteners: (() => void)[] = [];

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (eventName: string, listener: TauriListener) => {
    if (!tauriListeners[eventName]) tauriListeners[eventName] = [];
    tauriListeners[eventName].push(listener);
    const unlisten = () => {
      const idx = tauriListeners[eventName]?.indexOf(listener);
      if (idx !== undefined && idx >= 0) tauriListeners[eventName].splice(idx, 1);
    };
    tauriUnlisteners.push(unlisten);
    return unlisten;
  }),
}));

// Import hook after mocks are set up
import { useGenerationEvents } from "../useGenerationEvents";

beforeEach(() => {
  MockEventSource.instances = [];
  vi.clearAllMocks();
  mockIsTauriFlag.value = false;
});

describe("useGenerationEvents", () => {
  it("creates EventSource with correct URL when enabled", () => {
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: "gen-123",
        enabled: true,
      })
    );

    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toContain("http://localhost:3000/events");
    expect(es.url).toContain("generation_id=gen-123");
    expect(es.url).toContain("session_id=test-session-id");
  });

  it("does not create EventSource when disabled", () => {
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: "gen-123",
        enabled: false,
      })
    );

    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("creates EventSource without generationId when null", () => {
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toContain("http://localhost:3000/events");
    expect(es.url).not.toContain("generation_id");
  });

  it("includes access_token in URL when authToken is provided", () => {
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
        authToken: "my-token",
      })
    );

    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toContain("access_token=my-token");
  });

  it("calls onEvent callback when SSE message received", () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
        onEvent,
      })
    );

    const es = MockEventSource.instances[0];
    act(() => {
      es._emit("connected", { ok: true });
    });

    expect(onEvent).toHaveBeenCalledWith({
      type: "connected",
      data: { ok: true },
    });
  });

  it("parses job events correctly", () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
        onEvent,
      })
    );

    const es = MockEventSource.instances[0];
    const jobData = {
      jobId: "job-1",
      state: "running",
      position: 2,
      generationId: "gen-1",
    };

    act(() => {
      es._emit("job", jobData);
    });

    expect(onEvent).toHaveBeenCalledWith({
      type: "job",
      data: jobData,
    });
  });

  it("parses generation events correctly", () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
        onEvent,
      })
    );

    const es = MockEventSource.instances[0];
    const genData = {
      generationId: "gen-1",
      status: "completed",
      assets: [{ id: "a1", url: "/img.png" }],
    };

    act(() => {
      es._emit("generation", genData);
    });

    expect(onEvent).toHaveBeenCalledWith({
      type: "generation",
      data: genData,
    });
  });

  it("parses generation_deleted events correctly", () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
        onEvent,
      })
    );

    const es = MockEventSource.instances[0];
    act(() => {
      es._emit("generation_deleted", { generationId: "gen-del" });
    });

    expect(onEvent).toHaveBeenCalledWith({
      type: "generation_deleted",
      data: { generationId: "gen-del" },
    });
  });

  it("parses slot_filling events correctly", () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
        onEvent,
      })
    );

    const es = MockEventSource.instances[0];
    act(() => {
      es._emit("slot_filling", {
        generationId: "gen-1",
        slotIndex: 2,
        status: "completed",
      });
    });

    expect(onEvent).toHaveBeenCalledWith({
      type: "slot_filling",
      data: { generationId: "gen-1", slotIndex: 2, status: "completed" },
    });
  });

  it("parses rembg events correctly", () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
        onEvent,
      })
    );

    const es = MockEventSource.instances[0];
    act(() => {
      es._emit("rembg", {
        generationId: "gen-1",
        itemIndex: 0,
        status: "running",
      });
    });

    expect(onEvent).toHaveBeenCalledWith({
      type: "rembg",
      data: { generationId: "gen-1", itemIndex: 0, status: "running" },
    });
  });

  it("cleans up EventSource on unmount", () => {
    const { unmount } = renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.readyState).toBe(0);

    unmount();

    expect(es.readyState).toBe(2); // closed
  });

  it("sets evt state when no onEvent callback is provided", () => {
    const { result } = renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    const es = MockEventSource.instances[0];
    act(() => {
      es._emit("connected", { ok: true });
    });

    expect(result.current).toEqual({
      type: "connected",
      data: { ok: true },
    });
  });

  it("updates evt state on subsequent events", () => {
    const { result } = renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    const es = MockEventSource.instances[0];
    act(() => {
      es._emit("connected", { ok: true });
    });
    expect(result.current?.type).toBe("connected");

    act(() => {
      es._emit("job", { jobId: "j1", state: "queued", position: 1, generationId: null });
    });
    expect(result.current?.type).toBe("job");
  });

  it("registers listeners for all event types", () => {
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    const es = MockEventSource.instances[0];
    expect(es.listeners["connected"]).toHaveLength(1);
    expect(es.listeners["job"]).toHaveLength(1);
    expect(es.listeners["generation"]).toHaveLength(1);
    expect(es.listeners["generation_deleted"]).toHaveLength(1);
    expect(es.listeners["slot_filling"]).toHaveLength(1);
    expect(es.listeners["rembg"]).toHaveLength(1);
  });

  it("sets onerror handler on EventSource", () => {
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    const es = MockEventSource.instances[0];
    expect(es.onerror).toBeTypeOf("function");
  });

  it("handles error without crashing", () => {
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    const es = MockEventSource.instances[0];
    // Should not throw
    expect(() => es._triggerError()).not.toThrow();
  });

  it("creates new EventSource when generationId changes", () => {
    const { rerender } = renderHook(
      (props) =>
        useGenerationEvents({
          apiBaseUrl: "http://localhost:3000",
          generationId: props.generationId,
          enabled: true,
        }),
      { initialProps: { generationId: "gen-1" as string | null } }
    );

    expect(MockEventSource.instances).toHaveLength(1);
    const firstEs = MockEventSource.instances[0];
    expect(firstEs.url).toContain("generation_id=gen-1");

    rerender({ generationId: "gen-2" });

    expect(MockEventSource.instances).toHaveLength(2);
    expect(firstEs.readyState).toBe(2); // old one closed
    const secondEs = MockEventSource.instances[1];
    expect(secondEs.url).toContain("generation_id=gen-2");
  });

  it("defaults enabled to true when not specified", () => {
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
      })
    );

    expect(MockEventSource.instances).toHaveLength(1);
  });

  it("returns null initially", () => {
    const { result } = renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    // Before any events, should be null
    // (only check if no events have been emitted yet by our mock)
    // Since we haven't emitted anything, result.current should be null
    expect(result.current).toBeNull();
  });

  it("uses forceSSE to bypass Tauri mode", () => {
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: "gen-123",
        enabled: true,
        forceSSE: true,
      })
    );

    // Should still create EventSource when forceSSE is true even though
    // isTauri mock is false here (this verifies the forceSSE codepath is exercised)
    expect(MockEventSource.instances).toHaveLength(1);
  });
});

describe("useGenerationEvents (Tauri mode)", () => {
  beforeEach(() => {
    mockIsTauriFlag.value = true;
    MockEventSource.instances = [];
    // Clear tauri listeners
    for (const key of Object.keys(tauriListeners)) {
      tauriListeners[key] = [];
    }
    tauriUnlisteners.length = 0;
  });

  afterEach(() => {
    mockIsTauriFlag.value = false;
  });

  it("does not create EventSource in Tauri mode", async () => {
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    // Wait for async Tauri listener setup
    await waitFor(() => {
      expect(tauriListeners["generation-event"]?.length).toBeGreaterThan(0);
    });

    // No SSE EventSource should be created
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("registers Tauri event listeners for generation-event and queue-event", async () => {
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(tauriListeners["generation-event"]?.length).toBe(1);
      expect(tauriListeners["queue-event"]?.length).toBe(1);
    });
  });

  it("emits synthetic connected event in Tauri mode", async () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
        onEvent,
      })
    );

    await waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith({
        type: "connected",
        data: { ok: true },
      });
    });
  });

  it("forwards generation-event to onEvent callback", async () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
        onEvent,
      })
    );

    await waitFor(() => {
      expect(tauriListeners["generation-event"]?.length).toBe(1);
    });

    act(() => {
      tauriListeners["generation-event"][0]({
        payload: {
          generationId: "gen-1",
          status: "completed",
          assets: [],
        },
      });
    });

    expect(onEvent).toHaveBeenCalledWith({
      type: "generation",
      data: expect.objectContaining({
        generationId: "gen-1",
        status: "completed",
      }),
    });
  });

  it("forwards queue-event to onEvent callback", async () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
        onEvent,
      })
    );

    await waitFor(() => {
      expect(tauriListeners["queue-event"]?.length).toBe(1);
    });

    act(() => {
      tauriListeners["queue-event"][0]({
        payload: {
          jobId: "job-1",
          state: "running",
          position: 1,
          generationId: "gen-1",
        },
      });
    });

    expect(onEvent).toHaveBeenCalledWith({
      type: "job",
      data: expect.objectContaining({
        jobId: "job-1",
        state: "running",
      }),
    });
  });

  it("filters generation events by generationId when specified", async () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: "gen-specific",
        enabled: true,
        onEvent,
      })
    );

    await waitFor(() => {
      expect(tauriListeners["generation-event"]?.length).toBe(1);
    });

    // Clear the connected event
    onEvent.mockClear();

    // Send event for different generation - should be filtered
    act(() => {
      tauriListeners["generation-event"][0]({
        payload: {
          generationId: "gen-other",
          status: "completed",
        },
      });
    });
    expect(onEvent).not.toHaveBeenCalled();

    // Send event for matching generation
    act(() => {
      tauriListeners["generation-event"][0]({
        payload: {
          generationId: "gen-specific",
          status: "completed",
        },
      });
    });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "generation",
        data: expect.objectContaining({ generationId: "gen-specific" }),
      })
    );
  });

  it("sets state when no onEvent callback in Tauri mode", async () => {
    const { result } = renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    await waitFor(() => {
      // Connected event should have set the state
      expect(result.current).toEqual({
        type: "connected",
        data: { ok: true },
      });
    });
  });

  it("cleans up Tauri listeners on unmount", async () => {
    const { unmount } = renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(tauriListeners["generation-event"]?.length).toBe(1);
    });

    unmount();

    // Listeners should be removed
    expect(tauriListeners["generation-event"]?.length).toBe(0);
    expect(tauriListeners["queue-event"]?.length).toBe(0);
  });

  it("does not set up listeners when disabled in Tauri mode", () => {
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: false,
      })
    );

    expect(tauriListeners["generation-event"]?.length ?? 0).toBe(0);
    expect(tauriListeners["queue-event"]?.length ?? 0).toBe(0);
  });

  it("sets internal state for queue-event when no onEvent in Tauri mode", async () => {
    const { result } = renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(tauriListeners["queue-event"]?.length).toBe(1);
    });

    act(() => {
      tauriListeners["queue-event"][0]({
        payload: {
          jobId: "job-1",
          state: "queued",
          position: 2,
          generationId: "gen-1",
        },
      });
    });

    expect(result.current).toEqual({
      type: "job",
      data: expect.objectContaining({ jobId: "job-1", state: "queued" }),
    });
  });

  it("uses forceSSE to create EventSource even in Tauri mode", () => {
    renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: "gen-forced",
        enabled: true,
        forceSSE: true,
      })
    );

    // forceSSE in Tauri mode should create an EventSource
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain("generation_id=gen-forced");
  });

  it("sets internal state for generation-event when no onEvent in Tauri mode", async () => {
    const { result } = renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(tauriListeners["generation-event"]?.length).toBe(1);
    });

    act(() => {
      tauriListeners["generation-event"][0]({
        payload: {
          generationId: "gen-1",
          status: "succeeded",
          assets: [],
        },
      });
    });

    expect(result.current).toEqual({
      type: "generation",
      data: expect.objectContaining({ generationId: "gen-1", status: "succeeded" }),
    });
  });

  it("sets internal connected state when no onEvent callback in Tauri mode (via setEvt)", async () => {
    const { result } = renderHook(() =>
      useGenerationEvents({
        apiBaseUrl: "http://localhost:3000",
        generationId: null,
        enabled: true,
      })
    );

    await waitFor(() => {
      // The connected event should set the internal state
      expect(result.current).toEqual({
        type: "connected",
        data: { ok: true },
      });
    });
  });
});
