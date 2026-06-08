import { describe, it, expect } from "vitest";
import type { CanvasNode, CanvasConnector, ChatMessage, CanvasState, UndoableCanvasState } from "../types";
import type { Asset } from "../../types";
import {
  canvasReducer,
  initialCanvasState,
  undoableCanvasReducer,
  initialUndoableState,
} from "../canvasReducer";

function makeNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: crypto.randomUUID(),
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    naturalWidth: 100,
    naturalHeight: 100,
    zIndex: 1,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content: "hello",
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeConnector(overrides: Partial<CanvasConnector> = {}): CanvasConnector {
  return {
    id: crypto.randomUUID(),
    fromNodeId: "from",
    toNodeId: "to",
    ...overrides,
  };
}

function stateWith(overrides: Partial<CanvasState> = {}): CanvasState {
  return { ...initialCanvasState, ...overrides };
}

// ─── SET_VIEWPORT ──────────────────────────────────────────────

describe("SET_VIEWPORT", () => {
  it("sets viewport", () => {
    const vp = { x: 10, y: 20, scale: 2 };
    const result = canvasReducer(initialCanvasState, { type: "SET_VIEWPORT", viewport: vp });
    expect(result.viewport).toEqual(vp);
  });
});

// ─── ZOOM ──────────────────────────────────────────────────────

describe("ZOOM", () => {
  it("zooms in (negative delta)", () => {
    const result = canvasReducer(initialCanvasState, { type: "ZOOM", delta: -1, centerX: 0, centerY: 0 });
    expect(result.viewport.scale).toBeGreaterThan(1);
  });

  it("zooms out (positive delta)", () => {
    const result = canvasReducer(initialCanvasState, { type: "ZOOM", delta: 1, centerX: 0, centerY: 0 });
    expect(result.viewport.scale).toBeLessThan(1);
  });

  it("clamps to min scale (0.1)", () => {
    let state = stateWith({ viewport: { x: 0, y: 0, scale: 0.11 } });
    for (let i = 0; i < 20; i++) {
      state = canvasReducer(state, { type: "ZOOM", delta: 1, centerX: 0, centerY: 0 });
    }
    expect(state.viewport.scale).toBeGreaterThanOrEqual(0.1);
  });

  it("clamps to max scale (5)", () => {
    let state = stateWith({ viewport: { x: 0, y: 0, scale: 4.9 } });
    for (let i = 0; i < 20; i++) {
      state = canvasReducer(state, { type: "ZOOM", delta: -1, centerX: 0, centerY: 0 });
    }
    expect(state.viewport.scale).toBeLessThanOrEqual(5);
  });

  it("zooms toward cursor position", () => {
    const result = canvasReducer(initialCanvasState, { type: "ZOOM", delta: -1, centerX: 500, centerY: 500 });
    // After zooming in, viewport offset should shift toward the center point
    expect(result.viewport.x).not.toBe(0);
    expect(result.viewport.y).not.toBe(0);
  });
});

// ─── RESET_ZOOM ────────────────────────────────────────────────

describe("RESET_ZOOM", () => {
  it("resets viewport to origin with scale 1", () => {
    const state = stateWith({ viewport: { x: 100, y: 200, scale: 3 } });
    const result = canvasReducer(state, { type: "RESET_ZOOM" });
    expect(result.viewport).toEqual({ x: 0, y: 0, scale: 1 });
  });
});

// ─── ADD_NODE ──────────────────────────────────────────────────

describe("ADD_NODE", () => {
  it("adds a node and assigns nextZIndex", () => {
    const node = makeNode({ zIndex: 999 });
    const result = canvasReducer(initialCanvasState, { type: "ADD_NODE", node });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].zIndex).toBe(1); // overwritten with nextZIndex
    expect(result.nextZIndex).toBe(2);
  });

  it("increments nextZIndex on each add", () => {
    let state = initialCanvasState;
    state = canvasReducer(state, { type: "ADD_NODE", node: makeNode() });
    state = canvasReducer(state, { type: "ADD_NODE", node: makeNode() });
    expect(state.nextZIndex).toBe(3);
    expect(state.nodes[1].zIndex).toBe(2);
  });
});

// ─── UPDATE_NODE ───────────────────────────────────────────────

describe("UPDATE_NODE", () => {
  it("updates the specified node", () => {
    const node = makeNode({ id: "n1", x: 0 });
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, { type: "UPDATE_NODE", id: "n1", updates: { x: 50, y: 75 } });
    expect(result.nodes[0].x).toBe(50);
    expect(result.nodes[0].y).toBe(75);
  });

  it("does not change other nodes", () => {
    const n1 = makeNode({ id: "n1", x: 0 });
    const n2 = makeNode({ id: "n2", x: 10 });
    const state = stateWith({ nodes: [n1, n2] });
    const result = canvasReducer(state, { type: "UPDATE_NODE", id: "n1", updates: { x: 99 } });
    expect(result.nodes[1].x).toBe(10);
  });
});

// ─── REMOVE_NODE ───────────────────────────────────────────────

describe("REMOVE_NODE", () => {
  it("removes the node", () => {
    const node = makeNode({ id: "n1" });
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, { type: "REMOVE_NODE", id: "n1" });
    expect(result.nodes).toHaveLength(0);
  });

  it("removes the node from selectedNodeIds", () => {
    const node = makeNode({ id: "n1" });
    const state = stateWith({ nodes: [node], selectedNodeIds: new Set(["n1"]) });
    const result = canvasReducer(state, { type: "REMOVE_NODE", id: "n1" });
    expect(result.selectedNodeIds.size).toBe(0);
  });

  it("removes connectors referencing the node", () => {
    const node = makeNode({ id: "n1" });
    const c1 = makeConnector({ id: "c1", fromNodeId: "n1", toNodeId: "n2" });
    const c2 = makeConnector({ id: "c2", fromNodeId: "n3", toNodeId: "n1" });
    const c3 = makeConnector({ id: "c3", fromNodeId: "n3", toNodeId: "n2" });
    const state = stateWith({ nodes: [node, makeNode({ id: "n2" }), makeNode({ id: "n3" })], connectors: [c1, c2, c3] });
    const result = canvasReducer(state, { type: "REMOVE_NODE", id: "n1" });
    expect(result.connectors).toHaveLength(1);
    expect(result.connectors[0].id).toBe("c3");
  });
});

// ─── REMOVE_NODES ──────────────────────────────────────────────

describe("REMOVE_NODES", () => {
  it("removes multiple nodes at once", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const n3 = makeNode({ id: "n3" });
    const state = stateWith({ nodes: [n1, n2, n3], selectedNodeIds: new Set(["n1", "n2"]) });
    const result = canvasReducer(state, { type: "REMOVE_NODES", ids: ["n1", "n2"] });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("n3");
    expect(result.selectedNodeIds.size).toBe(0);
  });

  it("removes connectors referencing any removed node", () => {
    const c1 = makeConnector({ id: "c1", fromNodeId: "n1", toNodeId: "n2" });
    const c2 = makeConnector({ id: "c2", fromNodeId: "n3", toNodeId: "n4" });
    const state = stateWith({
      nodes: [makeNode({ id: "n1" }), makeNode({ id: "n2" }), makeNode({ id: "n3" }), makeNode({ id: "n4" })],
      connectors: [c1, c2],
    });
    const result = canvasReducer(state, { type: "REMOVE_NODES", ids: ["n1"] });
    expect(result.connectors).toHaveLength(1);
    expect(result.connectors[0].id).toBe("c2");
  });
});

// ─── DUPLICATE_NODE ────────────────────────────────────────────

describe("DUPLICATE_NODE", () => {
  it("duplicates a node with offset and new zIndex", () => {
    const node = makeNode({ id: "n1", x: 10, y: 20, src: "test.png" });
    const state = stateWith({ nodes: [node], nextZIndex: 5 });
    const result = canvasReducer(state, { type: "DUPLICATE_NODE", id: "n1" });
    expect(result.nodes).toHaveLength(2);
    const dup = result.nodes[1];
    expect(dup.id).not.toBe("n1");
    expect(dup.x).toBe(30);
    expect(dup.y).toBe(40);
    expect(dup.zIndex).toBe(5);
    expect(dup.src).toBe("test.png");
    expect(result.nextZIndex).toBe(6);
  });

  it("selects the duplicated node", () => {
    const node = makeNode({ id: "n1" });
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, { type: "DUPLICATE_NODE", id: "n1" });
    expect(result.selectedNodeIds.size).toBe(1);
    expect(result.selectedNodeIds.has(result.nodes[1].id)).toBe(true);
  });

  it("returns same state if source node not found", () => {
    const result = canvasReducer(initialCanvasState, { type: "DUPLICATE_NODE", id: "missing" });
    expect(result).toBe(initialCanvasState);
  });
});

// ─── DUPLICATE_NODES ───────────────────────────────────────────

