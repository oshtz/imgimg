import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock localStorage for re-exported getSessionId / buildAuthHeaders
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
});

// Mock fetch globally
vi.stubGlobal("fetch", vi.fn());

// Mock entire tauri-api module so client.ts imports don't blow up
const mockTauri = vi.hoisted(() => ({
  isTauri: () => false,
  getHealth: vi.fn(),
  getCurrentUser: vi.fn(),
  getProviderStatus: vi.fn().mockResolvedValue(null),
  listWorkflows: vi.fn().mockResolvedValue([]),
  getPinnedWorkflows: vi.fn().mockResolvedValue([]),
  getWorkflowOrganization: vi.fn().mockResolvedValue(null),
  getLoraSettings: vi.fn().mockResolvedValue({ enabled: [], displayNames: {}, previewUrls: {} }),
  pinWorkflow: vi.fn(),
  unpinWorkflow: vi.fn(),
  reorderWorkflowItems: vi.fn(),
  createWorkflowFolder: vi.fn(),
  renameWorkflowFolder: vi.fn(),
  deleteWorkflowFolder: vi.fn(),
  createGeneration: vi.fn().mockResolvedValue({ id: "gen-1", jobId: "job-1" }),
  listGenerations: vi.fn().mockResolvedValue([]),
  listGallery: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  getAssetVersions: vi.fn().mockResolvedValue([]),
  setActiveAssetVersion: vi.fn(),
  getGeneration: vi.fn().mockResolvedValue({ assets: [] }),
  deleteGeneration: vi.fn(),
  listAssetTypes: vi.fn().mockResolvedValue([]),
  getPresets: vi.fn().mockResolvedValue([]),
  regenerateItem: vi.fn().mockResolvedValue({ id: "a1", url: "" }),
  createInpaint: vi.fn(),
  removeBackground: vi.fn().mockResolvedValue({ id: "a2", url: "" }),
  downloadGenerationAssetsZip: vi.fn().mockResolvedValue(new Uint8Array(0)),
  streamEnhancedPrompt: vi.fn(),
  exploreVariants: vi.fn().mockResolvedValue([]),
  getCanvasState: vi.fn().mockResolvedValue(null),
  saveCanvasState: vi.fn(),
  canvasChat: vi.fn(),
  cancelCanvasChat: vi.fn(),
  searchProviderModels: vi.fn().mockResolvedValue({ models: [] }),
  getProviderModelDetail: vi.fn().mockResolvedValue({}),
  getReplicateModelParameters: vi.fn().mockResolvedValue({}),
  getFalModelParameters: vi.fn().mockResolvedValue({}),
  upsertWorkflow: vi.fn(),
  getAdminSettings: vi.fn().mockResolvedValue({}),
  getDefaultSystemPrompts: vi.fn().mockResolvedValue({ canvasAgent: "", promptEnhancer: "" }),
  updateAdminSettings: vi.fn(),
  getFeatureWorkflowConfig: vi.fn().mockResolvedValue({ inpaintWorkflowId: null, outpaintWorkflowId: null, rembgWorkflowId: null }),
  getCompareModels: vi.fn().mockResolvedValue([]),
  getCompareGroups: vi.fn().mockResolvedValue([]),
  listCanvases: vi.fn().mockResolvedValue([]),
}));

vi.mock("../tauri-api", () => mockTauri);


import * as client from "../client";

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
});

// ── Re-exported utilities ──

describe("client re-exports", () => {
  it("exports getSessionId function", () => {
    expect(typeof client.getSessionId).toBe("function");
  });

  it("exports buildAuthHeaders function", () => {
    expect(typeof client.buildAuthHeaders).toBe("function");
  });

  it("getSessionId returns a string", () => {
    const id = client.getSessionId();
    expect(typeof id).toBe("string");
  });

  it("buildAuthHeaders returns empty object", () => {
    expect(client.buildAuthHeaders()).toEqual({});
  });
});

// ── Exported function existence checks ──

describe("client exported functions", () => {
  it("exports getHealth", () => {
    expect(typeof client.getHealth).toBe("function");
  });

  it("exports getCurrentUser", () => {
    expect(typeof client.getCurrentUser).toBe("function");
  });

  it("exports getProviderStatus", () => {
    expect(typeof client.getProviderStatus).toBe("function");
  });

  it("exports getWorkflows", () => {
    expect(typeof client.getWorkflows).toBe("function");
  });

  it("exports getModels", () => {
    expect(typeof client.getModels).toBe("function");
  });

  it("exports pinWorkflow", () => {
    expect(typeof client.pinWorkflow).toBe("function");
  });

  it("exports unpinWorkflow", () => {
    expect(typeof client.unpinWorkflow).toBe("function");
  });

  it("exports createGeneration", () => {
    expect(typeof client.createGeneration).toBe("function");
  });

  it("exports deleteGeneration", () => {
    expect(typeof client.deleteGeneration).toBe("function");
  });

  it("exports getGallery", () => {
    expect(typeof client.getGallery).toBe("function");
  });

  it("exports getPresets", () => {
    expect(typeof client.getPresets).toBe("function");
  });

  it("exports getCanvasState", () => {
    expect(typeof client.getCanvasState).toBe("function");
  });

  it("exports putCanvasState", () => {
    expect(typeof client.putCanvasState).toBe("function");
  });

  it("exports searchProviderModels", () => {
    expect(typeof client.searchProviderModels).toBe("function");
  });

  it("exports getAdminSettings", () => {
    expect(typeof client.getAdminSettings).toBe("function");
  });
});

// ── getWorkflows ──

describe("getWorkflows", () => {
  it("returns workflows array, pinnedWorkflowIds, and organization", async () => {
    const result = await client.getWorkflows("http://localhost");
    expect(result).toHaveProperty("workflows");
    expect(result).toHaveProperty("pinnedWorkflowIds");
    expect(result).toHaveProperty("organization");
    expect(Array.isArray(result.workflows)).toBe(true);
  });

  it("transforms raw workflow records into WorkflowSummary shape", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      {
        id: "wf-test",
        label: "Test Workflow",
        engine: "comfyui",
        meta: {
          label: "Test WF",
          outputMode: "single_image",
          ui: { aspectRatio: true, batchSize: false },
          supportsImageInput: true,
          supportsLora: true,
          parameters: [{ name: "steps", type: "number" }],
        },
        template: { some: "template" },
      },
    ]);
    mockTauri.getPinnedWorkflows.mockResolvedValueOnce(["wf-test"]);
    mockTauri.getWorkflowOrganization.mockResolvedValueOnce({ folders: [] });

    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows).toHaveLength(1);
    const wf = result.workflows[0];
    expect(wf.id).toBe("wf-test");
    expect(wf.label).toBe("Test Workflow");
    expect(wf.engine).toBe("comfyui");
    expect(wf.outputMode).toBe("single_image");
    expect(wf.ui.aspectRatio).toBe(true);
    expect(wf.ui.batchSize).toBe(false);
    expect(wf.supportsImageInput).toBe(true);
    expect(wf.supportsLora).toBe(true);
    expect(wf.parameters).toEqual([{ name: "steps", type: "number" }]);
    expect(result.pinnedWorkflowIds).toEqual(["wf-test"]);
    expect(result.organization).toEqual({ folders: [] });
  });

  it("sets engine to fal for fal workflows", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-fal", engine: "fal", meta: {}, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].engine).toBe("fal");
  });

  it("sets engine to replicate for replicate workflows", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-rep", engine: "replicate", meta: {}, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].engine).toBe("replicate");
  });

  it("sets engine to openrouter for openrouter workflows", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-or", engine: "openrouter", meta: {}, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].engine).toBe("openrouter");
  });

  it("defaults engine to comfyui for unknown engine values", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-unknown", engine: "something_else", meta: {}, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].engine).toBe("comfyui");
  });

  it("supportsImageInput is true for openrouter engine even without meta flag", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-or", engine: "openrouter", meta: {}, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].supportsImageInput).toBe(true);
  });

  it("supportsImageInput is true when template contains __IMAGE__ token", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-img", engine: "comfyui", meta: {}, template: { input: "__IMAGE__" } },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].supportsImageInput).toBe(true);
  });

  it("supportsImageInput is false when meta explicitly sets it to false", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-nimg", engine: "comfyui", meta: { supportsImageInput: false }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].supportsImageInput).toBe(false);
  });

  it("supportsLora is false for fal engine", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-fal", engine: "fal", meta: {}, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].supportsLora).toBe(false);
  });

  it("supportsLora is false when meta explicitly disables it", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-nolora", engine: "comfyui", meta: { supportsLora: false }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].supportsLora).toBe(false);
  });

  it("uses meta.label as fallback when record label is missing", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-nolabel", meta: { label: "Meta Label" }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].label).toBe("Meta Label");
  });

  it("uses id as label when both record label and meta label are missing", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-fallback", meta: {}, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].label).toBe("wf-fallback");
  });

  it("sets providerAvailable from providerStatus for each engine", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-comfy", engine: "comfyui", meta: {}, template: {} },
      { id: "wf-rep", engine: "replicate", meta: {}, template: {} },
      { id: "wf-fal", engine: "fal", meta: {}, template: {} },
      { id: "wf-or", engine: "openrouter", meta: {}, template: {} },
    ]);
    mockTauri.getProviderStatus.mockResolvedValueOnce({
      comfyui: { available: true },
      replicate: { available: false },
      fal: { available: true },
      openrouter: { available: false },
    });
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].providerAvailable).toBe(true);
    expect(result.workflows[1].providerAvailable).toBe(false);
    expect(result.workflows[2].providerAvailable).toBe(true);
    expect(result.workflows[3].providerAvailable).toBe(false);
  });

  it("handles supportedAspectRatios as array", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-ar", meta: { supportedAspectRatios: ["16:9", "4:3"] }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].supportedAspectRatios).toEqual(["16:9", "4:3"]);
  });

  it("sets supportedAspectRatios to undefined when not an array", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-ar2", meta: { supportedAspectRatios: "invalid" }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].supportedAspectRatios).toBeUndefined();
  });
});

