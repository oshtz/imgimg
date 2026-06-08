import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock localStorage
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
});

// Mock tauri-api with a togglable isTauri
const _isTauriFlag = vi.hoisted(() => ({ value: false }));
vi.mock("../../tauri-api", () => ({
  isTauri: vi.fn(() => _isTauriFlag.value),
  listCanvases: vi.fn().mockResolvedValue([]),
  createCanvas: vi.fn(),
  renameCanvas: vi.fn(),
  deleteCanvas: vi.fn(),
  getCanvasState: vi.fn().mockResolvedValue(null),
  saveCanvasState: vi.fn(),
}));

import {
  listCanvases,
  listCanvasesAsync,
  createCanvas,
  renameCanvas,
  deleteCanvas,
  getCanvasLocalState,
  getCanvasStateAsync,
  putCanvasLocalState,
} from "../canvasStorage";

beforeEach(() => {
  storage.clear();
});

describe("listCanvases", () => {
  it("returns empty array initially", () => {
    const result = listCanvases();
    expect(result).toEqual([]);
  });

  it("returns parsed array from localStorage", () => {
    const canvases = [
      { id: "canvas_1", name: "My Canvas", createdAt: "2025-01-01T00:00:00.000Z" },
    ];
    storage.set("imgimg.canvases", JSON.stringify(canvases));
    const result = listCanvases();
    expect(result).toEqual(canvases);
  });

  it("returns empty array on invalid JSON", () => {
    storage.set("imgimg.canvases", "not-json");
    const result = listCanvases();
    expect(result).toEqual([]);
  });
});

