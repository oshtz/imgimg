import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: any[]) => mockListen(...args),
}));

import {
  isTauri,
  getHealth,
  getProviderStatus,
  getCurrentUser,
  listWorkflows,
  getWorkflow,
  getWorkflowTemplate,
  upsertWorkflow,
  deleteWorkflow,
  getPinnedWorkflows,
  pinWorkflow,
  unpinWorkflow,
  getWorkflowOrganization,
  reorderWorkflowItems,
  createWorkflowFolder,
  renameWorkflowFolder,
  deleteWorkflowFolder,
  reorderWorkflowFolders,
  createGeneration,
  getGeneration,
  listGenerations,
  deleteGeneration,
  getAssetVersions,
  setActiveAssetVersion,
  regenerateItem,
  createInpaint,
  downloadGenerationAssetsZip,
  removeBackground,
  listGallery,
  listGalleryUsers,
  listCanvases,
  createCanvas,
  renameCanvas,
  deleteCanvas,
  getCanvasState,
  saveCanvasState,
  canvasChat,
  cancelCanvasChat,
  listChatThreads,
  getChatThread,
  saveChatThread,
  deleteChatThread,
  getAdminSettings,
  getFeatureWorkflowConfig,
  getDefaultSystemPrompts,
  updateAdminSettings,
  getOpenrouterApiKey,
  setOpenrouterApiKey,
  getReplicateApiKey,
  setReplicateApiKey,
  getFalApiKey,
  setFalApiKey,
  getKieApiKey,
  setKieApiKey,
  listAvailableLoras,
  getLoraSettings,
  updateLoraSettings,
  searchProviderModels,
  getProviderModelDetail,
  getReplicateModelParameters,
  getFalModelParameters,
  getPresets,
  getAllPresets,
  setPresets,
  upsertPreset,
  deletePreset,
  listAssetTypes,
  getAssetType,
  createAssetType,
  updateAssetType,
  deleteAssetType,
  listEnhancerPresets,
  getEnhancerPreset,
  upsertEnhancerPreset,
  deleteEnhancerPreset,
  setActiveEnhancerPreset,
  enhancePrompt,
  streamEnhancedPrompt,
  exploreVariants,
  getStorageBasePath,
  getStorageFile,
  openStorageFolder,
  openExternalUrl,
  uploadToStorage,
  getAppInfo,
  checkPortableUpdate,
  installPortableUpdate,
  getCompareModels,
  getCompareGroups,
} from "../tauri-api";

beforeEach(() => {
  mockInvoke.mockReset();
  mockListen.mockReset();
});

// ──────────── Detection ────────────

describe("isTauri", () => {
  it("returns true when __TAURI_INTERNALS__ is present", () => {
    (globalThis as any).window = { __TAURI_INTERNALS__: {} };
    expect(isTauri()).toBe(true);
  });

  it("returns false when __TAURI_INTERNALS__ is not present", () => {
    (globalThis as any).window = {};
    expect(isTauri()).toBe(false);
  });
});

// ──────────── Health ────────────

describe("Health", () => {
  it("getHealth calls health_check and returns ok", async () => {
    mockInvoke.mockResolvedValue({ status: "ok", version: "1.0", database: "up" });
    const result = await getHealth();
    expect(mockInvoke).toHaveBeenCalledWith("health_check");
    expect(result).toEqual({ ok: true });
  });

  it("getProviderStatus calls get_provider_status", async () => {
    const data = { fal: true, replicate: false };
    mockInvoke.mockResolvedValue(data);
    const result = await getProviderStatus();
    expect(mockInvoke).toHaveBeenCalledWith("get_provider_status");
    expect(result).toEqual(data);
  });
});

// ──────────── User ────────────

describe("User", () => {
  it("getCurrentUser returns hardcoded local user", () => {
    const user = getCurrentUser();
    expect(user).toEqual({
      id: "local-user",
      email: "user@imgimg.local",
      role: "admin",
    });
  });
});

// ──────────── Workflows ────────────