// ── getModels ──

describe("getModels", () => {
  it("returns models array and meta", async () => {
    const result = await client.getModels("http://localhost");
    expect(result).toHaveProperty("models");
    expect(result).toHaveProperty("meta");
    expect(Array.isArray(result.models)).toBe(true);
    expect(result.meta.comfyAvailable).toBe(true);
  });

  it("transforms lora settings into Model objects", async () => {
    mockTauri.getLoraSettings.mockResolvedValueOnce({
      enabled: ["lora-a", "lora-b"],
      displayNames: { "lora-a": "LoRA Alpha" },
      previewUrls: { "lora-b": "http://preview.png" },
    });
    const result = await client.getModels("http://localhost");
    expect(result.models).toHaveLength(2);
    expect(result.models[0].id).toBe("lora-a");
    expect(result.models[0].name).toBe("LoRA Alpha");
    expect(result.models[0].previewImageUrl).toBe("");
    expect(result.models[1].id).toBe("lora-b");
    expect(result.models[1].name).toBe("lora-b"); // falls back to id
    expect(result.models[1].previewImageUrl).toBe("http://preview.png");
  });

  it("handles missing settings fields gracefully", async () => {
    mockTauri.getLoraSettings.mockResolvedValueOnce({});
    const result = await client.getModels("http://localhost");
    expect(result.models).toEqual([]);
  });
});

// ── createGeneration ──

describe("createGeneration", () => {
  it("returns generationId and jobId", async () => {
    const result = await client.createGeneration("http://localhost", {
      modelId: "model-1",
      prompt: "test prompt",
      workflowId: "wf-1",
    });
    expect(result).toHaveProperty("generationId", "gen-1");
    expect(result).toHaveProperty("jobId", "job-1");
    expect(result).toHaveProperty("queuePosition", null);
  });

  it("passes all body parameters to tauri.createGeneration", async () => {
    await client.createGeneration("http://localhost", {
      modelId: "m1",
      prompt: "hello",
      workflowId: "wf-1",
      seed: 42,
      batchSize: 4,
      width: 512,
      height: 768,
      aspectRatio: "16:9",
      imageDataUrl: "data:image/png;base64,abc",
      imageDataUrls: ["data:1", "data:2"],
      workflowParams: { steps: 20 },
      replicateModel: "rep/model",
      falModel: "fal-model",
      openrouterModel: "or-model",
      fileInputKeys: ["image"],
      promptField: "custom_prompt",
      presetId: "preset-1",
    });
    expect(mockTauri.createGeneration).toHaveBeenCalledWith({
      prompt: "hello",
      modelId: "m1",
      workflowId: "wf-1",
      seed: 42,
      batchSize: 4,
      width: 512,
      height: 768,
      aspectRatio: "16:9",
      image: "data:image/png;base64,abc",
      images: ["data:1", "data:2"],
      workflowParams: { steps: 20 },
      replicateModel: "rep/model",
      falModel: "fal-model",
      openrouterModel: "or-model",
      fileInputKeys: ["image"],
      promptField: "custom_prompt",
      presetId: "preset-1",
    });
  });

  it("defaults jobId to empty string when tauri returns no jobId", async () => {
    mockTauri.createGeneration.mockResolvedValueOnce({ id: "gen-2" });
    const result = await client.createGeneration("http://localhost", {
      modelId: "m",
      prompt: "p",
      workflowId: "w",
    });
    expect(result.jobId).toBe("");
  });
});

// ── getMyGenerations / getAdminGenerations ──

describe("getMyGenerations", () => {
  it("returns generations array", async () => {
    const result = await client.getMyGenerations("http://localhost");
    expect(result).toHaveProperty("generations");
    expect(Array.isArray(result.generations)).toBe(true);
  });

  it("wraps tauri.listGenerations result", async () => {
    const fakeGens = [{ id: "g1" }, { id: "g2" }];
    mockTauri.listGenerations.mockResolvedValueOnce(fakeGens);
    const result = await client.getMyGenerations("http://localhost");
    expect(result.generations).toEqual(fakeGens);
  });
});

describe("getAdminGenerations", () => {
  it("returns generations from tauri.listGenerations", async () => {
    const fakeGens = [{ id: "g3" }];
    mockTauri.listGenerations.mockResolvedValueOnce(fakeGens);
    const result = await client.getAdminGenerations("http://localhost");
    expect(result.generations).toEqual(fakeGens);
  });
});

// ── getGallery ──

describe("getGallery", () => {
  it("returns items and nextCursor", async () => {
    const result = await client.getGallery("http://localhost", {});
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("nextCursor");
  });

  it("passes parameters correctly to tauri.listGallery", async () => {
    await client.getGallery("http://localhost", {
      workflowId: "wf-1",
      modelId: "m-1",
      q: "search term",
      limit: 10,
      cursor: "cursor-abc",
    });
    expect(mockTauri.listGallery).toHaveBeenCalledWith({
      workflowId: "wf-1",
      modelId: "m-1",
      query: "search term",
      limit: 10,
      cursor: "cursor-abc",
    });
  });

  it("converts null cursor to undefined", async () => {
    await client.getGallery("http://localhost", { cursor: null });
    expect(mockTauri.listGallery).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: undefined })
    );
  });
});

// ── getCanvasState ──

describe("getCanvasState", () => {
  it("returns default state when tauri returns null", async () => {
    const result = await client.getCanvasState("http://localhost");
    expect(result).toEqual({
      gameId: "default",
      nodes: [],
      chatMessages: [],
      chatWorkflowId: null,
      nextZIndex: 1,
      pinnedModelIds: [],
      pinnedWorkflowIds: [],
      selectedProviderModelId: null,
      activeEngine: null,
      updatedAt: null,
      updatedByEmail: null,
    });
  });

  it("returns tauri state when available", async () => {
    const state = { nodes: [{ id: "n1" }], chatMessages: [], nextZIndex: 5 };
    mockTauri.getCanvasState.mockResolvedValueOnce(state);
    const result = await client.getCanvasState("http://localhost");
    expect(result).toEqual(state);
  });
});

// ── putCanvasState ──

describe("putCanvasState", () => {
  it("calls tauri.saveCanvasState with correct params", async () => {
    await client.putCanvasState("http://localhost", {
      nodes: [{ id: "n1" }],
      chatMessages: [{ text: "hi" }],
      chatWorkflowId: "wf-chat",
      nextZIndex: 3,
      pinnedModelIds: ["m1"],
      pinnedWorkflowIds: ["wf-img"],
      selectedProviderModelId: "provider/model",
      activeEngine: "replicate",
    } as any);
    expect(mockTauri.saveCanvasState).toHaveBeenCalledWith({
      nodes: [{ id: "n1" }],
      chatMessages: [{ text: "hi" }],
      chatWorkflowId: "wf-chat",
      nextZIndex: 3,
      pinnedModelIds: ["m1"],
      pinnedWorkflowIds: ["wf-img"],
      selectedProviderModelId: "provider/model",
      activeEngine: "replicate",
    });
  });

  it("converts null chatWorkflowId to undefined", async () => {
    await client.putCanvasState("http://localhost", {
      nodes: [],
      chatMessages: [],
      chatWorkflowId: null,
      nextZIndex: 1,
    });
    expect(mockTauri.saveCanvasState).toHaveBeenCalledWith(
      expect.objectContaining({ chatWorkflowId: undefined })
    );
  });
});

