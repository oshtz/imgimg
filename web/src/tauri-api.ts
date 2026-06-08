/**
 * Tauri API adapter -- all backend operations go through Tauri invoke().
 *
 * Instead of HTTP fetch() calls to the Express backend, this module uses
 * Tauri's invoke() to call Rust #[tauri::command] functions directly.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Asset, CurrentUser, Generation, Model } from "./types";
import type {
  AdminAssetType,
  CanvasStateResponse,
  DiscoveredModel,
  ProviderStatus,
  UserPreset,
  WorkflowFolder,
  WorkflowOrganization,
  WorkflowSummary,
} from "./api";

// ──────────── Detection ────────────

/** Returns true when running inside Tauri. */
export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

// ──────────── Health ────────────

export async function getHealth() {
  const result = await invoke<{
    status: string;
    version: string;
    database: string;
  }>("health_check");
  return { ok: true };
}

export async function getProviderStatus() {
  return invoke<ProviderStatus>("get_provider_status");
}

// ──────────── User ────────────

export function getCurrentUser(): CurrentUser {
  return { id: "local-user", email: "user@imgimg.local", role: "admin" };
}

// ──────────── Workflows ────────────

export async function listWorkflows() {
  return invoke<WorkflowSummary[]>("list_workflows");
}

export async function getWorkflow(workflowId: string) {
  return invoke<WorkflowSummary | null>("get_workflow", { workflowId });
}

export type WorkflowTemplateUi = {
  aspectRatio?: unknown;
  batchSize?: unknown;
  canvasMode?: unknown;
};

export type WorkflowTemplateMeta = Record<string, unknown> & {
  label?: string;
  outputMode?: "single_image" | "full_set" | "layered_image" | "single_audio";
  ui?: WorkflowTemplateUi;
};

export type WorkflowTemplateRecord = {
  id?: string;
  label?: string;
  outputMode?: "single_image" | "full_set" | "layered_image" | "single_audio";
  meta?: WorkflowTemplateMeta;
  template?: Record<string, unknown>;
  prompt?: Record<string, unknown>;
};

export type JsonObject = Record<string, unknown>;

export type PresetRecord = Partial<UserPreset> & JsonObject;
export type AssetTypeRecord = Partial<AdminAssetType> & JsonObject;

export async function getWorkflowTemplate(workflowId: string) {
  return invoke<WorkflowTemplateRecord | null>("get_workflow_template", {
    workflowId,
  });
}

export async function upsertWorkflow(workflow: {
  id: string;
  label: string;
  engine?: string;
  outputMode?: string;
  meta: Record<string, unknown>;
  template: Record<string, unknown>;
}) {
  return invoke("upsert_workflow", { workflow });
}

export async function deleteWorkflow(workflowId: string) {
  return invoke<boolean>("delete_workflow", { workflowId });
}

// ──────────── Workflow Organization ────────────

export async function getPinnedWorkflows() {
  return invoke<string[]>("get_pinned_workflows");
}

export async function pinWorkflow(workflowId: string) {
  return invoke("pin_workflow", { workflowId });
}

export async function unpinWorkflow(workflowId: string) {
  return invoke("unpin_workflow", { workflowId });
}

export async function getWorkflowOrganization() {
  return invoke<WorkflowOrganization>("get_workflow_organization");
}

export async function reorderWorkflowItems(
  items: import("./api").WorkflowOrderItem[],
) {
  return invoke("reorder_workflow_items", { items });
}

export async function createWorkflowFolder(name: string) {
  return invoke<WorkflowFolder>("create_workflow_folder", { name });
}

export async function renameWorkflowFolder(folderId: string, name: string) {
  return invoke("rename_workflow_folder", { folderId, name });
}

export async function deleteWorkflowFolder(folderId: string) {
  return invoke("delete_workflow_folder", { folderId });
}

export async function reorderWorkflowFolders(folders: [string, number][]) {
  return invoke("reorder_workflow_folders", { folders });
}

// ──────────── Generations ────────────

export async function createGeneration(input: {
  prompt: string;
  modelId?: string;
  workflowId: string;
  seed?: number;
  batchSize?: number;
  width?: number;
  height?: number;
  aspectRatio?: string;
  image?: string;
  images?: string[];
  workflowParams?: Record<string, unknown>;
  replicateModel?: string;
  falModel?: string;
  openrouterModel?: string;
  fileInputKeys?: string[];
  promptField?: string;
  presetId?: string;
}) {
  return invoke<Generation>("create_generation", { input });
}

export async function getGeneration(id: string) {
  return invoke<Generation | null>("get_generation", { id });
}