describe("Workflows", () => {
  it("listWorkflows calls list_workflows", async () => {
    mockInvoke.mockResolvedValue([]);
    const result = await listWorkflows();
    expect(mockInvoke).toHaveBeenCalledWith("list_workflows");
    expect(result).toEqual([]);
  });

  it("getWorkflow calls get_workflow with workflowId", async () => {
    mockInvoke.mockResolvedValue({ id: "w1" });
    const result = await getWorkflow("w1");
    expect(mockInvoke).toHaveBeenCalledWith("get_workflow", { workflowId: "w1" });
    expect(result).toEqual({ id: "w1" });
  });

  it("getWorkflowTemplate calls get_workflow_template with workflowId", async () => {
    mockInvoke.mockResolvedValue({ template: true });
    const result = await getWorkflowTemplate("w1");
    expect(mockInvoke).toHaveBeenCalledWith("get_workflow_template", { workflowId: "w1" });
    expect(result).toEqual({ template: true });
  });

  it("upsertWorkflow calls upsert_workflow with workflow", async () => {
    const wf = { id: "w1", label: "Test", meta: {}, template: {} };
    mockInvoke.mockResolvedValue(undefined);
    await upsertWorkflow(wf);
    expect(mockInvoke).toHaveBeenCalledWith("upsert_workflow", { workflow: wf });
  });

  it("deleteWorkflow calls delete_workflow with workflowId", async () => {
    mockInvoke.mockResolvedValue(true);
    const result = await deleteWorkflow("w1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_workflow", { workflowId: "w1" });
    expect(result).toBe(true);
  });
});

// ──────────── Workflow Organization ────────────

describe("Workflow Organization", () => {
  it("getPinnedWorkflows calls get_pinned_workflows", async () => {
    mockInvoke.mockResolvedValue(["w1", "w2"]);
    const result = await getPinnedWorkflows();
    expect(mockInvoke).toHaveBeenCalledWith("get_pinned_workflows");
    expect(result).toEqual(["w1", "w2"]);
  });

  it("pinWorkflow calls pin_workflow", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await pinWorkflow("w1");
    expect(mockInvoke).toHaveBeenCalledWith("pin_workflow", { workflowId: "w1" });
  });

  it("unpinWorkflow calls unpin_workflow", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await unpinWorkflow("w1");
    expect(mockInvoke).toHaveBeenCalledWith("unpin_workflow", { workflowId: "w1" });
  });

  it("getWorkflowOrganization calls get_workflow_organization", async () => {
    mockInvoke.mockResolvedValue({ folders: [] });
    const result = await getWorkflowOrganization();
    expect(mockInvoke).toHaveBeenCalledWith("get_workflow_organization");
    expect(result).toEqual({ folders: [] });
  });

  it("reorderWorkflowItems calls reorder_workflow_items", async () => {
    const items = [{ workflowId: "a", folderId: null, sortOrder: 0 }];
    mockInvoke.mockResolvedValue(undefined);
    await reorderWorkflowItems(items);
    expect(mockInvoke).toHaveBeenCalledWith("reorder_workflow_items", { items });
  });

  it("createWorkflowFolder calls create_workflow_folder", async () => {
    mockInvoke.mockResolvedValue({ id: "f1", name: "Folder" });
    const result = await createWorkflowFolder("Folder");
    expect(mockInvoke).toHaveBeenCalledWith("create_workflow_folder", { name: "Folder" });
    expect(result).toEqual({ id: "f1", name: "Folder" });
  });

  it("renameWorkflowFolder calls rename_workflow_folder", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await renameWorkflowFolder("f1", "New Name");
    expect(mockInvoke).toHaveBeenCalledWith("rename_workflow_folder", { folderId: "f1", name: "New Name" });
  });

  it("deleteWorkflowFolder calls delete_workflow_folder", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await deleteWorkflowFolder("f1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_workflow_folder", { folderId: "f1" });
  });

  it("reorderWorkflowFolders calls reorder_workflow_folders", async () => {
    const folders: [string, number][] = [["f1", 0], ["f2", 1]];
    mockInvoke.mockResolvedValue(undefined);
    await reorderWorkflowFolders(folders);
    expect(mockInvoke).toHaveBeenCalledWith("reorder_workflow_folders", { folders });
  });
});

// ──────────── Generations ────────────

