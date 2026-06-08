// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useExplore } from "../useExplore";
import type { Generation } from "../../../types";

vi.mock("../../../client", () => ({
  createGeneration: vi.fn(),
  generatePromptVariants: vi.fn(),
}));

vi.mock("../../placement", () => ({
  findMasonryClusterPositions: vi.fn((_node, itemDims: { width: number; height: number }[]) =>
    itemDims.map((_d, i) => ({ x: 100 + i * 50, y: 200 }))
  ),
  dimensionsFromAspectRatio: vi.fn(() => ({ width: 400, height: 400 })),
  pickExploreAspectRatios: vi.fn((_ar: string | undefined, count: number) =>
    Array.from({ length: count }, () => "1:1")
  ),
}));

const mockIsAspectRatio = vi.fn((_a?: any) => true);
const mockAspectRatioToSize = vi.fn((_a?: any, _b?: any) => ({ width: 1024, height: 1024 }));
vi.mock("../../../workflows", () => ({
  aspectRatioToSize: (a: any, b?: any) => mockAspectRatioToSize(a, b),
  isAspectRatio: (a: any) => mockIsAspectRatio(a),
}));

import { createGeneration, generatePromptVariants } from "../../../client";
import type { ExploreOptions } from "../../ExplorePopover";

const mockedCreateGeneration = vi.mocked(createGeneration);
const mockedGeneratePromptVariants = vi.mocked(generatePromptVariants);

function makeGeneration(overrides: Partial<Generation> = {}): Generation {
  return {
    id: "gen-1",
    jobId: "job-1",
    modelId: "model-1",
    prompt: "a beautiful sunset over the ocean",
    seed: 42,
    workflowUsed: "wf-1",
    status: "succeeded",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    error: null,
    assets: [],
    workflowParams: { aspect_ratio: "1:1", guidance: 7 },
    ...overrides,
  };
}

function makeNode(overrides: Record<string, any> = {}) {
  return {
    id: "node-1",
    x: 0,
    y: 0,
    width: 400,
    height: 400,
    generationId: "gen-1",
    prompt: "a beautiful sunset over the ocean",
    ...overrides,
  };
}

function makeParams(overrides: Record<string, any> = {}) {
  return {
    apiBaseUrl: { origin: "http://localhost:3000" } as any,
    workflows: [{ id: "wf-1", name: "wf", engine: "comfyui", ui: { aspectRatio: true }, supportedAspectRatios: ["1:1", "16:9"] }] as any[],
    nodes: [] as any[],
    history: [makeGeneration()] as Generation[],
    dispatch: vi.fn(),
    onRegisterGeneration: vi.fn(),
    exploreGenerationIds: { current: new Map<string, string>() } as React.MutableRefObject<Map<string, string>>,
    setExplorePopoverOpen: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Provide crypto.randomUUID
  let counter = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () => `uuid-${++counter}`,
  });
});