export async function listGenerations() {
  return invoke<Generation[]>("list_generations");
}

export async function deleteGeneration(id: string) {
  return invoke("delete_generation", { id });
}

export async function getAssetVersions(
  generationId: string,
  assetType: string,
  itemIndex: number | null
) {
  return invoke<Asset[]>("get_asset_versions", {
    generationId,
    assetType,
    itemIndex,
  });
}

export async function setActiveAssetVersion(
  generationId: string,
  assetId: string
) {
  return invoke("set_active_asset_version", { generationId, assetId });
}

export async function regenerateItem(
  generationId: string,
  itemIndex?: number,
  assetType?: string,
  seed?: number
) {
  return invoke<Asset>("regenerate_item", {
    generationId,
    itemIndex: itemIndex ?? null,
    assetType: assetType ?? null,
    seed: seed ?? null,
  });
}

export async function createInpaint(
  generationId: string,
  assetType: string,
  itemIndex: number | null | undefined,
  prompt: string,
  seed: number | undefined,
  imageDataUrl: string,
  maskDataUrl: string
) {
  return invoke<Asset>("create_inpaint", {
    generationId,
    assetType,
    itemIndex: itemIndex ?? null,
    prompt,
    seed: seed ?? null,
    imageDataUrl,
    maskDataUrl,
  });
}

export async function downloadGenerationAssetsZip(generationId: string) {
  return invoke<number[]>("download_generation_assets_zip", { generationId });
}

export async function removeBackground(
  generationId: string,
  itemIndex: number,
  workflow: Record<string, unknown>
) {
  return invoke<Asset>("remove_background", {
    generationId,
    itemIndex,
    workflow,
  });
}

// ──────────── Gallery ────────────

export async function listGallery(params: {
  workflowId?: string;
  modelId?: string;
  query?: string;
  limit?: number;
  cursor?: string;
}) {
  return invoke<{
    items: Generation[];
    nextCursor: string | null;
  }>("list_gallery", { params });
}

export async function listGalleryUsers() {
  return invoke<string[]>("list_gallery_users");
}

// ──────────── Canvas ────────────

export type TauriCanvasMeta = {
  id: string;
  name: string;
  createdAt: string;
};

export async function listCanvases() {
  return invoke<TauriCanvasMeta[]>("list_canvases");
}

export async function createCanvas(id: string, name: string) {
  return invoke<TauriCanvasMeta>("create_canvas", { id, name });
}

export async function renameCanvas(id: string, name: string) {
  return invoke("rename_canvas", { id, name });
}

export async function deleteCanvas(id: string) {
  return invoke("delete_canvas", { id });
}

export async function getCanvasState(gameId?: string) {
  return invoke<CanvasStateResponse | null>("get_canvas_state", { gameId });
}

export async function saveCanvasState(params: {
  gameId?: string;
  nodes: unknown[];
  chatMessages: unknown[];
  chatWorkflowId?: string;
  nextZIndex: number;
  pinnedModelIds?: string[];
  pinnedWorkflowIds?: string[];
  selectedProviderModelId?: string | null;
  activeEngine?: string | null;
}) {
  return invoke("save_canvas_state", params);
}

export async function canvasChat(params: {
  requestId: string;
  messages: unknown[];
  canvasContext?: unknown[];
  canvasWorkflowId?: string;
  pinnedModelIds?: string[];
  pinnedWorkflowIds?: string[];
  providerModelId?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
}) {
  return invoke<string>("canvas_chat", params);
}

export async function cancelCanvasChat(requestId: string) {
  return invoke("cancel_canvas_chat", { requestId });
}

// ──────────── Chat Threads ────────────

export async function listChatThreads(canvasId: string) {
  return invoke<{ id: string; canvasId: string; title: string; createdAt: string; updatedAt: string }[]>("list_chat_threads", { canvasId });
}

export async function getChatThread(id: string) {
  return invoke<{ id: string; canvasId: string; title: string; messages: unknown[]; createdAt: string; updatedAt: string } | null>("get_chat_thread", { id });
}

export async function saveChatThread(params: { id: string; canvasId: string; title: string; messages: unknown[] }) {
  return invoke("save_chat_thread", params);
}

export async function deleteChatThread(id: string) {
  return invoke("delete_chat_thread", { id });
}

// ──────────── Admin Settings ────────────

/** Raw admin settings record returned by the Tauri backend — includes actual
 * API key values (the HTTP-API equivalent `AdminSettingsSummary` strips them). */