describe("Generations", () => {
  it("createGeneration calls create_generation with input", async () => {
    const input = { prompt: "a cat", workflowId: "w1" };
    const gen = { id: "g1", prompt: "a cat" };
    mockInvoke.mockResolvedValue(gen);
    const result = await createGeneration(input);
    expect(mockInvoke).toHaveBeenCalledWith("create_generation", { input });
    expect(result).toEqual(gen);
  });

  it("getGeneration calls get_generation with id", async () => {
    mockInvoke.mockResolvedValue({ id: "g1" });
    const result = await getGeneration("g1");
    expect(mockInvoke).toHaveBeenCalledWith("get_generation", { id: "g1" });
    expect(result).toEqual({ id: "g1" });
  });

  it("listGenerations calls list_generations", async () => {
    mockInvoke.mockResolvedValue([]);
    const result = await listGenerations();
    expect(mockInvoke).toHaveBeenCalledWith("list_generations");
    expect(result).toEqual([]);
  });

  it("deleteGeneration calls delete_generation with id", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await deleteGeneration("g1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_generation", { id: "g1" });
  });

  it("getAssetVersions calls get_asset_versions with correct args", async () => {
    mockInvoke.mockResolvedValue([]);
    const result = await getAssetVersions("g1", "image", 0);
    expect(mockInvoke).toHaveBeenCalledWith("get_asset_versions", {
      generationId: "g1",
      assetType: "image",
      itemIndex: 0,
    });
    expect(result).toEqual([]);
  });

  it("getAssetVersions passes null itemIndex", async () => {
    mockInvoke.mockResolvedValue([]);
    await getAssetVersions("g1", "image", null);
    expect(mockInvoke).toHaveBeenCalledWith("get_asset_versions", {
      generationId: "g1",
      assetType: "image",
      itemIndex: null,
    });
  });

  it("setActiveAssetVersion calls set_active_asset_version", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await setActiveAssetVersion("g1", "a1");
    expect(mockInvoke).toHaveBeenCalledWith("set_active_asset_version", {
      generationId: "g1",
      assetId: "a1",
    });
  });

  it("regenerateItem calls regenerate_item with defaults as null", async () => {
    mockInvoke.mockResolvedValue({ id: "asset1" });
    const result = await regenerateItem("g1");
    expect(mockInvoke).toHaveBeenCalledWith("regenerate_item", {
      generationId: "g1",
      itemIndex: null,
      assetType: null,
      seed: null,
    });
    expect(result).toEqual({ id: "asset1" });
  });

  it("regenerateItem passes provided values", async () => {
    mockInvoke.mockResolvedValue({ id: "asset1" });
    await regenerateItem("g1", 2, "image", 42);
    expect(mockInvoke).toHaveBeenCalledWith("regenerate_item", {
      generationId: "g1",
      itemIndex: 2,
      assetType: "image",
      seed: 42,
    });
  });

  it("createInpaint calls create_inpaint with null coalescing", async () => {
    mockInvoke.mockResolvedValue({ id: "asset1" });
    const result = await createInpaint("g1", "image", undefined, "fix this", undefined, "data:img", "data:mask");
    expect(mockInvoke).toHaveBeenCalledWith("create_inpaint", {
      generationId: "g1",
      assetType: "image",
      itemIndex: null,
      prompt: "fix this",
      seed: null,
      imageDataUrl: "data:img",
      maskDataUrl: "data:mask",
    });
    expect(result).toEqual({ id: "asset1" });
  });

  it("downloadGenerationAssetsZip calls download_generation_assets_zip", async () => {
    mockInvoke.mockResolvedValue([1, 2, 3]);
    const result = await downloadGenerationAssetsZip("g1");
    expect(mockInvoke).toHaveBeenCalledWith("download_generation_assets_zip", { generationId: "g1" });
    expect(result).toEqual([1, 2, 3]);
  });

  it("removeBackground calls remove_background", async () => {
    const wf = { type: "bg-remove" };
    mockInvoke.mockResolvedValue({ id: "asset1" });
    const result = await removeBackground("g1", 0, wf);
    expect(mockInvoke).toHaveBeenCalledWith("remove_background", {
      generationId: "g1",
      itemIndex: 0,
      workflow: wf,
    });
    expect(result).toEqual({ id: "asset1" });
  });
});

// ──────────── Gallery ────────────

describe("Gallery", () => {
  it("listGallery calls list_gallery with params", async () => {
    const params = { workflowId: "w1", limit: 10 };
    const response = { items: [], nextCursor: null };
    mockInvoke.mockResolvedValue(response);
    const result = await listGallery(params);
    expect(mockInvoke).toHaveBeenCalledWith("list_gallery", { params });
    expect(result).toEqual(response);
  });

  it("listGalleryUsers calls list_gallery_users", async () => {
    mockInvoke.mockResolvedValue(["user1"]);
    const result = await listGalleryUsers();
    expect(mockInvoke).toHaveBeenCalledWith("list_gallery_users");
    expect(result).toEqual(["user1"]);
  });
});

// ──────────── Canvas ────────────