// ── getWorkflowPreviews ──

describe("getWorkflowPreviews", () => {
  it("returns empty object", async () => {
    const result = await client.getWorkflowPreviews("http://localhost");
    expect(result).toEqual({});
  });
});

// ── regenerateItem ──

describe("regenerateItem", () => {
  it("returns generation info with asset", async () => {
    const result = await client.regenerateItem("http://localhost", "gen-1", {
      itemIndex: 0,
      assetType: "image",
      seed: 42,
    });
    expect(result.generationId).toBe("gen-1");
    expect(result.jobId).toBe("");
    expect(result.queuePosition).toBe(0);
    expect(result.assets).toEqual([{ id: "a1", url: "" }]);
  });

  it("passes correct arguments to tauri.regenerateItem", async () => {
    await client.regenerateItem("http://localhost", "gen-5", {
      itemIndex: 2,
      assetType: "video",
      seed: 123,
    });
    expect(mockTauri.regenerateItem).toHaveBeenCalledWith("gen-5", 2, "video", 123);
  });
});

// ── createInpaintAssetVersion ──

describe("createInpaintAssetVersion", () => {
  it("calls tauri.createInpaint and returns correct shape", async () => {
    const result = await client.createInpaintAssetVersion("http://localhost", "gen-1", {
      assetType: "image",
      itemIndex: 0,
      prompt: "fix this",
      seed: 7,
      imageDataUrl: "data:image",
      maskDataUrl: "data:mask",
    });
    expect(mockTauri.createInpaint).toHaveBeenCalledWith(
      "gen-1", "image", 0, "fix this", 7, "data:image", "data:mask"
    );
    expect(result.generationId).toBe("gen-1");
    expect(result.jobId).toBe("");
    expect(result.queuePosition).toBe(0);
  });
});

// ── removeBackground ──

describe("removeBackground", () => {
  it("returns asset with correct shape", async () => {
    const result = await client.removeBackground("http://localhost", "gen-1", { itemIndex: 1 });
    expect(result.generationId).toBe("gen-1");
    expect(result.itemIndex).toBe(1);
    expect(result.asset.id).toBe("a2");
    expect(result.alreadyExists).toBe(false);
  });
});

// ── downloadGenerationAssetsZip ──

describe("downloadGenerationAssetsZip", () => {
  it("returns blob and filename", async () => {
    const result = await client.downloadGenerationAssetsZip("http://localhost", "gen-zip");
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.filename).toBe("generation_gen-zip.zip");
  });
});

// ── generatePromptVariants ──

describe("generatePromptVariants", () => {
  it("wraps tauri.exploreVariants into { variants } shape", async () => {
    mockTauri.exploreVariants.mockResolvedValueOnce(["variant1", "variant2"]);
    const result = await client.generatePromptVariants("http://localhost", {
      prompt: "a cat",
      count: 2,
      creativity: 0.5,
    });
    expect(result).toEqual({ variants: ["variant1", "variant2"] });
    expect(mockTauri.exploreVariants).toHaveBeenCalledWith("a cat", 2, 0.5);
  });
});

// ── setActiveAssetVersion ──

describe("setActiveAssetVersion", () => {
  it("calls tauri and returns assets from getGeneration", async () => {
    const fakeAssets = [{ id: "a1" }, { id: "a2" }];
    mockTauri.getGeneration.mockResolvedValueOnce({ assets: fakeAssets });
    const result = await client.setActiveAssetVersion("http://localhost", "gen-1", {
      assetId: "a2",
    });
    expect(mockTauri.setActiveAssetVersion).toHaveBeenCalledWith("gen-1", "a2");
    expect(result).toEqual(fakeAssets);
  });
});

// ── searchProviderModels ──

describe("searchProviderModels", () => {
  it("passes correct params to tauri", async () => {
    await client.searchProviderModels("http://localhost", "fal", {
      q: "sdxl",
      limit: 5,
      cursor: "c1",
    });
    expect(mockTauri.searchProviderModels).toHaveBeenCalledWith("fal", "sdxl", 5, "c1");
  });
});

// ── createOutpaintGeneration ──

describe("createOutpaintGeneration", () => {
  it("delegates to createGeneration with outpaint params as workflowParams", async () => {
    await client.createOutpaintGeneration("http://localhost", {
      modelId: "m1",
      prompt: "expand",
      seed: 10,
      imageDataUrl: "data:img",
      outpaintWorkflowId: "my-outpaint-wf",
      outpaintParams: {
        expandLeft: 64,
        expandRight: 64,
        expandTop: 32,
        expandBottom: 32,
        denoise: 0.8,
        edgeBlend: 64,
      },
    });
    expect(mockTauri.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "my-outpaint-wf",
        workflowParams: {
          expand_left: 64,
          expand_right: 64,
          expand_top: 32,
          expand_bottom: 32,
          denoise: 0.8,
          edge_blend: 64,
        },
        batchSize: 1,
      })
    );
  });
});

// ── getAdminSettings ──

describe("getAdminSettings", () => {
  it("masks API keys correctly", async () => {
    mockTauri.getAdminSettings.mockResolvedValueOnce({
      openrouterApiKey: "sk-abcdefghijklmnop",
      replicateApiKey: null,
      falApiKey: "fal-1234567890abcdef",
      kieApiKey: undefined,
    });
    mockTauri.getDefaultSystemPrompts.mockResolvedValueOnce({
      canvasAgent: "default-canvas",
      promptEnhancer: "default-enhancer",
    });

    const result = await client.getAdminSettings("http://localhost");
    expect(result.openrouterApiKeyPresent).toBe(true);
    expect(result.openrouterApiKeyHint).toBe("sk-a...mnop");
    expect(result.replicateApiKeyPresent).toBe(false);
    expect(result.replicateApiKeyHint).toBeNull();
    expect(result.falApiKeyPresent).toBe(true);
    expect(result.falApiKeyHint).toBe("fal-...cdef");
    expect(result.kieApiKeyPresent).toBe(false);
    expect(result.canvasAgentSystemPromptDefault).toBe("default-canvas");
    expect(result.promptEnhancerSystemPromptDefault).toBe("default-enhancer");
  });

  it("provides effective defaults for agent model and temperature", async () => {
    mockTauri.getAdminSettings.mockResolvedValueOnce({});
    mockTauri.getDefaultSystemPrompts.mockResolvedValueOnce({ canvasAgent: "", promptEnhancer: "" });

    const result = await client.getAdminSettings("http://localhost");
    expect(result.canvasAgentModelEffective).toBe("openai/gpt-4o-mini");
    expect(result.canvasAgentTemperatureEffective).toBe(0.7);
    expect(result.promptEnhancerModelEffective).toBe("openai/gpt-4o-mini");
  });

  it("uses custom model when set", async () => {
    mockTauri.getAdminSettings.mockResolvedValueOnce({
      canvasAgentModel: "custom/model",
      canvasAgentTemperature: 0.3,
    });
    mockTauri.getDefaultSystemPrompts.mockResolvedValueOnce({ canvasAgent: "", promptEnhancer: "" });

    const result = await client.getAdminSettings("http://localhost");
    expect(result.canvasAgentModelEffective).toBe("custom/model");
    expect(result.canvasAgentTemperatureEffective).toBe(0.3);
  });
});

// ── putAdminSettings ──

describe("putAdminSettings", () => {
  it("merges new settings with existing and calls updateAdminSettings", async () => {
    mockTauri.getAdminSettings
      .mockResolvedValueOnce({ openrouterApiKey: "old-key", adminEmails: ["a@b.com"] })
      .mockResolvedValueOnce({ openrouterApiKey: "new-key", adminEmails: ["a@b.com"] });
    mockTauri.getDefaultSystemPrompts.mockResolvedValue({ canvasAgent: "", promptEnhancer: "" });

    await client.putAdminSettings("http://localhost", {
      openrouterApiKey: "new-key",
    });

    expect(mockTauri.updateAdminSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        openrouterApiKey: "new-key",
        adminEmails: ["a@b.com"],
      })
    );
  });
});

// ── createWorkflowFromModel ──