export type TauriAdminSettings = {
  openrouterApiKey?: string | null;
  replicateApiKey?: string | null;
  falApiKey?: string | null;
  kieApiKey?: string | null;
  adminEmails?: string[] | null;
  allowedEmailDomains?: string[] | null;
  comfyBaseUrls?: string[] | null;
  canvasAgentModel?: string | null;
  canvasAgentSystemPrompt?: string | null;
  canvasAgentTemperature?: number | null;
  promptEnhancerModel?: string | null;
  promptEnhancerSystemPrompt?: string | null;
  inpaintWorkflowId?: string | null;
  outpaintWorkflowId?: string | null;
  rembgWorkflowId?: string | null;
};

export async function getAdminSettings() {
  return invoke<TauriAdminSettings>("get_admin_settings");
}

export async function getFeatureWorkflowConfig() {
  return invoke<{
    inpaintWorkflowId: string | null;
    outpaintWorkflowId: string | null;
    rembgWorkflowId: string | null;
  }>("get_feature_workflow_config");
}

export async function getDefaultSystemPrompts() {
  return invoke<Record<string, string>>("get_default_system_prompts");
}

export async function updateAdminSettings(settings: TauriAdminSettings) {
  return invoke("update_admin_settings", { settings });
}

export async function getOpenrouterApiKey() {
  return invoke<string | null>("get_openrouter_api_key");
}

export async function setOpenrouterApiKey(value: string | null) {
  return invoke("set_openrouter_api_key", { value });
}

export async function getReplicateApiKey() {
  return invoke<string | null>("get_replicate_api_key");
}

export async function setReplicateApiKey(value: string | null) {
  return invoke("set_replicate_api_key", { value });
}

export async function getFalApiKey() {
  return invoke<string | null>("get_fal_api_key");
}

export async function setFalApiKey(value: string | null) {
  return invoke("set_fal_api_key", { value });
}

export async function getKieApiKey() {
  return invoke<string | null>("get_kie_api_key");
}

export async function setKieApiKey(value: string | null) {
  return invoke("set_kie_api_key", { value });
}

// ──────────── Models / LoRA ────────────

export async function listAvailableLoras(): Promise<string[]> {
  return invoke<string[]>("list_available_loras", {});
}

export async function getLoraSettings(gameId?: string) {
  return invoke<{
    enabled: string[];
    displayNames: Record<string, string>;
    previewUrls: Record<string, string>;
    promptPrefixes: Record<string, string>;
    workflowOverrides: Record<string, string>;
    keywordReplacements: Record<string, Record<string, string>>;
  }>("get_lora_settings", { gameId });
}

export async function updateLoraSettings(params: {
  gameId?: string;
  enabled?: string[];
  displayNames?: Record<string, string>;
  previewUrls?: Record<string, string>;
  promptPrefixes?: Record<string, string>;
  workflowOverrides?: Record<string, string>;
  keywordReplacements?: Record<string, Record<string, string>>;
}) {
  return invoke("update_lora_settings", params);
}

export async function searchProviderModels(
  provider: string,
  query?: string,
  limit?: number,
  cursor?: string
) {
  return invoke<{
    models: DiscoveredModel[];
    nextCursor: string | null;
  }>("search_provider_models", { provider, query, limit, cursor });
}

export async function getProviderModelDetail(provider: string, modelId: string) {
  return invoke<JsonObject>("get_provider_model_detail", { provider, modelId });
}

export async function getReplicateModelParameters(owner: string, name: string) {
  return invoke<JsonObject>("get_replicate_model_parameters", { owner, name });
}

export async function getFalModelParameters(endpointId: string) {
  return invoke<JsonObject>("get_fal_model_parameters", { endpointId });
}

// ──────────── Presets ────────────

export async function getPresets() {
  return invoke<UserPreset[]>("get_presets");
}

export async function getAllPresets() {
  return invoke<Record<string, UserPreset[]>>("get_all_presets");
}

export async function setPresets(presets: PresetRecord[], gameId?: string) {
  return invoke("set_presets", { gameId, presets });
}

export async function upsertPreset(preset: PresetRecord, gameId?: string) {
  return invoke("upsert_preset", { gameId, preset });
}

export async function deletePreset(presetId: string, gameId?: string) {
  return invoke<boolean>("delete_preset", { gameId, presetId });
}

// ──────────── Asset Types ────────────

export async function listAssetTypes() {
  return invoke<AdminAssetType[]>("list_asset_types");
}

export async function getAssetType(id: string) {
  return invoke<AdminAssetType | null>("get_asset_type", { id });
}

export async function createAssetType(record: AssetTypeRecord) {
  return invoke<AdminAssetType>("create_asset_type", { record });
}