describe("Canvas", () => {
  it("listCanvases calls list_canvases", async () => {
    mockInvoke.mockResolvedValue([]);
    const result = await listCanvases();
    expect(mockInvoke).toHaveBeenCalledWith("list_canvases");
    expect(result).toEqual([]);
  });

  it("createCanvas calls create_canvas with id and name", async () => {
    const canvas = { id: "c1", name: "My Canvas", createdAt: "2024-01-01" };
    mockInvoke.mockResolvedValue(canvas);
    const result = await createCanvas("c1", "My Canvas");
    expect(mockInvoke).toHaveBeenCalledWith("create_canvas", { id: "c1", name: "My Canvas" });
    expect(result).toEqual(canvas);
  });

  it("renameCanvas calls rename_canvas", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await renameCanvas("c1", "Renamed");
    expect(mockInvoke).toHaveBeenCalledWith("rename_canvas", { id: "c1", name: "Renamed" });
  });

  it("deleteCanvas calls delete_canvas", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await deleteCanvas("c1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_canvas", { id: "c1" });
  });

  it("getCanvasState calls get_canvas_state with gameId", async () => {
    mockInvoke.mockResolvedValue({ nodes: [] });
    const result = await getCanvasState("game1");
    expect(mockInvoke).toHaveBeenCalledWith("get_canvas_state", { gameId: "game1" });
    expect(result).toEqual({ nodes: [] });
  });

  it("saveCanvasState calls save_canvas_state with params", async () => {
    const params = { nodes: [], chatMessages: [], nextZIndex: 1 };
    mockInvoke.mockResolvedValue(undefined);
    await saveCanvasState(params);
    expect(mockInvoke).toHaveBeenCalledWith("save_canvas_state", params);
  });

  it("canvasChat calls canvas_chat with params", async () => {
    const params = { requestId: "request-1", messages: [{ role: "user", content: "hi" }] };
    mockInvoke.mockResolvedValue("Hello!");
    const result = await canvasChat(params);
    expect(mockInvoke).toHaveBeenCalledWith("canvas_chat", params);
    expect(result).toBe("Hello!");
  });

  it("cancelCanvasChat calls cancel_canvas_chat with requestId", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await cancelCanvasChat("request-1");
    expect(mockInvoke).toHaveBeenCalledWith("cancel_canvas_chat", { requestId: "request-1" });
  });
});

// ──────────── Chat Threads ────────────

describe("Chat Threads", () => {
  it("listChatThreads calls list_chat_threads with canvasId", async () => {
    mockInvoke.mockResolvedValue([]);
    const result = await listChatThreads("c1");
    expect(mockInvoke).toHaveBeenCalledWith("list_chat_threads", { canvasId: "c1" });
    expect(result).toEqual([]);
  });

  it("getChatThread calls get_chat_thread with id", async () => {
    mockInvoke.mockResolvedValue({ id: "t1", title: "Thread" });
    const result = await getChatThread("t1");
    expect(mockInvoke).toHaveBeenCalledWith("get_chat_thread", { id: "t1" });
    expect(result).toEqual({ id: "t1", title: "Thread" });
  });

  it("saveChatThread calls save_chat_thread with params", async () => {
    const params = { id: "t1", canvasId: "c1", title: "Thread", messages: [] };
    mockInvoke.mockResolvedValue(undefined);
    await saveChatThread(params);
    expect(mockInvoke).toHaveBeenCalledWith("save_chat_thread", params);
  });

  it("deleteChatThread calls delete_chat_thread with id", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await deleteChatThread("t1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_chat_thread", { id: "t1" });
  });
});

// ──────────── Admin Settings ────────────