describe("createWorkflowFromModel", () => {
  it("creates workflow from provider model detail", async () => {
    mockTauri.getProviderModelDetail.mockResolvedValueOnce({
      name: "SDXL Lightning",
      supportsImageInput: true,
      template: { input: "test" },
    });

    const result = await client.createWorkflowFromModel("http://localhost", "fal", "fal-ai/sdxl");
    expect(result.workflowId).toBe("fal-fal-ai-sdxl");
    expect(result.workflow.label).toBe("SDXL Lightning");
    expect(result.workflow.engine).toBe("fal");
    expect(mockTauri.upsertWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "fal-fal-ai-sdxl",
        label: "SDXL Lightning",
        engine: "fal",
      })
    );
  });

  it("falls back to modelId as label when detail has no name", async () => {
    mockTauri.getProviderModelDetail.mockResolvedValueOnce({});
    const result = await client.createWorkflowFromModel("http://localhost", "replicate", "owner/model");
    expect(result.workflow.label).toBe("owner/model");
  });
});

// ── getAssetVersions ──

describe("getAssetVersions", () => {
  it("passes correct arguments to tauri", async () => {
    await client.getAssetVersions("http://localhost", "gen-1", {
      assetType: "image",
      itemIndex: 2,
    });
    expect(mockTauri.getAssetVersions).toHaveBeenCalledWith("gen-1", "image", 2);
  });

  it("converts null itemIndex correctly", async () => {
    await client.getAssetVersions("http://localhost", "gen-1", {
      assetType: "image",
      itemIndex: null,
    });
    expect(mockTauri.getAssetVersions).toHaveBeenCalledWith("gen-1", "image", null);
  });
});

// ── pinWorkflow / unpinWorkflow ──

describe("pinWorkflow", () => {
  it("delegates to tauri.pinWorkflow", async () => {
    await client.pinWorkflow("http://localhost", "wf-1");
    expect(mockTauri.pinWorkflow).toHaveBeenCalledWith("wf-1");
  });
});

describe("unpinWorkflow", () => {
  it("delegates to tauri.unpinWorkflow", async () => {
    await client.unpinWorkflow("http://localhost", "wf-1");
    expect(mockTauri.unpinWorkflow).toHaveBeenCalledWith("wf-1");
  });
});

// ── getCompareModels / getCompareGroups ──

describe("getCompareModels", () => {
  it("delegates to tauri", async () => {
    mockTauri.getCompareModels.mockResolvedValueOnce([{ id: "m1" }]);
    const result = await client.getCompareModels("http://localhost");
    expect(result).toEqual([{ id: "m1" }]);
  });
});

describe("getCompareGroups", () => {
  it("delegates to tauri", async () => {
    mockTauri.getCompareGroups.mockResolvedValueOnce([{ id: "g1" }]);
    const result = await client.getCompareGroups("http://localhost");
    expect(result).toEqual([{ id: "g1" }]);
  });
});

// ── tauriRecordToSummary — nullish coalescing branches ──

describe("tauriRecordToSummary via getWorkflows — nullish field branches", () => {
  it("handles meta fields explicitly null/undefined vs truthy", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      {
        id: "wf-null",
        engine: "comfyui",
        meta: {
          supportsImageInput: null,
          requiresImageInput: null,
          supportsVideoInput: null,
          maxVideoInputs: null,
          supportsAudioInput: null,
          maxAudioInputs: null,
          supportsLora: null,
          parameters: null,
          supportedAspectRatios: null,
          maxImageInputs: null,
          appendAspectRatioToPrompt: null,
          fullSetItemCount: null,
          fullSetSlots: null,
          supportsRemoveItemBackgrounds: null,
          promptRequired: null,
          supportsPresets: null,
          dynamicModel: null,
          ui: null,
          label: null,
          outputMode: null,
        },
        template: {},
        label: null,
        outputMode: null,
      },
    ]);
    const result = await client.getWorkflows("http://localhost");
    const wf = result.workflows[0];
    expect(wf.id).toBe("wf-null");
    // Label falls back through null -> null -> id
    expect(wf.label).toBe("wf-null");
    // outputMode falls back to "single_image"
    expect(wf.outputMode).toBe("single_image");
    // Boolean fields should be false/undefined
    expect(wf.requiresImageInput).toBeUndefined();
    expect(wf.supportsVideoInput).toBeUndefined();
    expect(wf.maxVideoInputs).toBeUndefined();
    expect(wf.supportsAudioInput).toBeUndefined();
    expect(wf.maxAudioInputs).toBeUndefined();
    expect(wf.parameters).toBeUndefined();
    expect(wf.supportedAspectRatios).toBeUndefined();
    expect(wf.maxImageInputs).toBeUndefined();
    expect(wf.appendAspectRatioToPrompt).toBeUndefined();
    expect(wf.fullSetItemCount).toBeUndefined();
    expect(wf.fullSetSlots).toBeUndefined();
    expect(wf.supportsRemoveItemBackgrounds).toBeUndefined();
    expect(wf.supportsPresets).toBeUndefined();
    expect(wf.dynamicModel).toBeUndefined();
  });

  it("handles meta fields with truthy values", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      {
        id: "wf-truthy",
        engine: "fal",
        meta: {
          supportsImageInput: true,
          requiresImageInput: true,
          supportsVideoInput: true,
          maxVideoInputs: 3,
          supportsAudioInput: true,
          maxAudioInputs: 2,
          supportsLora: false,
          parameters: [{ name: "p1" }],
          supportedAspectRatios: ["16:9"],
          maxImageInputs: 5,
          appendAspectRatioToPrompt: true,
          fullSetItemCount: 10,
          fullSetSlots: ["slot1"],
          supportsRemoveItemBackgrounds: true,
          promptRequired: false,
          supportsPresets: true,
          dynamicModel: true,
          ui: { aspectRatio: true, batchSize: true, canvasMode: true, lastFrameImage: true },
          label: "Truthy WF",
          outputMode: "multi_image",
        },
        template: {},
        label: "Record Label",
        outputMode: "video",
      },
    ]);
    const result = await client.getWorkflows("http://localhost");
    const wf = result.workflows[0];
    expect(wf.label).toBe("Record Label"); // rec.label takes priority
    expect(wf.outputMode).toBe("video"); // rec.outputMode takes priority
    expect(wf.requiresImageInput).toBe(true);
    expect(wf.supportsVideoInput).toBe(true);
    expect(wf.maxVideoInputs).toBe(3);
    expect(wf.supportsAudioInput).toBe(true);
    expect(wf.maxAudioInputs).toBe(2);
    expect(wf.parameters).toEqual([{ name: "p1" }]);
    expect(wf.supportedAspectRatios).toEqual(["16:9"]);
    expect(wf.maxImageInputs).toBe(5);
    expect(wf.appendAspectRatioToPrompt).toBe(true);
    expect(wf.fullSetItemCount).toBe(10);
    expect(wf.fullSetSlots).toEqual(["slot1"]);
    expect(wf.supportsRemoveItemBackgrounds).toBe(true);
    expect(wf.promptRequired).toBe(false);
    expect(wf.supportsPresets).toBe(true);
    expect(wf.dynamicModel).toBe(true);
    expect(wf.ui.canvasMode).toBe(true);
    expect(wf.ui.lastFrameImage).toBe(true);
  });

  it("handles kie engine for providerAvailable and supportsLora", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-kie", engine: "kie", meta: {}, template: {} },
    ]);
    mockTauri.getProviderStatus.mockResolvedValueOnce({
      kie: { available: true },
    });
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].engine).toBe("kie");
    expect(result.workflows[0].providerAvailable).toBe(true);
    expect(result.workflows[0].supportsLora).toBe(false);
    expect(result.workflows[0].supportsImageInput).toBe(true); // kie engine auto-enables
  });
});

describe("createGeneration — jobId nullish coalescing", () => {
  it("uses jobId when provided", async () => {
    mockTauri.createGeneration.mockResolvedValueOnce({ id: "gen-x", jobId: "real-job" });
    const result = await client.createGeneration("http://localhost", {
      modelId: "m", prompt: "p", workflowId: "w",
    });
    expect(result.jobId).toBe("real-job");
  });

  it("defaults to empty string when jobId is null", async () => {
    mockTauri.createGeneration.mockResolvedValueOnce({ id: "gen-y", jobId: null });
    const result = await client.createGeneration("http://localhost", {
      modelId: "m", prompt: "p", workflowId: "w",
    });
    expect(result.jobId).toBe("");
  });

  it("defaults to empty string when jobId is undefined", async () => {
    mockTauri.createGeneration.mockResolvedValueOnce({ id: "gen-z" });
    const result = await client.createGeneration("http://localhost", {
      modelId: "m", prompt: "p", workflowId: "w",
    });
    expect(result.jobId).toBe("");
  });
});

describe("getGallery — nextCursor nullish coalescing", () => {
  it("returns nextCursor when defined", async () => {
    mockTauri.listGallery.mockResolvedValueOnce({ items: [], nextCursor: "abc" });
    const result = await client.getGallery("http://localhost", {});
    expect(result.nextCursor).toBe("abc");
  });

  it("returns null when nextCursor is undefined", async () => {
    mockTauri.listGallery.mockResolvedValueOnce({ items: [] });
    const result = await client.getGallery("http://localhost", {});
    expect(result.nextCursor).toBeNull();
  });
});