describe("DUPLICATE_NODES", () => {
  it("duplicates multiple nodes", () => {
    const n1 = makeNode({ id: "n1", x: 0, y: 0 });
    const n2 = makeNode({ id: "n2", x: 50, y: 50 });
    const state = stateWith({ nodes: [n1, n2], nextZIndex: 3 });
    const result = canvasReducer(state, { type: "DUPLICATE_NODES", ids: ["n1", "n2"] });
    expect(result.nodes).toHaveLength(4);
    expect(result.nextZIndex).toBe(5);
    expect(result.selectedNodeIds.size).toBe(2);
    // The new nodes should be offset
    const newNodes = result.nodes.slice(2);
    expect(newNodes[0].x).toBe(20);
    expect(newNodes[1].x).toBe(70);
  });

  it("returns same state if no valid ids found", () => {
    const result = canvasReducer(initialCanvasState, { type: "DUPLICATE_NODES", ids: ["missing"] });
    expect(result).toBe(initialCanvasState);
  });
});

// ─── SELECT_NODE ───────────────────────────────────────────────

describe("SELECT_NODE", () => {
  it("selects a single node", () => {
    const result = canvasReducer(initialCanvasState, { type: "SELECT_NODE", id: "n1" });
    expect(result.selectedNodeIds).toEqual(new Set(["n1"]));
  });

  it("deselects all when id is null", () => {
    const state = stateWith({ selectedNodeIds: new Set(["n1", "n2"]) });
    const result = canvasReducer(state, { type: "SELECT_NODE", id: null });
    expect(result.selectedNodeIds.size).toBe(0);
  });

  it("additive: adds to selection", () => {
    const state = stateWith({ selectedNodeIds: new Set(["n1"]) });
    const result = canvasReducer(state, { type: "SELECT_NODE", id: "n2", additive: true });
    expect(result.selectedNodeIds).toEqual(new Set(["n1", "n2"]));
  });

  it("additive: toggles off if already selected", () => {
    const state = stateWith({ selectedNodeIds: new Set(["n1", "n2"]) });
    const result = canvasReducer(state, { type: "SELECT_NODE", id: "n1", additive: true });
    expect(result.selectedNodeIds).toEqual(new Set(["n2"]));
  });
});

// ─── SELECT_NODES ──────────────────────────────────────────────

describe("SELECT_NODES", () => {
  it("sets selection to exact set of ids", () => {
    const result = canvasReducer(initialCanvasState, { type: "SELECT_NODES", ids: ["a", "b", "c"] });
    expect(result.selectedNodeIds).toEqual(new Set(["a", "b", "c"]));
  });
});

// ─── MOVE_NODES ────────────────────────────────────────────────

describe("MOVE_NODES", () => {
  it("moves specified nodes by dx/dy", () => {
    const n1 = makeNode({ id: "n1", x: 10, y: 20 });
    const n2 = makeNode({ id: "n2", x: 100, y: 200 });
    const state = stateWith({ nodes: [n1, n2] });
    const result = canvasReducer(state, { type: "MOVE_NODES", ids: ["n1"], dx: 5, dy: 10 });
    expect(result.nodes[0].x).toBe(15);
    expect(result.nodes[0].y).toBe(30);
    expect(result.nodes[1].x).toBe(100); // unchanged
  });

  it("also moves children of frame nodes", () => {
    const frame = makeNode({ id: "f1", type: "frame" });
    const child = makeNode({ id: "c1", parentFrameId: "f1", x: 50, y: 50 });
    const state = stateWith({ nodes: [frame, child] });
    const result = canvasReducer(state, { type: "MOVE_NODES", ids: ["f1"], dx: 10, dy: 10 });
    expect(result.nodes[1].x).toBe(60);
    expect(result.nodes[1].y).toBe(60);
  });

  it("snaps to grid when snapToGrid is enabled", () => {
    const n1 = makeNode({ id: "n1", x: 0, y: 0 });
    const state = stateWith({ nodes: [n1], snapToGrid: true });
    const result = canvasReducer(state, { type: "MOVE_NODES", ids: ["n1"], dx: 25, dy: 25 });
    // Grid snap size is 40, so Math.round(25/40)*40 = 40
    expect(result.nodes[0].x).toBe(40);
    expect(result.nodes[0].y).toBe(40);
  });
});

// ─── DRAG_MOVE_NODES ───────────────────────────────────────────

describe("DRAG_MOVE_NODES", () => {
  it("moves nodes using origins but excludes the dragged node", () => {
    const n1 = makeNode({ id: "n1", x: 0, y: 0 });
    const n2 = makeNode({ id: "n2", x: 50, y: 50 });
    const origins = new Map([["n1", { x: 0, y: 0 }], ["n2", { x: 50, y: 50 }]]);
    const state = stateWith({ nodes: [n1, n2] });
    const result = canvasReducer(state, {
      type: "DRAG_MOVE_NODES", ids: ["n1", "n2"], excludeId: "n1", dx: 10, dy: 10, origins,
    });
    expect(result.nodes[0].x).toBe(0); // excluded
    expect(result.nodes[1].x).toBe(60); // origin.x + dx
  });
});

// ─── DRAG_END ──────────────────────────────────────────────────

describe("DRAG_END", () => {
  it("commits final positions from origins + delta", () => {
    const n1 = makeNode({ id: "n1", x: 999, y: 999 });
    const origins = new Map([["n1", { x: 0, y: 0 }]]);
    const state = stateWith({ nodes: [n1] });
    const result = canvasReducer(state, { type: "DRAG_END", ids: ["n1"], dx: 30, dy: 40, origins });
    expect(result.nodes[0].x).toBe(30);
    expect(result.nodes[0].y).toBe(40);
  });

  it("snaps to grid when enabled", () => {
    const n1 = makeNode({ id: "n1", x: 0, y: 0 });
    const origins = new Map([["n1", { x: 0, y: 0 }]]);
    const state = stateWith({ nodes: [n1], snapToGrid: true });
    const result = canvasReducer(state, { type: "DRAG_END", ids: ["n1"], dx: 25, dy: 25, origins });
    expect(result.nodes[0].x).toBe(40);
    expect(result.nodes[0].y).toBe(40);
  });
});

// ─── BRING_TO_FRONT / SEND_TO_BACK ────────────────────────────

describe("BRING_TO_FRONT", () => {
  it("sets node zIndex to nextZIndex and increments it", () => {
    const node = makeNode({ id: "n1", zIndex: 1 });
    const state = stateWith({ nodes: [node], nextZIndex: 5 });
    const result = canvasReducer(state, { type: "BRING_TO_FRONT", id: "n1" });
    expect(result.nodes[0].zIndex).toBe(5);
    expect(result.nextZIndex).toBe(6);
  });

  it("returns same state if node not found", () => {
    const result = canvasReducer(initialCanvasState, { type: "BRING_TO_FRONT", id: "missing" });
    expect(result).toBe(initialCanvasState);
  });
});

describe("SEND_TO_BACK", () => {
  it("sets node zIndex to min - 1", () => {
    const n1 = makeNode({ id: "n1", zIndex: 5 });
    const n2 = makeNode({ id: "n2", zIndex: 3 });
    const state = stateWith({ nodes: [n1, n2] });
    const result = canvasReducer(state, { type: "SEND_TO_BACK", id: "n1" });
    expect(result.nodes[0].zIndex).toBe(2); // min(5,3) - 1
  });

  it("returns same state for empty nodes array", () => {
    const result = canvasReducer(initialCanvasState, { type: "SEND_TO_BACK", id: "n1" });
    expect(result).toBe(initialCanvasState);
  });
});

describe("BRING_TO_FRONT_BATCH", () => {
  it("assigns incrementing zIndexes starting from nextZIndex", () => {
    const n1 = makeNode({ id: "n1", zIndex: 1 });
    const n2 = makeNode({ id: "n2", zIndex: 2 });
    const state = stateWith({ nodes: [n1, n2], nextZIndex: 10 });
    const result = canvasReducer(state, { type: "BRING_TO_FRONT_BATCH", ids: ["n1", "n2"] });
    expect(result.nodes[0].zIndex).toBe(10);
    expect(result.nodes[1].zIndex).toBe(11);
    expect(result.nextZIndex).toBe(12);
  });
});

describe("SEND_TO_BACK_BATCH", () => {
  it("assigns zIndexes below min for multiple nodes", () => {
    const n1 = makeNode({ id: "n1", zIndex: 5 });
    const n2 = makeNode({ id: "n2", zIndex: 6 });
    const n3 = makeNode({ id: "n3", zIndex: 3 });
    const state = stateWith({ nodes: [n1, n2, n3] });
    const result = canvasReducer(state, { type: "SEND_TO_BACK_BATCH", ids: ["n1", "n2"] });
    // min is 3, two ids so starting at 3-2=1
    expect(result.nodes[0].zIndex).toBe(1);
    expect(result.nodes[1].zIndex).toBe(2);
    expect(result.nodes[2].zIndex).toBe(3); // unchanged
  });

  it("returns same state for empty nodes array", () => {
    const result = canvasReducer(initialCanvasState, { type: "SEND_TO_BACK_BATCH", ids: ["n1"] });
    expect(result).toBe(initialCanvasState);
  });
});