describe("Admin Settings", () => {
  it("getAdminSettings calls get_admin_settings", async () => {
    mockInvoke.mockResolvedValue({ theme: "dark" });
    const result = await getAdminSettings();
    expect(mockInvoke).toHaveBeenCalledWith("get_admin_settings");
    expect(result).toEqual({ theme: "dark" });
  });

  it("getFeatureWorkflowConfig calls get_feature_workflow_config", async () => {
    const cfg = { inpaintWorkflowId: "inp", outpaintWorkflowId: null, rembgWorkflowId: null };
    mockInvoke.mockResolvedValue(cfg);
    const result = await getFeatureWorkflowConfig();
    expect(mockInvoke).toHaveBeenCalledWith("get_feature_workflow_config");
    expect(result).toEqual(cfg);
  });

  it("getDefaultSystemPrompts calls get_default_system_prompts", async () => {
    mockInvoke.mockResolvedValue({ enhance: "You are..." });
    const result = await getDefaultSystemPrompts();
    expect(mockInvoke).toHaveBeenCalledWith("get_default_system_prompts");
    expect(result).toEqual({ enhance: "You are..." });
  });

  it("updateAdminSettings calls update_admin_settings with settings", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const settings = { canvasAgentModel: "gpt-4" };
    await updateAdminSettings(settings);
    expect(mockInvoke).toHaveBeenCalledWith("update_admin_settings", { settings });
  });

  it("getOpenrouterApiKey calls get_openrouter_api_key", async () => {
    mockInvoke.mockResolvedValue("sk-or-xxx");
    const result = await getOpenrouterApiKey();
    expect(mockInvoke).toHaveBeenCalledWith("get_openrouter_api_key");
    expect(result).toBe("sk-or-xxx");
  });

  it("setOpenrouterApiKey calls set_openrouter_api_key with value", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await setOpenrouterApiKey("sk-or-xxx");
    expect(mockInvoke).toHaveBeenCalledWith("set_openrouter_api_key", { value: "sk-or-xxx" });
  });

  it("setOpenrouterApiKey accepts null", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await setOpenrouterApiKey(null);
    expect(mockInvoke).toHaveBeenCalledWith("set_openrouter_api_key", { value: null });
  });

  it("getReplicateApiKey calls get_replicate_api_key", async () => {
    mockInvoke.mockResolvedValue("r8_xxx");
    const result = await getReplicateApiKey();
    expect(mockInvoke).toHaveBeenCalledWith("get_replicate_api_key");
    expect(result).toBe("r8_xxx");
  });

  it("setReplicateApiKey calls set_replicate_api_key", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await setReplicateApiKey("r8_xxx");
    expect(mockInvoke).toHaveBeenCalledWith("set_replicate_api_key", { value: "r8_xxx" });
  });

  it("getFalApiKey calls get_fal_api_key", async () => {
    mockInvoke.mockResolvedValue("fal-xxx");
    const result = await getFalApiKey();
    expect(mockInvoke).toHaveBeenCalledWith("get_fal_api_key");
    expect(result).toBe("fal-xxx");
  });

  it("setFalApiKey calls set_fal_api_key", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await setFalApiKey("fal-xxx");
    expect(mockInvoke).toHaveBeenCalledWith("set_fal_api_key", { value: "fal-xxx" });
  });

  it("getKieApiKey calls get_kie_api_key", async () => {
    mockInvoke.mockResolvedValue("kie-xxx");
    const result = await getKieApiKey();
    expect(mockInvoke).toHaveBeenCalledWith("get_kie_api_key");
    expect(result).toBe("kie-xxx");
  });

  it("setKieApiKey calls set_kie_api_key", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await setKieApiKey("kie-xxx");
    expect(mockInvoke).toHaveBeenCalledWith("set_kie_api_key", { value: "kie-xxx" });
  });
});

// ──────────── Models / LoRA ────────────

describe("Models", () => {
  it("listAvailableLoras calls list_available_loras", async () => {
    mockInvoke.mockResolvedValue(["lora1", "lora2"]);
    const result = await listAvailableLoras();
    expect(mockInvoke).toHaveBeenCalledWith("list_available_loras", {});
    expect(result).toEqual(["lora1", "lora2"]);
  });

  it("getLoraSettings calls get_lora_settings with gameId", async () => {
    mockInvoke.mockResolvedValue({ enabled: [] });
    const result = await getLoraSettings("game1");
    expect(mockInvoke).toHaveBeenCalledWith("get_lora_settings", { gameId: "game1" });
    expect(result).toEqual({ enabled: [] });
  });

  it("updateLoraSettings calls update_lora_settings with params", async () => {
    const params = { gameId: "g1", enabled: ["lora1"] };
    mockInvoke.mockResolvedValue(undefined);
    await updateLoraSettings(params);
    expect(mockInvoke).toHaveBeenCalledWith("update_lora_settings", params);
  });

  it("searchProviderModels calls search_provider_models", async () => {
    mockInvoke.mockResolvedValue({ models: [] });
    const result = await searchProviderModels("fal", "flux", 10, "cursor1");
    expect(mockInvoke).toHaveBeenCalledWith("search_provider_models", {
      provider: "fal",
      query: "flux",
      limit: 10,
      cursor: "cursor1",
    });
    expect(result).toEqual({ models: [] });
  });

  it("getProviderModelDetail calls get_provider_model_detail", async () => {
    mockInvoke.mockResolvedValue({ id: "m1" });
    const result = await getProviderModelDetail("replicate", "m1");
    expect(mockInvoke).toHaveBeenCalledWith("get_provider_model_detail", {
      provider: "replicate",
      modelId: "m1",
    });
    expect(result).toEqual({ id: "m1" });
  });

  it("getReplicateModelParameters calls get_replicate_model_parameters", async () => {
    mockInvoke.mockResolvedValue({ params: {} });
    const result = await getReplicateModelParameters("owner", "model");
    expect(mockInvoke).toHaveBeenCalledWith("get_replicate_model_parameters", {
      owner: "owner",
      name: "model",
    });
    expect(result).toEqual({ params: {} });
  });

  it("getFalModelParameters calls get_fal_model_parameters", async () => {
    mockInvoke.mockResolvedValue({ params: {} });
    const result = await getFalModelParameters("fal-ai/flux");
    expect(mockInvoke).toHaveBeenCalledWith("get_fal_model_parameters", {
      endpointId: "fal-ai/flux",
    });
    expect(result).toEqual({ params: {} });
  });
});