describe("getWorkflows — providerStatus null branch", () => {
  it("does not set providerAvailable when providerStatus is null", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-1", engine: "comfyui", meta: {}, template: {} },
    ]);
    mockTauri.getProviderStatus.mockRejectedValueOnce(new Error("fail"));
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].providerAvailable).toBeUndefined();
    expect(result.providerStatus).toBeUndefined();
  });
});

describe("getWorkflows — providerAvailable ?? false branches", () => {
  it("defaults to false when provider field is missing from status", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-comfy", engine: "comfyui", meta: {}, template: {} },
      { id: "wf-rep", engine: "replicate", meta: {}, template: {} },
      { id: "wf-fal", engine: "fal", meta: {}, template: {} },
      { id: "wf-or", engine: "openrouter", meta: {}, template: {} },
      { id: "wf-kie", engine: "kie", meta: {}, template: {} },
    ]);
    // Return a status object but with undefined providers (triggering ?? false)
    mockTauri.getProviderStatus.mockResolvedValueOnce({});
    const result = await client.getWorkflows("http://localhost");
    // All should default to false since provider fields are undefined
    for (const wf of result.workflows) {
      expect(wf.providerAvailable).toBe(false);
    }
  });
});

describe("setActiveAssetVersion — gen null branch", () => {
  it("returns empty array when getGeneration returns null", async () => {
    mockTauri.getGeneration.mockResolvedValueOnce(null);
    const result = await client.setActiveAssetVersion("http://localhost", "gen-1", { assetId: "a1" });
    expect(result).toEqual([]);
  });
});

describe("putAdminSettings — individual field branches", () => {
  it("merges all possible fields", async () => {
    mockTauri.getAdminSettings
      .mockResolvedValueOnce({ openrouterApiKey: "old" })
      .mockResolvedValueOnce({});
    mockTauri.getDefaultSystemPrompts.mockResolvedValue({ canvasAgent: "", promptEnhancer: "" });

    await client.putAdminSettings("http://localhost", {
      openrouterApiKey: "new-or",
      replicateApiKey: "new-rep",
      falApiKey: "new-fal",
      kieApiKey: "new-kie",
      adminEmails: ["a@b.com"],
      allowedEmailDomains: ["b.com"],
      comfyBaseUrls: ["http://comfy"],
      canvasAgentModel: "model-x",
      canvasAgentSystemPrompt: "prompt-x",
      canvasAgentTemperature: 0.5,
      promptEnhancerModel: "model-pe",
      promptEnhancerSystemPrompt: "prompt-pe",
    });

    expect(mockTauri.updateAdminSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        openrouterApiKey: "new-or",
        replicateApiKey: "new-rep",
        falApiKey: "new-fal",
        kieApiKey: "new-kie",
        adminEmails: ["a@b.com"],
        allowedEmailDomains: ["b.com"],
        comfyBaseUrls: ["http://comfy"],
        canvasAgentModel: "model-x",
        canvasAgentSystemPrompt: "prompt-x",
        canvasAgentTemperature: 0.5,
        promptEnhancerModel: "model-pe",
        promptEnhancerSystemPrompt: "prompt-pe",
      })
    );
  });

  it("handles null current settings from tauri", async () => {
    mockTauri.getAdminSettings
      .mockResolvedValueOnce(null)  // first call returns null → ?? {} fallback
      .mockResolvedValueOnce({});
    mockTauri.getDefaultSystemPrompts.mockResolvedValue({ canvasAgent: "", promptEnhancer: "" });

    await client.putAdminSettings("http://localhost", {
      openrouterApiKey: "new-key",
    });

    expect(mockTauri.updateAdminSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        openrouterApiKey: "new-key",
      })
    );
  });

  it("does not overwrite fields that are not in the body", async () => {
    mockTauri.getAdminSettings
      .mockResolvedValueOnce({ openrouterApiKey: "keep-this", falApiKey: "keep-fal" })
      .mockResolvedValueOnce({});
    mockTauri.getDefaultSystemPrompts.mockResolvedValue({ canvasAgent: "", promptEnhancer: "" });

    await client.putAdminSettings("http://localhost", {
      replicateApiKey: "set-rep",
    });

    expect(mockTauri.updateAdminSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        openrouterApiKey: "keep-this",
        falApiKey: "keep-fal",
        replicateApiKey: "set-rep",
      })
    );
  });
});

describe("getAdminSettings — null settings fallback", () => {
  it("handles null settings from tauri", async () => {
    mockTauri.getAdminSettings.mockResolvedValueOnce(null);
    mockTauri.getDefaultSystemPrompts.mockResolvedValueOnce({ canvasAgent: "def1", promptEnhancer: "def2" });
    const result = await client.getAdminSettings("http://localhost");
    expect(result.openrouterApiKeyPresent).toBe(false);
    expect(result.adminEmails).toEqual([]);
    expect(result.comfyBaseUrls).toEqual([]);
    expect(result.canvasAgentModel).toBeNull();
  });
});

describe("getAdminSettings — defaults null fallback", () => {
  it("falls back to empty string when default prompts are null", async () => {
    mockTauri.getAdminSettings.mockResolvedValueOnce({});
    mockTauri.getDefaultSystemPrompts.mockResolvedValueOnce({
      canvasAgent: null,
      promptEnhancer: null,
    });
    const result = await client.getAdminSettings("http://localhost");
    expect(result.canvasAgentSystemPromptDefault).toBe("");
    expect(result.promptEnhancerSystemPromptDefault).toBe("");
  });
});

describe("getReplicateModelParameters — modelId without slash", () => {
  it("handles modelId without slash (parts[1] is undefined)", async () => {
    mockTauri.getReplicateModelParameters.mockResolvedValueOnce({ parameters: [] });
    const result = await client.getReplicateModelParameters("http://localhost", "noSlash");
    expect(mockTauri.getReplicateModelParameters).toHaveBeenCalledWith("noSlash", "");
  });
});

describe("getReplicateModelParameters — raw schema conversion", () => {
  it("converts schema when raw has no parameters field", async () => {
    mockTauri.getReplicateModelParameters.mockResolvedValueOnce({
      input: { type: "object", properties: {} },
      definitions: {},
      readme: "readme text",
      description: "desc text",
    });
    // The function imports schemaToParameters dynamically; we just test it doesn't throw
    const result = await client.getReplicateModelParameters("http://localhost", "owner/model");
    expect(result).toBeDefined();
  });

  it("returns raw when parameters field exists", async () => {
    const rawWithParams = { parameters: [{ name: "steps" }] };
    mockTauri.getReplicateModelParameters.mockResolvedValueOnce(rawWithParams);
    const result = await client.getReplicateModelParameters("http://localhost", "owner/model");
    expect(result).toEqual(rawWithParams);
  });
});

describe("getFalModelParameters — raw schema conversion", () => {
  it("converts schema when raw has no parameters field", async () => {
    mockTauri.getFalModelParameters.mockResolvedValueOnce({
      input: { type: "object", properties: {} },
      definitions: {},
      description: "fal desc",
    });
    const result = await client.getFalModelParameters("http://localhost", "fal-ai/model");
    expect(result).toBeDefined();
  });

  it("returns raw when parameters field exists", async () => {
    const rawWithParams = { parameters: [{ name: "seed" }] };
    mockTauri.getFalModelParameters.mockResolvedValueOnce(rawWithParams);
    const result = await client.getFalModelParameters("http://localhost", "fal-ai/model");
    expect(result).toEqual(rawWithParams);
  });
});

// ── getHealth ──

describe("getHealth", () => {
  it("delegates to tauri.getHealth", async () => {
    mockTauri.getHealth.mockResolvedValueOnce({ ok: true });
    const result = await client.getHealth("http://localhost");
    expect(result).toEqual({ ok: true });
    expect(mockTauri.getHealth).toHaveBeenCalled();
  });

  it("propagates errors from tauri.getHealth", async () => {
    mockTauri.getHealth.mockRejectedValueOnce(new Error("connection failed"));
    await expect(client.getHealth("http://localhost")).rejects.toThrow("connection failed");
  });
});

// ── getCurrentUser ──