export async function updateAssetType(id: string, record: AssetTypeRecord) {
  return invoke<AdminAssetType>("update_asset_type", { id, record });
}

export async function deleteAssetType(id: string) {
  return invoke<boolean>("delete_asset_type", { id });
}

// ──────────── Enhancer Presets ────────────

export type EnhancerPreset = {
  id: string;
  name: string;
  systemPrompt: string;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export async function listEnhancerPresets() {
  return invoke<EnhancerPreset[]>("list_enhancer_presets");
}

export async function getEnhancerPreset(id: string) {
  return invoke<EnhancerPreset | null>("get_enhancer_preset", { id });
}

export async function upsertEnhancerPreset(preset: {
  id?: string;
  name: string;
  systemPrompt: string;
  sortOrder?: number;
}) {
  return invoke<EnhancerPreset>("upsert_enhancer_preset", { preset });
}

export async function deleteEnhancerPreset(id: string) {
  return invoke<void>("delete_enhancer_preset", { id });
}

export async function setActiveEnhancerPreset(id: string) {
  return invoke<void>("set_active_enhancer_preset", { id });
}

// ──────────── Saved Prompts ────────────

export type SavedPromptRecord = {
  id: string;
  name: string;
  text: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export async function listSavedPrompts() {
  return invoke<SavedPromptRecord[]>("list_saved_prompts");
}

export async function upsertSavedPrompt(prompt: {
  id?: string;
  name: string;
  text: string;
  sortOrder?: number;
}) {
  return invoke<SavedPromptRecord>("upsert_saved_prompt", { prompt });
}

export async function deleteSavedPrompt(id: string) {
  return invoke<void>("delete_saved_prompt", { id });
}

// ──────────── Prompts ────────────

export async function enhancePrompt(prompt: string, model?: string) {
  return invoke<string>("enhance_prompt", { prompt, model });
}

/**
 * Stream-enhanced prompt via Tauri events.
 * Registers a listener for prompt-enhance-chunk events, calls enhance_prompt
 * with a requestId, and returns the final result.
 */
export async function streamEnhancedPrompt(
  prompt: string,
  onChunk: (fullText: string) => void
): Promise<string> {
  const requestId = crypto.randomUUID();
  let fullText = "";
  let unlisten: UnlistenFn | null = null;

  // Set up listener before invoking
  unlisten = await listen<{
    requestId: string;
    chunk?: string;
    done?: boolean;
    result?: string;
  }>("prompt-enhance-chunk", (event) => {
    if (event.payload.requestId !== requestId) return;
    if (event.payload.chunk) {
      fullText += event.payload.chunk;
      onChunk(fullText);
    }
    if (event.payload.done && event.payload.result) {
      fullText = event.payload.result;
    }
  });

  try {
    const result = await invoke<string>("enhance_prompt", {
      prompt,
      requestId,
    });
    return result;
  } finally {
    if (unlisten) unlisten();
  }
}

export async function exploreVariants(prompt: string, count?: number, creativity?: number) {
  return invoke<string[]>("explore_variants", { prompt, count, creativity });
}

// ──────────── Storage ────────────

export async function getStorageBasePath() {
  return invoke<string>("get_storage_base_path");
}

export async function getStorageFile(url: string) {
  return invoke<number[]>("get_storage_file", { url });
}

export async function openStorageFolder() {
  return invoke<void>("open_storage_folder");
}

export async function openExternalUrl(url: string) {
  return invoke<void>("open_external_url", { url });
}

export async function uploadToStorage(
  generationId: string,
  filename: string,
  data: number[]
) {
  return invoke<string>("upload_to_storage", {
    generationId,
    filename,
    data,
  });
}

// ──────────── Portable updater ────────────

export type AppInfo = {
  name: string;
  version: string;
  platform: string;
};

export async function getAppInfo() {
  return invoke<AppInfo>("get_app_info");
}

export type PortableUpdateStatus = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  assetName: string | null;
  downloadUrl: string | null;
  body: string | null;
};

export async function checkPortableUpdate() {
  return invoke<PortableUpdateStatus>("check_portable_update");
}

export async function installPortableUpdate(downloadUrl: string) {
  return invoke<void>("install_portable_update", { downloadUrl });
}

// ──────────── Compare ────────────

export async function getCompareModels() {
  return invoke<{
    models: import("./api").CompareModel[];
    providerStatus: import("./api").ProviderStatus;
  }>("get_compare_models");
}

export async function getCompareGroups() {
  return invoke<{ groups: import("./api").CompareGroup[] }>("get_compare_groups");
}