// ──────────── Presets ────────────

describe("Presets", () => {
  it("getPresets calls get_presets", async () => {
    mockInvoke.mockResolvedValue([]);
    const result = await getPresets();
    expect(mockInvoke).toHaveBeenCalledWith("get_presets");
    expect(result).toEqual([]);
  });

  it("getAllPresets calls get_all_presets", async () => {
    mockInvoke.mockResolvedValue({});
    const result = await getAllPresets();
    expect(mockInvoke).toHaveBeenCalledWith("get_all_presets");
    expect(result).toEqual({});
  });

  it("setPresets calls set_presets with gameId and presets", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await setPresets([{ id: "p1" }], "game1");
    expect(mockInvoke).toHaveBeenCalledWith("set_presets", { gameId: "game1", presets: [{ id: "p1" }] });
  });

  it("upsertPreset calls upsert_preset with gameId and preset", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await upsertPreset({ id: "p1", name: "My Preset" }, "game1");
    expect(mockInvoke).toHaveBeenCalledWith("upsert_preset", { gameId: "game1", preset: { id: "p1", name: "My Preset" } });
  });

  it("deletePreset calls delete_preset with gameId and presetId", async () => {
    mockInvoke.mockResolvedValue(true);
    const result = await deletePreset("p1", "game1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_preset", { gameId: "game1", presetId: "p1" });
    expect(result).toBe(true);
  });
});

// ──────────── Asset Types ────────────

describe("Asset Types", () => {
  it("listAssetTypes calls list_asset_types", async () => {
    mockInvoke.mockResolvedValue([]);
    const result = await listAssetTypes();
    expect(mockInvoke).toHaveBeenCalledWith("list_asset_types");
    expect(result).toEqual([]);
  });

  it("getAssetType calls get_asset_type with id", async () => {
    mockInvoke.mockResolvedValue({ id: "at1" });
    const result = await getAssetType("at1");
    expect(mockInvoke).toHaveBeenCalledWith("get_asset_type", { id: "at1" });
    expect(result).toEqual({ id: "at1" });
  });

  it("createAssetType calls create_asset_type with record", async () => {
    const record = { label: "Image" };
    mockInvoke.mockResolvedValue({ id: "at1", label: "Image" });
    const result = await createAssetType(record);
    expect(mockInvoke).toHaveBeenCalledWith("create_asset_type", { record });
    expect(result).toEqual({ id: "at1", label: "Image" });
  });

  it("updateAssetType calls update_asset_type with id and record", async () => {
    const record = { label: "Updated" };
    mockInvoke.mockResolvedValue({ id: "at1", label: "Updated" });
    const result = await updateAssetType("at1", record);
    expect(mockInvoke).toHaveBeenCalledWith("update_asset_type", { id: "at1", record });
    expect(result).toEqual({ id: "at1", label: "Updated" });
  });

  it("deleteAssetType calls delete_asset_type with id", async () => {
    mockInvoke.mockResolvedValue(true);
    const result = await deleteAssetType("at1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_asset_type", { id: "at1" });
    expect(result).toBe(true);
  });
});

// ──────────── Enhancer Presets ────────────