describe("useExplore", () => {
  describe("handleExplore", () => {
    it("is a no-op when node has no generationId", async () => {
      const params = makeParams();
      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(
          makeNode({ generationId: undefined }),
          { mode: "seed", count: 4, creativity: 0.5 }
        );
      });

      expect(params.dispatch).not.toHaveBeenCalled();
      expect(mockedCreateGeneration).not.toHaveBeenCalled();
    });

    it("is a no-op when no matching source generation in history", async () => {
      const params = makeParams({ history: [] });
      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(
          makeNode({ generationId: "nonexistent" }),
          { mode: "seed", count: 4, creativity: 0.5 }
        );
      });

      expect(params.dispatch).not.toHaveBeenCalled();
      expect(mockedCreateGeneration).not.toHaveBeenCalled();
    });

    it("closes the explore popover", async () => {
      const params = makeParams();
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-1",
        jobId: "new-job-1",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "seed",
          count: 1,
          creativity: 0.5,
        });
      });

      expect(params.setExplorePopoverOpen).toHaveBeenCalledWith(false);
    });

    it("in seeds mode dispatches ADD_NODE skeletons, calls createGeneration, then dispatches UPDATE_NODE", async () => {
      const params = makeParams();
      let genCounter = 0;
      mockedCreateGeneration.mockImplementation(async () => ({
        generationId: `new-gen-${++genCounter}`,
        jobId: `new-job-${genCounter}`,
        queuePosition: 1,
      }) as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "seed",
          count: 2,
          creativity: 0.5,
        });
      });

      // Should dispatch ADD_NODE for 2 skeletons
      const addCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "ADD_NODE"
      );
      expect(addCalls).toHaveLength(2);
      expect(addCalls[0][0].node.loadingStatus).toBe("queued");
      expect(addCalls[0][0].node.sourceNodeId).toBe("node-1");

      // Should call createGeneration twice
      expect(mockedCreateGeneration).toHaveBeenCalledTimes(2);

      // Should dispatch UPDATE_NODE with running status for each
      const updateCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "UPDATE_NODE"
      );
      expect(updateCalls).toHaveLength(2);
      expect(updateCalls[0][0].updates.loadingStatus).toBe("running");
      expect(updateCalls[0][0].updates.generationId).toBe("new-gen-1");

      // Should register explore generation IDs
      expect(params.exploreGenerationIds.current.size).toBe(2);

      // Should call onRegisterGeneration
      expect(params.onRegisterGeneration).toHaveBeenCalledTimes(2);
    });

    it("in mutate mode calls generatePromptVariants then createGeneration per variant", async () => {
      const params = makeParams();
      mockedGeneratePromptVariants.mockResolvedValue({
        variants: ["variant prompt 1", "variant prompt 2"],
      });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-m",
        jobId: "new-job-m",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "mutate",
          count: 2,
          creativity: 0.7,
        });
      });

      // Should call generatePromptVariants
      expect(mockedGeneratePromptVariants).toHaveBeenCalledWith(
        params.apiBaseUrl,
        { prompt: "a beautiful sunset over the ocean", count: 2, creativity: 0.7 }
      );

      // Should dispatch ADD_NODE skeletons first
      const addCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "ADD_NODE"
      );
      expect(addCalls).toHaveLength(2);

      // Should call createGeneration for each variant
      expect(mockedCreateGeneration).toHaveBeenCalledTimes(2);
      expect(mockedCreateGeneration.mock.calls[0][1].prompt).toBe("variant prompt 1");
      expect(mockedCreateGeneration.mock.calls[1][1].prompt).toBe("variant prompt 2");

      // Should dispatch UPDATE_NODE with running status
      const updateCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "UPDATE_NODE" && a.updates?.loadingStatus === "running"
      );
      expect(updateCalls).toHaveLength(2);
    });

    it("handles createGeneration error by dispatching failed status", async () => {
      vi.useFakeTimers();
      const params = makeParams();
      mockedCreateGeneration.mockRejectedValue(new Error("API down"));

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "seed",
          count: 1,
          creativity: 0.5,
        });
      });

      // Should dispatch UPDATE_NODE with failed status
      const updateCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "UPDATE_NODE"
      );
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][0].updates.loadingStatus).toBe("failed");
      expect(updateCalls[0][0].updates.loadingLabel).toContain("API down");

      // Should dispatch REMOVE_NODE after timeout
      vi.advanceTimersByTime(5000);
      const removeCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "REMOVE_NODE"
      );
      expect(removeCalls).toHaveLength(1);

      vi.useRealTimers();
    });

    it("mutate mode removes all skeletons when generatePromptVariants fails", async () => {
      const params = makeParams();
      mockedGeneratePromptVariants.mockRejectedValue(new Error("LLM error"));

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "mutate",
          count: 3,
          creativity: 0.5,
        });
      });

      const removeCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "REMOVE_NODES"
      );
      expect(removeCalls).toHaveLength(1);
      expect(removeCalls[0][0].ids).toHaveLength(3);
    });

    it("filters out aspect_ratio from workflowParams", async () => {
      const params = makeParams();
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-1",
        jobId: "new-job-1",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "seed",
          count: 1,
          creativity: 0.5,
        });
      });

      const callArgs = mockedCreateGeneration.mock.calls[0][1];
      expect(callArgs.workflowParams).toEqual({ guidance: 7 });
      expect(callArgs.workflowParams).not.toHaveProperty("aspect_ratio");
    });
  });

  describe("handleQuickExplore", () => {
    it("calls fireExploreSeeds with count=4", async () => {
      const params = makeParams();
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-q",
        jobId: "new-job-q",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleQuickExplore(makeNode());
      });

      // Should create 4 generations
      expect(mockedCreateGeneration).toHaveBeenCalledTimes(4);

      // Should dispatch 4 ADD_NODE skeletons
      const addCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "ADD_NODE"
      );
      expect(addCalls).toHaveLength(4);

      // Should close the popover
      expect(params.setExplorePopoverOpen).toHaveBeenCalledWith(false);
    });

    it("is a no-op when node has no generationId", async () => {
      const params = makeParams();
      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleQuickExplore(makeNode({ generationId: undefined }));
      });

      expect(params.dispatch).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("removes orphaned skeletons when variants count < skeleton count in mutate mode", async () => {
      const params = makeParams();
      // Return fewer variants than requested count
      mockedGeneratePromptVariants.mockResolvedValue({
        variants: ["only one variant"],
      });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-m",
        jobId: "new-job-m",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "mutate",
          count: 3, // request 3 but only get 1 variant
          creativity: 0.7,
        });
      });

      // Should remove orphaned skeleton nodes (indices 1,2)
      const removeCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "REMOVE_NODES"
      );
      expect(removeCalls).toHaveLength(1);
      expect(removeCalls[0][0].ids).toHaveLength(2);
    });

    it("handles source generation with no workflowParams", async () => {
      const params = makeParams({
        history: [makeGeneration({ workflowParams: undefined })],
      });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-1",
        jobId: "new-job-1",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "seed",
          count: 1,
          creativity: 0.5,
        });
      });

      const callArgs = mockedCreateGeneration.mock.calls[0][1];
      expect(callArgs.workflowParams).toBeUndefined();
    });

    it("handles source generation with empty workflowParams (only aspect_ratio)", async () => {
      const params = makeParams({
        history: [makeGeneration({ workflowParams: { aspect_ratio: "1:1" } })],
      });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-1",
        jobId: "new-job-1",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "seed",
          count: 1,
          creativity: 0.5,
        });
      });

      const callArgs = mockedCreateGeneration.mock.calls[0][1];
      // After filtering aspect_ratio, empty object → should be undefined
      expect(callArgs.workflowParams).toBeUndefined();
    });

    it("handles workflow not found in workflows list", async () => {
      const params = makeParams({ workflows: [] });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-1",
        jobId: "new-job-1",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "seed",
          count: 1,
          creativity: 0.5,
        });
      });

      expect(mockedCreateGeneration).toHaveBeenCalled();
    });

    it("handles non-Error throw in seed mode", async () => {
      vi.useFakeTimers();
      const params = makeParams();
      mockedCreateGeneration.mockRejectedValue("string error");

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "seed",
          count: 1,
          creativity: 0.5,
        });
      });

      const updateCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "UPDATE_NODE"
      );
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][0].updates.loadingLabel).toContain("string error");

      vi.advanceTimersByTime(5000);
      vi.useRealTimers();
    });

    it("handles non-Error throw in mutate mode per-variant", async () => {
      vi.useFakeTimers();
      const params = makeParams();
      mockedGeneratePromptVariants.mockResolvedValue({
        variants: ["variant 1"],
      });
      mockedCreateGeneration.mockRejectedValue(42);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "mutate",
          count: 1,
          creativity: 0.5,
        });
      });

      const failCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "UPDATE_NODE" && a.updates?.loadingStatus === "failed"
      );
      expect(failCalls).toHaveLength(1);
      expect(failCalls[0][0].updates.loadingLabel).toContain("42");

      vi.advanceTimersByTime(5000);
      vi.useRealTimers();
    });

    it("uses sourceGen dimensions when isAspectRatio returns false", async () => {
      // Mock isAspectRatio to return false so size is null
      mockIsAspectRatio.mockReturnValue(false);

      const params = makeParams({
        history: [makeGeneration({ width: 512, height: 768 })],
      });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-1",
        jobId: "new-job-1",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "seed",
          count: 1,
          creativity: 0.5,
        });
      });

      const callArgs = mockedCreateGeneration.mock.calls[0][1];
      // When isAspectRatio returns false, size is null, so width/height come from sourceGen
      expect(callArgs.width).toBe(512);
      expect(callArgs.height).toBe(768);

      // Restore
      mockIsAspectRatio.mockReturnValue(true);
    });

    it("uses sourceGen dimensions when no width/height on sourceGen either", async () => {
      mockIsAspectRatio.mockReturnValue(false);

      const params = makeParams({
        history: [makeGeneration({ width: undefined, height: undefined })],
      });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-1",
        jobId: "new-job-1",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "seed",
          count: 1,
          creativity: 0.5,
        });
      });

      const callArgs = mockedCreateGeneration.mock.calls[0][1];
      // Both size and sourceGen.width are undefined
      expect(callArgs.width).toBeUndefined();
      expect(callArgs.height).toBeUndefined();

      mockIsAspectRatio.mockReturnValue(true);
    });

    it("mutate mode uses sourceGen dimensions when isAspectRatio returns false", async () => {
      mockIsAspectRatio.mockReturnValue(false);

      const params = makeParams({
        history: [makeGeneration({ width: 640, height: 480 })],
      });
      mockedGeneratePromptVariants.mockResolvedValue({
        variants: ["mutated prompt"],
      });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-m",
        jobId: "new-job-m",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "mutate",
          count: 1,
          creativity: 0.5,
        });
      });

      const callArgs = mockedCreateGeneration.mock.calls[0][1];
      expect(callArgs.width).toBe(640);
      expect(callArgs.height).toBe(480);

      mockIsAspectRatio.mockReturnValue(true);
    });

    it("quickExplore is a no-op when source generation not found", async () => {
      const params = makeParams({ history: [] });
      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleQuickExplore(makeNode());
      });

      expect(params.dispatch).not.toHaveBeenCalled();
    });

    it("uses undefined width/height when sourceGen.width and height are null and isAspectRatio returns false", async () => {
      mockIsAspectRatio.mockReturnValue(false);

      const params = makeParams({
        history: [makeGeneration({ width: null as any, height: null as any })],
      });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-1",
        jobId: "new-job-1",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "seed",
          count: 1,
          creativity: 0.5,
        });
      });

      const callArgs = mockedCreateGeneration.mock.calls[0][1];
      expect(callArgs.width).toBeUndefined();
      expect(callArgs.height).toBeUndefined();

      mockIsAspectRatio.mockReturnValue(true);
    });

    it("uses wf.ui.aspectRatio ?? false when workflow has no ui property", async () => {
      const params = makeParams({
        workflows: [{ id: "wf-1", name: "wf", engine: "comfyui" }] as any[],
      });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-1",
        jobId: "new-job-1",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "seed",
          count: 1,
          creativity: 0.5,
        });
      });

      // Should not crash; workflowSupportsAr defaults to false via ?? false
      expect(mockedCreateGeneration).toHaveBeenCalled();
    });

    it("uses wf.supportedAspectRatios as undefined when workflow has no supportedAspectRatios", async () => {
      const params = makeParams({
        workflows: [{ id: "wf-1", name: "wf", engine: "comfyui", ui: { aspectRatio: true } }] as any[],
      });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-1",
        jobId: "new-job-1",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "seed",
          count: 1,
          creativity: 0.5,
        });
      });

      expect(mockedCreateGeneration).toHaveBeenCalled();
    });

    it("mutate mode with workflow without ui property defaults workflowSupportsAr to false", async () => {
      const params = makeParams({
        workflows: [{ id: "wf-1", name: "wf", engine: "comfyui" }] as any[],
      });
      mockedGeneratePromptVariants.mockResolvedValue({
        variants: ["variant 1"],
      });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-m",
        jobId: "new-job-m",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "mutate",
          count: 1,
          creativity: 0.5,
        });
      });

      expect(mockedCreateGeneration).toHaveBeenCalled();
    });

    it("mutate mode uses sourceGen dimensions when isAspectRatio returns false and sourceGen has null dimensions", async () => {
      mockIsAspectRatio.mockReturnValue(false);

      const params = makeParams({
        history: [makeGeneration({ width: null as any, height: null as any })],
      });
      mockedGeneratePromptVariants.mockResolvedValue({
        variants: ["mutated prompt"],
      });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-m",
        jobId: "new-job-m",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "mutate",
          count: 1,
          creativity: 0.5,
        });
      });

      const callArgs = mockedCreateGeneration.mock.calls[0][1];
      expect(callArgs.width).toBeUndefined();
      expect(callArgs.height).toBeUndefined();

      mockIsAspectRatio.mockReturnValue(true);
    });

    it("mutate mode with empty workflowParams (only aspect_ratio) sends undefined", async () => {
      const params = makeParams({
        history: [makeGeneration({ workflowParams: { aspect_ratio: "1:1" } })],
      });
      mockedGeneratePromptVariants.mockResolvedValue({
        variants: ["mutated prompt"],
      });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-m",
        jobId: "new-job-m",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "mutate",
          count: 1,
          creativity: 0.5,
        });
      });

      const callArgs = mockedCreateGeneration.mock.calls[0][1];
      expect(callArgs.workflowParams).toBeUndefined();
    });

    it("mutate mode with no workflowParams sends undefined", async () => {
      const params = makeParams({
        history: [makeGeneration({ workflowParams: undefined })],
      });
      mockedGeneratePromptVariants.mockResolvedValue({
        variants: ["mutated prompt"],
      });
      mockedCreateGeneration.mockResolvedValue({
        generationId: "new-gen-m",
        jobId: "new-job-m",
        queuePosition: 1,
      } as any);

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "mutate",
          count: 1,
          creativity: 0.5,
        });
      });

      const callArgs = mockedCreateGeneration.mock.calls[0][1];
      expect(callArgs.workflowParams).toBeUndefined();
    });

    it("handles per-variant createGeneration error in mutate mode", async () => {
      vi.useFakeTimers();
      const params = makeParams();
      mockedGeneratePromptVariants.mockResolvedValue({
        variants: ["variant 1", "variant 2"],
      });
      // First succeeds, second fails
      let callCount = 0;
      mockedCreateGeneration.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Rate limited");
        }
        return {
          generationId: `new-gen-${callCount}`,
          jobId: `new-job-${callCount}`,
          queuePosition: 1,
        } as any;
      });

      const { result } = renderHook(() => useExplore(params));

      await act(async () => {
        await result.current.handleExplore(makeNode(), {
          mode: "mutate",
          count: 2,
          creativity: 0.5,
        });
      });

      // First variant should succeed with running status
      const runningCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "UPDATE_NODE" && a.updates?.loadingStatus === "running"
      );
      expect(runningCalls).toHaveLength(1);

      // Second variant should fail
      const failCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "UPDATE_NODE" && a.updates?.loadingStatus === "failed"
      );
      expect(failCalls).toHaveLength(1);
      expect(failCalls[0][0].updates.loadingLabel).toContain("Rate limited");

      // Failed skeleton should be removed after timeout
      vi.advanceTimersByTime(5000);
      const removeCalls = params.dispatch.mock.calls.filter(
        ([a]: any) => a.type === "REMOVE_NODE"
      );
      expect(removeCalls).toHaveLength(1);

      vi.useRealTimers();
    });
  });
});