// ─── REPLACE_NODE_IMAGE ────────────────────────────────────────

describe("REPLACE_NODE_IMAGE", () => {
  it("replaces src and natural dimensions", () => {
    const node = makeNode({ id: "n1", src: "old.png", naturalWidth: 100, naturalHeight: 100 });
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, {
      type: "REPLACE_NODE_IMAGE", id: "n1", src: "new.png", naturalWidth: 200, naturalHeight: 300,
    });
    expect(result.nodes[0].src).toBe("new.png");
    expect(result.nodes[0].naturalWidth).toBe(200);
    expect(result.nodes[0].naturalHeight).toBe(300);
  });
});

// ─── SET_EDIT_MODE ─────────────────────────────────────────────

describe("SET_EDIT_MODE", () => {
  it("sets edit mode", () => {
    const result = canvasReducer(initialCanvasState, { type: "SET_EDIT_MODE", mode: "inpaint" });
    expect(result.editMode).toBe("inpaint");
  });
});

// ─── Chat message actions ──────────────────────────────────────

describe("ADD_CHAT_MESSAGE", () => {
  it("appends a message", () => {
    const msg = makeMessage({ id: "m1" });
    const result = canvasReducer(initialCanvasState, { type: "ADD_CHAT_MESSAGE", message: msg });
    expect(result.chatMessages).toHaveLength(1);
    expect(result.chatMessages[0].id).toBe("m1");
  });
});

describe("REMOVE_CHAT_MESSAGE", () => {
  it("removes a message by id", () => {
    const msg = makeMessage({ id: "m1" });
    const state = stateWith({ chatMessages: [msg] });
    const result = canvasReducer(state, { type: "REMOVE_CHAT_MESSAGE", id: "m1" });
    expect(result.chatMessages).toHaveLength(0);
  });
});

describe("UPDATE_CHAT_MESSAGE", () => {
  it("updates a message", () => {
    const msg = makeMessage({ id: "m1", content: "old" });
    const state = stateWith({ chatMessages: [msg] });
    const result = canvasReducer(state, { type: "UPDATE_CHAT_MESSAGE", id: "m1", updates: { content: "new" } });
    expect(result.chatMessages[0].content).toBe("new");
  });
});

describe("UPDATE_TOOL_CALL_STATUS", () => {
  it("updates a tool call status within a message", () => {
    const msg = makeMessage({
      id: "m1",
      toolCalls: [{ id: "tc1", name: "generate", arguments: {}, status: "pending" }],
    });
    const state = stateWith({ chatMessages: [msg] });
    const result = canvasReducer(state, {
      type: "UPDATE_TOOL_CALL_STATUS", messageId: "m1", toolCallId: "tc1", status: "approved",
    });
    expect(result.chatMessages[0].toolCalls![0].status).toBe("approved");
  });

  it("attaches result to tool call", () => {
    const msg = makeMessage({
      id: "m1",
      toolCalls: [{ id: "tc1", name: "generate", arguments: {}, status: "executing" }],
    });
    const state = stateWith({ chatMessages: [msg] });
    const result = canvasReducer(state, {
      type: "UPDATE_TOOL_CALL_STATUS", messageId: "m1", toolCallId: "tc1", status: "completed",
      result: { success: true, generationId: "g1" },
    });
    expect(result.chatMessages[0].toolCalls![0].result?.success).toBe(true);
  });
});

// ─── SET_CHAT_WORKFLOW / SET_ENGINE ────────────────────────────

describe("SET_CHAT_WORKFLOW", () => {
  it("sets workflow id", () => {
    const result = canvasReducer(initialCanvasState, { type: "SET_CHAT_WORKFLOW", workflowId: "wf1" });
    expect(result.chatWorkflowId).toBe("wf1");
  });

  it("sets to null", () => {
    const state = stateWith({ chatWorkflowId: "wf1" });
    const result = canvasReducer(state, { type: "SET_CHAT_WORKFLOW", workflowId: null });
    expect(result.chatWorkflowId).toBeNull();
  });
});

describe("SET_ENGINE", () => {
  it("sets active engine", () => {
    const result = canvasReducer(initialCanvasState, { type: "SET_ENGINE", engine: "fal" });
    expect(result.activeEngine).toBe("fal");
  });
});

// ─── CLEAR_CHAT / CLEAR_CANVAS ────────────────────────────────

describe("CLEAR_CHAT", () => {
  it("clears messages and thread id", () => {
    const state = stateWith({ chatMessages: [makeMessage()], activeThreadId: "t1" });
    const result = canvasReducer(state, { type: "CLEAR_CHAT" });
    expect(result.chatMessages).toHaveLength(0);
    expect(result.activeThreadId).toBeNull();
  });
});

describe("CLEAR_CANVAS", () => {
  it("resets to initial but preserves chatWorkflowId, showLineage, pinned, engine", () => {
    const state = stateWith({
      nodes: [makeNode()],
      chatWorkflowId: "wf1",
      showLineage: true,
      pinnedModelIds: ["m1"],
      pinnedWorkflowIds: ["pw1"],
      selectedProviderModelId: "sp1",
      activeEngine: "replicate",
    });
    const result = canvasReducer(state, { type: "CLEAR_CANVAS" });
    expect(result.nodes).toHaveLength(0);
    expect(result.chatWorkflowId).toBe("wf1");
    expect(result.showLineage).toBe(true);
    expect(result.pinnedModelIds).toEqual(["m1"]);
    expect(result.pinnedWorkflowIds).toEqual(["pw1"]);
    expect(result.selectedProviderModelId).toBe("sp1");
    expect(result.activeEngine).toBe("replicate");
    expect(result.connectors).toEqual([]);
  });
});

// ─── LOAD_STATE ────────────────────────────────────────────────

describe("LOAD_STATE", () => {
  it("loads nodes, messages, workflow, and nextZIndex", () => {
    const nodes = [makeNode({ id: "n1" })];
    const msgs = [makeMessage({ id: "m1" })];
    const result = canvasReducer(initialCanvasState, {
      type: "LOAD_STATE", nodes, chatMessages: msgs, chatWorkflowId: "wf1", nextZIndex: 10,
    });
    expect(result.nodes).toHaveLength(1);
    expect(result.chatMessages).toHaveLength(1);
    expect(result.chatWorkflowId).toBe("wf1");
    expect(result.nextZIndex).toBe(10);
    expect(result.selectedNodeIds.size).toBe(0);
    expect(result.editMode).toBe("select");
  });

  it("loads optional fields with defaults", () => {
    const result = canvasReducer(initialCanvasState, {
      type: "LOAD_STATE", nodes: [], chatMessages: [], chatWorkflowId: null, nextZIndex: 1,
    });
    expect(result.connectors).toEqual([]);
    expect(result.pinnedModelIds).toEqual([]);
    expect(result.pinnedWorkflowIds).toEqual([]);
    expect(result.selectedProviderModelId).toBeNull();
    expect(result.activeEngine).toBeNull();
  });

  it("loads optional fields when provided", () => {
    const conn = makeConnector({ id: "c1" });
    const result = canvasReducer(initialCanvasState, {
      type: "LOAD_STATE", nodes: [], chatMessages: [], chatWorkflowId: null, nextZIndex: 1,
      connectors: [conn], pinnedModelIds: ["m1"], pinnedWorkflowIds: ["pw1"],
      selectedProviderModelId: "sp1", activeEngine: "fal",
    });
    expect(result.connectors).toHaveLength(1);
    expect(result.pinnedModelIds).toEqual(["m1"]);
    expect(result.activeEngine).toBe("fal");
  });
});

// ─── FIT_TO_CONTENT ────────────────────────────────────────────

describe("FIT_TO_CONTENT", () => {
  it("returns same state if no nodes", () => {
    const result = canvasReducer(initialCanvasState, {
      type: "FIT_TO_CONTENT", containerWidth: 800, containerHeight: 600,
    });
    expect(result).toBe(initialCanvasState);
  });

  it("fits viewport to cover all nodes", () => {
    const nodes = [
      makeNode({ id: "n1", x: 0, y: 0, width: 100, height: 100 }),
      makeNode({ id: "n2", x: 500, y: 500, width: 100, height: 100 }),
    ];
    const state = stateWith({ nodes });
    const result = canvasReducer(state, {
      type: "FIT_TO_CONTENT", containerWidth: 800, containerHeight: 600,
    });
    expect(result.viewport.scale).toBeGreaterThan(0);
    expect(result.viewport.scale).toBeLessThanOrEqual(1);
  });

  it("uses custom padding when provided", () => {
    // Use content large enough that padding affects scale
    const nodes = [
      makeNode({ id: "n1", x: 0, y: 0, width: 500, height: 500 }),
      makeNode({ id: "n2", x: 500, y: 500, width: 500, height: 500 }),
    ];
    const state = stateWith({ nodes });
    const resultDefault = canvasReducer(state, {
      type: "FIT_TO_CONTENT", containerWidth: 800, containerHeight: 600,
    });
    const resultCustom = canvasReducer(state, {
      type: "FIT_TO_CONTENT", containerWidth: 800, containerHeight: 600, padding: 200,
    });
    // Different padding should produce different scale because content bounds differ
    expect(resultDefault.viewport.scale).not.toBe(resultCustom.viewport.scale);
  });

  it("caps scale at 1 for small content in large container", () => {
    const nodes = [makeNode({ id: "n1", x: 0, y: 0, width: 10, height: 10 })];
    const state = stateWith({ nodes });
    const result = canvasReducer(state, {
      type: "FIT_TO_CONTENT", containerWidth: 2000, containerHeight: 2000,
    });
    expect(result.viewport.scale).toBe(1);
  });
});