describe("Enhancer Presets", () => {
  it("listEnhancerPresets calls list_enhancer_presets", async () => {
    mockInvoke.mockResolvedValue([]);
    const result = await listEnhancerPresets();
    expect(mockInvoke).toHaveBeenCalledWith("list_enhancer_presets");
    expect(result).toEqual([]);
  });

  it("getEnhancerPreset calls get_enhancer_preset with id", async () => {
    mockInvoke.mockResolvedValue({ id: "ep1", name: "Default" });
    const result = await getEnhancerPreset("ep1");
    expect(mockInvoke).toHaveBeenCalledWith("get_enhancer_preset", { id: "ep1" });
    expect(result).toEqual({ id: "ep1", name: "Default" });
  });

  it("upsertEnhancerPreset calls upsert_enhancer_preset with preset", async () => {
    const preset = { name: "Custom", systemPrompt: "You are..." };
    mockInvoke.mockResolvedValue({ id: "ep1", ...preset });
    const result = await upsertEnhancerPreset(preset);
    expect(mockInvoke).toHaveBeenCalledWith("upsert_enhancer_preset", { preset });
    expect(result).toEqual({ id: "ep1", ...preset });
  });

  it("deleteEnhancerPreset calls delete_enhancer_preset with id", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await deleteEnhancerPreset("ep1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_enhancer_preset", { id: "ep1" });
  });

  it("setActiveEnhancerPreset calls set_active_enhancer_preset with id", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await setActiveEnhancerPreset("ep1");
    expect(mockInvoke).toHaveBeenCalledWith("set_active_enhancer_preset", { id: "ep1" });
  });
});

// ──────────── Prompts ────────────

describe("Prompts", () => {
  it("enhancePrompt calls enhance_prompt with prompt and model", async () => {
    mockInvoke.mockResolvedValue("enhanced prompt");
    const result = await enhancePrompt("a cat", "gpt-4");
    expect(mockInvoke).toHaveBeenCalledWith("enhance_prompt", { prompt: "a cat", model: "gpt-4" });
    expect(result).toBe("enhanced prompt");
  });

  it("enhancePrompt calls enhance_prompt without model", async () => {
    mockInvoke.mockResolvedValue("enhanced prompt");
    const result = await enhancePrompt("a cat");
    expect(mockInvoke).toHaveBeenCalledWith("enhance_prompt", { prompt: "a cat", model: undefined });
    expect(result).toBe("enhanced prompt");
  });

  it("exploreVariants calls explore_variants with all args", async () => {
    mockInvoke.mockResolvedValue(["v1", "v2"]);
    const result = await exploreVariants("a cat", 3, 0.8);
    expect(mockInvoke).toHaveBeenCalledWith("explore_variants", { prompt: "a cat", count: 3, creativity: 0.8 });
    expect(result).toEqual(["v1", "v2"]);
  });

  describe("streamEnhancedPrompt", () => {
    it("calls listen and invoke with requestId, returns result", async () => {
      // Mock crypto.randomUUID
      const mockUUID = "test-uuid-1234";
      vi.spyOn(crypto, "randomUUID").mockReturnValue(mockUUID as `${string}-${string}-${string}-${string}-${string}`);

      const mockUnlisten = vi.fn();
      mockListen.mockResolvedValue(mockUnlisten);
      mockInvoke.mockResolvedValue("final enhanced result");

      const onChunk = vi.fn();
      const result = await streamEnhancedPrompt("a cat", onChunk);

      // Verify listen was called with correct event name
      expect(mockListen).toHaveBeenCalledWith("prompt-enhance-chunk", expect.any(Function));

      // Verify invoke was called with prompt and requestId
      expect(mockInvoke).toHaveBeenCalledWith("enhance_prompt", {
        prompt: "a cat",
        requestId: mockUUID,
      });

      // Verify unlisten was called in finally block
      expect(mockUnlisten).toHaveBeenCalled();

      // Verify return value
      expect(result).toBe("final enhanced result");

      vi.restoreAllMocks();
    });

    it("calls unlisten even if invoke throws", async () => {
      const mockUUID = "test-uuid-5678";
      vi.spyOn(crypto, "randomUUID").mockReturnValue(mockUUID as `${string}-${string}-${string}-${string}-${string}`);

      const mockUnlisten = vi.fn();
      mockListen.mockResolvedValue(mockUnlisten);
      mockInvoke.mockRejectedValue(new Error("invoke failed"));

      const onChunk = vi.fn();
      await expect(streamEnhancedPrompt("a cat", onChunk)).rejects.toThrow("invoke failed");
      expect(mockUnlisten).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it("listener processes chunks and filters by requestId", async () => {
      const mockUUID = "matching-uuid";
      vi.spyOn(crypto, "randomUUID").mockReturnValue(mockUUID as `${string}-${string}-${string}-${string}-${string}`);

      let capturedCallback: Function;
      const mockUnlisten = vi.fn();
      mockListen.mockImplementation((_event: string, cb: Function) => {
        capturedCallback = cb;
        return Promise.resolve(mockUnlisten);
      });
      mockInvoke.mockResolvedValue("final");

      const onChunk = vi.fn();
      const resultPromise = streamEnhancedPrompt("a cat", onChunk);

      // Simulate chunk from different requestId - should be ignored
      capturedCallback!({ payload: { requestId: "other-uuid", chunk: "ignored" } });
      expect(onChunk).not.toHaveBeenCalled();

      // Simulate chunk from matching requestId
      capturedCallback!({ payload: { requestId: mockUUID, chunk: "Hello " } });
      expect(onChunk).toHaveBeenCalledWith("Hello ");

      capturedCallback!({ payload: { requestId: mockUUID, chunk: "world" } });
      expect(onChunk).toHaveBeenCalledWith("Hello world");

      // Simulate done event
      capturedCallback!({ payload: { requestId: mockUUID, done: true, result: "Hello world final" } });

      const result = await resultPromise;
      expect(result).toBe("final");

      vi.restoreAllMocks();
    });
  });
});

// ──────────── Storage ────────────

describe("Storage", () => {
  it("getStorageBasePath calls get_storage_base_path", async () => {
    mockInvoke.mockResolvedValue("/home/user/.imgimg");
    const result = await getStorageBasePath();
    expect(mockInvoke).toHaveBeenCalledWith("get_storage_base_path");
    expect(result).toBe("/home/user/.imgimg");
  });

  it("getStorageFile calls get_storage_file with url", async () => {
    mockInvoke.mockResolvedValue([255, 216, 255]);
    const result = await getStorageFile("/images/test.png");
    expect(mockInvoke).toHaveBeenCalledWith("get_storage_file", { url: "/images/test.png" });
    expect(result).toEqual([255, 216, 255]);
  });

  it("openStorageFolder calls open_storage_folder", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await openStorageFolder();
    expect(mockInvoke).toHaveBeenCalledWith("open_storage_folder");
  });

  it("openExternalUrl calls open_external_url with the url", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await openExternalUrl("https://example.com");
    expect(mockInvoke).toHaveBeenCalledWith("open_external_url", { url: "https://example.com" });
  });

  it("uploadToStorage calls upload_to_storage with all args", async () => {
    mockInvoke.mockResolvedValue("/uploads/file.png");
    const result = await uploadToStorage("g1", "file.png", [1, 2, 3]);
    expect(mockInvoke).toHaveBeenCalledWith("upload_to_storage", {
      generationId: "g1",
      filename: "file.png",
      data: [1, 2, 3],
    });
    expect(result).toBe("/uploads/file.png");
  });
});

