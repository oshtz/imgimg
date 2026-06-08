// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEngineSelection } from "../useEngineSelection";
import type { ProviderStatus, WorkflowSummary } from "../../../api";

function makeWorkflow(overrides: Partial<WorkflowSummary> & { id: string }): WorkflowSummary {
  return {
    name: overrides.id,
    engine: "comfyui",
    description: "",
    supportsImageInput: false,
    ...overrides,
  } as WorkflowSummary;
}

function makeProviderStatus(overrides?: Partial<Record<string, { available: boolean }>>): ProviderStatus {
  return {
    comfyui: { available: true, instances: [], healthyCount: 1, totalCount: 1 },
    openrouter: { available: true, hasApiKey: true },
    replicate: { available: true, hasApiKey: true },
    fal: { available: true, hasApiKey: true },
    kie: { available: true, hasApiKey: true },
    timestamp: new Date().toISOString(),
    ...overrides,
  } as unknown as ProviderStatus;
}

describe("useEngineSelection", () => {
  it("defaults activeEngine to the current canvas workflow engine", () => {
    const workflows = [makeWorkflow({ id: "wf1", engine: "fal" })];
    const dispatch = vi.fn();

    const { result } = renderHook(() =>
      useEngineSelection({
        workflows,
        canvasWorkflowId: "wf1",
        activeEngineFromState: null,
        providerStatus: null,
        dispatch,
      })
    );

    expect(result.current.activeEngine).toBe("fal");
  });

  it("uses activeEngineFromState when provided", () => {
    const workflows = [
      makeWorkflow({ id: "wf1", engine: "comfyui" }),
      makeWorkflow({ id: "wf2", engine: "replicate" }),
    ];
    const dispatch = vi.fn();

    const { result } = renderHook(() =>
      useEngineSelection({
        workflows,
        canvasWorkflowId: "wf1",
        activeEngineFromState: "replicate",
        providerStatus: null,
        dispatch,
      })
    );

    expect(result.current.activeEngine).toBe("replicate");
  });

  it("defaults to comfyui when workflow has no engine field", () => {
    const workflows = [makeWorkflow({ id: "wf1", engine: undefined as any })];
    const dispatch = vi.fn();

    const { result } = renderHook(() =>
      useEngineSelection({
        workflows,
        canvasWorkflowId: "wf1",
        activeEngineFromState: null,
        providerStatus: null,
        dispatch,
      })
    );

    expect(result.current.activeEngine).toBe("comfyui");
  });

  it("setActiveEngine dispatches SET_ENGINE action", () => {
    const workflows = [makeWorkflow({ id: "wf1" })];
    const dispatch = vi.fn();

    const { result } = renderHook(() =>
      useEngineSelection({
        workflows,
        canvasWorkflowId: "wf1",
        activeEngineFromState: null,
        providerStatus: null,
        dispatch,
      })
    );

    act(() => {
      result.current.setActiveEngine("fal");
    });

    expect(dispatch).toHaveBeenCalledWith({ type: "SET_ENGINE", engine: "fal" });
  });

  it("availableEngines returns deduplicated engines from workflows", () => {
    const workflows = [
      makeWorkflow({ id: "wf1", engine: "comfyui" }),
      makeWorkflow({ id: "wf2", engine: "fal" }),
      makeWorkflow({ id: "wf3", engine: "comfyui" }),
      makeWorkflow({ id: "wf4", engine: "replicate" }),
    ];
    const dispatch = vi.fn();

    const { result } = renderHook(() =>
      useEngineSelection({
        workflows,
        canvasWorkflowId: "wf1",
        activeEngineFromState: null,
        providerStatus: null,
        dispatch,
      })
    );

    expect(result.current.availableEngines).toEqual(["comfyui", "fal", "replicate"]);
  });

  it("availableEngines filters out unavailable providers", () => {
    const workflows = [
      makeWorkflow({ id: "wf1", engine: "comfyui" }),
      makeWorkflow({ id: "wf2", engine: "fal" }),
      makeWorkflow({ id: "wf3", engine: "replicate" }),
    ];
    const dispatch = vi.fn();
    const status = makeProviderStatus({
      fal: { available: false },
    });

    const { result } = renderHook(() =>
      useEngineSelection({
        workflows,
        canvasWorkflowId: "wf1",
        activeEngineFromState: null,
        providerStatus: status,
        dispatch,
      })
    );

    expect(result.current.availableEngines).toContain("comfyui");
    expect(result.current.availableEngines).toContain("replicate");
    expect(result.current.availableEngines).not.toContain("fal");
  });

  it("activeWorkflowId resolves to matching workflow for active engine", () => {
    const workflows = [
      makeWorkflow({ id: "wf1", engine: "comfyui" }),
      makeWorkflow({ id: "wf2", engine: "fal" }),
    ];
    const dispatch = vi.fn();

    const { result } = renderHook(() =>
      useEngineSelection({
        workflows,
        canvasWorkflowId: "wf1",
        activeEngineFromState: "fal",
        providerStatus: null,
        dispatch,
      })
    );

    expect(result.current.activeWorkflowId).toBe("wf2");
  });

  it("activeWorkflowId falls back to canvasWorkflowId when no match", () => {
    const workflows = [makeWorkflow({ id: "wf1", engine: "comfyui" })];
    const dispatch = vi.fn();

    const { result } = renderHook(() =>
      useEngineSelection({
        workflows,
        canvasWorkflowId: "wf1",
        activeEngineFromState: "nonexistent",
        providerStatus: null,
        dispatch,
      })
    );

    expect(result.current.activeWorkflowId).toBe("wf1");
  });

  it("subWorkflows filters out canvas-mode workflows", () => {
    const workflows = [
      makeWorkflow({ id: "wf1", engine: "comfyui", ui: { canvasMode: true } as any }),
      makeWorkflow({ id: "wf2", engine: "comfyui" }),
      makeWorkflow({ id: "wf3", engine: "fal" }),
    ];
    const dispatch = vi.fn();

    const { result } = renderHook(() =>
      useEngineSelection({
        workflows,
        canvasWorkflowId: "wf1",
        activeEngineFromState: null,
        providerStatus: null,
        dispatch,
      })
    );

    expect(result.current.subWorkflows.map((w) => w.id)).toEqual(["wf2", "wf3"]);
  });
});