// ─── FIT_TO_SELECTION ──────────────────────────────────────────

describe("FIT_TO_SELECTION", () => {
  it("returns same state if no matching nodes", () => {
    const result = canvasReducer(initialCanvasState, {
      type: "FIT_TO_SELECTION", ids: ["missing"], containerWidth: 800, containerHeight: 600,
    });
    expect(result).toBe(initialCanvasState);
  });

  it("fits viewport to the selected nodes only", () => {
    const n1 = makeNode({ id: "n1", x: 0, y: 0, width: 100, height: 100 });
    const n2 = makeNode({ id: "n2", x: 1000, y: 1000, width: 100, height: 100 });
    const state = stateWith({ nodes: [n1, n2] });
    const result = canvasReducer(state, {
      type: "FIT_TO_SELECTION", ids: ["n1"], containerWidth: 800, containerHeight: 600,
    });
    // Scale should be 1 since one small node fits easily
    expect(result.viewport.scale).toBe(1);
  });
});

// ─── SET_PARENT_FRAME ──────────────────────────────────────────

describe("SET_PARENT_FRAME", () => {
  it("sets parentFrameId on specified nodes", () => {
    const n1 = makeNode({ id: "n1" });
    const n2 = makeNode({ id: "n2" });
    const state = stateWith({ nodes: [n1, n2] });
    const result = canvasReducer(state, { type: "SET_PARENT_FRAME", nodeIds: ["n1"], frameId: "f1" });
    expect(result.nodes[0].parentFrameId).toBe("f1");
    expect(result.nodes[1].parentFrameId).toBeUndefined();
  });

  it("clears parentFrameId when frameId is null", () => {
    const n1 = makeNode({ id: "n1", parentFrameId: "f1" });
    const state = stateWith({ nodes: [n1] });
    const result = canvasReducer(state, { type: "SET_PARENT_FRAME", nodeIds: ["n1"], frameId: null });
    expect(result.nodes[0].parentFrameId).toBeUndefined();
  });
});

// ─── TOGGLE_LINEAGE ────────────────────────────────────────────

describe("TOGGLE_LINEAGE", () => {
  it("toggles showLineage", () => {
    expect(canvasReducer(initialCanvasState, { type: "TOGGLE_LINEAGE" }).showLineage).toBe(true);
    const on = stateWith({ showLineage: true });
    expect(canvasReducer(on, { type: "TOGGLE_LINEAGE" }).showLineage).toBe(false);
  });
});

// ─── TOGGLE_SNAP_TO_GRID ──────────────────────────────────────

describe("TOGGLE_SNAP_TO_GRID", () => {
  it("toggles snapToGrid", () => {
    expect(canvasReducer(initialCanvasState, { type: "TOGGLE_SNAP_TO_GRID" }).snapToGrid).toBe(true);
    const on = stateWith({ snapToGrid: true });
    expect(canvasReducer(on, { type: "TOGGLE_SNAP_TO_GRID" }).snapToGrid).toBe(false);
  });
});

// ─── SET_NODE_VISIBLE ──────────────────────────────────────────

describe("SET_NODE_VISIBLE", () => {
  it("hides a node (visible=false sets hidden=true)", () => {
    const node = makeNode({ id: "n1" });
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, { type: "SET_NODE_VISIBLE", id: "n1", visible: false });
    expect(result.nodes[0].hidden).toBe(true);
  });

  it("shows a node (visible=true clears hidden)", () => {
    const node = makeNode({ id: "n1", hidden: true });
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, { type: "SET_NODE_VISIBLE", id: "n1", visible: true });
    expect(result.nodes[0].hidden).toBeUndefined();
  });
});

// ─── REORDER_Z ─────────────────────────────────────────────────

describe("REORDER_Z", () => {
  it("sets a new zIndex on the specified node", () => {
    const node = makeNode({ id: "n1", zIndex: 1 });
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, { type: "REORDER_Z", id: "n1", newZIndex: 99 });
    expect(result.nodes[0].zIndex).toBe(99);
  });
});

// ─── TOGGLE_FRAME_COLLAPSE ─────────────────────────────────────

describe("TOGGLE_FRAME_COLLAPSE", () => {
  it("collapses a frame (saves height, sets to 32)", () => {
    const frame = makeNode({ id: "f1", type: "frame", height: 400 });
    const state = stateWith({ nodes: [frame] });
    const result = canvasReducer(state, { type: "TOGGLE_FRAME_COLLAPSE", id: "f1" });
    expect(result.nodes[0].collapsed).toBe(true);
    expect(result.nodes[0].expandedHeight).toBe(400);
    expect(result.nodes[0].height).toBe(32);
  });

  it("expands a collapsed frame (restores height)", () => {
    const frame = makeNode({ id: "f1", type: "frame", height: 32, collapsed: true, expandedHeight: 400 });
    const state = stateWith({ nodes: [frame] });
    const result = canvasReducer(state, { type: "TOGGLE_FRAME_COLLAPSE", id: "f1" });
    expect(result.nodes[0].collapsed).toBe(false);
    expect(result.nodes[0].height).toBe(400);
    expect(result.nodes[0].expandedHeight).toBeUndefined();
  });

  it("uses 400 as default expanded height when expandedHeight is missing", () => {
    const frame = makeNode({ id: "f1", type: "frame", height: 32, collapsed: true });
    const state = stateWith({ nodes: [frame] });
    const result = canvasReducer(state, { type: "TOGGLE_FRAME_COLLAPSE", id: "f1" });
    expect(result.nodes[0].height).toBe(400);
  });

  it("returns same state if node is not a frame", () => {
    const node = makeNode({ id: "n1" });
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, { type: "TOGGLE_FRAME_COLLAPSE", id: "n1" });
    expect(result).toBe(state);
  });

  it("returns same state if node not found", () => {
    const result = canvasReducer(initialCanvasState, { type: "TOGGLE_FRAME_COLLAPSE", id: "missing" });
    expect(result).toBe(initialCanvasState);
  });
});

// ─── Connector actions ─────────────────────────────────────────

describe("ADD_CONNECTOR", () => {
  it("adds a connector", () => {
    const conn = makeConnector({ id: "c1" });
    const result = canvasReducer(initialCanvasState, { type: "ADD_CONNECTOR", connector: conn });
    expect(result.connectors).toHaveLength(1);
    expect(result.connectors[0].id).toBe("c1");
  });
});

describe("REMOVE_CONNECTOR", () => {
  it("removes a connector by id", () => {
    const conn = makeConnector({ id: "c1" });
    const state = stateWith({ connectors: [conn] });
    const result = canvasReducer(state, { type: "REMOVE_CONNECTOR", id: "c1" });
    expect(result.connectors).toHaveLength(0);
  });
});

describe("UPDATE_CONNECTOR", () => {
  it("updates connector properties", () => {
    const conn = makeConnector({ id: "c1", color: "red" });
    const state = stateWith({ connectors: [conn] });
    const result = canvasReducer(state, { type: "UPDATE_CONNECTOR", id: "c1", updates: { color: "blue", arrowEnd: true } });
    expect(result.connectors[0].color).toBe("blue");
    expect(result.connectors[0].arrowEnd).toBe(true);
  });
});

// ─── TOGGLE_LOCK ───────────────────────────────────────────────

describe("TOGGLE_LOCK", () => {
  it("locks all nodes if any is unlocked", () => {
    const n1 = makeNode({ id: "n1", locked: true });
    const n2 = makeNode({ id: "n2" }); // unlocked
    const state = stateWith({ nodes: [n1, n2] });
    const result = canvasReducer(state, { type: "TOGGLE_LOCK", ids: ["n1", "n2"] });
    expect(result.nodes[0].locked).toBe(true);
    expect(result.nodes[1].locked).toBe(true);
  });

  it("unlocks all nodes if all are locked", () => {
    const n1 = makeNode({ id: "n1", locked: true });
    const n2 = makeNode({ id: "n2", locked: true });
    const state = stateWith({ nodes: [n1, n2] });
    const result = canvasReducer(state, { type: "TOGGLE_LOCK", ids: ["n1", "n2"] });
    // shouldLock is false, so locked = false || undefined = undefined
    expect(result.nodes[0].locked).toBeUndefined();
    expect(result.nodes[1].locked).toBeUndefined();
  });
});