describe("getCurrentUser", () => {
  it("delegates to tauri.getCurrentUser", async () => {
    const user = { id: "u1", email: "test@test.com", displayName: "Test" };
    mockTauri.getCurrentUser.mockResolvedValueOnce(user);
    const result = await client.getCurrentUser("http://localhost");
    expect(result).toEqual(user);
    expect(mockTauri.getCurrentUser).toHaveBeenCalled();
  });

  it("propagates errors from tauri.getCurrentUser", async () => {
    mockTauri.getCurrentUser.mockRejectedValueOnce(new Error("not authenticated"));
    await expect(client.getCurrentUser("http://localhost")).rejects.toThrow("not authenticated");
  });
});

// ── getProviderStatus ──

describe("getProviderStatus", () => {
  it("delegates to tauri.getProviderStatus", async () => {
    const status = { comfyui: { available: true }, replicate: { available: false } };
    mockTauri.getProviderStatus.mockResolvedValueOnce(status);
    const result = await client.getProviderStatus("http://localhost");
    expect(result).toEqual(status);
    expect(mockTauri.getProviderStatus).toHaveBeenCalled();
  });
});

// ── saveWorkflowOrganization ──

describe("saveWorkflowOrganization", () => {
  it("delegates to tauri.reorderWorkflowItems", async () => {
    const items = [{ id: "wf-1", type: "workflow" as const }];
    await client.saveWorkflowOrganization("http://localhost", items as any);
    expect(mockTauri.reorderWorkflowItems).toHaveBeenCalledWith(items);
  });
});

// ── createWorkflowFolder ──

describe("createWorkflowFolder", () => {
  it("delegates to tauri.createWorkflowFolder", async () => {
    const folder = { id: "folder-1", name: "My Folder" };
    mockTauri.createWorkflowFolder.mockResolvedValueOnce(folder);
    const result = await client.createWorkflowFolder("http://localhost", "My Folder");
    expect(result).toEqual(folder);
    expect(mockTauri.createWorkflowFolder).toHaveBeenCalledWith("My Folder");
  });
});

// ── renameWorkflowFolder ──

describe("renameWorkflowFolder", () => {
  it("delegates to tauri.renameWorkflowFolder", async () => {
    await client.renameWorkflowFolder("http://localhost", "folder-1", "New Name");
    expect(mockTauri.renameWorkflowFolder).toHaveBeenCalledWith("folder-1", "New Name");
  });
});

// ── deleteWorkflowFolder ──

describe("deleteWorkflowFolder", () => {
  it("delegates to tauri.deleteWorkflowFolder", async () => {
    await client.deleteWorkflowFolder("http://localhost", "folder-1");
    expect(mockTauri.deleteWorkflowFolder).toHaveBeenCalledWith("folder-1");
  });
});

// ── deleteGeneration ──

describe("deleteGeneration", () => {
  it("delegates to tauri.deleteGeneration", async () => {
    await client.deleteGeneration("http://localhost", "gen-del");
    expect(mockTauri.deleteGeneration).toHaveBeenCalledWith("gen-del");
  });
});

// ── getAssetTypes ──

describe("getAssetTypes", () => {
  it("delegates to tauri.listAssetTypes", async () => {
    const types = [{ id: "image", label: "Image" }, { id: "video", label: "Video" }];
    mockTauri.listAssetTypes.mockResolvedValueOnce(types);
    const result = await client.getAssetTypes("http://localhost");
    expect(result).toEqual(types);
    expect(mockTauri.listAssetTypes).toHaveBeenCalled();
  });

  it("returns empty array when no asset types exist", async () => {
    mockTauri.listAssetTypes.mockResolvedValueOnce([]);
    const result = await client.getAssetTypes("http://localhost");
    expect(result).toEqual([]);
  });
});

// ── getPresets ──

describe("getPresets", () => {
  it("normalizes camelCase backend fields to UserPreset shape", async () => {
    mockTauri.getPresets.mockResolvedValueOnce([
      { id: "p1", name: "Preset 1", previewUrl: "u1", imageUrls: ["a", "b", "c"] },
      { id: "p2", name: "Preset 2", previewUrl: "u2", imageUrls: [] },
    ]);
    const result = await client.getPresets("http://localhost");
    expect(result).toEqual([
      { id: "p1", name: "Preset 1", preview_url: "u1", image_count: 3 },
      { id: "p2", name: "Preset 2", preview_url: "u2", image_count: 0 },
    ]);
    expect(mockTauri.getPresets).toHaveBeenCalled();
  });

  it("returns empty array when no presets exist", async () => {
    mockTauri.getPresets.mockResolvedValueOnce([]);
    const result = await client.getPresets("http://localhost");
    expect(result).toEqual([]);
  });
});

// ── streamEnhancedPrompt ──

describe("streamEnhancedPrompt", () => {
  it("delegates to tauri.streamEnhancedPrompt with prompt and callback", async () => {
    const onChunk = vi.fn();
    await client.streamEnhancedPrompt("http://localhost", { prompt: "a cat sitting" }, onChunk);
    expect(mockTauri.streamEnhancedPrompt).toHaveBeenCalledWith("a cat sitting", onChunk);
  });

  it("propagates errors from tauri.streamEnhancedPrompt", async () => {
    mockTauri.streamEnhancedPrompt.mockRejectedValueOnce(new Error("enhance failed"));
    await expect(
      client.streamEnhancedPrompt("http://localhost", { prompt: "test" }, vi.fn())
    ).rejects.toThrow("enhance failed");
  });
});

// ── getProviderModelDetail ──

describe("getProviderModelDetail", () => {
  it("delegates to tauri.getProviderModelDetail", async () => {
    const detail = { name: "SDXL", description: "A model" };
    mockTauri.getProviderModelDetail.mockResolvedValueOnce(detail);
    const result = await client.getProviderModelDetail("http://localhost", "fal", "fal-ai/sdxl");
    expect(result).toEqual(detail);
    expect(mockTauri.getProviderModelDetail).toHaveBeenCalledWith("fal", "fal-ai/sdxl");
  });
});

// ── getReplicateModelParameters ──

describe("getReplicateModelParameters", () => {
  it("returns raw result when it has parameters field", async () => {
    const raw = { parameters: [{ name: "steps" }], readme: "readme text" };
    mockTauri.getReplicateModelParameters.mockResolvedValueOnce(raw);
    const result = await client.getReplicateModelParameters("http://localhost", "owner/model");
    expect(result).toEqual(raw);
    expect(mockTauri.getReplicateModelParameters).toHaveBeenCalledWith("owner", "model");
  });

  it("splits modelId by / for owner and model name", async () => {
    mockTauri.getReplicateModelParameters.mockResolvedValueOnce({ parameters: [] });
    await client.getReplicateModelParameters("http://localhost", "stability-ai/sdxl");
    expect(mockTauri.getReplicateModelParameters).toHaveBeenCalledWith("stability-ai", "sdxl");
  });

  it("handles modelId without slash", async () => {
    mockTauri.getReplicateModelParameters.mockResolvedValueOnce({ parameters: [] });
    await client.getReplicateModelParameters("http://localhost", "modelonly");
    expect(mockTauri.getReplicateModelParameters).toHaveBeenCalledWith("modelonly", "");
  });
});

// ── getFalModelParameters ──

describe("getFalModelParameters", () => {
  it("returns raw result when it has parameters field", async () => {
    const raw = { parameters: [{ name: "guidance_scale" }] };
    mockTauri.getFalModelParameters.mockResolvedValueOnce(raw);
    const result = await client.getFalModelParameters("http://localhost", "fal-ai/sdxl");
    expect(result).toEqual(raw);
    expect(mockTauri.getFalModelParameters).toHaveBeenCalledWith("fal-ai/sdxl");
  });
});

// ── getWorkflows additional edge cases ──