describe("createCanvas", () => {
  it("returns meta with id, name, and createdAt", () => {
    const meta = createCanvas("Test Canvas");
    expect(meta).toHaveProperty("id");
    expect(meta).toHaveProperty("name", "Test Canvas");
    expect(meta).toHaveProperty("createdAt");
    expect(meta.id).toMatch(/^canvas_/);
  });

  it("adds the canvas to localStorage index", () => {
    createCanvas("First");
    const stored = JSON.parse(storage.get("imgimg.canvases") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("First");
  });

  it("appends multiple canvases to the list", () => {
    createCanvas("A");
    createCanvas("B");
    const stored = JSON.parse(storage.get("imgimg.canvases") ?? "[]");
    expect(stored).toHaveLength(2);
  });

  it("generates unique ids for each canvas", () => {
    const a = createCanvas("A");
    const b = createCanvas("B");
    expect(a.id).not.toBe(b.id);
  });

  it("createdAt is a valid ISO string", () => {
    const meta = createCanvas("Test");
    const date = new Date(meta.createdAt);
    expect(date.toISOString()).toBe(meta.createdAt);
  });
});

describe("renameCanvas", () => {
  it("updates name in localStorage", () => {
    const meta = createCanvas("Original");
    renameCanvas(meta.id, "Renamed");
    const stored = JSON.parse(storage.get("imgimg.canvases") ?? "[]");
    expect(stored[0].name).toBe("Renamed");
  });

  it("does nothing for non-existent id", () => {
    createCanvas("Only");
    renameCanvas("nonexistent", "Nope");
    const stored = JSON.parse(storage.get("imgimg.canvases") ?? "[]");
    expect(stored[0].name).toBe("Only");
  });

  it("only renames the targeted canvas", () => {
    const a = createCanvas("A");
    createCanvas("B");
    renameCanvas(a.id, "A2");
    const stored = JSON.parse(storage.get("imgimg.canvases") ?? "[]");
    const names = stored.map((c: any) => c.name);
    expect(names).toContain("A2");
    expect(names).toContain("B");
  });
});

describe("deleteCanvas", () => {
  it("removes canvas from list", () => {
    const meta = createCanvas("Doomed");
    deleteCanvas(meta.id);
    const stored = JSON.parse(storage.get("imgimg.canvases") ?? "[]");
    expect(stored).toHaveLength(0);
  });

  it("removes persisted canvas state", () => {
    const meta = createCanvas("Doomed");
    storage.set(`imgimg.canvas.state.${meta.id}`, '{"nodes":[]}');
    deleteCanvas(meta.id);
    expect(storage.has(`imgimg.canvas.state.${meta.id}`)).toBe(false);
  });

  it("removes viewport data for the canvas", () => {
    const meta = createCanvas("Doomed");
    storage.set(`imgimg.canvas.viewport.${meta.id}`, '{"x":0}');
    deleteCanvas(meta.id);
    expect(storage.has(`imgimg.canvas.viewport.${meta.id}`)).toBe(false);
  });

  it("does not affect other canvases", () => {
    const a = createCanvas("A");
    const b = createCanvas("B");
    deleteCanvas(a.id);
    const stored = JSON.parse(storage.get("imgimg.canvases") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(b.id);
  });
});

describe("getCanvasLocalState", () => {
  it("returns null when no state stored", () => {
    expect(getCanvasLocalState("canvas_xyz")).toBeNull();
  });

  it("returns parsed state from localStorage", () => {
    const state = { nodes: [{ id: "n1" }], nextZIndex: 5 };
    storage.set("imgimg.canvas.state.canvas_abc", JSON.stringify(state));
    const result = getCanvasLocalState("canvas_abc");
    expect(result).toEqual(state);
  });

  it("returns null on invalid JSON", () => {
    storage.set("imgimg.canvas.state.canvas_bad", "{{bad");
    expect(getCanvasLocalState("canvas_bad")).toBeNull();
  });
});

describe("putCanvasLocalState", () => {
  it("stores stringified state in localStorage", () => {
    const state = { nodes: [], chatMessages: [], nextZIndex: 1 };
    putCanvasLocalState("canvas_123", state);
    const raw = storage.get("imgimg.canvas.state.canvas_123");
    expect(raw).toBe(JSON.stringify(state));
  });

  it("overwrites existing state", () => {
    putCanvasLocalState("canvas_x", { nodes: [1] });
    putCanvasLocalState("canvas_x", { nodes: [1, 2] });
    const parsed = JSON.parse(storage.get("imgimg.canvas.state.canvas_x")!);
    expect(parsed.nodes).toEqual([1, 2]);
  });

  it("state can be read back with getCanvasLocalState", () => {
    const state = { nodes: [{ id: "n1" }], nextZIndex: 10 };
    putCanvasLocalState("canvas_rt", state);
    expect(getCanvasLocalState("canvas_rt")).toEqual(state);
  });
});

describe("edge cases", () => {
  it("createCanvas generates IDs with canvas_ prefix and random suffix", () => {
    const ids = Array.from({ length: 5 }, (_, i) => createCanvas(`c${i}`).id);
    const allUnique = new Set(ids).size === ids.length;
    expect(allUnique).toBe(true);
    ids.forEach((id) => expect(id).toMatch(/^canvas_\d+_[a-z0-9]+$/));
  });

  it("listCanvases returns empty array when index is empty string", () => {
    storage.set("imgimg.canvases", "");
    expect(listCanvases()).toEqual([]);
  });

  it("multiple canvases are tracked independently", () => {
    const a = createCanvas("A");
    const b = createCanvas("B");
    const c = createCanvas("C");
    putCanvasLocalState(a.id, { nodes: [1] });
    putCanvasLocalState(b.id, { nodes: [2] });
    putCanvasLocalState(c.id, { nodes: [3] });

    expect(getCanvasLocalState(a.id)).toEqual({ nodes: [1] });
    expect(getCanvasLocalState(b.id)).toEqual({ nodes: [2] });
    expect(getCanvasLocalState(c.id)).toEqual({ nodes: [3] });

    deleteCanvas(b.id);
    expect(getCanvasLocalState(b.id)).toBeNull();
    expect(getCanvasLocalState(a.id)).toEqual({ nodes: [1] });
    expect(getCanvasLocalState(c.id)).toEqual({ nodes: [3] });

    const remaining = listCanvases();
    expect(remaining).toHaveLength(2);
    expect(remaining.map((r) => r.id)).toEqual([a.id, c.id]);
  });

  it("renameCanvas preserves other fields like createdAt", () => {
    const meta = createCanvas("Original");
    renameCanvas(meta.id, "NewName");
    const stored = JSON.parse(storage.get("imgimg.canvases") ?? "[]");
    expect(stored[0].createdAt).toBe(meta.createdAt);
    expect(stored[0].id).toBe(meta.id);
  });

  it("getCanvasLocalState handles objects with nested data", () => {
    const complexState = {
      nodes: [{ id: "n1", data: { label: "Node 1", children: [1, 2, 3] } }],
      chatMessages: [{ role: "user", content: "hello" }],
      nextZIndex: 10,
      meta: { nested: { deep: true } },
    };
    storage.set("imgimg.canvas.state.canvas_complex", JSON.stringify(complexState));
    const result = getCanvasLocalState("canvas_complex");
    expect(result).toEqual(complexState);
  });

  it("getCanvasLocalState handles arrays as state", () => {
    const arrayState = [1, 2, 3];
    storage.set("imgimg.canvas.state.canvas_arr", JSON.stringify(arrayState));
    const result = getCanvasLocalState("canvas_arr");
    expect(result).toEqual(arrayState);
  });

  it("putCanvasLocalState overwrites existing state completely", () => {
    putCanvasLocalState("canvas_ow", { nodes: [1, 2, 3], extra: "field" });
    putCanvasLocalState("canvas_ow", { nodes: [4] });
    const result = getCanvasLocalState("canvas_ow") as any;
    expect(result.nodes).toEqual([4]);
    expect(result.extra).toBeUndefined();
  });

  it("putCanvasLocalState silently handles storage full (setItem throws)", () => {
    // Replace setItem temporarily to throw
    const origSetItem = localStorage.setItem;
    const throwingSetItem = (_key: string, _value: string) => {
      throw new DOMException("QuotaExceededError");
    };
    (localStorage as any).setItem = throwingSetItem;

    // Should not throw
    expect(() => putCanvasLocalState("canvas_full", { nodes: [] })).not.toThrow();

    // Restore
    (localStorage as any).setItem = origSetItem;
  });

  it("renameCanvas is a no-op for missing canvas id", () => {
    // No canvases created — renaming should not throw or create entries
    renameCanvas("nonexistent_id", "NewName");
    const stored = JSON.parse(storage.get("imgimg.canvases") ?? "[]");
    expect(stored).toEqual([]);
  });

  it("getCanvasStateAsync returns localStorage state in non-Tauri mode", async () => {
    const state = { nodes: [{ id: "n1" }], nextZIndex: 3 };
    storage.set("imgimg.canvas.state.canvas_async", JSON.stringify(state));
    const result = await getCanvasStateAsync("canvas_async");
    expect(result).toEqual(state);
  });

  it("listCanvasesAsync returns localStorage list in non-Tauri mode", async () => {
    const canvases = [
      { id: "canvas_1", name: "My Canvas", createdAt: "2025-01-01T00:00:00.000Z" },
    ];
    storage.set("imgimg.canvases", JSON.stringify(canvases));
    const result = await listCanvasesAsync();
    expect(result).toEqual(canvases);
  });
});

// ── Tauri mode ──

describe("Tauri mode", () => {
  let tauriMock: typeof import("../../tauri-api");

  beforeEach(async () => {
    tauriMock = await import("../../tauri-api");
    _isTauriFlag.value = true;
  });

  afterEach(() => {
    _isTauriFlag.value = false;
  });

  it("listCanvases returns cached canvases in Tauri mode", () => {
    const result = listCanvases();
    // Returns empty cached array by default (no async fetch yet)
    expect(Array.isArray(result)).toBe(true);
  });

  it("listCanvasesAsync calls tauriApi.listCanvases", async () => {
    const { listCanvasesAsync } = await import("../canvasStorage");
    const expected = [{ id: "c1", name: "Canvas 1", createdAt: "2025-01-01" }];
    vi.mocked(tauriMock.listCanvases).mockResolvedValue(expected as any);

    const result = await listCanvasesAsync();
    expect(tauriMock.listCanvases).toHaveBeenCalled();
    expect(result).toEqual(expected);
  });

  it("getCanvasStateAsync calls tauriApi.getCanvasState in Tauri mode", async () => {
    const { getCanvasStateAsync } = await import("../canvasStorage");
    const state = { nodes: [{ id: "n1" }], nextZIndex: 3 };
    vi.mocked(tauriMock.getCanvasState).mockResolvedValue(state as any);

    const result = await getCanvasStateAsync("canvas_1");
    expect(tauriMock.getCanvasState).toHaveBeenCalledWith("canvas_1");
    expect(result).toEqual(state);
  });

  it("putCanvasLocalState calls tauriApi.saveCanvasState in Tauri mode", () => {
    const state = {
      nodes: [{ id: "n1" }],
      chatMessages: [{ text: "hi" }],
      chatWorkflowId: "wf-1",
      nextZIndex: 5,
      pinnedModelIds: ["m1"],
      pinnedWorkflowIds: ["wf-1"],
      selectedProviderModelId: "pm-1",
      activeEngine: "comfyui",
    };
    putCanvasLocalState("canvas_t1", state);
    expect(tauriMock.saveCanvasState).toHaveBeenCalledWith({
      gameId: "canvas_t1",
      nodes: [{ id: "n1" }],
      chatMessages: [{ text: "hi" }],
      chatWorkflowId: "wf-1",
      nextZIndex: 5,
      pinnedModelIds: ["m1"],
      pinnedWorkflowIds: ["wf-1"],
      selectedProviderModelId: "pm-1",
      activeEngine: "comfyui",
    });
  });

  it("putCanvasLocalState defaults missing fields", () => {
    putCanvasLocalState("canvas_t2", {});
    expect(tauriMock.saveCanvasState).toHaveBeenCalledWith({
      gameId: "canvas_t2",
      nodes: [],
      chatMessages: [],
      chatWorkflowId: undefined,
      nextZIndex: 1,
      pinnedModelIds: [],
      pinnedWorkflowIds: [],
      selectedProviderModelId: null,
      activeEngine: null,
    });
  });

  it("createCanvas calls tauriApi.createCanvas", () => {
    vi.mocked(tauriMock.createCanvas).mockResolvedValue({
      id: "canvas_srv",
      name: "Tauri Canvas",
      createdAt: "2025-01-01",
    } as any);

    const meta = createCanvas("Tauri Canvas");
    expect(meta.name).toBe("Tauri Canvas");
    expect(meta.id).toMatch(/^canvas_/);
    expect(tauriMock.createCanvas).toHaveBeenCalledWith(meta.id, "Tauri Canvas");
  });

  it("renameCanvas calls tauriApi.renameCanvas", () => {
    renameCanvas("c1", "New Name");
    expect(tauriMock.renameCanvas).toHaveBeenCalledWith("c1", "New Name");
  });

  it("deleteCanvas calls tauriApi.deleteCanvas", () => {
    deleteCanvas("c1");
    expect(tauriMock.deleteCanvas).toHaveBeenCalledWith("c1");
  });
});