// ─── ALIGN_NODES ───────────────────────────────────────────────

describe("ALIGN_NODES", () => {
  const n1 = makeNode({ id: "n1", x: 10, y: 10, width: 100, height: 50 });
  const n2 = makeNode({ id: "n2", x: 200, y: 200, width: 80, height: 60 });
  const n3 = makeNode({ id: "n3", x: 100, y: 100, width: 120, height: 40 });
  const baseState = stateWith({ nodes: [n1, n2, n3] });
  const ids = ["n1", "n2", "n3"];

  it("returns same state for fewer than 2 nodes", () => {
    const result = canvasReducer(baseState, { type: "ALIGN_NODES", ids: ["n1"], edge: "left" });
    expect(result).toBe(baseState);
  });

  it("aligns left", () => {
    const result = canvasReducer(baseState, { type: "ALIGN_NODES", ids, edge: "left" });
    result.nodes.forEach((n) => { if (ids.includes(n.id)) expect(n.x).toBe(10); });
  });

  it("aligns right", () => {
    const result = canvasReducer(baseState, { type: "ALIGN_NODES", ids, edge: "right" });
    // maxX = 200+80 = 280
    expect(result.nodes[0].x).toBe(280 - 100); // 180
    expect(result.nodes[1].x).toBe(280 - 80); // 200
    expect(result.nodes[2].x).toBe(280 - 120); // 160
  });

  it("aligns top", () => {
    const result = canvasReducer(baseState, { type: "ALIGN_NODES", ids, edge: "top" });
    result.nodes.forEach((n) => { if (ids.includes(n.id)) expect(n.y).toBe(10); });
  });

  it("aligns bottom", () => {
    const result = canvasReducer(baseState, { type: "ALIGN_NODES", ids, edge: "bottom" });
    // maxY = 200+60 = 260
    expect(result.nodes[0].y).toBe(260 - 50);
    expect(result.nodes[1].y).toBe(260 - 60);
    expect(result.nodes[2].y).toBe(260 - 40);
  });

  it("aligns center horizontally", () => {
    const result = canvasReducer(baseState, { type: "ALIGN_NODES", ids, edge: "center" });
    // minX=10, maxX=280, center = 145
    const center = (10 + 280) / 2;
    expect(result.nodes[0].x).toBe(center - 100 / 2);
    expect(result.nodes[1].x).toBe(center - 80 / 2);
  });

  it("aligns middle vertically", () => {
    const result = canvasReducer(baseState, { type: "ALIGN_NODES", ids, edge: "middle" });
    // minY=10, maxY=260, middle = 135
    const middle = (10 + 260) / 2;
    expect(result.nodes[0].y).toBe(middle - 50 / 2);
    expect(result.nodes[1].y).toBe(middle - 60 / 2);
  });

  it("returns node unchanged for unknown edge value (default case)", () => {
    const result = canvasReducer(baseState, {
      type: "ALIGN_NODES", ids, edge: "unknown" as any,
    });
    // Nodes should be unchanged since the unknown edge hits the default case
    expect(result.nodes[0].x).toBe(10);
    expect(result.nodes[0].y).toBe(10);
  });
});

// ─── DISTRIBUTE_NODES ──────────────────────────────────────────

describe("DISTRIBUTE_NODES", () => {
  it("returns same state for fewer than 3 nodes", () => {
    const state = stateWith({ nodes: [makeNode({ id: "n1" }), makeNode({ id: "n2" })] });
    const result = canvasReducer(state, { type: "DISTRIBUTE_NODES", ids: ["n1", "n2"], axis: "horizontal" });
    expect(result).toBe(state);
  });

  it("distributes horizontally with even gaps", () => {
    const n1 = makeNode({ id: "n1", x: 0, width: 50 });
    const n2 = makeNode({ id: "n2", x: 100, width: 50 });
    const n3 = makeNode({ id: "n3", x: 300, width: 50 });
    const state = stateWith({ nodes: [n1, n2, n3] });
    const result = canvasReducer(state, { type: "DISTRIBUTE_NODES", ids: ["n1", "n2", "n3"], axis: "horizontal" });
    // Total span: 0 to 350, total node width: 150, gap = (350 - 150) / 2 = 100
    expect(result.nodes[0].x).toBe(0);
    expect(result.nodes[1].x).toBe(150); // 0 + 50 + 100
    expect(result.nodes[2].x).toBe(300); // 150 + 50 + 100
  });

  it("distributes vertically with even gaps", () => {
    const n1 = makeNode({ id: "n1", y: 0, height: 50 });
    const n2 = makeNode({ id: "n2", y: 100, height: 50 });
    const n3 = makeNode({ id: "n3", y: 300, height: 50 });
    const state = stateWith({ nodes: [n1, n2, n3] });
    const result = canvasReducer(state, { type: "DISTRIBUTE_NODES", ids: ["n1", "n2", "n3"], axis: "vertical" });
    expect(result.nodes[0].y).toBe(0);
    expect(result.nodes[1].y).toBe(150);
    expect(result.nodes[2].y).toBe(300);
  });
});

// ─── MATCH_SIZE ────────────────────────────────────────────────

describe("MATCH_SIZE", () => {
  it("returns same state for fewer than 2 nodes", () => {
    const state = stateWith({ nodes: [makeNode({ id: "n1" })] });
    const result = canvasReducer(state, { type: "MATCH_SIZE", ids: ["n1"], dimension: "width" });
    expect(result).toBe(state);
  });

  it("matches width to the maximum width", () => {
    const n1 = makeNode({ id: "n1", width: 100 });
    const n2 = makeNode({ id: "n2", width: 200 });
    const state = stateWith({ nodes: [n1, n2] });
    const result = canvasReducer(state, { type: "MATCH_SIZE", ids: ["n1", "n2"], dimension: "width" });
    expect(result.nodes[0].width).toBe(200);
    expect(result.nodes[1].width).toBe(200);
  });

  it("matches height to the maximum height", () => {
    const n1 = makeNode({ id: "n1", height: 50 });
    const n2 = makeNode({ id: "n2", height: 300 });
    const state = stateWith({ nodes: [n1, n2] });
    const result = canvasReducer(state, { type: "MATCH_SIZE", ids: ["n1", "n2"], dimension: "height" });
    expect(result.nodes[0].height).toBe(300);
    expect(result.nodes[1].height).toBe(300);
  });
});

// ─── NORMALIZE_SIZE ────────────────────────────────────────────

describe("NORMALIZE_SIZE", () => {
  it("returns same state for no matching nodes", () => {
    const result = canvasReducer(initialCanvasState, { type: "NORMALIZE_SIZE", ids: ["missing"], target: "small" });
    expect(result).toBe(initialCanvasState);
  });

  it("normalizes landscape image to small (200px longest edge)", () => {
    const node = makeNode({ id: "n1", width: 800, height: 400, naturalWidth: 800, naturalHeight: 400 });
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, { type: "NORMALIZE_SIZE", ids: ["n1"], target: "small" });
    expect(result.nodes[0].width).toBe(200);
    expect(result.nodes[0].height).toBe(100);
  });

  it("normalizes portrait image to medium (400px longest edge)", () => {
    const node = makeNode({ id: "n1", width: 300, height: 600, naturalWidth: 300, naturalHeight: 600 });
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, { type: "NORMALIZE_SIZE", ids: ["n1"], target: "medium" });
    expect(result.nodes[0].height).toBe(400);
    expect(result.nodes[0].width).toBe(200);
  });

  it("normalizes to large (600px longest edge)", () => {
    const node = makeNode({ id: "n1", width: 100, height: 100, naturalWidth: 100, naturalHeight: 100 });
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, { type: "NORMALIZE_SIZE", ids: ["n1"], target: "large" });
    expect(result.nodes[0].width).toBe(600);
    expect(result.nodes[0].height).toBe(600);
  });

  it("normalizes to original natural dimensions", () => {
    const node = makeNode({ id: "n1", width: 50, height: 50, naturalWidth: 800, naturalHeight: 600 });
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, { type: "NORMALIZE_SIZE", ids: ["n1"], target: "original" });
    expect(result.nodes[0].width).toBe(800);
    expect(result.nodes[0].height).toBe(600);
  });

  it("skips non-image nodes", () => {
    const frame = makeNode({ id: "f1", type: "frame", width: 500, height: 500 });
    const state = stateWith({ nodes: [frame] });
    const result = canvasReducer(state, { type: "NORMALIZE_SIZE", ids: ["f1"], target: "small" });
    expect(result.nodes[0].width).toBe(500); // unchanged
  });
});

// ─── AUTO_ARRANGE ──────────────────────────────────────────────

