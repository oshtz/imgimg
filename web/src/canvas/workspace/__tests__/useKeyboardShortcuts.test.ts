// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "../useKeyboardShortcuts";
import type { CanvasNode } from "../../types";

function makeNode(overrides: Partial<CanvasNode> & { id: string }): CanvasNode {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    naturalWidth: 100,
    naturalHeight: 100,
    zIndex: 0,
    ...overrides,
  };
}

function setup(overrides: Partial<Parameters<typeof useKeyboardShortcuts>[0]> = {}) {
  const dispatch = vi.fn();
  const setSelectedConnectorId = vi.fn();
  const setContextMenu = vi.fn();
  const clipboardRef = { current: [] as CanvasNode[] };
  const defaults = {
    selectedNodeIds: new Set<string>(),
    nodes: [] as CanvasNode[],
    dimensions: { width: 800, height: 600 },
    dispatch,
    selectedConnectorId: null as string | null,
    setSelectedConnectorId,
    setContextMenu,
    clipboardRef,
    ...overrides,
  };
  renderHook(() => useKeyboardShortcuts(defaults));
  return { dispatch, setSelectedConnectorId, setContextMenu, clipboardRef };
}

function fire(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...opts }));
}

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Delete key dispatches REMOVE_NODES for selected unlocked nodes", () => {
    const nodes = [makeNode({ id: "a" }), makeNode({ id: "b", locked: true } as any)];
    const { dispatch } = setup({
      selectedNodeIds: new Set(["a", "b"]),
      nodes,
    });

    fire("Delete");

    expect(dispatch).toHaveBeenCalledWith({ type: "REMOVE_NODES", ids: ["a"] });
  });

  it("Delete removes connector when selectedConnectorId is set", () => {
    const { dispatch, setSelectedConnectorId } = setup({
      selectedConnectorId: "conn-1",
    });

    fire("Delete");

    expect(dispatch).toHaveBeenCalledWith({ type: "REMOVE_CONNECTOR", id: "conn-1" });
    expect(setSelectedConnectorId).toHaveBeenCalledWith(null);
  });

  it("Ctrl+D duplicates selected nodes", () => {
    const { dispatch } = setup({
      selectedNodeIds: new Set(["a"]),
      nodes: [makeNode({ id: "a" })],
    });

    fire("d", { ctrlKey: true });

    expect(dispatch).toHaveBeenCalledWith({ type: "DUPLICATE_NODES", ids: ["a"] });
  });

  it("Ctrl+Z dispatches UNDO", () => {
    const { dispatch } = setup();

    fire("z", { ctrlKey: true });

    expect(dispatch).toHaveBeenCalledWith({ type: "UNDO" });
  });

  it("Ctrl+Shift+Z dispatches REDO", () => {
    const { dispatch } = setup();

    fire("z", { ctrlKey: true, shiftKey: true });

    // The handler checks for both key === "y" and key === "z" && shiftKey
    // With shiftKey: true and key "z", UNDO won't fire (shiftKey check prevents it),
    // but REDO will fire
    expect(dispatch).toHaveBeenCalledWith({ type: "REDO" });
  });

  it("Ctrl+C copies selected nodes to clipboard", () => {
    const nodes = [makeNode({ id: "a", src: "img.png" }), makeNode({ id: "b" })];
    const { clipboardRef } = setup({
      selectedNodeIds: new Set(["a"]),
      nodes,
    });

    fire("c", { ctrlKey: true });

    expect(clipboardRef.current).toHaveLength(1);
    expect(clipboardRef.current[0].id).toBe("a");
  });

  it("Ctrl+V pastes nodes from clipboard", () => {
    const clipboardRef = { current: [makeNode({ id: "orig", x: 10, y: 20 })] };
    const { dispatch } = setup({ clipboardRef });

    fire("v", { ctrlKey: true });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ADD_NODE",
        node: expect.objectContaining({ x: 40, y: 50 }),
      })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SELECT_NODES" })
    );
  });

  it("+ key zooms in", () => {
    const { dispatch } = setup({ dimensions: { width: 800, height: 600 } });

    fire("=");

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ZOOM", delta: -1, centerX: 400, centerY: 300 })
    );
  });

  it("- key zooms out", () => {
    const { dispatch } = setup({ dimensions: { width: 800, height: 600 } });

    fire("-");

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ZOOM", delta: 1, centerX: 400, centerY: 300 })
    );
  });

  it("arrow keys nudge selected nodes", () => {
    const { dispatch } = setup({
      selectedNodeIds: new Set(["a"]),
      nodes: [makeNode({ id: "a" })],
    });

    fire("ArrowRight");

    expect(dispatch).toHaveBeenCalledWith({
      type: "MOVE_NODES",
      ids: ["a"],
      dx: 1,
      dy: 0,
    });
  });

  it("arrow keys with shift nudge by 10", () => {
    const { dispatch } = setup({
      selectedNodeIds: new Set(["a"]),
      nodes: [makeNode({ id: "a" })],
    });

    fire("ArrowUp", { shiftKey: true });

    expect(dispatch).toHaveBeenCalledWith({
      type: "MOVE_NODES",
      ids: ["a"],
      dx: 0,
      dy: -10,
    });
  });

  it("ignores events from input elements", () => {
    const { dispatch } = setup({
      selectedNodeIds: new Set(["a"]),
      nodes: [makeNode({ id: "a" })],
    });

    const input = document.createElement("input");
    document.body.appendChild(input);
    const event = new KeyboardEvent("keydown", {
      key: "Delete",
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: input });
    window.dispatchEvent(event);

    expect(dispatch).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("Escape clears selection and edit mode", () => {
    const { dispatch, setSelectedConnectorId, setContextMenu } = setup({
      selectedNodeIds: new Set(["a"]),
    });

    fire("Escape");

    expect(dispatch).toHaveBeenCalledWith({ type: "SELECT_NODE", id: null });
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_EDIT_MODE", mode: "select" });
    expect(setSelectedConnectorId).toHaveBeenCalledWith(null);
    expect(setContextMenu).toHaveBeenCalledWith(null);
  });

  it("Ctrl+A selects all nodes", () => {
    const nodes = [makeNode({ id: "a" }), makeNode({ id: "b" })];
    const { dispatch } = setup({ nodes });

    fire("a", { ctrlKey: true });

    expect(dispatch).toHaveBeenCalledWith({ type: "SELECT_NODES", ids: ["a", "b"] });
  });

  it("Ctrl+X cuts selected nodes (copy + delete)", () => {
    const nodes = [makeNode({ id: "a" }), makeNode({ id: "b" })];
    const { dispatch, clipboardRef } = setup({
      selectedNodeIds: new Set(["a"]),
      nodes,
    });

    fire("x", { ctrlKey: true });

    expect(clipboardRef.current).toHaveLength(1);
    expect(clipboardRef.current[0].id).toBe("a");
    expect(dispatch).toHaveBeenCalledWith({ type: "REMOVE_NODES", ids: ["a"] });
  });

  it("Ctrl+0 dispatches FIT_TO_CONTENT when nodes exist", () => {
    const nodes = [makeNode({ id: "a" })];
    const { dispatch } = setup({
      nodes,
      dimensions: { width: 800, height: 600 },
    });

    fire("0", { ctrlKey: true });

    expect(dispatch).toHaveBeenCalledWith({
      type: "FIT_TO_CONTENT",
      containerWidth: 800,
      containerHeight: 600,
    });
  });

  it("Ctrl+0 does nothing when no nodes", () => {
    const { dispatch } = setup({
      nodes: [],
      dimensions: { width: 800, height: 600 },
    });

    fire("0", { ctrlKey: true });

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "FIT_TO_CONTENT" })
    );
  });

  it("Shift+! (Shift+1) dispatches FIT_TO_SELECTION", () => {
    const nodes = [makeNode({ id: "a" }), makeNode({ id: "b" })];
    const { dispatch } = setup({
      selectedNodeIds: new Set(["a"]),
      nodes,
      dimensions: { width: 800, height: 600 },
    });

    fire("!", { shiftKey: true });

    expect(dispatch).toHaveBeenCalledWith({
      type: "FIT_TO_SELECTION",
      ids: ["a"],
      containerWidth: 800,
      containerHeight: 600,
    });
  });

  it("V key sets edit mode to select", () => {
    const { dispatch } = setup();

    fire("v");

    expect(dispatch).toHaveBeenCalledWith({ type: "SET_EDIT_MODE", mode: "select" });
  });

  it("Backspace key also deletes selected nodes", () => {
    const nodes = [makeNode({ id: "a" })];
    const { dispatch } = setup({
      selectedNodeIds: new Set(["a"]),
      nodes,
    });

    fire("Backspace");

    expect(dispatch).toHaveBeenCalledWith({ type: "REMOVE_NODES", ids: ["a"] });
  });

  it("Delete key with all locked nodes does not dispatch REMOVE_NODES", () => {
    const nodes = [makeNode({ id: "a", locked: true } as any), makeNode({ id: "b", locked: true } as any)];
    const { dispatch } = setup({
      selectedNodeIds: new Set(["a", "b"]),
      nodes,
    });

    fire("Delete");

    // No deletable nodes, so REMOVE_NODES should NOT be dispatched
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "REMOVE_NODES" })
    );
  });

  it("Delete with no selectedNodeIds and no selectedConnectorId does nothing", () => {
    const { dispatch } = setup({
      selectedNodeIds: new Set(),
      selectedConnectorId: null,
    });

    fire("Delete");

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("ArrowDown nudges by 1", () => {
    const { dispatch } = setup({
      selectedNodeIds: new Set(["a"]),
      nodes: [makeNode({ id: "a" })],
    });

    fire("ArrowDown");

    expect(dispatch).toHaveBeenCalledWith({
      type: "MOVE_NODES",
      ids: ["a"],
      dx: 0,
      dy: 1,
    });
  });

  it("ArrowLeft nudges by 1", () => {
    const { dispatch } = setup({
      selectedNodeIds: new Set(["a"]),
      nodes: [makeNode({ id: "a" })],
    });

    fire("ArrowLeft");

    expect(dispatch).toHaveBeenCalledWith({
      type: "MOVE_NODES",
      ids: ["a"],
      dx: -1,
      dy: 0,
    });
  });

  it("ArrowLeft with shift nudges by 10", () => {
    const { dispatch } = setup({
      selectedNodeIds: new Set(["a"]),
      nodes: [makeNode({ id: "a" })],
    });

    fire("ArrowLeft", { shiftKey: true });

    expect(dispatch).toHaveBeenCalledWith({
      type: "MOVE_NODES",
      ids: ["a"],
      dx: -10,
      dy: 0,
    });
  });

  it("Ctrl+Y dispatches REDO", () => {
    const { dispatch } = setup();

    fire("y", { ctrlKey: true });

    expect(dispatch).toHaveBeenCalledWith({ type: "REDO" });
  });

  it("+ key zooms in using window dimensions when dimensions are zero", () => {
    const { dispatch } = setup({ dimensions: { width: 0, height: 0 } });

    fire("=");

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ZOOM",
        delta: -1,
        centerX: window.innerWidth / 2,
        centerY: window.innerHeight / 2,
      })
    );
  });

  it("- key zooms out using window dimensions when dimensions are zero", () => {
    const { dispatch } = setup({ dimensions: { width: 0, height: 0 } });

    fire("-");

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ZOOM",
        delta: 1,
        centerX: window.innerWidth / 2,
        centerY: window.innerHeight / 2,
      })
    );
  });
});
