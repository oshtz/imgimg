// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCanvasDrag } from "../useCanvasDrag";
import type { SnapResult } from "../../snapGuides";

vi.mock("../../snapGuides", () => ({
  computeSnapGuides: vi.fn((): SnapResult => ({
    snappedDx: 0,
    snappedDy: 0,
    guides: [],
  })),
}));

import { computeSnapGuides } from "../../snapGuides";
const mockedComputeSnapGuides = vi.mocked(computeSnapGuides);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Record<string, any> = {}) {
  return {
    id: "node-1",
    type: "image" as const,
    src: "test.png",
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    naturalWidth: 200,
    naturalHeight: 200,
    zIndex: 1,
    ...overrides,
  };
}

function defaultState() {
  return {
    nodes: [makeNode()],
    selectedNodeIds: new Set<string>(["node-1"]),
    viewport: { x: 0, y: 0, scale: 1 },
    editMode: "select",
    connectors: [] as any[],
    showLineage: false,
  };
}

function mockKonvaGroup(id: string) {
  return {
    position: vi.fn(),
    getLayer: vi.fn(() => ({ batchDraw: vi.fn() })),
  };
}

function mockKonvaLayer() {
  return { batchDraw: vi.fn() };
}

function setupDrag(stateOverrides: Partial<ReturnType<typeof defaultState>> = {}) {
  const state = { ...defaultState(), ...stateOverrides };
  const stateRef = { current: state } as any;

  const groupMap = new Map<string, any>();
  for (const n of state.nodes) {
    groupMap.set(n.id, mockKonvaGroup(n.id));
  }
  const groupRefs = { current: groupMap } as any;

  const dispatch = vi.fn();
  const onDragDelta = vi.fn();
  const dropTargetRectRef = { current: null } as any;
  const dropHighlightLayerRef = { current: mockKonvaLayer() } as any;
  const snapGuidesRef = { current: [] } as any;
  const snapLayerRef = { current: mockKonvaLayer() } as any;

  const hookResult = renderHook(() =>
    useCanvasDrag(
      stateRef,
      groupRefs,
      dispatch,
      onDragDelta,
      dropTargetRectRef,
      dropHighlightLayerRef,
      snapGuidesRef,
      snapLayerRef,
    ),
  );

  return {
    hookResult,
    dispatch,
    stateRef,
    groupRefs,
    onDragDelta,
    dropTargetRectRef,
    dropHighlightLayerRef,
    snapGuidesRef,
    snapLayerRef,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useCanvasDrag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedComputeSnapGuides.mockReturnValue({ snappedDx: 0, snappedDy: 0, guides: [] });
  });

  it("returns drag handler functions", () => {
    const { hookResult } = setupDrag();
    const result = hookResult.result.current;
    expect(typeof result.handleNodeDragStart).toBe("function");
    expect(typeof result.handleNodeDragMove).toBe("function");
    expect(typeof result.handleNodeDragEnd).toBe("function");
  });

  describe("handleNodeDragStart", () => {
    it("selects node if not already selected", () => {
      const { hookResult, dispatch } = setupDrag({
        selectedNodeIds: new Set<string>(),
      });
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      expect(dispatch).toHaveBeenCalledWith({ type: "SELECT_NODE", id: "node-1" });
    });

    it("does not dispatch SELECT_NODE if already selected", () => {
      const { hookResult, dispatch } = setupDrag({
        selectedNodeIds: new Set<string>(["node-1"]),
      });
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      // Should not have dispatched SELECT_NODE
      const selectCalls = dispatch.mock.calls.filter((c) => c[0].type === "SELECT_NODE");
      expect(selectCalls).toHaveLength(0);
    });

    it("does not start drag for locked nodes", () => {
      const { hookResult, dispatch } = setupDrag({
        nodes: [makeNode({ locked: true })],
      });
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("includes children of dragged frame nodes", () => {
      const { hookResult, dispatch } = setupDrag({
        nodes: [
          makeNode({ id: "frame-1", type: "frame", x: 0, y: 0, width: 500, height: 500 }),
          makeNode({ id: "child-1", parentFrameId: "frame-1", x: 50, y: 50 }),
        ],
        selectedNodeIds: new Set(["frame-1"]),
      });
      act(() => {
        hookResult.result.current.handleNodeDragStart("frame-1");
      });
      // After drag start, drag end should include the child
      dispatch.mockClear();
      act(() => {
        hookResult.result.current.handleNodeDragEnd("frame-1", 10, 10);
      });
      const dragEnd = dispatch.mock.calls.find((c) => c[0].type === "DRAG_END");
      expect(dragEnd).toBeDefined();
      expect(dragEnd![0].ids).toContain("child-1");
      expect(dragEnd![0].ids).toContain("frame-1");
    });
  });

  describe("handleNodeDragMove", () => {
    it("calls computeSnapGuides during drag", () => {
      const { hookResult } = setupDrag();
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 10, 20);
      });
      expect(mockedComputeSnapGuides).toHaveBeenCalled();
    });

    it("does nothing when dx and dy are both zero", () => {
      const { hookResult } = setupDrag();
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      mockedComputeSnapGuides.mockClear();
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 0, 0);
      });
      expect(mockedComputeSnapGuides).not.toHaveBeenCalled();
    });

    it("updates group positions with snapped values", () => {
      mockedComputeSnapGuides.mockReturnValue({
        snappedDx: 15,
        snappedDy: 25,
        guides: [],
      });
      const { hookResult, groupRefs } = setupDrag();
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 10, 20);
      });
      const group = groupRefs.current.get("node-1");
      expect(group.position).toHaveBeenCalledWith({ x: 115, y: 125 }); // origin (100,100) + snapped delta (15,25)
    });

    it("calls onDragDelta with snapped deltas", () => {
      mockedComputeSnapGuides.mockReturnValue({
        snappedDx: 10,
        snappedDy: 20,
        guides: [],
      });
      const { hookResult, onDragDelta } = setupDrag();
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 10, 20);
      });
      expect(onDragDelta).toHaveBeenCalledWith(10, 20);
    });

    it("sets snap guides when guides are returned", () => {
      const guides = [{ orientation: "v" as const, position: 100 }];
      mockedComputeSnapGuides.mockReturnValue({
        snappedDx: 10,
        snappedDy: 0,
        guides,
      });
      const { hookResult, snapGuidesRef, snapLayerRef } = setupDrag();
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 10, 0);
      });
      expect(snapGuidesRef.current).toEqual(guides);
      expect(snapLayerRef.current.batchDraw).toHaveBeenCalled();
    });

    it("detects drop target frame during drag", () => {
      const { hookResult, dropTargetRectRef, dropHighlightLayerRef, stateRef } = setupDrag({
        nodes: [
          makeNode({ id: "node-1", type: "image", x: 50, y: 50, width: 50, height: 50 }),
          makeNode({ id: "frame-1", type: "frame", x: 0, y: 0, width: 500, height: 500 }),
        ],
        selectedNodeIds: new Set(["node-1"]),
      });
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 10, 10);
      });
      expect(dropTargetRectRef.current).toEqual(
        expect.objectContaining({ x: 0, y: 0, width: 500, height: 500 }),
      );
      expect(dropHighlightLayerRef.current.batchDraw).toHaveBeenCalled();
    });
  });

  describe("handleNodeDragEnd", () => {
    it("dispatches DRAG_END with snapped deltas", () => {
      mockedComputeSnapGuides.mockReturnValue({
        snappedDx: 12,
        snappedDy: 18,
        guides: [],
      });
      const { hookResult, dispatch } = setupDrag();
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      dispatch.mockClear();
      act(() => {
        hookResult.result.current.handleNodeDragEnd("node-1", 10, 15);
      });
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "DRAG_END",
          ids: ["node-1"],
          dx: 12,
          dy: 18,
        }),
      );
    });

    it("clears snap guides after drag end", () => {
      const { hookResult, snapGuidesRef } = setupDrag();
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      snapGuidesRef.current = [{ orientation: "v" as const, position: 50 }];
      act(() => {
        hookResult.result.current.handleNodeDragEnd("node-1", 10, 10);
      });
      expect(snapGuidesRef.current).toEqual([]);
    });

    it("calls onDragDelta with (0, 0) to reset", () => {
      const { hookResult, onDragDelta } = setupDrag();
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      onDragDelta.mockClear();
      act(() => {
        hookResult.result.current.handleNodeDragEnd("node-1", 10, 10);
      });
      expect(onDragDelta).toHaveBeenCalledWith(0, 0);
    });

    it("clears drop target rect after drag end", () => {
      const { hookResult, dropTargetRectRef } = setupDrag();
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      dropTargetRectRef.current = { x: 0, y: 0, width: 100, height: 100 };
      act(() => {
        hookResult.result.current.handleNodeDragEnd("node-1", 10, 10);
      });
      expect(dropTargetRectRef.current).toBeNull();
    });

    it("assigns nodes to frame when dropped inside", () => {
      const { hookResult, dispatch, stateRef } = setupDrag({
        nodes: [
          makeNode({ id: "node-1", type: "image", x: 50, y: 50, width: 50, height: 50 }),
          makeNode({ id: "frame-1", type: "frame", x: 0, y: 0, width: 500, height: 500 }),
        ],
        selectedNodeIds: new Set(["node-1"]),
      });
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      dispatch.mockClear();
      act(() => {
        hookResult.result.current.handleNodeDragEnd("node-1", 10, 10);
      });
      const setParent = dispatch.mock.calls.find((c) => c[0].type === "SET_PARENT_FRAME");
      expect(setParent).toBeDefined();
      expect(setParent![0].nodeIds).toContain("node-1");
      expect(setParent![0].frameId).toBe("frame-1");
    });

    it("unparents node when dropped outside frame", () => {
      // Return the actual dx/dy so the node actually moves outside the frame
      mockedComputeSnapGuides.mockReturnValue({ snappedDx: 500, snappedDy: 500, guides: [] });
      const { hookResult, dispatch, stateRef } = setupDrag({
        nodes: [
          makeNode({ id: "node-1", type: "image", x: 50, y: 50, width: 50, height: 50, parentFrameId: "frame-1" }),
          makeNode({ id: "frame-1", type: "frame", x: 0, y: 0, width: 100, height: 100 }),
        ],
        selectedNodeIds: new Set(["node-1"]),
      });
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      dispatch.mockClear();
      // Move far outside the frame
      act(() => {
        hookResult.result.current.handleNodeDragEnd("node-1", 500, 500);
      });
      const setParent = dispatch.mock.calls.find((c) => c[0].type === "SET_PARENT_FRAME");
      expect(setParent).toBeDefined();
      expect(setParent![0].frameId).toBeNull();
    });

    it("handles multi-node drag", () => {
      const { hookResult, dispatch, groupRefs } = setupDrag({
        nodes: [
          makeNode({ id: "node-1", x: 100, y: 100 }),
          makeNode({ id: "node-2", x: 300, y: 300 }),
        ],
        selectedNodeIds: new Set(["node-1", "node-2"]),
      });
      // Add group ref for node-2
      groupRefs.current.set("node-2", mockKonvaGroup("node-2"));

      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      dispatch.mockClear();
      act(() => {
        hookResult.result.current.handleNodeDragEnd("node-1", 20, 20);
      });
      const dragEnd = dispatch.mock.calls.find((c) => c[0].type === "DRAG_END");
      expect(dragEnd).toBeDefined();
      expect(dragEnd![0].ids).toContain("node-1");
      expect(dragEnd![0].ids).toContain("node-2");
    });

    it("does nothing if drag was not started", () => {
      const { hookResult, dispatch } = setupDrag();
      act(() => {
        hookResult.result.current.handleNodeDragEnd("node-1", 10, 10);
      });
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("uses node position as fallback when origin is missing during drag end", () => {
      // Start drag with a node that won't have an origin entry
      const { hookResult, dispatch, stateRef } = setupDrag({
        nodes: [
          makeNode({ id: "node-1", x: 100, y: 100 }),
          makeNode({ id: "node-2", x: 200, y: 200 }),
        ],
        selectedNodeIds: new Set(["node-1"]),
      });
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });

      // Manually add node-2 to stateRef.current to simulate it being in the dragged set
      // but without having origin
      dispatch.mockClear();
      act(() => {
        hookResult.result.current.handleNodeDragEnd("node-1", 10, 10);
      });
      // DRAG_END dispatched
      const dragEnd = dispatch.mock.calls.find((c) => c[0].type === "DRAG_END");
      expect(dragEnd).toBeDefined();
    });

    it("skips nodes whose parentFrameId matches a dragged frame during frame assignment", () => {
      const { hookResult, dispatch } = setupDrag({
        nodes: [
          makeNode({ id: "frame-1", type: "frame", x: 0, y: 0, width: 500, height: 500 }),
          makeNode({ id: "child-1", type: "image", x: 50, y: 50, width: 50, height: 50, parentFrameId: "frame-1" }),
          makeNode({ id: "frame-2", type: "frame", x: 0, y: 0, width: 600, height: 600 }),
        ],
        selectedNodeIds: new Set(["frame-1"]),
      });
      act(() => {
        hookResult.result.current.handleNodeDragStart("frame-1");
      });
      dispatch.mockClear();
      act(() => {
        hookResult.result.current.handleNodeDragEnd("frame-1", 10, 10);
      });
      // child-1 has parentFrameId matching a dragged frame, so it shouldn't trigger SET_PARENT_FRAME
      const setParent = dispatch.mock.calls.find((c) => c[0].type === "SET_PARENT_FRAME");
      expect(setParent).toBeUndefined();
    });

    it("node already inside target frame does not trigger SET_PARENT_FRAME", () => {
      const { hookResult, dispatch } = setupDrag({
        nodes: [
          makeNode({ id: "node-1", type: "image", x: 50, y: 50, width: 50, height: 50, parentFrameId: "frame-1" }),
          makeNode({ id: "frame-1", type: "frame", x: 0, y: 0, width: 500, height: 500 }),
        ],
        selectedNodeIds: new Set(["node-1"]),
      });
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      dispatch.mockClear();
      // Move a small amount - still within frame-1
      act(() => {
        hookResult.result.current.handleNodeDragEnd("node-1", 10, 10);
      });
      const setParent = dispatch.mock.calls.find((c) => c[0].type === "SET_PARENT_FRAME");
      // Already in frame-1, moved within frame-1 -> no SET_PARENT_FRAME
      expect(setParent).toBeUndefined();
    });
  });

  describe("handleNodeDragMove edge cases", () => {
    it("does nothing when dragOrigins is null (no drag started)", () => {
      const { hookResult } = setupDrag();
      // Don't call handleNodeDragStart, go straight to move
      mockedComputeSnapGuides.mockClear();
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 10, 20);
      });
      expect(mockedComputeSnapGuides).not.toHaveBeenCalled();
    });

    it("handles snap guide key changes by redrawing snap layer", () => {
      const guides1 = [{ orientation: "v" as const, position: 100 }];
      const guides2 = [{ orientation: "h" as const, position: 200 }];

      const { hookResult, snapLayerRef } = setupDrag();
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });

      // First move with guides
      mockedComputeSnapGuides.mockReturnValue({ snappedDx: 10, snappedDy: 0, guides: guides1 });
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 10, 0);
      });
      expect(snapLayerRef.current.batchDraw).toHaveBeenCalled();

      snapLayerRef.current.batchDraw.mockClear();

      // Second move with SAME guides key - should NOT redraw
      mockedComputeSnapGuides.mockReturnValue({ snappedDx: 10, snappedDy: 0, guides: guides1 });
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 10, 0);
      });
      expect(snapLayerRef.current.batchDraw).not.toHaveBeenCalled();

      // Third move with DIFFERENT guides key - should redraw
      mockedComputeSnapGuides.mockReturnValue({ snappedDx: 10, snappedDy: 0, guides: guides2 });
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 10, 0);
      });
      expect(snapLayerRef.current.batchDraw).toHaveBeenCalled();
    });

    it("does not set drop target when dragging a frame type node", () => {
      const { hookResult, dropTargetRectRef } = setupDrag({
        nodes: [
          makeNode({ id: "frame-1", type: "frame", x: 0, y: 0, width: 200, height: 200 }),
          makeNode({ id: "frame-2", type: "frame", x: 500, y: 500, width: 200, height: 200 }),
        ],
        selectedNodeIds: new Set(["frame-1"]),
      });

      act(() => {
        hookResult.result.current.handleNodeDragStart("frame-1");
      });

      act(() => {
        hookResult.result.current.handleNodeDragMove("frame-1", 10, 10);
      });

      // Frame nodes don't trigger drop target detection (n.type !== "frame" check)
      // so dropTargetRectRef stays null (no frame assignment for frames being dragged)
      expect(dropTargetRectRef.current).toBeNull();
    });

    it("clears prevDropTarget when node disappears from state during drag", () => {
      // This tests the else-if branch at lines 157-160:
      // When origin && n is falsy (node removed from state mid-drag) and prevDropTarget was set
      const { hookResult, dropTargetRectRef, dropHighlightLayerRef, stateRef } = setupDrag({
        nodes: [
          makeNode({ id: "node-1", type: "image", x: 50, y: 50, width: 50, height: 50 }),
          makeNode({ id: "frame-1", type: "frame", x: 0, y: 0, width: 500, height: 500 }),
        ],
        selectedNodeIds: new Set(["node-1"]),
      });

      // Start drag on image
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });

      // First move: node exists, finds frame → prevDropTarget set
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 5, 5);
      });
      expect(dropTargetRectRef.current).not.toBeNull();

      // Now remove the node from stateRef (simulating React re-render where node was deleted)
      stateRef.current = {
        ...stateRef.current,
        nodes: [
          makeNode({ id: "frame-1", type: "frame", x: 0, y: 0, width: 500, height: 500 }),
        ],
      };

      // Second move: node-1 not found in state → n is undefined → else-if fires → clears prevDropTarget
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 10, 10);
      });
      expect(dropTargetRectRef.current).toBeNull();
    });

    it("clears prevDropTarget when switching from image to frame drag context", () => {
      // This tests the else-if branch where prevDropTarget.current !== null
      // but the node being processed is a frame, so it clears the drop target
      const { hookResult, dropTargetRectRef, dropHighlightLayerRef, stateRef } = setupDrag({
        nodes: [
          makeNode({ id: "node-img", type: "image", x: 50, y: 50, width: 50, height: 50 }),
          makeNode({ id: "frame-target", type: "frame", x: 0, y: 0, width: 500, height: 500 }),
        ],
        selectedNodeIds: new Set(["node-img"]),
      });

      // Start drag on image node, which WILL detect drop target
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-img");
      });
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-img", 5, 5);
      });
      // Should have set drop target
      expect(dropTargetRectRef.current).not.toBeNull();

      // Now end this drag
      act(() => {
        hookResult.result.current.handleNodeDragEnd("node-img", 5, 5);
      });

      // Now start dragging the frame itself
      stateRef.current = {
        ...stateRef.current,
        nodes: [
          makeNode({ id: "frame-target", type: "frame", x: 0, y: 0, width: 500, height: 500 }),
        ],
        selectedNodeIds: new Set(["frame-target"]),
      };

      act(() => {
        hookResult.result.current.handleNodeDragStart("frame-target");
      });
      act(() => {
        hookResult.result.current.handleNodeDragMove("frame-target", 10, 10);
      });
      // frame type nodes skip drop target, dropTargetRectRef should be null
      expect(dropTargetRectRef.current).toBeNull();
    });

    it("handles node without origin in processDragFrame", () => {
      const { hookResult, groupRefs } = setupDrag({
        nodes: [
          makeNode({ id: "node-1", x: 100, y: 100 }),
          makeNode({ id: "node-2", x: 200, y: 200 }),
        ],
        selectedNodeIds: new Set(["node-1", "node-2"]),
      });
      groupRefs.current.set("node-2", mockKonvaGroup("node-2"));

      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      // Both nodes should have origins, just verify the move works
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 5, 5);
      });
      const group2 = groupRefs.current.get("node-2");
      expect(group2.position).toHaveBeenCalled();
    });

    it("detects drop target change from one frame to null", () => {
      const { hookResult, dropTargetRectRef, stateRef } = setupDrag({
        nodes: [
          makeNode({ id: "node-1", type: "image", x: 50, y: 50, width: 50, height: 50 }),
          makeNode({ id: "frame-1", type: "frame", x: 0, y: 0, width: 100, height: 100 }),
        ],
        selectedNodeIds: new Set(["node-1"]),
      });

      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });

      // First move inside the frame
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 5, 5);
      });
      expect(dropTargetRectRef.current).not.toBeNull();

      // Second move outside the frame
      mockedComputeSnapGuides.mockReturnValue({ snappedDx: 500, snappedDy: 500, guides: [] });
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 500, 500);
      });
      expect(dropTargetRectRef.current).toBeNull();
    });
  });

  describe("findFrameAtPoint", () => {
    it("selects frame with highest zIndex when multiple overlap", () => {
      const { hookResult, dropTargetRectRef } = setupDrag({
        nodes: [
          makeNode({ id: "node-1", type: "image", x: 50, y: 50, width: 50, height: 50 }),
          makeNode({ id: "frame-1", type: "frame", x: 0, y: 0, width: 500, height: 500, zIndex: 1 }),
          makeNode({ id: "frame-2", type: "frame", x: 0, y: 0, width: 500, height: 500, zIndex: 5 }),
        ],
        selectedNodeIds: new Set(["node-1"]),
      });

      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 5, 5);
      });
      // Should pick frame-2 (higher zIndex)
      expect(dropTargetRectRef.current).toEqual(
        expect.objectContaining({ x: 0, y: 0, width: 500, height: 500 }),
      );
    });
  });

  describe("useLayoutEffect re-apply", () => {
    it("re-applies positions via useLayoutEffect after rerender during drag", () => {
      mockedComputeSnapGuides.mockReturnValue({
        snappedDx: 15,
        snappedDy: 25,
        guides: [],
      });
      const { hookResult, groupRefs } = setupDrag();

      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 10, 20);
      });

      // Clear position calls
      const group = groupRefs.current.get("node-1");
      group.position.mockClear();

      // Trigger a rerender — useLayoutEffect should re-apply positions
      hookResult.rerender();

      // The useLayoutEffect should have called group.position again
      expect(group.position).toHaveBeenCalledWith({ x: 115, y: 125 });
    });
  });

  describe("handleNodeDragMove — snap guides with results", () => {
    it("applies snapped guides and redraws when guides change", () => {
      const guides = [
        { orientation: "v" as const, position: 150 },
        { orientation: "h" as const, position: 250 },
      ];
      mockedComputeSnapGuides.mockReturnValue({
        snappedDx: 12,
        snappedDy: 22,
        guides,
      });

      const { hookResult, snapGuidesRef, snapLayerRef, groupRefs } = setupDrag();
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      act(() => {
        hookResult.result.current.handleNodeDragMove("node-1", 10, 20);
      });

      // Verify snap guides were set
      expect(snapGuidesRef.current).toEqual(guides);
      expect(snapLayerRef.current.batchDraw).toHaveBeenCalled();

      // Verify the group position used snapped deltas
      const group = groupRefs.current.get("node-1");
      expect(group.position).toHaveBeenCalledWith({ x: 112, y: 122 }); // 100+12, 100+22
    });
  });

  describe("handleNodeDragEnd — node without origin in drag end uses fallback", () => {
    it("computes final position using n.x + dx for nodes without origin", () => {
      // Start drag only for node-1, but then change selectedIds to include node-2
      // which won't have an origin
      const { hookResult, dispatch, stateRef } = setupDrag({
        nodes: [
          makeNode({ id: "node-1", x: 100, y: 100 }),
          makeNode({ id: "node-2", x: 300, y: 300 }),
        ],
        selectedNodeIds: new Set(["node-1"]),
      });

      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });

      dispatch.mockClear();
      act(() => {
        hookResult.result.current.handleNodeDragEnd("node-1", 10, 10);
      });

      const dragEnd = dispatch.mock.calls.find((c) => c[0].type === "DRAG_END");
      expect(dragEnd).toBeDefined();
      // Only node-1 was in the drag set
      expect(dragEnd![0].ids).toContain("node-1");
    });
  });

  describe("handleNodeDragStart edge cases", () => {
    it("handles drag start on unselected node and builds origins for just that node", () => {
      const { hookResult, dispatch } = setupDrag({
        nodes: [
          makeNode({ id: "node-1", x: 100, y: 100 }),
          makeNode({ id: "node-2", x: 200, y: 200 }),
        ],
        selectedNodeIds: new Set(["node-2"]),
      });
      // Start drag on node-1 which is NOT selected
      act(() => {
        hookResult.result.current.handleNodeDragStart("node-1");
      });
      // Should dispatch SELECT_NODE for node-1
      expect(dispatch).toHaveBeenCalledWith({ type: "SELECT_NODE", id: "node-1" });

      // Now drag end should work for just node-1
      dispatch.mockClear();
      act(() => {
        hookResult.result.current.handleNodeDragEnd("node-1", 10, 10);
      });
      const dragEnd = dispatch.mock.calls.find((c) => c[0].type === "DRAG_END");
      expect(dragEnd).toBeDefined();
      expect(dragEnd![0].ids).toEqual(["node-1"]);
    });

    it("handles drag start with node not found in nodes array", () => {
      const { hookResult, dispatch } = setupDrag({
        nodes: [makeNode({ id: "node-1" })],
        selectedNodeIds: new Set(["node-1"]),
      });
      // Start drag on nonexistent node - draggedNode is undefined, so locked check passes
      act(() => {
        hookResult.result.current.handleNodeDragStart("nonexistent");
      });
      // Should dispatch SELECT_NODE since it's not in selectedNodeIds
      expect(dispatch).toHaveBeenCalledWith({ type: "SELECT_NODE", id: "nonexistent" });
    });
  });
});