describe("AUTO_ARRANGE", () => {
  it("returns same state for fewer than 2 nodes", () => {
    const state = stateWith({ nodes: [makeNode({ id: "n1" })] });
    const result = canvasReducer(state, { type: "AUTO_ARRANGE", ids: ["n1"], mode: "grid" });
    expect(result).toBe(state);
  });

  it("rearranges nodes in masonry mode (includes width/height in results)", () => {
    const nodes = Array.from({ length: 4 }, (_, i) =>
      makeNode({ id: `n${i}`, x: i * 500, y: i * 500, width: 200, height: 300, naturalWidth: 200, naturalHeight: 300 })
    );
    const state = stateWith({ nodes });
    const ids = nodes.map((n) => n.id);
    const result = canvasReducer(state, { type: "AUTO_ARRANGE", ids, mode: "masonry" });
    // Masonry mode returns width/height in the position map
    const moved = result.nodes.some((n, i) => n.x !== nodes[i].x || n.y !== nodes[i].y);
    expect(moved).toBe(true);
  });

  it("rearranges nodes in tree mode", () => {
    const n1 = makeNode({ id: "root", x: 0, y: 0, width: 100, height: 100 });
    const n2 = makeNode({ id: "child", x: 500, y: 500, width: 100, height: 100 });
    const conn = makeConnector({ id: "c1", fromNodeId: "root", toNodeId: "child" });
    const state = stateWith({ nodes: [n1, n2], connectors: [conn] });
    const result = canvasReducer(state, { type: "AUTO_ARRANGE", ids: ["root", "child"], mode: "tree" });
    // Tree mode should rearrange based on connectors
    const moved = result.nodes.some((n, i) => n.x !== state.nodes[i].x || n.y !== state.nodes[i].y);
    expect(moved).toBe(true);
  });

  it("rearranges nodes in grid mode", () => {
    const nodes = Array.from({ length: 4 }, (_, i) =>
      makeNode({ id: `n${i}`, x: i * 500, y: i * 500, width: 100, height: 100 })
    );
    const state = stateWith({ nodes });
    const ids = nodes.map((n) => n.id);
    const result = canvasReducer(state, { type: "AUTO_ARRANGE", ids, mode: "grid" });
    // Just verify positions changed (exact layout depends on placement.ts)
    const moved = result.nodes.some((n, i) => n.x !== nodes[i].x || n.y !== nodes[i].y);
    expect(moved).toBe(true);
  });
});

// ─── SET_PINNED_MODELS / SET_PINNED_WORKFLOWS ──────────────────

describe("SET_PINNED_MODELS", () => {
  it("sets pinned model ids", () => {
    const result = canvasReducer(initialCanvasState, { type: "SET_PINNED_MODELS", modelIds: ["a", "b"] });
    expect(result.pinnedModelIds).toEqual(["a", "b"]);
  });
});

describe("SET_PINNED_WORKFLOWS", () => {
  it("sets pinned workflow ids", () => {
    const result = canvasReducer(initialCanvasState, { type: "SET_PINNED_WORKFLOWS", workflowIds: ["w1"] });
    expect(result.pinnedWorkflowIds).toEqual(["w1"]);
  });
});

// ─── SET_ACTIVE_THREAD / LOAD_THREAD ──────────────────────────

describe("SET_ACTIVE_THREAD", () => {
  it("sets active thread id", () => {
    const result = canvasReducer(initialCanvasState, { type: "SET_ACTIVE_THREAD", threadId: "t1" });
    expect(result.activeThreadId).toBe("t1");
  });
});

describe("LOAD_THREAD", () => {
  it("sets thread id and messages", () => {
    const msgs = [makeMessage({ id: "m1" })];
    const result = canvasReducer(initialCanvasState, { type: "LOAD_THREAD", threadId: "t1", messages: msgs });
    expect(result.activeThreadId).toBe("t1");
    expect(result.chatMessages).toHaveLength(1);
  });
});

// ─── SET_PROVIDER_MODEL ────────────────────────────────────────

describe("SET_PROVIDER_MODEL", () => {
  it("sets the provider model id", () => {
    const result = canvasReducer(initialCanvasState, { type: "SET_PROVIDER_MODEL", modelId: "model-1" });
    expect(result.selectedProviderModelId).toBe("model-1");
  });
});

// ─── UNDO / REDO (undoableCanvasReducer) ───────────────────────

describe("undoableCanvasReducer", () => {
  describe("UNDO", () => {
    it("returns same state if past is empty", () => {
      const result = undoableCanvasReducer(initialUndoableState, { type: "UNDO" });
      expect(result).toBe(initialUndoableState);
    });

    it("restores previous state and pushes current to future", () => {
      const node = makeNode({ id: "n1" });
      // Add a node (undoable action)
      const afterAdd = undoableCanvasReducer(initialUndoableState, { type: "ADD_NODE", node });
      expect(afterAdd.present.nodes).toHaveLength(1);
      expect(afterAdd.past).toHaveLength(1);
      expect(afterAdd.future).toHaveLength(0);

      // Undo
      const afterUndo = undoableCanvasReducer(afterAdd, { type: "UNDO" });
      expect(afterUndo.present.nodes).toHaveLength(0);
      expect(afterUndo.past).toHaveLength(0);
      expect(afterUndo.future).toHaveLength(1);
    });

    it("preserves viewport and resets selection/editMode on undo", () => {
      const node = makeNode({ id: "n1" });
      let state = undoableCanvasReducer(initialUndoableState, { type: "ADD_NODE", node });
      // Change viewport (non-undoable)
      state = undoableCanvasReducer(state, { type: "SET_VIEWPORT", viewport: { x: 100, y: 200, scale: 2 } });
      // Select node
      state = undoableCanvasReducer(state, { type: "SELECT_NODE", id: "n1" });

      const afterUndo = undoableCanvasReducer(state, { type: "UNDO" });
      expect(afterUndo.present.viewport).toEqual({ x: 100, y: 200, scale: 2 });
      expect(afterUndo.present.selectedNodeIds.size).toBe(0);
      expect(afterUndo.present.editMode).toBe("select");
    });
  });

  describe("REDO", () => {
    it("returns same state if future is empty", () => {
      const result = undoableCanvasReducer(initialUndoableState, { type: "REDO" });
      expect(result).toBe(initialUndoableState);
    });

    it("restores next state and pushes current to past", () => {
      const node = makeNode({ id: "n1" });
      let state = undoableCanvasReducer(initialUndoableState, { type: "ADD_NODE", node });
      state = undoableCanvasReducer(state, { type: "UNDO" });
      expect(state.present.nodes).toHaveLength(0);

      state = undoableCanvasReducer(state, { type: "REDO" });
      expect(state.present.nodes).toHaveLength(1);
      expect(state.past).toHaveLength(1);
      expect(state.future).toHaveLength(0);
    });
  });

  describe("undoable action tracking", () => {
    it("pushes to past for undoable actions", () => {
      const node = makeNode({ id: "n1" });
      const result = undoableCanvasReducer(initialUndoableState, { type: "ADD_NODE", node });
      expect(result.past).toHaveLength(1);
      expect(result.future).toHaveLength(0);
    });

    it("does not push to past for non-undoable actions", () => {
      const result = undoableCanvasReducer(initialUndoableState, {
        type: "SET_VIEWPORT", viewport: { x: 1, y: 1, scale: 1 },
      });
      expect(result.past).toHaveLength(0);
    });

    it("clears future on new undoable action", () => {
      const node = makeNode({ id: "n1" });
      let state = undoableCanvasReducer(initialUndoableState, { type: "ADD_NODE", node });
      state = undoableCanvasReducer(state, { type: "UNDO" });
      expect(state.future).toHaveLength(1);

      // New undoable action clears redo stack
      state = undoableCanvasReducer(state, { type: "ADD_NODE", node: makeNode({ id: "n2" }) });
      expect(state.future).toHaveLength(0);
    });

    it("caps undo history at 50", () => {
      let state = initialUndoableState;
      for (let i = 0; i < 60; i++) {
        state = undoableCanvasReducer(state, { type: "ADD_NODE", node: makeNode() });
      }
      expect(state.past.length).toBeLessThanOrEqual(50);
    });
  });

  describe("no-op detection", () => {
    it("returns same state when inner reducer returns same reference", () => {
      // BRING_TO_FRONT with missing id returns same state
      const result = undoableCanvasReducer(initialUndoableState, { type: "BRING_TO_FRONT", id: "missing" });
      expect(result).toBe(initialUndoableState);
    });
  });

  describe("transient actions (layered-op atomicity)", () => {
    const asset: Asset = {
      id: "asset-1",
      generationId: "gen-1",
      type: "image" as Asset["type"],
      url: "blob:new",
      itemIndex: null,
      createdAt: "2026-01-01T00:00:00Z",
    };

    it("does not push to past for a transient UPDATE_NODE", () => {
      const node = makeNode({ id: "n1" });
      let state = undoableCanvasReducer(initialUndoableState, { type: "ADD_NODE", node });
      expect(state.past).toHaveLength(1);

      // Transient update (loading-status churn) updates present without history
      state = undoableCanvasReducer(state, {
        type: "UPDATE_NODE", id: "n1", transient: true, updates: { loadingStatus: "running" },
      });
      expect(state.past).toHaveLength(1);
      expect(state.present.nodes[0].loadingStatus).toBe("running");
    });

    it("does not push to past for a transient ADD_NODE but still adds the node", () => {
      const anchor = makeNode({ id: "n1" });
      let state = undoableCanvasReducer(initialUndoableState, { type: "ADD_NODE", node: anchor });
      expect(state.past).toHaveLength(1);

      state = undoableCanvasReducer(state, { type: "ADD_NODE", transient: true, node: makeNode({ id: "n2" }) });
      expect(state.past).toHaveLength(1);
      expect(state.present.nodes).toHaveLength(2);
    });

    it("collapses a skeleton-add + transient fill into a single undo", () => {
      // Simulates a chat generation: skeleton ADD (anchor) then transient fill.
      const skeleton = makeNode({ id: "n1", loadingStatus: "queued" });
      let state = undoableCanvasReducer(initialUndoableState, { type: "ADD_NODE", node: skeleton });
      state = undoableCanvasReducer(state, {
        type: "UPDATE_NODE", id: "n1", transient: true,
        updates: { src: "blob:img", loadingStatus: undefined },
      });
      expect(state.present.nodes[0].src).toBe("blob:img");
      expect(state.past).toHaveLength(1);

      // One undo removes the whole generated node (no loading-skeleton replay)
      const afterUndo = undoableCanvasReducer(state, { type: "UNDO" });
      expect(afterUndo.present.nodes).toHaveLength(0);
    });

    it("REPLACE_NODE_IMAGE with asset is one undoable, reversible step", () => {
      const original = makeNode({ id: "n1", src: "blob:old", asset: { ...asset, id: "old", url: "blob:old" } });
      let state: UndoableCanvasState = {
        present: { ...initialCanvasState, nodes: [original], nextZIndex: 2 },
        past: [],
        future: [],
      };

      state = undoableCanvasReducer(state, {
        type: "REPLACE_NODE_IMAGE", id: "n1", src: "blob:new", naturalWidth: 512, naturalHeight: 512, asset,
      });
      expect(state.past).toHaveLength(1);
      expect(state.present.nodes[0].src).toBe("blob:new");
      expect(state.present.nodes[0].asset?.id).toBe("asset-1");

      // One undo restores image and asset together (no half-reverted state)
      const afterUndo = undoableCanvasReducer(state, { type: "UNDO" });
      expect(afterUndo.present.nodes[0].src).toBe("blob:old");
      expect(afterUndo.present.nodes[0].asset?.id).toBe("old");
    });
  });
});