describe("getWorkflows edge cases", () => {
  it("sets engine to kie for kie workflows", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-kie", engine: "kie", meta: {}, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].engine).toBe("kie");
    expect(result.workflows[0].supportsLora).toBe(false);
    expect(result.workflows[0].supportsImageInput).toBe(true);
  });

  it("sets providerAvailable for kie engine from providerStatus", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-kie", engine: "kie", meta: {}, template: {} },
    ]);
    mockTauri.getProviderStatus.mockResolvedValueOnce({
      kie: { available: true },
    });
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].providerAvailable).toBe(true);
  });

  it("handles maxImageInputs from meta", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-multi", meta: { maxImageInputs: 4 }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].maxImageInputs).toBe(4);
  });

  it("sets maxImageInputs to undefined when not a number", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-bad", meta: { maxImageInputs: "invalid" }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].maxImageInputs).toBeUndefined();
  });

  it("handles requiresImageInput from meta", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-req", meta: { requiresImageInput: true }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].requiresImageInput).toBe(true);
  });

  it("handles supportsVideoInput from meta", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-vid", meta: { supportsVideoInput: true, maxVideoInputs: 2 }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].supportsVideoInput).toBe(true);
    expect(result.workflows[0].maxVideoInputs).toBe(2);
  });

  it("handles supportsAudioInput from meta", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-aud", meta: { supportsAudioInput: true, maxAudioInputs: 3 }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].supportsAudioInput).toBe(true);
    expect(result.workflows[0].maxAudioInputs).toBe(3);
  });

  it("sets maxVideoInputs to undefined when not a number", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-bad-vid", meta: { maxVideoInputs: "nope" }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].maxVideoInputs).toBeUndefined();
  });

  it("sets maxAudioInputs to undefined when not a number", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-bad-aud", meta: { maxAudioInputs: "nope" }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].maxAudioInputs).toBeUndefined();
  });

  it("handles appendAspectRatioToPrompt from meta", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-ar", meta: { appendAspectRatioToPrompt: true }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].appendAspectRatioToPrompt).toBe(true);
  });

  it("handles fullSetItemCount from meta", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-fs", meta: { fullSetItemCount: 8 }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].fullSetItemCount).toBe(8);
  });

  it("sets fullSetItemCount to undefined when not a number", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-fs-bad", meta: { fullSetItemCount: "bad" }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].fullSetItemCount).toBeUndefined();
  });

  it("handles fullSetSlots from meta", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-slots", meta: { fullSetSlots: ["slot1", "slot2"] }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].fullSetSlots).toEqual(["slot1", "slot2"]);
  });

  it("sets fullSetSlots to undefined when not an array", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-slots-bad", meta: { fullSetSlots: "invalid" }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].fullSetSlots).toBeUndefined();
  });

  it("handles supportsRemoveItemBackgrounds from meta", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-rembg", meta: { supportsRemoveItemBackgrounds: true }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].supportsRemoveItemBackgrounds).toBe(true);
  });

  it("handles promptRequired false from meta", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-no-prompt", meta: { promptRequired: false }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].promptRequired).toBe(false);
  });

  it("sets promptRequired to undefined when not explicitly false", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-prompt", meta: { promptRequired: true }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].promptRequired).toBeUndefined();
  });

  it("handles supportsPresets from meta", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-presets", meta: { supportsPresets: true }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].supportsPresets).toBe(true);
  });

  it("handles dynamicModel from meta", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-dyn", meta: { dynamicModel: true }, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].dynamicModel).toBe(true);
  });

  it("handles providerStatus returning null gracefully", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-1", engine: "comfyui", meta: {}, template: {} },
    ]);
    mockTauri.getProviderStatus.mockRejectedValueOnce(new Error("failed"));
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].providerAvailable).toBeUndefined();
    expect(result.providerStatus).toBeUndefined();
  });

  it("handles missing meta gracefully", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-nometa", template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].id).toBe("wf-nometa");
    expect(result.workflows[0].ui.aspectRatio).toBe(false);
    expect(result.workflows[0].ui.batchSize).toBe(false);
  });

  it("handles missing template gracefully", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-notmpl", meta: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].id).toBe("wf-notmpl");
  });

  it("defaults outputMode to single_image when missing", async () => {
    mockTauri.listWorkflows.mockResolvedValueOnce([
      { id: "wf-nomode", meta: {}, template: {} },
    ]);
    const result = await client.getWorkflows("http://localhost");
    expect(result.workflows[0].outputMode).toBe("single_image");
  });
});

// ── putAdminSettings edge cases ──

describe("putAdminSettings edge cases", () => {
  it("merges multiple fields correctly", async () => {
    mockTauri.getAdminSettings
      .mockResolvedValueOnce({ openrouterApiKey: "old", comfyBaseUrls: ["http://a"] })
      .mockResolvedValueOnce({ openrouterApiKey: "old", falApiKey: "new-fal", comfyBaseUrls: ["http://a"] });
    mockTauri.getDefaultSystemPrompts.mockResolvedValue({ canvasAgent: "", promptEnhancer: "" });

    await client.putAdminSettings("http://localhost", {
      falApiKey: "new-fal",
    });

    expect(mockTauri.updateAdminSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        openrouterApiKey: "old",
        falApiKey: "new-fal",
        comfyBaseUrls: ["http://a"],
      })
    );
  });

  it("handles null values to clear settings", async () => {
    mockTauri.getAdminSettings
      .mockResolvedValueOnce({ openrouterApiKey: "old-key" })
      .mockResolvedValueOnce({ openrouterApiKey: null });
    mockTauri.getDefaultSystemPrompts.mockResolvedValue({ canvasAgent: "", promptEnhancer: "" });

    await client.putAdminSettings("http://localhost", {
      openrouterApiKey: null,
    });

    expect(mockTauri.updateAdminSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        openrouterApiKey: null,
      })
    );
  });

  it("updates canvas agent settings", async () => {
    mockTauri.getAdminSettings
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ canvasAgentModel: "custom/model", canvasAgentTemperature: 0.5 });
    mockTauri.getDefaultSystemPrompts.mockResolvedValue({ canvasAgent: "", promptEnhancer: "" });

    const result = await client.putAdminSettings("http://localhost", {
      canvasAgentModel: "custom/model",
      canvasAgentTemperature: 0.5,
    });

    expect(mockTauri.updateAdminSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        canvasAgentModel: "custom/model",
        canvasAgentTemperature: 0.5,
      })
    );
    expect(result.canvasAgentModelEffective).toBe("custom/model");
  });

  it("updates prompt enhancer settings", async () => {
    mockTauri.getAdminSettings
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ promptEnhancerModel: "custom/enhancer", promptEnhancerSystemPrompt: "Be creative" });
    mockTauri.getDefaultSystemPrompts.mockResolvedValue({ canvasAgent: "", promptEnhancer: "" });

    await client.putAdminSettings("http://localhost", {
      promptEnhancerModel: "custom/enhancer",
      promptEnhancerSystemPrompt: "Be creative",
    });

    expect(mockTauri.updateAdminSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        promptEnhancerModel: "custom/enhancer",
        promptEnhancerSystemPrompt: "Be creative",
      })
    );
  });
});

// ── removeBackground edge cases ──

describe("removeBackground edge cases", () => {
  it("includes asset type from returned asset", async () => {
    mockTauri.removeBackground.mockResolvedValueOnce({ id: "a3", url: "/bg.png", type: "custom_type" });
    const result = await client.removeBackground("http://localhost", "gen-2", { itemIndex: 0 });
    expect(result.asset.type).toBe("custom_type");
  });

  it("defaults asset type to rembg when not in returned asset", async () => {
    mockTauri.removeBackground.mockResolvedValueOnce({ id: "a4", url: "/bg2.png" });
    const result = await client.removeBackground("http://localhost", "gen-3", { itemIndex: 1 });
    expect(result.asset.type).toBe("rembg");
  });
});

// ── createWorkflowFromModel additional cases ──

describe("createWorkflowFromModel edge cases", () => {
  it("uses title as fallback when name is missing", async () => {
    mockTauri.getProviderModelDetail.mockResolvedValueOnce({
      title: "Model Title",
    });
    const result = await client.createWorkflowFromModel("http://localhost", "replicate", "owner/model");
    expect(result.workflow.label).toBe("Model Title");
  });

  it("sets replicateModel in meta for replicate provider", async () => {
    mockTauri.getProviderModelDetail.mockResolvedValueOnce({ name: "Rep Model" });
    await client.createWorkflowFromModel("http://localhost", "replicate", "owner/model");
    expect(mockTauri.upsertWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          replicateModel: "owner/model",
        }),
      })
    );
  });

  it("does not set replicateModel for non-replicate providers", async () => {
    mockTauri.getProviderModelDetail.mockResolvedValueOnce({ name: "Fal Model" });
    await client.createWorkflowFromModel("http://localhost", "fal", "fal-ai/sdxl");
    const calledWith = mockTauri.upsertWorkflow.mock.calls[0][0];
    expect(calledWith.meta.replicateModel).toBeUndefined();
  });
});

// ── getReplicateModelParameters — schema conversion branch ──

describe("getReplicateModelParameters schema conversion", () => {
  it("converts schema to parameters when raw has no parameters field", async () => {
    mockTauri.getReplicateModelParameters.mockResolvedValueOnce({
      input: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "The prompt" },
          steps: { type: "integer", description: "Number of steps", default: 20 },
        },
      },
      readme: "Some readme",
      description: "A model description",
    });
    const result = await client.getReplicateModelParameters("http://localhost", "owner/model");
    expect(result).toHaveProperty("parameters");
    expect(result.readme).toBe("Some readme");
    expect(result.description).toBe("A model description");
  });

  it("uses raw itself as inputSchema when input field is missing", async () => {
    mockTauri.getReplicateModelParameters.mockResolvedValueOnce({
      type: "object",
      properties: {
        prompt: { type: "string" },
      },
    });
    const result = await client.getReplicateModelParameters("http://localhost", "owner/model");
    expect(result).toHaveProperty("parameters");
    expect(result.readme).toBeNull();
    expect(result.description).toBeNull();
  });

  it("passes definitions to convertSchemaToParameters", async () => {
    mockTauri.getReplicateModelParameters.mockResolvedValueOnce({
      input: { type: "object", properties: {} },
      definitions: { MyType: { type: "string" } },
      readme: null,
    });
    const result = await client.getReplicateModelParameters("http://localhost", "owner/model");
    expect(result).toHaveProperty("parameters");
  });
});

