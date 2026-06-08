// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { useAutoPlacement } from "../useAutoPlacement";
import type { Asset, Generation } from "../../../types";
import type { CanvasNode } from "../../types";

vi.mock("../../placement", () => ({
  findFreePositionsForBatch: vi.fn(
    (_nodes: any, _vp: any, count: number) =>
      Array.from({ length: count }, (_, i) => ({ x: 100 + i * 50, y: 200 }))
  ),
}));

import { findFreePositionsForBatch } from "../../placement";

const mockedFindPositions = vi.mocked(findFreePositionsForBatch);

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset-1",
    generationId: "gen-1",
    type: "square",
    url: "/images/test.png",
    itemIndex: 0,
    createdAt: "2025-01-01T00:00:00Z",
    isActive: true,
    ...overrides,
  };
}

function makeGeneration(overrides: Partial<Generation> = {}): Generation {
  return {
    id: "gen-1",
    jobId: "job-1",
    modelId: "model-1",
    prompt: "test prompt",
    seed: 42,
    workflowUsed: "wf-1",
    status: "succeeded",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    error: null,
    assets: [makeAsset()],
    width: 512,
    height: 512,
    ...overrides,
  };
}

function makeNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: "node-1",
    x: 0,
    y: 0,
    width: 400,
    height: 400,
    naturalWidth: 512,
    naturalHeight: 512,
    zIndex: 0,
    ...overrides,
  };
}

function makeChatMessage(genId: string, status = "completed") {
  return {
    id: "msg-1",
    role: "assistant",
    content: "",
    createdAt: Date.now(),
    toolCalls: [
      {
        id: "tc-1",
        name: "generate",
        arguments: {},
        status,
        result: { generationId: genId },
      },
    ],
  };
}

function makeParams(overrides: Record<string, any> = {}) {
  return {
    loading: false,
    history: [] as Generation[],
    nodes: [] as CanvasNode[],
    viewport: { x: 0, y: 0, scale: 1 },
    chatMessages: [] as any[],
    assetUrl: vi.fn((asset: Asset) => `http://localhost/${asset.url}`),
    dispatch: vi.fn(),
    currentUser: { id: "user-1", email: "test@test.com" },
    exploreGenerationIds: { current: new Map<string, string>() } as React.MutableRefObject<Map<string, string>>,
    pendingInpaintOps: { current: new Map<string, { nodeId: string; prevAssetCount: number }>() } as React.MutableRefObject<Map<string, { nodeId: string; prevAssetCount: number }>>,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  let counter = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () => `uuid-${++counter}`,
  });
});

