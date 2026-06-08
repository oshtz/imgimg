// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSpaceKey, useCanvasInteractions } from "../useCanvasInteractions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Record<string, any> = {}) {
  return {
    id: "node-1",
    type: "image" as const,
    src: "test.png",
    x: 50,
    y: 50,
    width: 100,
    height: 100,
    naturalWidth: 100,
    naturalHeight: 100,
    zIndex: 1,
    ...overrides,
  };
}

function makeState(overrides: Partial<ReturnType<typeof defaultState>> = {}) {
  return { ...defaultState(), ...overrides };
}

function defaultState() {
  return {
    nodes: [makeNode()],
    selectedNodeIds: new Set<string>(),
    viewport: { x: 0, y: 0, scale: 1 },
    editMode: "select",
    connectors: [] as any[],
    showLineage: false,
  };
}

function makeMockStage(target?: any) {
  const container = document.createElement("div");
  // Give the container a bounding rect
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => {},
  });
  const stage: any = {
    getPointerPosition: vi.fn(() => ({ x: 100, y: 100 })),
    container: vi.fn(() => container),
    getAbsoluteTransform: vi.fn(() => ({
      copy: () => ({ invert: () => ({ point: (p: any) => p }) }),
    })),
  };
  return stage;
}

function setupInteractions(stateOverrides: Partial<ReturnType<typeof defaultState>> = {}) {
  const state = makeState(stateOverrides);
  const stateRef = { current: state } as { readonly current: typeof state };
  const viewportRef = { current: state.viewport } as { readonly current: typeof state.viewport };
  const stage = makeMockStage();
  const stageRef = { current: stage } as any;
  const dispatch = vi.fn();
  const screenToWorld = vi.fn((sx: number, sy: number) => ({ x: sx, y: sy }));
  const onConnectorSelect = vi.fn();

  const hookResult = renderHook(() =>
    useCanvasInteractions(
      stateRef,
      viewportRef,
      stageRef,
      dispatch,
      false, // locked
      false, // spaceHeld
      screenToWorld,
      "#ff0000",
      2,
      onConnectorSelect,
      null,
    ),
  );

  return { hookResult, dispatch, stateRef, stageRef, stage, screenToWorld, onConnectorSelect };
}

function konvaEvent(nativeEvent: Partial<MouseEvent | WheelEvent>, target?: any): any {
  return {
    evt: { preventDefault: vi.fn(), ...nativeEvent },
    target: target ?? null,
  };
}

// ---------------------------------------------------------------------------
// useSpaceKey
// ---------------------------------------------------------------------------

