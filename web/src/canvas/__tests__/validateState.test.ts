import { describe, it, expect, vi } from "vitest";
import { validatePersistedCanvasState } from "../validateState";

describe("validatePersistedCanvasState", () => {
  it("returns null for non-object inputs", () => {
    expect(validatePersistedCanvasState(null)).toBeNull();
    expect(validatePersistedCanvasState(undefined)).toBeNull();
    expect(validatePersistedCanvasState("string")).toBeNull();
    expect(validatePersistedCanvasState(42)).toBeNull();
    expect(validatePersistedCanvasState([])).toBeNull();
  });

  it("returns a fully defaulted state for an empty object", () => {
    const result = validatePersistedCanvasState({});
    expect(result).toEqual({
      nodes: [],
      chatMessages: [],
      chatWorkflowId: null,
      nextZIndex: 1,
      connectors: [],
      pinnedModelIds: [],
      pinnedWorkflowIds: [],
      selectedProviderModelId: null,
      activeEngine: null,
    });
  });

  it("salvages a well-formed image node", () => {
    const result = validatePersistedCanvasState({
      nodes: [
        {
          id: "n1",
          type: "image",
          src: "asset://localhost/foo.png",
          x: 10,
          y: 20,
          width: 100,
          height: 80,
          naturalWidth: 1024,
          naturalHeight: 768,
          zIndex: 5,
        },
      ],
    });
    expect(result?.nodes).toHaveLength(1);
    expect(result?.nodes[0]).toMatchObject({
      id: "n1",
      type: "image",
      src: "asset://localhost/foo.png",
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      zIndex: 5,
    });
  });

  it("drops nodes missing required numeric fields", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = validatePersistedCanvasState({
      nodes: [
        { id: "ok", x: 0, y: 0, width: 10, height: 10, naturalWidth: 10, naturalHeight: 10, zIndex: 0 },
        { id: "bad" }, // missing coordinates
        { x: 1, y: 1, width: 1, height: 1, naturalWidth: 1, naturalHeight: 1, zIndex: 0 }, // missing id
      ],
    });
    expect(result?.nodes.map((n) => n.id)).toEqual(["ok"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("coerces NaN / non-numeric coordinates to drop", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = validatePersistedCanvasState({
      nodes: [
        { id: "bad", x: NaN, y: 0, width: 10, height: 10, naturalWidth: 10, naturalHeight: 10, zIndex: 0 },
        { id: "bad2", x: "10", y: 0, width: 10, height: 10, naturalWidth: 10, naturalHeight: 10, zIndex: 0 },
      ],
    });
    expect(result?.nodes).toHaveLength(0);
    warn.mockRestore();
  });

  it("salvages connectors and drops malformed ones", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = validatePersistedCanvasState({
      connectors: [
        { id: "c1", fromNodeId: "a", toNodeId: "b", arrowEnd: true },
        { id: "c2", fromNodeId: "x" }, // missing toNodeId
        "not-an-object",
      ],
    });
    expect(result?.connectors).toEqual([
      { id: "c1", fromNodeId: "a", toNodeId: "b", arrowEnd: true },
    ]);
    warn.mockRestore();
  });

  it("salvages chat messages and drops malformed ones", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = validatePersistedCanvasState({
      chatMessages: [
        { id: "m1", role: "user", content: "hi", createdAt: 1 },
        { id: "m2", role: "invalid", content: "bad role", createdAt: 2 },
        { id: "m3", role: "assistant", content: "" /* empty content allowed */, createdAt: 3 },
        { id: "m4", role: "user", content: "no timestamp" /* missing createdAt */ },
      ],
    });
    expect(result?.chatMessages.map((m) => m.id)).toEqual(["m1", "m3"]);
    warn.mockRestore();
  });

  it("filters non-string entries out of string arrays", () => {
    const result = validatePersistedCanvasState({
      pinnedModelIds: ["a", 42, "b", null, "c"],
      pinnedWorkflowIds: ["w1", {}],
    });
    expect(result?.pinnedModelIds).toEqual(["a", "b", "c"]);
    expect(result?.pinnedWorkflowIds).toEqual(["w1"]);
  });

  it("defaults non-string scalar fields to null", () => {
    const result = validatePersistedCanvasState({
      chatWorkflowId: 42,
      selectedProviderModelId: {},
      activeEngine: false,
      nextZIndex: "not a number",
    });
    expect(result?.chatWorkflowId).toBeNull();
    expect(result?.selectedProviderModelId).toBeNull();
    expect(result?.activeEngine).toBeNull();
    expect(result?.nextZIndex).toBe(1);
  });

  it("preserves optional node fields when valid", () => {
    const result = validatePersistedCanvasState({
      nodes: [
        {
          id: "n1",
          x: 0, y: 0, width: 10, height: 10,
          naturalWidth: 10, naturalHeight: 10, zIndex: 0,
          type: "shape",
          shapeKind: "circle",
          fillColor: "#ff0",
          strokeColor: "#000",
          locked: true,
          hidden: false,
          parentFrameId: "f1",
          crop: { x: 1, y: 2, width: 3, height: 4 },
        },
      ],
    });
    expect(result?.nodes[0]).toMatchObject({
      type: "shape",
      shapeKind: "circle",
      fillColor: "#ff0",
      strokeColor: "#000",
      locked: true,
      hidden: false,
      parentFrameId: "f1",
      crop: { x: 1, y: 2, width: 3, height: 4 },
    });
  });

  it("drops invalid enum values silently (does not include them)", () => {
    const result = validatePersistedCanvasState({
      nodes: [
        {
          id: "n1",
          x: 0, y: 0, width: 10, height: 10,
          naturalWidth: 10, naturalHeight: 10, zIndex: 0,
          type: "not-a-real-type",
          shapeKind: "hexagon",
          stickyColor: "magenta",
        },
      ],
    });
    expect(result?.nodes[0].type).toBeUndefined();
    expect(result?.nodes[0].shapeKind).toBeUndefined();
    expect(result?.nodes[0].stickyColor).toBeUndefined();
  });
});
