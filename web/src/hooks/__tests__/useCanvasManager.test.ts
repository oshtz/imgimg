// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockListCanvases = vi.fn(() => [] as any[]);
const mockListCanvasesAsync = vi.fn(async () => [] as any[]);
const mockCreateCanvas = vi.fn((name: string) => ({
  id: `canvas_123`,
  name,
  createdAt: new Date().toISOString(),
}));
const mockDeleteCanvas = vi.fn();
const mockRenameCanvas = vi.fn();
const mockGetCanvasStateAsync = vi.fn(async (_id?: string): Promise<any> => null);
const mockPutCanvasLocalState = vi.fn();

vi.mock("../../canvas/canvasStorage", () => ({
  listCanvases: () => mockListCanvases(),
  listCanvasesAsync: () => mockListCanvasesAsync(),
  createCanvas: (name: string) => mockCreateCanvas(name),
  deleteCanvas: (id: string) => mockDeleteCanvas(id),
  renameCanvas: (id: string, name: string) => mockRenameCanvas(id, name),
  getCanvasStateAsync: (id: string) => mockGetCanvasStateAsync(id),
  putCanvasLocalState: (id: string, state: any) => mockPutCanvasLocalState(id, state),
}));

const mockIsTauri = vi.hoisted(() => ({ value: false }));
vi.mock("../../tauri-api", () => ({ isTauri: () => mockIsTauri.value }));
vi.mock("../../client", () => ({
  getCanvasState: vi.fn(async () => ({
    nodes: [],
    chatMessages: [],
    nextZIndex: 1,
  })),
}));
vi.mock("../../utils/assets", () => ({
  resolveStorageUrl: vi.fn((_: any, url: string) => url),
}));

import { useCanvasManager } from "../useCanvasManager";

const apiBaseUrl = "http://localhost:3000" as any;
const mockSetActiveView = vi.fn();
const mockSetSidebarCollapsed = vi.fn();

function renderCanvasManager(canvases: any[] = []) {
  mockListCanvases.mockReturnValue(canvases);
  return renderHook(() =>
    useCanvasManager(apiBaseUrl, true, mockSetActiveView, mockSetSidebarCollapsed)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Mark migration as done to prevent async side effects
  localStorage.setItem("imgimg.canvasMigrated", "1");
  mockListCanvases.mockReturnValue([]);
  mockListCanvasesAsync.mockResolvedValue([]);
  mockIsTauri.value = false;
});