describe("useSpaceKey", () => {
  it("returns false initially", () => {
    const { result } = renderHook(() => useSpaceKey());
    expect(result.current).toBe(false);
  });

  it("returns true when space is pressed", () => {
    const { result } = renderHook(() => useSpaceKey());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    });
    expect(result.current).toBe(true);
  });

  it("returns false when space is released", () => {
    const { result } = renderHook(() => useSpaceKey());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    });
    expect(result.current).toBe(true);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    });
    expect(result.current).toBe(false);
  });

  it("ignores space in input elements", () => {
    const { result } = renderHook(() => useSpaceKey());
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() => {
      const event = new KeyboardEvent("keydown", { code: "Space", bubbles: true });
      Object.defineProperty(event, "target", { value: input });
      window.dispatchEvent(event);
    });
    expect(result.current).toBe(false);
    document.body.removeChild(input);
  });

  it("ignores space in textarea elements", () => {
    const { result } = renderHook(() => useSpaceKey());
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    act(() => {
      const event = new KeyboardEvent("keydown", { code: "Space", bubbles: true });
      Object.defineProperty(event, "target", { value: textarea });
      window.dispatchEvent(event);
    });
    expect(result.current).toBe(false);
    document.body.removeChild(textarea);
  });

  it("ignores non-space keys", () => {
    const { result } = renderHook(() => useSpaceKey());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA" }));
    });
    expect(result.current).toBe(false);
  });

  it("cleans up event listeners on unmount", () => {
    const spy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useSpaceKey());
    unmount();
    const removedTypes = spy.mock.calls.map((c) => c[0]);
    expect(removedTypes).toContain("keydown");
    expect(removedTypes).toContain("keyup");
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// useCanvasInteractions
// ---------------------------------------------------------------------------

describe("useCanvasInteractions", () => {
  it("returns handler functions", () => {
    const { hookResult } = setupInteractions();
    const result = hookResult.result.current;
    expect(typeof result.handleWheel).toBe("function");
    expect(typeof result.handleMouseDown).toBe("function");
    expect(typeof result.handleMouseMove).toBe("function");
    expect(typeof result.handleMouseUp).toBe("function");
    expect(typeof result.handleStageClick).toBe("function");
    expect(typeof result.handleNodeSelect).toBe("function");
    expect(typeof result.handleNodeContextMenu).toBe("function");
    expect(typeof result.handleConnectorSelect).toBe("function");
  });

  it("returns initial state values", () => {
    const { hookResult } = setupInteractions();
    const result = hookResult.result.current;
    expect(result.marquee).toBeNull();
    expect(result.connectFrom).toBeNull();
    expect(result.connectPreview).toBeNull();
    expect(result.connectHoverTarget).toBeNull();
    expect(result.drawingActive).toBe(false);
    expect(result.lassoPath).toEqual([]);
  });

  describe("handleWheel", () => {
    it("dispatches ZOOM action", () => {
      const { hookResult, dispatch, stage } = setupInteractions();
      act(() => {
        hookResult.result.current.handleWheel(
          konvaEvent({ deltaY: -100 }),
        );
      });
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ZOOM",
          delta: -100,
          centerX: 100,
          centerY: 100,
        }),
      );
    });

    it("does not dispatch when locked", () => {
      const state = makeState();
      const stateRef = { current: state } as any;
      const viewportRef = { current: state.viewport } as any;
      const stage = makeMockStage();
      const stageRef = { current: stage } as any;
      const dispatch = vi.fn();

      const { result } = renderHook(() =>
        useCanvasInteractions(
          stateRef, viewportRef, stageRef, dispatch,
          true, // locked
          false, (sx: number, sy: number) => ({ x: sx, y: sy }), "#ff0000", 2, undefined, null,
        ),
      );
      act(() => {
        result.current.handleWheel(konvaEvent({ deltaY: -100 }));
      });
      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe("handleMouseDown", () => {
    it("starts marquee on left-click on empty stage", () => {
      const { hookResult, stage, screenToWorld } = setupInteractions();
      screenToWorld.mockReturnValue({ x: 200, y: 300 });

      act(() => {
        hookResult.result.current.handleMouseDown(
          konvaEvent({ button: 0, clientX: 200, clientY: 300 }, stage),
        );
      });
      // After mousedown on stage, marquee should be set
      expect(hookResult.result.current.marquee).not.toBeNull();
      if (hookResult.result.current.marquee) {
        expect(hookResult.result.current.marquee.startX).toBe(200);
        expect(hookResult.result.current.marquee.startY).toBe(300);
      }
    });

    it("starts panning on middle mouse button", () => {
      const { hookResult, dispatch } = setupInteractions();
      const evt = konvaEvent({ button: 1, clientX: 100, clientY: 100 });
      act(() => {
        hookResult.result.current.handleMouseDown(evt);
      });
      expect(evt.evt.preventDefault).toHaveBeenCalled();
      // isPanning ref should be true (we can verify via panning in mouseMove)
      expect(hookResult.result.current.isPanning.current).toBe(true);
    });

    it("does nothing when locked", () => {
      const state = makeState();
      const stateRef = { current: state } as any;
      const viewportRef = { current: state.viewport } as any;
      const stage = makeMockStage();
      const stageRef = { current: stage } as any;
      const dispatch = vi.fn();

      const { result } = renderHook(() =>
        useCanvasInteractions(
          stateRef, viewportRef, stageRef, dispatch,
          true, false, (sx: number, sy: number) => ({ x: sx, y: sy }), "#ff0000", 2, undefined, null,
        ),
      );
      act(() => {
        result.current.handleMouseDown(konvaEvent({ button: 0, clientX: 100, clientY: 100 }, stage));
      });
      expect(result.current.marquee).toBeNull();
    });
  });

  describe("handleMouseMove", () => {
    it("dispatches SET_VIEWPORT when panning", () => {
      const { hookResult, dispatch } = setupInteractions();
      // Start panning
      act(() => {
        hookResult.result.current.handleMouseDown(
          konvaEvent({ button: 1, clientX: 100, clientY: 100 }),
        );
      });
      dispatch.mockClear();
      // Move mouse
      act(() => {
        hookResult.result.current.handleMouseMove(
          konvaEvent({ clientX: 120, clientY: 130 }),
        );
      });
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SET_VIEWPORT",
          viewport: expect.objectContaining({ x: 20, y: 30 }),
        }),
      );
    });

    it("updates marquee during drag", () => {
      const { hookResult, stage, screenToWorld } = setupInteractions();
      screenToWorld.mockReturnValue({ x: 50, y: 50 });
      // Start marquee
      act(() => {
        hookResult.result.current.handleMouseDown(
          konvaEvent({ button: 0, clientX: 50, clientY: 50 }, stage),
        );
      });
      // Move
      act(() => {
        hookResult.result.current.handleMouseMove(
          konvaEvent({ clientX: 200, clientY: 200 }),
        );
      });
      const marquee = hookResult.result.current.marquee;
      expect(marquee).not.toBeNull();
    });
  });

  describe("handleMouseUp", () => {
    it("stops panning", () => {
      const { hookResult } = setupInteractions();
      act(() => {
        hookResult.result.current.handleMouseDown(
          konvaEvent({ button: 1, clientX: 100, clientY: 100 }),
        );
      });
      expect(hookResult.result.current.isPanning.current).toBe(true);
      act(() => {
        hookResult.result.current.handleMouseUp(konvaEvent({ clientX: 120, clientY: 130 }));
      });
      expect(hookResult.result.current.isPanning.current).toBe(false);
    });

    it("dispatches SELECT_NODE null for small marquee (click deselect)", () => {
      const { hookResult, dispatch, stage, screenToWorld } = setupInteractions();
      screenToWorld.mockReturnValue({ x: 50, y: 50 });

      act(() => {
        hookResult.result.current.handleMouseDown(
          konvaEvent({ button: 0, clientX: 50, clientY: 50 }, stage),
        );
      });
      dispatch.mockClear();
      // Mouse up at same position (marquee < 5px)
      act(() => {
        hookResult.result.current.handleMouseUp(
          konvaEvent({ button: 0, clientX: 51, clientY: 51, shiftKey: false, metaKey: false, ctrlKey: false }),
        );
      });
      expect(dispatch).toHaveBeenCalledWith({ type: "SELECT_NODE", id: null });
    });

    it("selects nodes within marquee area", () => {
      const { hookResult, dispatch, stage, screenToWorld, stateRef } = setupInteractions({
        nodes: [
          makeNode({ id: "a", x: 10, y: 10, width: 20, height: 20 }),
          makeNode({ id: "b", x: 200, y: 200, width: 20, height: 20 }),
        ],
      });

      // Start marquee at (0,0)
      screenToWorld.mockReturnValue({ x: 0, y: 0 });
      act(() => {
        hookResult.result.current.handleMouseDown(
          konvaEvent({ button: 0, clientX: 0, clientY: 0 }, stage),
        );
      });
      // Move to (100,100) - should intersect node "a" but not "b"
      act(() => {
        hookResult.result.current.handleMouseMove(
          konvaEvent({ clientX: 100, clientY: 100 }),
        );
      });
      dispatch.mockClear();
      act(() => {
        hookResult.result.current.handleMouseUp(
          konvaEvent({ button: 0, clientX: 100, clientY: 100, shiftKey: false, metaKey: false, ctrlKey: false }),
        );
      });
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: "SELECT_NODES", ids: ["a"] }),
      );
    });
  });

  describe("handleStageClick", () => {
    it("deselects when clicking empty stage", () => {
      const { hookResult, dispatch, stage, onConnectorSelect } = setupInteractions();
      act(() => {
        hookResult.result.current.handleStageClick(konvaEvent({ button: 0 }, stage));
      });
      expect(onConnectorSelect).toHaveBeenCalledWith(null);
      expect(dispatch).toHaveBeenCalledWith({ type: "SELECT_NODE", id: null });
    });
  });

  describe("handleNodeSelect", () => {
    it("dispatches SELECT_NODE in select mode", () => {
      const { hookResult, dispatch } = setupInteractions();
      act(() => {
        hookResult.result.current.handleNodeSelect("node-1", false);
      });
      expect(dispatch).toHaveBeenCalledWith({ type: "SELECT_NODE", id: "node-1", additive: false });
    });

    it("dispatches SELECT_NODE with additive flag", () => {
      const { hookResult, dispatch } = setupInteractions();
      act(() => {
        hookResult.result.current.handleNodeSelect("node-1", true);
      });
      expect(dispatch).toHaveBeenCalledWith({ type: "SELECT_NODE", id: "node-1", additive: true });
    });

    it("in connect mode sets connectFrom on first click", () => {
      const { hookResult } = setupInteractions({ editMode: "connect" });
      act(() => {
        hookResult.result.current.handleNodeSelect("node-1", false);
      });
      expect(hookResult.result.current.connectFrom).toBe("node-1");
    });

    it("in connect mode dispatches ADD_CONNECTOR on second click", () => {
      const { hookResult, dispatch } = setupInteractions({ editMode: "connect" });
      // First click - set source
      act(() => {
        hookResult.result.current.handleNodeSelect("node-1", false);
      });
      dispatch.mockClear();
      // Second click - different node
      act(() => {
        hookResult.result.current.handleNodeSelect("node-2", false);
      });
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ADD_CONNECTOR",
          connector: expect.objectContaining({
            fromNodeId: "node-1",
            toNodeId: "node-2",
            arrowEnd: true,
          }),
        }),
      );
      // connectFrom should be reset
      expect(hookResult.result.current.connectFrom).toBeNull();
    });
  });

  describe("handleNodeContextMenu", () => {
    it("prevents default and selects node", () => {
      const { hookResult, dispatch } = setupInteractions();
      const evt = konvaEvent({ button: 2 });
      act(() => {
        hookResult.result.current.handleNodeContextMenu("node-1", evt);
      });
      expect(evt.evt.preventDefault).toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledWith({ type: "SELECT_NODE", id: "node-1" });
    });
  });

  describe("handleConnectorSelect", () => {
    it("deselects nodes and selects connector", () => {
      const { hookResult, dispatch, onConnectorSelect } = setupInteractions();
      act(() => {
        hookResult.result.current.handleConnectorSelect("conn-1");
      });
      expect(dispatch).toHaveBeenCalledWith({ type: "SELECT_NODE", id: null });
      expect(onConnectorSelect).toHaveBeenCalledWith("conn-1");
    });

    it("toggles connector off when same id selected", () => {
      // Setup with selectedConnectorId already set
      const state = makeState();
      const stateRef = { current: state } as any;
      const viewportRef = { current: state.viewport } as any;
      const stage = makeMockStage();
      const stageRef = { current: stage } as any;
      const dispatch = vi.fn();
      const onConnectorSelect = vi.fn();
      const screenToWorld = vi.fn((sx: number, sy: number) => ({ x: sx, y: sy }));

      const { result } = renderHook(() =>
        useCanvasInteractions(
          stateRef, viewportRef, stageRef, dispatch,
          false, false, screenToWorld, "#ff0000", 2, onConnectorSelect, "conn-1",
        ),
      );
      act(() => {
        result.current.handleConnectorSelect("conn-1");
      });
      expect(onConnectorSelect).toHaveBeenCalledWith(null);
    });
  });

  describe("draw mode", () => {
    function setupDrawMode() {
      const state = makeState({ editMode: "draw" });
      const stateRef = { current: state } as any;
      const viewportRef = { current: state.viewport } as any;
      const stage = makeMockStage();
      const stageRef = { current: stage } as any;
      const dispatch = vi.fn();
      const screenToWorld = vi.fn((sx: number, sy: number) => ({ x: sx, y: sy }));

      const { result } = renderHook(() =>
        useCanvasInteractions(
          stateRef, viewportRef, stageRef, dispatch,
          false, false, screenToWorld, "#ff0000", 2, undefined, null,
        ),
      );
      return { result, dispatch, stage, stageRef };
    }

    it("starts drawing on mousedown in draw mode", () => {
      const { result, stage } = setupDrawMode();

      act(() => {
        result.current.handleMouseDown(
          konvaEvent({ button: 0, clientX: 100, clientY: 100 }, stage),
        );
      });
      expect(result.current.drawingActive).toBe(true);
    });

    it("creates drawing node on mouseup after drawing", () => {
      const { result, dispatch, stage } = setupDrawMode();

      // Start drawing
      act(() => {
        result.current.handleMouseDown(
          konvaEvent({ button: 0, clientX: 100, clientY: 100 }, stage),
        );
      });
      // Move mouse to add points (must be > 2px apart)
      act(() => {
        result.current.handleMouseMove(konvaEvent({ clientX: 120, clientY: 120 }));
      });
      act(() => {
        result.current.handleMouseMove(konvaEvent({ clientX: 140, clientY: 140 }));
      });
      dispatch.mockClear();
      // Finish drawing
      act(() => {
        result.current.handleMouseUp(konvaEvent({ clientX: 140, clientY: 140 }));
      });
      expect(result.current.drawingActive).toBe(false);
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ADD_NODE",
          node: expect.objectContaining({
            type: "drawing",
            strokeColor: "#ff0000",
            strokeWidth: 2,
          }),
        }),
      );
    });
  });

  describe("lasso selection", () => {
    it("selects nodes within lasso path", () => {
      const nodes = [
        makeNode({ id: "inside", x: 50, y: 50, width: 10, height: 10 }),
        makeNode({ id: "outside", x: 500, y: 500, width: 10, height: 10 }),
      ];
      const state = makeState({ nodes });
      const stateRef = { current: state } as any;
      const viewportRef = { current: state.viewport } as any;
      const stage = makeMockStage();
      const stageRef = { current: stage } as any;
      const dispatch = vi.fn();
      const screenToWorld = vi.fn((sx: number, sy: number) => ({ x: sx, y: sy }));

      const { result } = renderHook(() =>
        useCanvasInteractions(
          stateRef, viewportRef, stageRef, dispatch,
          false, false, screenToWorld, "#ff0000", 2, undefined, null,
        ),
      );

      // Start lasso (alt+click on stage)
      act(() => {
        result.current.handleMouseDown(
          konvaEvent({ button: 0, clientX: 0, clientY: 0, altKey: true }, stage),
        );
      });
      // Draw lasso polygon around (50,50)
      act(() => {
        result.current.handleMouseMove(konvaEvent({ clientX: 100, clientY: 0 }));
      });
      act(() => {
        result.current.handleMouseMove(konvaEvent({ clientX: 100, clientY: 100 }));
      });
      act(() => {
        result.current.handleMouseMove(konvaEvent({ clientX: 0, clientY: 100 }));
      });
      dispatch.mockClear();
      // Finish lasso
      act(() => {
        result.current.handleMouseUp(
          konvaEvent({ clientX: 0, clientY: 100, shiftKey: false, metaKey: false, ctrlKey: false }),
        );
      });
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SELECT_NODES",
          ids: expect.arrayContaining(["inside"]),
        }),
      );
    });
  });

  describe("additive lasso selection with shift key", () => {
    it("merges lasso hits with existing selection when shift is held", () => {
      const nodes = [
        makeNode({ id: "inside", x: 50, y: 50, width: 10, height: 10 }),
        makeNode({ id: "outside", x: 500, y: 500, width: 10, height: 10 }),
      ];
      const state = makeState({ nodes, selectedNodeIds: new Set(["pre-selected"]) });
      const stateRef = { current: state } as any;
      const viewportRef = { current: state.viewport } as any;
      const stage = makeMockStage();
      const stageRef = { current: stage } as any;
      const dispatch = vi.fn();
      const screenToWorld = vi.fn((sx: number, sy: number) => ({ x: sx, y: sy }));

      const { result } = renderHook(() =>
        useCanvasInteractions(
          stateRef, viewportRef, stageRef, dispatch,
          false, false, screenToWorld, "#ff0000", 2, undefined, null,
        ),
      );

      // Start lasso (alt+click on stage)
      act(() => {
        result.current.handleMouseDown(
          konvaEvent({ button: 0, clientX: 0, clientY: 0, altKey: true }, stage),
        );
      });
      // Draw lasso polygon around (50,50)
      act(() => {
        result.current.handleMouseMove(konvaEvent({ clientX: 100, clientY: 0 }));
      });
      act(() => {
        result.current.handleMouseMove(konvaEvent({ clientX: 100, clientY: 100 }));
      });
      act(() => {
        result.current.handleMouseMove(konvaEvent({ clientX: 0, clientY: 100 }));
      });
      dispatch.mockClear();
      // Finish lasso with shift held — should merge with existing selection
      act(() => {
        result.current.handleMouseUp(
          konvaEvent({ clientX: 0, clientY: 100, shiftKey: true, metaKey: false, ctrlKey: false }),
        );
      });
      const selectCall = dispatch.mock.calls.find(([a]: any) => a.type === "SELECT_NODES");
      expect(selectCall).toBeDefined();
      const ids = selectCall![0].ids;
      expect(ids).toContain("inside");
      expect(ids).toContain("pre-selected");
    });
  });

  describe("marquee selecting multiple nodes", () => {
    it("selects all nodes within large marquee area", () => {
      const nodes = [
        makeNode({ id: "a", x: 10, y: 10, width: 20, height: 20 }),
        makeNode({ id: "b", x: 50, y: 50, width: 20, height: 20 }),
        makeNode({ id: "c", x: 300, y: 300, width: 20, height: 20 }),
      ];
      const { hookResult, dispatch, stage, screenToWorld } = setupInteractions({ nodes });

      screenToWorld.mockReturnValue({ x: 0, y: 0 });
      act(() => {
        hookResult.result.current.handleMouseDown(
          konvaEvent({ button: 0, clientX: 0, clientY: 0 }, stage),
        );
      });
      act(() => {
        hookResult.result.current.handleMouseMove(konvaEvent({ clientX: 100, clientY: 100 }));
      });
      dispatch.mockClear();
      act(() => {
        hookResult.result.current.handleMouseUp(
          konvaEvent({ button: 0, clientX: 100, clientY: 100, shiftKey: false, metaKey: false, ctrlKey: false }),
        );
      });
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SELECT_NODES",
          ids: expect.arrayContaining(["a", "b"]),
        }),
      );
    });

    it("additive marquee selection with shift key", () => {
      const nodes = [
        makeNode({ id: "a", x: 10, y: 10, width: 20, height: 20 }),
        makeNode({ id: "b", x: 50, y: 50, width: 20, height: 20 }),
      ];
      const { hookResult, dispatch, stage, screenToWorld } = setupInteractions({
        nodes,
        selectedNodeIds: new Set(["existing"]),
      });

      screenToWorld.mockReturnValue({ x: 0, y: 0 });
      act(() => {
        hookResult.result.current.handleMouseDown(
          konvaEvent({ button: 0, clientX: 0, clientY: 0 }, stage),
        );
      });
      act(() => {
        hookResult.result.current.handleMouseMove(konvaEvent({ clientX: 100, clientY: 100 }));
      });
      dispatch.mockClear();
      act(() => {
        hookResult.result.current.handleMouseUp(
          konvaEvent({ button: 0, clientX: 100, clientY: 100, shiftKey: true, metaKey: false, ctrlKey: false }),
        );
      });
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SELECT_NODES",
        }),
      );
    });
  });

  describe("handleStageClick cancels connect mode", () => {
    it("cancels connectFrom when clicking empty stage in connect mode", () => {
      const { hookResult, dispatch, stage } = setupInteractions({ editMode: "connect" });
      // First set connectFrom
      act(() => {
        hookResult.result.current.handleNodeSelect("node-1", false);
      });
      expect(hookResult.result.current.connectFrom).toBe("node-1");
      // Click empty stage
      act(() => {
        hookResult.result.current.handleStageClick(konvaEvent({ button: 0 }, stage));
      });
      expect(hookResult.result.current.connectFrom).toBeNull();
    });
  });

  describe("connect drag-to-node", () => {
    it("dispatches ADD_CONNECTOR when drag-connecting to a target node", () => {
      const nodes = [
        makeNode({ id: "src", x: 0, y: 0, width: 100, height: 100 }),
        makeNode({ id: "tgt", x: 200, y: 200, width: 100, height: 100 }),
      ];
      const state = makeState({ nodes, editMode: "connect" });
      const stateRef = { current: state } as any;
      const viewportRef = { current: state.viewport } as any;
      const stage = makeMockStage();
      const stageRef = { current: stage } as any;
      let dispatch = vi.fn();
      const screenToWorld = vi.fn((sx: number, sy: number) => ({ x: sx, y: sy }));

      vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" });

      // Use a mutable ref so we can swap dispatch to force handleMouseMove re-creation
      const dispatchRef = { current: dispatch };

      const { result, rerender } = renderHook(
        ({ d }) =>
          useCanvasInteractions(
            stateRef, viewportRef, stageRef, d,
            false, false, screenToWorld, "#ff0000", 2, undefined, null,
          ),
        { initialProps: { d: dispatch } },
      );

      // Click source node to set connectFrom
      act(() => {
        result.current.handleNodeSelect("src", false);
      });
      expect(result.current.connectFrom).toBe("src");

      // Re-render with new dispatch ref to force handleMouseMove to re-capture connectFrom
      const dispatch2 = vi.fn();
      rerender({ d: dispatch2 });

      // Mousedown on source node (starts drag via connect mode — sets connectDragSource)
      // In connect mode, mousedown on stage doesn't start marquee (it falls through)
      // but handleNodeSelect already set connectDragSource.current
      // We need to trigger handleMouseMove which now has connectFrom="src"

      // Move mouse to target area — should enter connect preview path (lines 207-225)
      act(() => {
        result.current.handleMouseMove(
          konvaEvent({ clientX: 250, clientY: 250 }),
        );
      });

      // Verify connect preview was set
      expect(result.current.connectPreview).not.toBeNull();
      // The hover target should be "tgt" since (250,250) is within tgt bounds (200-300, 200-300)
      expect(result.current.connectHoverTarget).toBe("tgt");
    });

    it("completes drag-to-connect on mouseup at target node", () => {
      const nodes = [
        makeNode({ id: "src", x: 0, y: 0, width: 100, height: 100 }),
        makeNode({ id: "tgt", x: 200, y: 200, width: 100, height: 100 }),
      ];
      const state = makeState({ nodes, editMode: "connect" });
      const stateRef = { current: state } as any;
      const viewportRef = { current: state.viewport } as any;
      const stage = makeMockStage();
      const stageRef = { current: stage } as any;
      const dispatch = vi.fn();
      const screenToWorld = vi.fn((sx: number, sy: number) => ({ x: sx, y: sy }));

      vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" });

      const { result, rerender } = renderHook(
        ({ d }) =>
          useCanvasInteractions(
            stateRef, viewportRef, stageRef, d,
            false, false, screenToWorld, "#ff0000", 2, undefined, null,
          ),
        { initialProps: { d: dispatch } },
      );

      // Click source node to set connectFrom and connectDragSource
      act(() => {
        result.current.handleNodeSelect("src", false);
      });
      expect(result.current.connectFrom).toBe("src");

      // Re-render with new dispatch to force handleMouseMove re-capture
      const dispatch2 = vi.fn();
      rerender({ d: dispatch2 });

      // Move mouse — this sets connectDragMoved = true (lines 207-225)
      act(() => {
        result.current.handleMouseMove(
          konvaEvent({ clientX: 250, clientY: 250 }),
        );
      });

      // Now mouseup at target location (within tgt bounds) — lines 323-358
      dispatch2.mockClear();
      act(() => {
        result.current.handleMouseUp(
          konvaEvent({ button: 0, clientX: 250, clientY: 250, shiftKey: false, metaKey: false, ctrlKey: false }),
        );
      });

      expect(dispatch2).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ADD_CONNECTOR",
          connector: expect.objectContaining({
            fromNodeId: "src",
            toNodeId: "tgt",
            arrowEnd: true,
          }),
        }),
      );
      // connectFrom should be reset
      expect(result.current.connectFrom).toBeNull();
      expect(result.current.connectPreview).toBeNull();
      expect(result.current.connectHoverTarget).toBeNull();
    });

    it("clears drag state when mouseup misses target node", () => {
      const nodes = [
        makeNode({ id: "src", x: 0, y: 0, width: 100, height: 100 }),
        makeNode({ id: "tgt", x: 200, y: 200, width: 100, height: 100 }),
      ];
      const state = makeState({ nodes, editMode: "connect" });
      const stateRef = { current: state } as any;
      const viewportRef = { current: state.viewport } as any;
      const stage = makeMockStage();
      const stageRef = { current: stage } as any;
      const dispatch = vi.fn();
      const screenToWorld = vi.fn((sx: number, sy: number) => ({ x: sx, y: sy }));

      vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" });

      const { result, rerender } = renderHook(
        ({ d }) =>
          useCanvasInteractions(
            stateRef, viewportRef, stageRef, d,
            false, false, screenToWorld, "#ff0000", 2, undefined, null,
          ),
        { initialProps: { d: dispatch } },
      );

      // Set connectFrom
      act(() => {
        result.current.handleNodeSelect("src", false);
      });

      // Re-render with new dispatch
      const dispatch2 = vi.fn();
      rerender({ d: dispatch2 });

      // Move to trigger connectDragMoved
      act(() => {
        result.current.handleMouseMove(
          konvaEvent({ clientX: 150, clientY: 150 }),
        );
      });

      dispatch2.mockClear();

      // Mouseup at empty area (150,150) — not inside any node
      act(() => {
        result.current.handleMouseUp(
          konvaEvent({ button: 0, clientX: 150, clientY: 150, shiftKey: false, metaKey: false, ctrlKey: false }),
        );
      });

      // Should NOT dispatch ADD_CONNECTOR
      const addCalls = dispatch2.mock.calls.filter(([a]: any) => a.type === "ADD_CONNECTOR");
      expect(addCalls).toHaveLength(0);
      // connectHoverTarget should be cleared (line 358)
      expect(result.current.connectHoverTarget).toBeNull();
    });
  });

  describe("handleMouseDown — middle click panning", () => {
    it("starts panning on middle mouse button (button === 1) without spaceHeld", () => {
      const { hookResult } = setupInteractions();
      const evt = konvaEvent({ button: 1, clientX: 200, clientY: 200 });
      act(() => {
        hookResult.result.current.handleMouseDown(evt);
      });
      expect(hookResult.result.current.isPanning.current).toBe(true);
      expect(evt.evt.preventDefault).toHaveBeenCalled();
    });

    it("starts panning with space+left click", () => {
      const state = makeState();
      const stateRef = { current: state } as any;
      const viewportRef = { current: state.viewport } as any;
      const stage = makeMockStage();
      const stageRef = { current: stage } as any;
      const dispatch = vi.fn();
      const screenToWorld = vi.fn((sx: number, sy: number) => ({ x: sx, y: sy }));

      const { result } = renderHook(() =>
        useCanvasInteractions(
          stateRef, viewportRef, stageRef, dispatch,
          false, true, // spaceHeld = true
          screenToWorld, "#ff0000", 2, undefined, null,
        ),
      );

      const evt = konvaEvent({ button: 0, clientX: 150, clientY: 150 });
      act(() => {
        result.current.handleMouseDown(evt);
      });
      expect(result.current.isPanning.current).toBe(true);
      expect(evt.evt.preventDefault).toHaveBeenCalled();
    });
  });

  describe("handleNodeSelect — additive and connect branches", () => {
    it("dispatches SELECT_NODE with additive=true in select mode", () => {
      const { hookResult, dispatch, onConnectorSelect } = setupInteractions();
      act(() => {
        hookResult.result.current.handleNodeSelect("node-1", true);
      });
      expect(onConnectorSelect).toHaveBeenCalledWith(null);
      expect(dispatch).toHaveBeenCalledWith({ type: "SELECT_NODE", id: "node-1", additive: true });
    });

    it("in connect mode, clicking same node as connectFrom does nothing", () => {
      const { hookResult, dispatch } = setupInteractions({ editMode: "connect" });
      // First click sets connectFrom
      act(() => {
        hookResult.result.current.handleNodeSelect("node-1", false);
      });
      expect(hookResult.result.current.connectFrom).toBe("node-1");
      dispatch.mockClear();
      // Second click on same node — should not dispatch or change connectFrom
      act(() => {
        hookResult.result.current.handleNodeSelect("node-1", false);
      });
      expect(dispatch).not.toHaveBeenCalled();
      expect(hookResult.result.current.connectFrom).toBe("node-1");
    });
  });

  describe("handleMouseMove — connect preview when connectFrom is set", () => {
    it("sets connectPreview during connect mode mouse move", () => {
      const nodes = [
        makeNode({ id: "src", x: 0, y: 0, width: 100, height: 100 }),
        makeNode({ id: "tgt", x: 200, y: 200, width: 100, height: 100 }),
      ];
      const state = makeState({ nodes, editMode: "connect" });
      const stateRef = { current: state } as any;
      const viewportRef = { current: state.viewport } as any;
      const stage = makeMockStage();
      const stageRef = { current: stage } as any;
      const dispatch = vi.fn();
      const screenToWorld = vi.fn((sx: number, sy: number) => ({ x: sx, y: sy }));

      const { result, rerender } = renderHook(
        ({ d }) =>
          useCanvasInteractions(
            stateRef, viewportRef, stageRef, d,
            false, false, screenToWorld, "#ff0000", 2, undefined, null,
          ),
        { initialProps: { d: dispatch } },
      );

      // Set connectFrom
      act(() => {
        result.current.handleNodeSelect("src", false);
      });
      expect(result.current.connectFrom).toBe("src");

      // Re-render so handleMouseMove picks up connectFrom
      const dispatch2 = vi.fn();
      rerender({ d: dispatch2 });

      // Move to empty area (not over any node)
      act(() => {
        result.current.handleMouseMove(konvaEvent({ clientX: 400, clientY: 400 }));
      });

      // connectPreview should be set, connectHoverTarget should be null (no node at 400,400)
      expect(result.current.connectPreview).not.toBeNull();
      expect(result.current.connectHoverTarget).toBeNull();
    });
  });

  describe("justFinishedMarquee guard", () => {
    it("handleStageClick is suppressed right after marquee finishes", () => {
      const nodes = [
        makeNode({ id: "a", x: 10, y: 10, width: 20, height: 20 }),
      ];
      const { hookResult, dispatch, stage, screenToWorld } = setupInteractions({ nodes });

      // Start and complete a marquee selection
      screenToWorld.mockReturnValue({ x: 0, y: 0 });
      act(() => {
        hookResult.result.current.handleMouseDown(
          konvaEvent({ button: 0, clientX: 0, clientY: 0 }, stage),
        );
      });
      act(() => {
        hookResult.result.current.handleMouseMove(konvaEvent({ clientX: 100, clientY: 100 }));
      });
      act(() => {
        hookResult.result.current.handleMouseUp(
          konvaEvent({ button: 0, clientX: 100, clientY: 100, shiftKey: false, metaKey: false, ctrlKey: false }),
        );
      });
      dispatch.mockClear();

      // Immediately fire handleStageClick — should be suppressed by justFinishedMarquee
      act(() => {
        hookResult.result.current.handleStageClick(konvaEvent({ button: 0 }, stage));
      });

      // The SELECT_NODE { id: null } deselect should NOT fire since marquee just finished
      const selectNullCalls = dispatch.mock.calls.filter(
        ([a]: any) => a.type === "SELECT_NODE" && a.id === null
      );
      expect(selectNullCalls).toHaveLength(0);
    });
  });
});