// ─── Default case ──────────────────────────────────────────────

describe("default case", () => {
  it("returns state for unknown action type", () => {
    // @ts-expect-error testing unknown action
    const result = canvasReducer(initialCanvasState, { type: "UNKNOWN_ACTION" });
    expect(result).toBe(initialCanvasState);
  });
});

// ─── DRAG_MOVE_NODES fallback without origin ──────────────────

describe("DRAG_MOVE_NODES fallback", () => {
  it("falls back to relative dx/dy when no origin exists for a node", () => {
    const n1 = makeNode({ id: "n1", x: 100, y: 100 });
    const n2 = makeNode({ id: "n2", x: 200, y: 200 });
    // origins only has n1, not n2
    const origins = new Map([["n1", { x: 100, y: 100 }]]);
    const state = stateWith({ nodes: [n1, n2] });
    const result = canvasReducer(state, {
      type: "DRAG_MOVE_NODES", ids: ["n1", "n2"], excludeId: "n1", dx: 10, dy: 10, origins,
    });
    // n1 excluded, n2 has no origin so falls back to n.x + dx
    expect(result.nodes[1].x).toBe(210);
    expect(result.nodes[1].y).toBe(210);
  });

  it("also moves children of dragged frame nodes", () => {
    const frame = makeNode({ id: "f1", type: "frame", x: 0, y: 0 });
    const child = makeNode({ id: "c1", parentFrameId: "f1", x: 50, y: 50 });
    const origins = new Map([["f1", { x: 0, y: 0 }], ["c1", { x: 50, y: 50 }]]);
    const state = stateWith({ nodes: [frame, child] });
    const result = canvasReducer(state, {
      type: "DRAG_MOVE_NODES", ids: ["f1"], excludeId: "f1", dx: 10, dy: 10, origins,
    });
    // child should be moved (not excluded)
    expect(result.nodes[1].x).toBe(60);
    expect(result.nodes[1].y).toBe(60);
  });
});

// ─── DRAG_END fallback without origin ─────────────────────────

describe("DRAG_END fallback", () => {
  it("falls back to relative dx/dy when no origin exists for a node", () => {
    const n1 = makeNode({ id: "n1", x: 100, y: 100 });
    // Empty origins map
    const origins = new Map<string, { x: number; y: number }>();
    const state = stateWith({ nodes: [n1] });
    const result = canvasReducer(state, {
      type: "DRAG_END", ids: ["n1"], dx: 10, dy: 10, origins,
    });
    expect(result.nodes[0].x).toBe(110);
    expect(result.nodes[0].y).toBe(110);
  });

  it("also moves children of dragged frame nodes", () => {
    const frame = makeNode({ id: "f1", type: "frame", x: 0, y: 0 });
    const child = makeNode({ id: "c1", parentFrameId: "f1", x: 50, y: 50 });
    const origins = new Map([["f1", { x: 0, y: 0 }]]);
    const state = stateWith({ nodes: [frame, child] });
    const result = canvasReducer(state, {
      type: "DRAG_END", ids: ["f1"], dx: 10, dy: 10, origins,
    });
    // child should also be moved
    expect(result.nodes[1].x).toBe(60);
    expect(result.nodes[1].y).toBe(60);
  });
});

// ─── Additional coverage: uncovered branches ─────────────────

describe("NORMALIZE_SIZE — original with naturalWidth/naturalHeight", () => {
  it("uses naturalWidth/naturalHeight for 'original' target", () => {
    const node = makeNode({ id: "n1", width: 200, height: 200, naturalWidth: 1024, naturalHeight: 768 });
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, { type: "NORMALIZE_SIZE", ids: ["n1"], target: "original" });
    expect(result.nodes[0].width).toBe(1024);
    expect(result.nodes[0].height).toBe(768);
  });

  it("falls back to current width/height when naturalWidth is 0", () => {
    const node = makeNode({ id: "n1", width: 300, height: 200, naturalWidth: 0, naturalHeight: 0 });
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, { type: "NORMALIZE_SIZE", ids: ["n1"], target: "small" });
    // nw = n.naturalWidth || n.width = 0 || 300 = 300, aspect = 300/200 = 1.5
    // landscape: newW = 200, newH = round(200/1.5) = 133
    expect(result.nodes[0].width).toBe(200);
    expect(result.nodes[0].height).toBe(133);
  });

  it("skips text nodes (non-image type)", () => {
    const textNode = makeNode({ id: "t1", type: "text" as any, width: 200, height: 100 });
    const state = stateWith({ nodes: [textNode] });
    const result = canvasReducer(state, { type: "NORMALIZE_SIZE", ids: ["t1"], target: "large" });
    expect(result.nodes[0].width).toBe(200); // unchanged
  });

  it("resizes node with no type (defaults to image)", () => {
    const node = makeNode({ id: "n1", width: 100, height: 200, naturalWidth: 100, naturalHeight: 200 });
    // Ensure type is undefined (no type = image)
    delete (node as any).type;
    const state = stateWith({ nodes: [node] });
    const result = canvasReducer(state, { type: "NORMALIZE_SIZE", ids: ["n1"], target: "medium" });
    // Portrait: constrain height to 400
    expect(result.nodes[0].height).toBe(400);
    expect(result.nodes[0].width).toBe(200);
  });
});

describe("ZOOM — exact min/max scale clamping", () => {
  it("clamps exactly at MIN_SCALE (0.1)", () => {
    const state = stateWith({ viewport: { x: 0, y: 0, scale: 0.1 } });
    // Zooming out should not go below 0.1
    const result = canvasReducer(state, { type: "ZOOM", delta: 1, centerX: 0, centerY: 0 });
    expect(result.viewport.scale).toBeGreaterThanOrEqual(0.1);
  });

  it("clamps exactly at MAX_SCALE (5)", () => {
    const state = stateWith({ viewport: { x: 0, y: 0, scale: 5 } });
    // Zooming in should not go above 5
    const result = canvasReducer(state, { type: "ZOOM", delta: -1, centerX: 0, centerY: 0 });
    expect(result.viewport.scale).toBeLessThanOrEqual(5);
  });
});