describe("useAutoPlacement", () => {
  it("does nothing when loading=true", () => {
    const gen = makeGeneration();
    const params = makeParams({
      loading: true,
      history: [gen],
      chatMessages: [makeChatMessage("gen-1")],
    });

    renderHook(() => useAutoPlacement(params));

    expect(params.dispatch).not.toHaveBeenCalled();
  });

  it("does nothing for non-succeeded generations", () => {
    const gen = makeGeneration({ status: "running", assets: [] });
    const params = makeParams({
      history: [gen],
      chatMessages: [makeChatMessage("gen-1")],
    });

    renderHook(() => useAutoPlacement(params));

    expect(params.dispatch).not.toHaveBeenCalled();
  });

  it("does nothing for generations with no assets", () => {
    const gen = makeGeneration({ assets: [] });
    const params = makeParams({
      history: [gen],
      chatMessages: [makeChatMessage("gen-1")],
    });

    renderHook(() => useAutoPlacement(params));

    expect(params.dispatch).not.toHaveBeenCalled();
  });

  it("places new node when generation succeeds with assets matching a canvas generation ID", () => {
    // First render with generation still running (no assets)
    const runningGen = makeGeneration({ status: "running", assets: [] });
    const chatMessages = [makeChatMessage("gen-1")];
    const params = makeParams({
      history: [runningGen],
      chatMessages,
    });

    const { rerender } = renderHook(
      (props: any) => useAutoPlacement(props),
      { initialProps: params }
    );

    expect(params.dispatch).not.toHaveBeenCalled();

    // Now the generation succeeds
    const succeededGen = makeGeneration();
    rerender({ ...params, history: [succeededGen] });

    const addCalls = params.dispatch.mock.calls.filter(
      ([a]: any) => a.type === "ADD_NODE"
    );
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0][0].node.generationId).toBe("gen-1");
    expect(addCalls[0][0].node.src).toContain("test.png");
    expect(addCalls[0][0].node.placedBy).toEqual({ userId: "user-1", email: "test@test.com" });
    expect(addCalls[0][0].node.prompt).toBe("test prompt");
    expect(mockedFindPositions).toHaveBeenCalled();
  });

  it("updates existing loading skeleton node instead of creating a new one", () => {
    const gen = makeGeneration();
    const existingNode = makeNode({
      id: "skel-1",
      generationId: "gen-1",
      loadingStatus: "running",
    });
    const params = makeParams({
      history: [gen],
      nodes: [existingNode],
      chatMessages: [makeChatMessage("gen-1")],
    });

    renderHook(() => useAutoPlacement(params));

    const updateCalls = params.dispatch.mock.calls.filter(
      ([a]: any) => a.type === "UPDATE_NODE"
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0].id).toBe("skel-1");
    expect(updateCalls[0][0].updates.src).toContain("test.png");
    expect(updateCalls[0][0].updates.loadingStatus).toBeUndefined();
    expect(updateCalls[0][0].updates.loadingLabel).toBeUndefined();

    // Should NOT dispatch ADD_NODE for the first asset
    const addCalls = params.dispatch.mock.calls.filter(
      ([a]: any) => a.type === "ADD_NODE"
    );
    expect(addCalls).toHaveLength(0);
  });

  it("skips already-placed generation IDs", () => {
    const gen = makeGeneration();
    // Node already placed (no loadingStatus = completed)
    const existingNode = makeNode({
      id: "existing-1",
      generationId: "gen-1",
    });
    const params = makeParams({
      history: [gen],
      nodes: [existingNode],
      chatMessages: [makeChatMessage("gen-1")],
    });

    renderHook(() => useAutoPlacement(params));

    // The generation is already on canvas, so no dispatch
    expect(params.dispatch).not.toHaveBeenCalled();
  });

  it("does not place generations that are not canvas or explore generations", () => {
    const gen = makeGeneration({ id: "gen-orphan" });
    const params = makeParams({
      history: [gen],
      chatMessages: [], // No chat messages referencing this gen
    });

    renderHook(() => useAutoPlacement(params));

    expect(params.dispatch).not.toHaveBeenCalled();
  });

  it("handles explore generations (via exploreGenerationIds ref)", () => {
    const gen = makeGeneration({ id: "gen-explore" });
    const exploreMap = new Map<string, string>();
    exploreMap.set("gen-explore", "source-node-1");

    const params = makeParams({
      history: [gen],
      chatMessages: [],
      exploreGenerationIds: { current: exploreMap },
    });

    renderHook(() => useAutoPlacement(params));

    const addCalls = params.dispatch.mock.calls.filter(
      ([a]: any) => a.type === "ADD_NODE"
    );
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0][0].node.sourceNodeId).toBe("source-node-1");

    // Should remove from exploreGenerationIds after placement
    expect(exploreMap.has("gen-explore")).toBe(false);
  });

  it("places multiple assets from one generation side by side when skeleton exists", () => {
    const assets = [
      makeAsset({ id: "a1", url: "/img1.png" }),
      makeAsset({ id: "a2", url: "/img2.png" }),
    ];
    const gen = makeGeneration({ assets });
    const existingNode = makeNode({
      id: "skel-1",
      generationId: "gen-1",
      loadingStatus: "running",
      width: 400,
      height: 400,
    });
    const params = makeParams({
      history: [gen],
      nodes: [existingNode],
      chatMessages: [makeChatMessage("gen-1")],
    });

    renderHook(() => useAutoPlacement(params));

    // First asset updates the skeleton
    const updateCalls = params.dispatch.mock.calls.filter(
      ([a]: any) => a.type === "UPDATE_NODE"
    );
    expect(updateCalls).toHaveLength(1);

    // Second asset creates a new ADD_NODE
    const addCalls = params.dispatch.mock.calls.filter(
      ([a]: any) => a.type === "ADD_NODE"
    );
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0][0].node.src).toContain("img2.png");
  });

  it("skips non-placeable asset types (preview, video, etc.)", () => {
    const gen = makeGeneration({
      assets: [makeAsset({ type: "preview" })],
    });
    const params = makeParams({
      history: [gen],
      chatMessages: [makeChatMessage("gen-1")],
    });

    renderHook(() => useAutoPlacement(params));

    expect(params.dispatch).not.toHaveBeenCalled();
  });

  describe("inpaint watcher", () => {
    it("dispatches REPLACE_NODE_IMAGE when asset count increases", () => {
      const newAsset = makeAsset({ id: "a-new", url: "/inpaint-result.png" });
      const gen = makeGeneration({
        id: "gen-inpaint",
        status: "succeeded",
        assets: [makeAsset(), newAsset],
        width: 1024,
        height: 1024,
      });

      const pendingMap = new Map<string, { nodeId: string; prevAssetCount: number }>();
      pendingMap.set("gen-inpaint", { nodeId: "canvas-node-1", prevAssetCount: 1 });

      const params = makeParams({
        history: [gen],
        chatMessages: [],
        pendingInpaintOps: { current: pendingMap },
      });

      renderHook(() => useAutoPlacement(params));

      const replaceCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "REPLACE_NODE_IMAGE"
      );
      expect(replaceCalls).toHaveLength(1);
      expect(replaceCalls[0][0].id).toBe("canvas-node-1");
      expect(replaceCalls[0][0].src).toContain("inpaint-result.png");

      // Asset now travels on the single REPLACE_NODE_IMAGE action (atomic — one
      // undo step) rather than a separate follow-up UPDATE_NODE.
      expect(replaceCalls[0][0].asset.id).toBe("a-new");
      const assetUpdate = params.dispatch.mock.calls.find(
        ([a]: any) => a.type === "UPDATE_NODE" && a.updates?.asset
      );
      expect(assetUpdate).toBeUndefined();

      // Should remove from pending map
      expect(pendingMap.has("gen-inpaint")).toBe(false);
    });

    it("does nothing when asset count has not increased", () => {
      const gen = makeGeneration({ id: "gen-inpaint" });

      const pendingMap = new Map<string, { nodeId: string; prevAssetCount: number }>();
      pendingMap.set("gen-inpaint", { nodeId: "canvas-node-1", prevAssetCount: 1 });

      const params = makeParams({
        history: [gen],
        chatMessages: [],
        pendingInpaintOps: { current: pendingMap },
      });

      renderHook(() => useAutoPlacement(params));

      const replaceCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "REPLACE_NODE_IMAGE"
      );
      expect(replaceCalls).toHaveLength(0);

      // Should still be pending
      expect(pendingMap.has("gen-inpaint")).toBe(true);
    });
  });

  it("returns canvasGenerationIds set", () => {
    const params = makeParams({
      chatMessages: [makeChatMessage("gen-1"), makeChatMessage("gen-2")],
    });

    const { result } = renderHook(() => useAutoPlacement(params));

    expect(result.current.canvasGenerationIds.has("gen-1")).toBe(true);
    expect(result.current.canvasGenerationIds.has("gen-2")).toBe(true);
  });

  it("uses default width/height (400) when gen.width and gen.height are null", () => {
    const gen = makeGeneration({ id: "gen-dim", width: undefined, height: undefined });
    const exploreMap = new Map<string, string>();
    exploreMap.set("gen-dim", "src");

    const params = makeParams({
      loading: true,
      history: [],
      chatMessages: [],
      exploreGenerationIds: { current: exploreMap },
    });
    const { rerender } = renderHook(
      (props: any) => useAutoPlacement(props),
      { initialProps: params }
    );
    rerender({ ...params, loading: false, history: [gen] });

    const addCalls = params.dispatch.mock.calls.filter(
      ([a]: any) => a.type === "ADD_NODE"
    );
    expect(addCalls).toHaveLength(1);
    // 400 ?? 400 = 400, scale = min(400/400, 400/400, 1) = 1, so w=400, h=400
    expect(addCalls[0][0].node.width).toBe(400);
    expect(addCalls[0][0].node.height).toBe(400);
  });

  it("sets prompt to undefined when gen.prompt is empty string", () => {
    const gen = makeGeneration({ id: "gen-ep", prompt: "" });
    const exploreMap = new Map<string, string>();
    exploreMap.set("gen-ep", "src");

    const params = makeParams({
      loading: true,
      history: [],
      chatMessages: [],
      exploreGenerationIds: { current: exploreMap },
    });
    const { rerender } = renderHook(
      (props: any) => useAutoPlacement(props),
      { initialProps: params }
    );
    rerender({ ...params, loading: false, history: [gen] });

    const addCalls = params.dispatch.mock.calls.filter(
      ([a]: any) => a.type === "ADD_NODE"
    );
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0][0].node.prompt).toBeUndefined();
  });

  it("sets placedBy to undefined when currentUser is null", () => {
    const gen = makeGeneration({ id: "gen-cu" });
    const exploreMap = new Map<string, string>();
    exploreMap.set("gen-cu", "src");

    const params = makeParams({
      loading: true,
      history: [],
      chatMessages: [],
      currentUser: null,
      exploreGenerationIds: { current: exploreMap },
    });
    const { rerender } = renderHook(
      (props: any) => useAutoPlacement(props),
      { initialProps: params }
    );
    rerender({ ...params, loading: false, history: [gen] });

    const addCalls = params.dispatch.mock.calls.filter(
      ([a]: any) => a.type === "ADD_NODE"
    );
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0][0].node.placedBy).toBeUndefined();
  });

  it("sets sourceNodeId to undefined when exploreSourceNodeId is empty string", () => {
    const gen = makeGeneration({ id: "gen-explore" });
    const exploreMap = new Map<string, string>();
    exploreMap.set("gen-explore", "");

    const params = makeParams({
      loading: true,
      history: [],
      chatMessages: [],
      exploreGenerationIds: { current: exploreMap },
    });
    const { rerender } = renderHook(
      (props: any) => useAutoPlacement(props),
      { initialProps: params }
    );
    rerender({ ...params, loading: false, history: [gen] });

    const addCalls = params.dispatch.mock.calls.filter(
      ([a]: any) => a.type === "ADD_NODE"
    );
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0][0].node.sourceNodeId).toBeUndefined();
  });

  it("filters out assets with isActive=false", () => {
    const gen = makeGeneration({
      id: "gen-ia",
      assets: [
        makeAsset({ id: "a1", isActive: false, generationId: "gen-ia" }),
        makeAsset({ id: "a2", isActive: true, url: "/img2.png", generationId: "gen-ia" }),
      ],
    });
    const exploreMap = new Map<string, string>();
    exploreMap.set("gen-ia", "src");

    const params = makeParams({
      loading: true,
      history: [],
      chatMessages: [],
      exploreGenerationIds: { current: exploreMap },
    });
    const { rerender } = renderHook(
      (props: any) => useAutoPlacement(props),
      { initialProps: params }
    );
    rerender({ ...params, loading: false, history: [gen] });

    const addCalls = params.dispatch.mock.calls.filter(
      ([a]: any) => a.type === "ADD_NODE"
    );
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0][0].node.asset.id).toBe("a2");
  });

  it("falls back to {x:0,y:0} when positions array is shorter than assets", () => {
    // Use an explore generation so initial seed doesn't pre-place it
    mockedFindPositions.mockReturnValueOnce([{ x: 100, y: 200 }]);

    const gen = makeGeneration({
      id: "gen-pos",
      assets: [
        makeAsset({ id: "a1", url: "/img1.png", generationId: "gen-pos" }),
        makeAsset({ id: "a2", url: "/img2.png", generationId: "gen-pos" }),
      ],
    });
    const exploreMap = new Map<string, string>();
    exploreMap.set("gen-pos", "src-node");

    // First render while loading to prevent initial seed
    const params = makeParams({
      loading: true,
      history: [],
      chatMessages: [],
      exploreGenerationIds: { current: exploreMap },
    });

    const { rerender } = renderHook(
      (props: any) => useAutoPlacement(props),
      { initialProps: params }
    );

    // Now stop loading and provide the completed gen
    rerender({
      ...params,
      loading: false,
      history: [gen],
    });

    const addCalls = params.dispatch.mock.calls.filter(
      ([a]: any) => a.type === "ADD_NODE"
    );
    expect(addCalls).toHaveLength(2);
    expect(addCalls[0][0].node.x).toBe(100);
    expect(addCalls[0][0].node.y).toBe(200);
    // Second asset should use fallback {x: 0, y: 0}
    expect(addCalls[1][0].node.x).toBe(0);
    expect(addCalls[1][0].node.y).toBe(0);
  });

  it("sets placedBy/prompt/sourceNodeId correctly on UPDATE_NODE path with currentUser=null and empty prompt", () => {
    const gen = makeGeneration({ prompt: "" });
    const existingNode = makeNode({
      id: "skel-1",
      generationId: "gen-1",
      loadingStatus: "running",
    });
    const params = makeParams({
      history: [gen],
      nodes: [existingNode],
      chatMessages: [makeChatMessage("gen-1")],
      currentUser: null,
    });

    renderHook(() => useAutoPlacement(params));

    const updateCalls = params.dispatch.mock.calls.filter(
      ([a]: any) => a.type === "UPDATE_NODE"
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0].updates.placedBy).toBeUndefined();
    expect(updateCalls[0][0].updates.prompt).toBeUndefined();
  });

  it("sets placedBy/prompt/sourceNodeId on ADD_NODE for extra assets on skeleton path with null currentUser", () => {
    const assets = [
      makeAsset({ id: "a1", url: "/img1.png" }),
      makeAsset({ id: "a2", url: "/img2.png" }),
    ];
    const gen = makeGeneration({ assets, prompt: "" });
    const exploreMap = new Map<string, string>();
    exploreMap.set("gen-1", "");
    const existingNode = makeNode({
      id: "skel-1",
      generationId: "gen-1",
      loadingStatus: "running",
      width: 400,
      height: 400,
    });
    const params = makeParams({
      history: [gen],
      nodes: [existingNode],
      chatMessages: [],
      currentUser: null,
      exploreGenerationIds: { current: exploreMap },
    });

    renderHook(() => useAutoPlacement(params));

    const addCalls = params.dispatch.mock.calls.filter(
      ([a]: any) => a.type === "ADD_NODE"
    );
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0][0].node.placedBy).toBeUndefined();
    expect(addCalls[0][0].node.prompt).toBeUndefined();
    expect(addCalls[0][0].node.sourceNodeId).toBeUndefined();
  });

  describe("inpaint watcher", () => {
    it("uses default width/height 1024 when gen dimensions are null", () => {
      const newAsset = makeAsset({ id: "a-new", url: "/inpaint-result.png" });
      const gen = makeGeneration({
        id: "gen-inpaint",
        status: "succeeded",
        assets: [makeAsset(), newAsset],
        width: undefined,
        height: undefined,
      });

      const pendingMap = new Map<string, { nodeId: string; prevAssetCount: number }>();
      pendingMap.set("gen-inpaint", { nodeId: "canvas-node-1", prevAssetCount: 1 });

      const params = makeParams({
        history: [gen],
        chatMessages: [],
        pendingInpaintOps: { current: pendingMap },
      });

      renderHook(() => useAutoPlacement(params));

      const replaceCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "REPLACE_NODE_IMAGE"
      );
      expect(replaceCalls).toHaveLength(1);
      expect(replaceCalls[0][0].naturalWidth).toBe(1024);
      expect(replaceCalls[0][0].naturalHeight).toBe(1024);
    });
  });
});