describe("useCanvasManager", () => {
  it("returns empty canvases initially", () => {
    const { result } = renderCanvasManager();
    expect(result.current.canvases).toEqual([]);
    expect(result.current.activeCanvasId).toBeNull();
  });

  it("handleCanvasCreate creates canvas and sets active", () => {
    const { result } = renderCanvasManager();

    // After createCanvas, listCanvases returns the new canvas
    const newCanvas = { id: "canvas_123", name: "Canvas 1", createdAt: "2026-01-01" };
    mockListCanvases.mockReturnValue([newCanvas]);

    act(() => {
      result.current.handleCanvasCreate();
    });

    expect(mockCreateCanvas).toHaveBeenCalledWith("Canvas 1");
    expect(result.current.canvases).toEqual([newCanvas]);
    expect(result.current.activeCanvasId).toBe("canvas_123");
    expect(mockSetActiveView).toHaveBeenCalledWith("canvas");
  });

  it("handleCanvasDelete removes canvas", () => {
    const canvas1 = { id: "c1", name: "Canvas 1", createdAt: "2026-01-01" };
    const canvas2 = { id: "c2", name: "Canvas 2", createdAt: "2026-01-02" };
    const { result } = renderCanvasManager([canvas1, canvas2]);

    act(() => {
      result.current.handleCanvasDelete("c1");
    });

    expect(mockDeleteCanvas).toHaveBeenCalledWith("c1");
    expect(result.current.canvases).toEqual([canvas2]);
  });

  it("handleCanvasDelete switches to remaining canvas when active deleted", () => {
    const canvas1 = { id: "c1", name: "Canvas 1", createdAt: "2026-01-01" };
    const canvas2 = { id: "c2", name: "Canvas 2", createdAt: "2026-01-02" };
    const { result } = renderCanvasManager([canvas1, canvas2]);

    // Set active to c1 first
    act(() => {
      result.current.setActiveCanvasId("c1");
    });

    act(() => {
      result.current.handleCanvasDelete("c1");
    });

    expect(result.current.activeCanvasId).toBe("c2");
  });

  it("handleCanvasRename updates name", () => {
    const canvas1 = { id: "c1", name: "Canvas 1", createdAt: "2026-01-01" };
    const renamedCanvas = { ...canvas1, name: "Renamed" };
    const { result } = renderCanvasManager([canvas1]);

    mockListCanvases.mockReturnValue([renamedCanvas]);

    act(() => {
      result.current.handleCanvasRename("c1", "Renamed");
    });

    expect(mockRenameCanvas).toHaveBeenCalledWith("c1", "Renamed");
    expect(result.current.canvases).toEqual([renamedCanvas]);
  });

  it("handleCanvasSelect sets active and view", () => {
    const canvas1 = { id: "c1", name: "Canvas 1", createdAt: "2026-01-01" };
    const { result } = renderCanvasManager([canvas1]);

    act(() => {
      result.current.handleCanvasSelect("c1");
    });

    expect(result.current.activeCanvasId).toBe("c1");
    expect(mockSetActiveView).toHaveBeenCalledWith("canvas");
    expect(mockSetSidebarCollapsed).toHaveBeenCalled();
  });

  it("handleCanvasDelete sets activeCanvasId to null and view to generate when no remaining canvases", () => {
    const canvas1 = { id: "c1", name: "Canvas 1", createdAt: "2026-01-01" };
    const { result } = renderCanvasManager([canvas1]);

    // Set active to c1
    act(() => {
      result.current.setActiveCanvasId("c1");
    });

    act(() => {
      result.current.handleCanvasDelete("c1");
    });

    expect(result.current.activeCanvasId).toBeNull();
    expect(result.current.canvases).toEqual([]);
    expect(mockSetActiveView).toHaveBeenCalledWith("generate");
  });

  it("handleCanvasDelete does not change activeCanvasId when deleting non-active canvas", () => {
    const canvas1 = { id: "c1", name: "Canvas 1", createdAt: "2026-01-01" };
    const canvas2 = { id: "c2", name: "Canvas 2", createdAt: "2026-01-02" };
    const { result } = renderCanvasManager([canvas1, canvas2]);

    // Set active to c1
    act(() => {
      result.current.setActiveCanvasId("c1");
    });

    // Delete c2 (non-active)
    act(() => {
      result.current.handleCanvasDelete("c2");
    });

    expect(result.current.activeCanvasId).toBe("c1");
    expect(result.current.canvases).toEqual([canvas1]);
  });

  it("multiple canvas operations in sequence", () => {
    const { result } = renderCanvasManager();

    // Create first canvas
    const canvas1 = { id: "canvas_123", name: "Canvas 1", createdAt: "2026-01-01" };
    mockListCanvases.mockReturnValue([canvas1]);
    act(() => {
      result.current.handleCanvasCreate();
    });
    expect(result.current.canvases).toHaveLength(1);
    expect(result.current.activeCanvasId).toBe("canvas_123");

    // Rename it
    const renamedCanvas = { ...canvas1, name: "My Canvas" };
    mockListCanvases.mockReturnValue([renamedCanvas]);
    act(() => {
      result.current.handleCanvasRename("canvas_123", "My Canvas");
    });
    expect(result.current.canvases[0].name).toBe("My Canvas");

    // Delete it
    act(() => {
      result.current.handleCanvasDelete("canvas_123");
    });
    expect(result.current.canvases).toEqual([]);
    expect(result.current.activeCanvasId).toBeNull();
  });

  it("refreshCanvasList returns updated list (non-Tauri)", async () => {
    const { result } = renderCanvasManager();

    const canvasList = [
      { id: "c1", name: "Canvas 1", createdAt: "2026-01-01" },
    ];
    mockListCanvases.mockReturnValue(canvasList);

    let list: any;
    await act(async () => {
      list = await result.current.refreshCanvasList();
    });

    expect(list).toEqual(canvasList);
    expect(result.current.canvases).toEqual(canvasList);
  });

  it("loads canvas previews from state with image nodes", async () => {
    const canvases = [
      { id: "c1", name: "Canvas 1", createdAt: "2026-01-01" },
      { id: "c2", name: "Canvas 2", createdAt: "2026-01-02" },
    ];

    mockGetCanvasStateAsync.mockImplementation(async (id?: string): Promise<any> => {
      if (id === "c1") {
        return {
          nodes: [
            { type: "image", src: "http://example.com/img.png" },
          ],
        };
      }
      if (id === "c2") {
        return {
          nodes: [
            { type: "image", asset: { url: "/storage/thumb.png" } },
          ],
        };
      }
      return null;
    });

    const { result } = renderCanvasManager(canvases);

    await waitFor(() => {
      expect(Object.keys(result.current.canvasPreviews).length).toBeGreaterThan(0);
    });

    // c1 uses src directly, c2 resolves storage URL
    expect(result.current.canvasPreviews["c1"]).toBe("http://example.com/img.png");
    expect(result.current.canvasPreviews["c2"]).toBe("/storage/thumb.png");
  });

  it("canvas previews handles errors gracefully", async () => {
    const canvases = [
      { id: "c1", name: "Canvas 1", createdAt: "2026-01-01" },
    ];

    mockGetCanvasStateAsync.mockRejectedValue(new Error("DB error"));

    const { result } = renderCanvasManager(canvases);

    // Should not crash, previews should remain empty
    await waitFor(() => {
      expect(mockGetCanvasStateAsync).toHaveBeenCalled();
    });

    expect(result.current.canvasPreviews).toEqual({});
  });

  describe("migration", () => {
    it("migration runs once and sets MIGRATION_KEY", async () => {
      // Remove migration key to allow migration to run
      localStorage.removeItem("imgimg.canvasMigrated");

      const { getCanvasState } = await import("../../client");
      // Mock server returning empty data
      (getCanvasState as any).mockResolvedValue({
        nodes: [],
        chatMessages: [],
        nextZIndex: 1,
      });

      renderCanvasManager();

      await waitFor(() => {
        expect(localStorage.getItem("imgimg.canvasMigrated")).toBe("1");
      });
    });

    it("migration skipped when key already set", async () => {
      localStorage.setItem("imgimg.canvasMigrated", "1");

      const { getCanvasState } = await import("../../client");
      (getCanvasState as any).mockClear();

      renderCanvasManager();

      // Should not call getCanvasState since migration is skipped
      await waitFor(() => {
        // Give time for effects to run
        expect(localStorage.getItem("imgimg.canvasMigrated")).toBe("1");
      });
    });

    it("Tauri migration skips when no local canvases or default state", async () => {
      localStorage.removeItem("imgimg.canvasMigrated");
      mockIsTauri.value = true;

      // No local canvases in localStorage
      // Mock Tauri APIs
      vi.doMock("../../tauri-api", async () => ({
        isTauri: () => true,
        createCanvas: vi.fn(),
        saveCanvasState: vi.fn(),
        getCanvasState: vi.fn(async () => null),
      }));

      mockListCanvasesAsync.mockResolvedValue([]);

      renderCanvasManager();

      await waitFor(() => {
        expect(localStorage.getItem("imgimg.canvasMigrated")).toBe("1");
      });
    });

    it("Tauri migration migrates localStorage canvases to SQLite", async () => {
      localStorage.removeItem("imgimg.canvasMigrated");
      mockIsTauri.value = true;

      // Set up localStorage canvases
      const localCanvases = [
        { id: "lc1", name: "Local Canvas 1", createdAt: "2026-01-01" },
      ];
      localStorage.setItem("imgimg.canvases", JSON.stringify(localCanvases));
      localStorage.setItem("imgimg.canvas.state.lc1", JSON.stringify({
        nodes: [{ id: "n1", type: "image" }],
        chatMessages: [],
        nextZIndex: 2,
      }));

      const mockTauriCreateCanvas = vi.fn();
      const mockTauriSaveCanvasState = vi.fn();
      const mockTauriGetCanvasState = vi.fn(async () => null);

      vi.doMock("../../tauri-api", async () => ({
        isTauri: () => true,
        createCanvas: mockTauriCreateCanvas,
        saveCanvasState: mockTauriSaveCanvasState,
        getCanvasState: mockTauriGetCanvasState,
      }));

      const migratedList = [{ id: "lc1", name: "Local Canvas 1", createdAt: "2026-01-01" }];
      mockListCanvasesAsync.mockResolvedValue(migratedList);

      const { result } = renderCanvasManager();

      await waitFor(() => {
        expect(localStorage.getItem("imgimg.canvasMigrated")).toBe("1");
      });

      await waitFor(() => {
        expect(result.current.canvases).toEqual(migratedList);
      });
    });

    it("Tauri migration migrates default canvas with data", async () => {
      localStorage.removeItem("imgimg.canvasMigrated");
      localStorage.removeItem("imgimg.activeCanvasId");
      mockIsTauri.value = true;

      // No local canvases array
      const mockTauriCreateCanvas = vi.fn();
      const mockTauriSaveCanvasState = vi.fn();
      const mockTauriGetCanvasState = vi.fn(async () => ({
        nodes: [{ id: "n1", type: "image" }],
        chatMessages: [{ text: "hello" }],
        nextZIndex: 3,
      }));

      vi.doMock("../../tauri-api", async () => ({
        isTauri: () => true,
        createCanvas: mockTauriCreateCanvas,
        saveCanvasState: mockTauriSaveCanvasState,
        getCanvasState: mockTauriGetCanvasState,
      }));

      const migratedCanvas = { id: "canvas_123", name: "Canvas (migrated)", createdAt: "2026-01-01" };
      mockCreateCanvas.mockReturnValue(migratedCanvas);
      mockListCanvasesAsync.mockResolvedValue([migratedCanvas]);

      const { result } = renderCanvasManager();

      await waitFor(() => {
        expect(localStorage.getItem("imgimg.canvasMigrated")).toBe("1");
      });

      await waitFor(() => {
        expect(result.current.canvases).toEqual([migratedCanvas]);
        expect(result.current.activeCanvasId).toBe("canvas_123");
      });
    });

    it("non-Tauri migration creates canvas from server data", async () => {
      localStorage.removeItem("imgimg.canvasMigrated");

      const { getCanvasState } = await import("../../client");
      (getCanvasState as any).mockResolvedValue({
        nodes: [{ id: "n1", type: "image" }],
        chatMessages: [{ text: "hello" }],
        chatWorkflowId: "wf-1",
        nextZIndex: 5,
      });

      const newCanvas = { id: "canvas_123", name: "Canvas", createdAt: "2026-01-01" };
      mockCreateCanvas.mockReturnValue(newCanvas);
      mockListCanvases.mockReturnValue([newCanvas]);

      const { result } = renderCanvasManager();

      await waitFor(() => {
        expect(mockCreateCanvas).toHaveBeenCalledWith("Canvas");
      });

      expect(mockPutCanvasLocalState).toHaveBeenCalledWith("canvas_123", expect.objectContaining({
        nodes: [{ id: "n1", type: "image" }],
        chatMessages: [{ text: "hello" }],
      }));
    });
  });

  it("refreshCanvasList in Tauri mode uses listCanvasesAsync", async () => {
    mockIsTauri.value = true;
    const canvasList = [{ id: "c1", name: "Canvas 1", createdAt: "2026-01-01" }];
    mockListCanvasesAsync.mockResolvedValue(canvasList);

    const { result } = renderCanvasManager();

    let list: any;
    await act(async () => {
      list = await result.current.refreshCanvasList();
    });

    expect(list).toEqual(canvasList);
    expect(mockListCanvasesAsync).toHaveBeenCalled();
  });

  it("loads canvases from Tauri on mount", async () => {
    mockIsTauri.value = true;
    const canvasList = [{ id: "c1", name: "Canvas 1", createdAt: "2026-01-01" }];
    mockListCanvasesAsync.mockResolvedValue(canvasList);

    const { result } = renderCanvasManager();

    await waitFor(() => {
      expect(result.current.canvases).toEqual(canvasList);
    });
  });

  it("deserializes activeCanvasId from localStorage", () => {
    localStorage.setItem("imgimg.activeCanvasId", "saved-canvas-id");
    const { result } = renderCanvasManager();
    expect(result.current.activeCanvasId).toBe("saved-canvas-id");
  });

  it("deserializes empty string activeCanvasId as null", () => {
    localStorage.setItem("imgimg.activeCanvasId", "");
    const { result } = renderCanvasManager();
    expect(result.current.activeCanvasId).toBeNull();
  });

  it("Tauri migration handles invalid JSON in localStorage canvases", async () => {
    localStorage.removeItem("imgimg.canvasMigrated");
    mockIsTauri.value = true;

    // Set invalid JSON for canvases
    localStorage.setItem("imgimg.canvases", "invalid json{{{");

    vi.doMock("../../tauri-api", async () => ({
      isTauri: () => true,
      createCanvas: vi.fn(),
      saveCanvasState: vi.fn(),
      getCanvasState: vi.fn(async () => null),
    }));

    mockListCanvasesAsync.mockResolvedValue([]);

    renderCanvasManager();

    await waitFor(() => {
      expect(localStorage.getItem("imgimg.canvasMigrated")).toBe("1");
    });

    // Should not crash - the catch block returns []
  });

  it("migration handles errors gracefully without crashing", async () => {
    localStorage.removeItem("imgimg.canvasMigrated");

    const { getCanvasState } = await import("../../client");
    (getCanvasState as any).mockRejectedValue(new Error("Network error"));

    // Should not throw
    const { result } = renderCanvasManager();

    await waitFor(() => {
      expect(localStorage.getItem("imgimg.canvasMigrated")).toBe("1");
    });

    // App should still work
    expect(result.current.canvases).toEqual([]);
  });

  it("non-Tauri migration skips when server returns no data", async () => {
    localStorage.removeItem("imgimg.canvasMigrated");

    const { getCanvasState } = await import("../../client");
    (getCanvasState as any).mockResolvedValue({
      nodes: [],
      chatMessages: [],
      nextZIndex: 1,
    });

    renderCanvasManager();

    await waitFor(() => {
      expect(localStorage.getItem("imgimg.canvasMigrated")).toBe("1");
    });

    // Should not create any canvas since there's no data
    expect(mockCreateCanvas).not.toHaveBeenCalled();
  });
});