describe("DRAG_END — snapToGrid with origins", () => {
  it("snaps to grid when snapToGrid is enabled and origins exist", () => {
    const n1 = makeNode({ id: "n1", x: 0, y: 0 });
    const origins = new Map([["n1", { x: 0, y: 0 }]]);
    const state = stateWith({ nodes: [n1], snapToGrid: true });
    // dx=25, dy=25 → snap: round(25/40)*40 = 40
    const result = canvasReducer(state, { type: "DRAG_END", ids: ["n1"], dx: 25, dy: 25, origins });
    expect(result.nodes[0].x).toBe(40);
    expect(result.nodes[0].y).toBe(40);
  });

  it("snaps to grid without origins (fallback path)", () => {
    const n1 = makeNode({ id: "n1", x: 10, y: 10 });
    const origins = new Map<string, { x: number; y: number }>();
    const state = stateWith({ nodes: [n1], snapToGrid: true });
    // No origin: nx = n.x + dx = 10 + 25 = 35, snap: round(35/40)*40 = 40
    const result = canvasReducer(state, { type: "DRAG_END", ids: ["n1"], dx: 25, dy: 25, origins });
    expect(result.nodes[0].x).toBe(40);
    expect(result.nodes[0].y).toBe(40);
  });
});

describe("FIT_TO_CONTENT — scale cap at 1", () => {
  it("does not zoom past 1 for tiny content in big container", () => {
    const nodes = [makeNode({ id: "n1", x: 0, y: 0, width: 10, height: 10 })];
    const state = stateWith({ nodes });
    const result = canvasReducer(state, {
      type: "FIT_TO_CONTENT", containerWidth: 5000, containerHeight: 5000,
    });
    expect(result.viewport.scale).toBe(1);
  });
});

describe("FIT_TO_SELECTION — scale cap at 1", () => {
  it("does not zoom past 1 for tiny selection in big container", () => {
    const n1 = makeNode({ id: "n1", x: 0, y: 0, width: 10, height: 10 });
    const state = stateWith({ nodes: [n1] });
    const result = canvasReducer(state, {
      type: "FIT_TO_SELECTION", ids: ["n1"], containerWidth: 5000, containerHeight: 5000,
    });
    expect(result.viewport.scale).toBe(1);
  });
});

describe("LOAD_STATE — all optional fields", () => {
  it("uses defaults when optional fields are undefined", () => {
    const result = canvasReducer(initialCanvasState, {
      type: "LOAD_STATE",
      nodes: [],
      chatMessages: [],
      chatWorkflowId: null,
      nextZIndex: 1,
      // all optional fields omitted
    });
    expect(result.connectors).toEqual([]);
    expect(result.pinnedModelIds).toEqual([]);
    expect(result.pinnedWorkflowIds).toEqual([]);
    expect(result.selectedProviderModelId).toBeNull();
    expect(result.activeEngine).toBeNull();
  });

  it("uses provided values when optional fields are defined", () => {
    const conn = makeConnector({ id: "c1" });
    const result = canvasReducer(initialCanvasState, {
      type: "LOAD_STATE",
      nodes: [],
      chatMessages: [],
      chatWorkflowId: "wf-1",
      nextZIndex: 5,
      connectors: [conn],
      pinnedModelIds: ["m1", "m2"],
      pinnedWorkflowIds: ["pw1"],
      selectedProviderModelId: "sp-1",
      activeEngine: "replicate",
    });
    expect(result.connectors).toHaveLength(1);
    expect(result.pinnedModelIds).toEqual(["m1", "m2"]);
    expect(result.pinnedWorkflowIds).toEqual(["pw1"]);
    expect(result.selectedProviderModelId).toBe("sp-1");
    expect(result.activeEngine).toBe("replicate");
  });
});

describe("MOVE_NODES — snapToGrid ternary branches", () => {
  it("does not snap when snapToGrid is false (gs=0 branch)", () => {
    const n1 = makeNode({ id: "n1", x: 10, y: 10 });
    const state = stateWith({ nodes: [n1], snapToGrid: false });
    const result = canvasReducer(state, { type: "MOVE_NODES", ids: ["n1"], dx: 25, dy: 25 });
    // Without snap: nx = 10+25 = 35
    expect(result.nodes[0].x).toBe(35);
    expect(result.nodes[0].y).toBe(35);
  });
});

describe("DRAG_MOVE_NODES — frame children branch", () => {
  it("moves frame children during drag move", () => {
    const frame = makeNode({ id: "f1", type: "frame", x: 0, y: 0 });
    const child = makeNode({ id: "c1", parentFrameId: "f1", x: 50, y: 50 });
    const origins = new Map([["f1", { x: 0, y: 0 }], ["c1", { x: 50, y: 50 }]]);
    const state = stateWith({ nodes: [frame, child] });
    const result = canvasReducer(state, {
      type: "DRAG_MOVE_NODES", ids: ["f1"], excludeId: "f1", dx: 10, dy: 10, origins,
    });
    // child moves using origin
    expect(result.nodes[1].x).toBe(60);
    expect(result.nodes[1].y).toBe(60);
  });
});

describe("DRAG_END — frame children and snapToGrid=false", () => {
  it("moves frame children in DRAG_END with no snap", () => {
    const frame = makeNode({ id: "f1", type: "frame", x: 0, y: 0 });
    const child = makeNode({ id: "c1", parentFrameId: "f1", x: 50, y: 50 });
    const origins = new Map([["f1", { x: 0, y: 0 }], ["c1", { x: 50, y: 50 }]]);
    const state = stateWith({ nodes: [frame, child], snapToGrid: false });
    const result = canvasReducer(state, {
      type: "DRAG_END", ids: ["f1"], dx: 15, dy: 15, origins,
    });
    // No snap, origin-based: child x = 50 + 15 = 65
    expect(result.nodes[1].x).toBe(65);
    expect(result.nodes[1].y).toBe(65);
  });
});

describe("AUTO_ARRANGE — masonry w/h in results", () => {
  it("applies width and height from masonry layout", () => {
    const nodes = [
      makeNode({ id: "n1", x: 0, y: 0, width: 200, height: 300 }),
      makeNode({ id: "n2", x: 300, y: 0, width: 200, height: 100 }),
    ];
    const state = stateWith({ nodes });
    const result = canvasReducer(state, { type: "AUTO_ARRANGE", ids: ["n1", "n2"], mode: "masonry" });
    // Masonry includes width/height
    const n1 = result.nodes.find(n => n.id === "n1")!;
    const n2 = result.nodes.find(n => n.id === "n2")!;
    expect(n1.width).toBeDefined();
    expect(n1.height).toBeDefined();
  });

  it("handles AUTO_ARRANGE with tree mode when posMap returns empty", () => {
    // Two nodes with no connectors → falls back to grid in tree mode
    const nodes = [
      makeNode({ id: "n1", x: 0, y: 0 }),
      makeNode({ id: "n2", x: 200, y: 200 }),
    ];
    const state = stateWith({ nodes, connectors: [] });
    const result = canvasReducer(state, { type: "AUTO_ARRANGE", ids: ["n1", "n2"], mode: "tree" });
    // Should rearrange using grid fallback
    expect(result.nodes.length).toBe(2);
  });
});

describe("UPDATE_TOOL_CALL_STATUS — missing result vs with result", () => {
  it("updates without result", () => {
    const msg = makeMessage({
      id: "m1",
      toolCalls: [{ id: "tc1", name: "gen", arguments: {}, status: "pending" }],
    });
    const state = stateWith({ chatMessages: [msg] });
    const result = canvasReducer(state, {
      type: "UPDATE_TOOL_CALL_STATUS", messageId: "m1", toolCallId: "tc1", status: "approved",
    });
    expect(result.chatMessages[0].toolCalls![0].status).toBe("approved");
    expect(result.chatMessages[0].toolCalls![0].result).toBeUndefined();
  });
});

describe("DISTRIBUTE_NODES — posMap.get() undefined branch", () => {
  it("leaves non-target nodes unchanged during horizontal distribute", () => {
    const n1 = makeNode({ id: "n1", x: 0, width: 50 });
    const n2 = makeNode({ id: "n2", x: 100, width: 50 });
    const n3 = makeNode({ id: "n3", x: 300, width: 50 });
    const other = makeNode({ id: "other", x: 500, width: 50 });
    const state = stateWith({ nodes: [n1, n2, n3, other] });
    const result = canvasReducer(state, {
      type: "DISTRIBUTE_NODES", ids: ["n1", "n2", "n3"], axis: "horizontal",
    });
    expect(result.nodes[3].x).toBe(500); // "other" unchanged
  });

  it("leaves non-target nodes unchanged during vertical distribute", () => {
    const n1 = makeNode({ id: "n1", y: 0, height: 50 });
    const n2 = makeNode({ id: "n2", y: 100, height: 50 });
    const n3 = makeNode({ id: "n3", y: 300, height: 50 });
    const other = makeNode({ id: "other", y: 500, height: 50 });
    const state = stateWith({ nodes: [n1, n2, n3, other] });
    const result = canvasReducer(state, {
      type: "DISTRIBUTE_NODES", ids: ["n1", "n2", "n3"], axis: "vertical",
    });
    expect(result.nodes[3].y).toBe(500); // "other" unchanged
  });
});