describe("App metadata", () => {
  it("getAppInfo calls get_app_info", async () => {
    const data = { name: "imgimg", version: "0.1.0", platform: "windows-portable" };
    mockInvoke.mockResolvedValue(data);

    const result = await getAppInfo();

    expect(mockInvoke).toHaveBeenCalledWith("get_app_info");
    expect(result).toEqual(data);
  });
});

// ──────────── Portable updater ────────────

describe("Portable updater", () => {
  it("checkPortableUpdate calls check_portable_update", async () => {
    const data = {
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      updateAvailable: true,
      releaseUrl: "https://github.com/oshtz/imgimg/releases/tag/v0.2.0",
      assetName: "imgimg-Portable.exe",
      downloadUrl: "https://github.com/oshtz/imgimg/releases/download/v0.2.0/imgimg-Portable.exe",
      body: "release notes",
    };
    mockInvoke.mockResolvedValue(data);

    const result = await checkPortableUpdate();

    expect(mockInvoke).toHaveBeenCalledWith("check_portable_update");
    expect(result).toEqual(data);
  });

  it("installPortableUpdate passes the portable exe download URL", async () => {
    mockInvoke.mockResolvedValue(undefined);

    await installPortableUpdate("https://github.com/oshtz/imgimg/releases/download/v0.2.0/imgimg-Portable.exe");

    expect(mockInvoke).toHaveBeenCalledWith("install_portable_update", {
      downloadUrl: "https://github.com/oshtz/imgimg/releases/download/v0.2.0/imgimg-Portable.exe",
    });
  });
});

// ──────────── Compare ────────────

describe("Compare", () => {
  it("getCompareModels calls get_compare_models", async () => {
    const data = { models: [], providerStatus: {} };
    mockInvoke.mockResolvedValue(data);
    const result = await getCompareModels();
    expect(mockInvoke).toHaveBeenCalledWith("get_compare_models");
    expect(result).toEqual(data);
  });

  it("getCompareGroups calls get_compare_groups", async () => {
    const data = { groups: [] };
    mockInvoke.mockResolvedValue(data);
    const result = await getCompareGroups();
    expect(mockInvoke).toHaveBeenCalledWith("get_compare_groups");
    expect(result).toEqual(data);
  });
});