// ── getFalModelParameters — schema conversion branch ──

describe("getFalModelParameters schema conversion", () => {
  it("converts schema to parameters when raw has no parameters field", async () => {
    mockTauri.getFalModelParameters.mockResolvedValueOnce({
      input: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          guidance_scale: { type: "number", default: 7.5 },
        },
      },
      description: "FAL model desc",
    });
    const result = await client.getFalModelParameters("http://localhost", "fal-ai/sdxl");
    expect(result).toHaveProperty("parameters");
    expect(result.readme).toBeNull();
    expect(result.description).toBe("FAL model desc");
  });

  it("uses raw itself as inputSchema when input field is missing", async () => {
    mockTauri.getFalModelParameters.mockResolvedValueOnce({
      type: "object",
      properties: { seed: { type: "integer" } },
    });
    const result = await client.getFalModelParameters("http://localhost", "fal-ai/test");
    expect(result).toHaveProperty("parameters");
    expect(result.readme).toBeNull();
  });

  it("passes definitions to convertSchemaToParameters", async () => {
    mockTauri.getFalModelParameters.mockResolvedValueOnce({
      input: { type: "object", properties: {} },
      definitions: { SomeType: { type: "number" } },
    });
    const result = await client.getFalModelParameters("http://localhost", "fal-ai/test");
    expect(result).toHaveProperty("parameters");
  });
});

// ── streamCanvasChat ──

describe("streamCanvasChat", () => {
  it("returns a Response with SSE content type", async () => {
    // Mock @tauri-apps/api/event
    const listenCallbacks: Array<(event: any) => void> = [];
    vi.doMock("@tauri-apps/api/event", () => ({
      listen: vi.fn((_eventName: string, cb: (event: any) => void) => {
        listenCallbacks.push(cb);
        // Simulate done event after a tick
        setTimeout(() => {
          cb({ payload: { type: "content", text: "hello" } });
          cb({ payload: { type: "done" } });
        }, 10);
        return Promise.resolve(() => {});
      }),
    }));

    mockTauri.canvasChat.mockResolvedValueOnce(undefined);

    const result = await client.streamCanvasChat("http://localhost", {
      canvasWorkflowId: "wf-chat",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(200);
    expect(result.headers.get("Content-Type")).toBe("text/event-stream");

    vi.doUnmock("@tauri-apps/api/event");
  });
});

// ── listCanvasesAsync (through getMyGenerations re-verification) ──

describe("getGallery edge cases", () => {
  it("returns items from tauri result", async () => {
    const items = [{ id: "item1" }, { id: "item2" }];
    mockTauri.listGallery.mockResolvedValueOnce({ items, nextCursor: "c2" });
    const result = await client.getGallery("http://localhost", {});
    expect(result.items).toEqual(items);
    expect(result.nextCursor).toBe("c2");
  });

  it("handles missing nextCursor as null", async () => {
    mockTauri.listGallery.mockResolvedValueOnce({ items: [] });
    const result = await client.getGallery("http://localhost", {});
    expect(result.nextCursor).toBeNull();
  });

  it("passes undefined for missing optional params", async () => {
    await client.getGallery("http://localhost", {});
    expect(mockTauri.listGallery).toHaveBeenCalledWith({
      workflowId: undefined,
      modelId: undefined,
      query: undefined,
      limit: undefined,
      cursor: undefined,
    });
  });
});

// ── streamCanvasChat ──

describe("streamCanvasChat", () => {
  let capturedListener: ((event: any) => void) | null;
  let mockUnlisten: ReturnType<typeof vi.fn>;
  let randomUUIDSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    capturedListener = null;
    mockUnlisten = vi.fn();
    randomUUIDSpy = vi.spyOn(crypto, "randomUUID").mockReturnValue("request-1" as `${string}-${string}-${string}-${string}-${string}`);
    vi.doMock("@tauri-apps/api/event", () => ({
      listen: vi.fn(async (_eventName: string, handler: any) => {
        capturedListener = handler;
        return mockUnlisten;
      }),
    }));
    mockTauri.canvasChat.mockResolvedValue(undefined);
  });

  afterEach(() => {
    randomUUIDSpy.mockRestore();
    vi.doUnmock("@tauri-apps/api/event");
  });

  async function callStreamAndGetReader() {
    const response = await client.streamCanvasChat("http://localhost" as any, {
      canvasWorkflowId: "wf-1",
      messages: [{ role: "user", content: "hello" }],
    });
    expect(response.status).toBe(200);
    return response.body!.getReader();
  }

  function fireEvent(payload: Record<string, any>) {
    if (!capturedListener) throw new Error("No listener registered");
    capturedListener({ payload: { requestId: "request-1", ...payload } });
  }

  it("returns a Response with SSE content type", async () => {
    const response = await client.streamCanvasChat("http://localhost" as any, {
      canvasWorkflowId: "wf-1",
      messages: [],
    });
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("emits content events as SSE data", async () => {
    const reader = await callStreamAndGetReader();

    fireEvent({ type: "content", text: "Hello world" });
    fireEvent({ type: "done" });

    const chunks: string[] = [];
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }

    const combined = chunks.join("");
    expect(combined).toContain('"content":"Hello world"');
    expect(combined).toContain('"finish_reason":"stop"');
  });

  it("passes a request id and filters events from other canvas chat requests", async () => {
    const reader = await callStreamAndGetReader();

    expect(mockTauri.canvasChat).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "request-1",
    }));

    fireEvent({ requestId: "other-request", type: "content", text: "ignored" });
    fireEvent({ requestId: "request-1", type: "content", text: "kept" });
    fireEvent({ requestId: "request-1", type: "done" });

    const decoder = new TextDecoder();
    const chunks: string[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }
    const combined = chunks.join("");
    expect(combined).toContain('"content":"kept"');
    expect(combined).not.toContain("ignored");
  });

  it("cancels the backend request and removes the listener when the stream is cancelled", async () => {
    const reader = await callStreamAndGetReader();

    await reader.cancel();

    expect(mockTauri.cancelCanvasChat).toHaveBeenCalledWith("request-1");
    expect(mockUnlisten).toHaveBeenCalled();
  });

  it("emits tool_call events", async () => {
    const reader = await callStreamAndGetReader();
    const toolCall = { name: "generate", arguments: "{}" };

    fireEvent({ type: "tool_call", toolCall });
    fireEvent({ type: "done" });

    const decoder = new TextDecoder();
    const chunks: string[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }
    expect(chunks.join("")).toContain('"tool_call"');
  });

  it("emits finish events", async () => {
    const reader = await callStreamAndGetReader();

    fireEvent({ type: "finish", text: "length" });
    fireEvent({ type: "done" });

    const decoder = new TextDecoder();
    const chunks: string[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }
    expect(chunks.join("")).toContain('"finish_reason":"length"');
  });

  it("emits error events", async () => {
    const reader = await callStreamAndGetReader();

    fireEvent({ type: "error", error: "Something went wrong" });
    fireEvent({ type: "done" });

    const decoder = new TextDecoder();
    const chunks: string[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }
    expect(chunks.join("")).toContain('"message":"Something went wrong"');
  });

  it("closes stream and calls unlisten on done event", async () => {
    const reader = await callStreamAndGetReader();

    fireEvent({ type: "done" });

    const { done } = await reader.read();
    // After done chunk, next read should be done
    if (!done) {
      const next = await reader.read();
      expect(next.done).toBe(true);
    }
    expect(mockUnlisten).toHaveBeenCalled();
  });

  it("handles canvasChat error by emitting error SSE and closing stream", async () => {
    mockTauri.canvasChat.mockRejectedValueOnce(new Error("chat failed"));

    const response = await client.streamCanvasChat("http://localhost" as any, {
      canvasWorkflowId: "wf-1",
      messages: [{ role: "user", content: "hello" }],
    });
    expect(response.status).toBe(200);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }
    const combined = chunks.join("");
    expect(combined).toContain('"message"');
    expect(combined).toContain("chat failed");
  });
});

