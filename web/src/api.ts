/**
 * Shared type definitions and lightweight utilities.
 * All backend calls go through Tauri invoke — see tauri-api.ts and client.ts.
 */

// ========== Utility functions ==========

export type ApiBaseUrl = `http${string}` | string;

const sessionStorageKey = "imgimg.sessionId.v1";

export function getSessionId() {
  try {
    let sessionId = localStorage.getItem(sessionStorageKey);
    if (!sessionId) {
      sessionId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `sess_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      localStorage.setItem(sessionStorageKey, sessionId);
    }
    return sessionId;
  } catch {
    return null;
  }
}

export function buildAuthHeaders(): Record<string, string> {
  return {};
}

// ========== Provider Status Types ==========

export interface ComfyInstanceStatus {
  url: string;
  healthy: boolean;
}

export interface ComfyUIStatus {
  available: boolean;
  instances: ComfyInstanceStatus[];
  healthyCount: number;
  totalCount: number;
}

export interface OpenRouterStatus {
  available: boolean;
  hasApiKey: boolean;
}

export interface ReplicateStatus {
  available: boolean;
  hasApiKey: boolean;
}

export interface FalStatus {
  available: boolean;
  hasApiKey: boolean;
}

export interface KieStatus {
  available: boolean;
  hasApiKey: boolean;
}

export interface ProviderStatus {
  comfyui: ComfyUIStatus;
  openrouter: OpenRouterStatus;
  replicate: ReplicateStatus;
  fal: FalStatus;
  kie: KieStatus;
  timestamp: string;
}

// ========== Models ==========

export interface ModelsResponse {
  models: import("./types").Model[];
  meta: {
    comfyAvailable: boolean;
    message: string | null;
  };
}

// ========== Asset Types ==========

export type AssetTypeForRegen = string;
export type AssetTypeForInpaint = string;

// ========== Gallery ==========

export type GalleryUser = { id: string; email: string };

// ========== Prompts ==========

export type HookSuggestion = { visual: string; script: string };

// ========== Workflow Parameters ==========

export type WorkflowParameterOption = {
  value: string;
  label: string;
};

export type WorkflowParameter = {
  name: string;
  type: "number" | "boolean" | "select" | "text";
  label: string;
  description?: string;
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: WorkflowParameterOption[];
};

// ========== Workflows ==========

export type WorkflowSummary = {
  id: string;
  label: string;
  outputMode: "single_image" | "full_set" | "layered_image" | "single_audio";
  ui: { aspectRatio: boolean; batchSize: boolean; canvasMode?: boolean; lastFrameImage?: boolean };
  supportsImageInput?: boolean;
  requiresImageInput?: boolean;
  supportsVideoInput?: boolean;
  maxVideoInputs?: number;
  supportsAudioInput?: boolean;
  maxAudioInputs?: number;
  supportsLora?: boolean;
  parameters?: WorkflowParameter[];
  supportedAspectRatios?: string[];
  maxImageInputs?: number;
  appendAspectRatioToPrompt?: boolean;
  engine?: "comfyui" | "openrouter" | "replicate" | "fal" | "kie";
  providerAvailable?: boolean;
  fullSetItemCount?: number;
  fullSetSlots?: Array<{ type: string; aspectRatio: string; itemIndex?: number }>;
  supportsRemoveItemBackgrounds?: boolean;
  promptRequired?: boolean;
  supportsPresets?: boolean;
  dynamicModel?: boolean;
};

export interface WorkflowFolder {
  id: string;
  name: string;
  sortOrder: number;
}

export interface WorkflowOrderItem {
  workflowId: string;
  folderId: string | null;
  sortOrder: number;
}

export interface WorkflowOrganization {
  folders: WorkflowFolder[];
  items: WorkflowOrderItem[];
}

export interface WorkflowsResponse {
  workflows: WorkflowSummary[];
  providerStatus?: ProviderStatus;
  pinnedWorkflowIds: string[];
  organization: WorkflowOrganization | null;
}

export type AdminWorkflowSummary = WorkflowSummary & { regenOnly: boolean };

// ========== LoRA ==========

export type AdminLoraRow = {
  name: string;
  displayName: string;
  previewUrl: string;
  previewImageUrl: string;
  promptPrefix: string;
  workflowOverride: string;
  keywordReplacements: Record<string, string>;
  available: boolean;
  enabled: boolean;
};

// ========== Presets ==========

export type UserPreset = {
  id: string;
  name: string;
  preview_url: string;
  image_count: number;
};

export type AdminPreset = {
  id: string;
  name: string;
  enabled: boolean;
  imageUrls: string[];
  promptPrefix: string;
  promptSuffix: string;
  previewUrl: string;
};

// ========== Admin Settings ==========

export type AdminSettingsSummary = {
  openrouterApiKeyPresent: boolean;
  openrouterApiKeyHint: string | null;
  replicateApiKeyPresent: boolean;
  replicateApiKeyHint: string | null;
  falApiKeyPresent: boolean;
  falApiKeyHint: string | null;
  kieApiKeyPresent: boolean;
  kieApiKeyHint: string | null;
  adminEmails: string[];
  allowedEmailDomains: string[];
  comfyBaseUrls: string[];
  adminEmailsSource: "settings" | "env";
  allowedEmailDomainsSource: "settings" | "env";
  comfyBaseUrlsSource: "settings" | "env";
  canvasAgentModel: string | null;
  canvasAgentSystemPrompt: string | null;
  canvasAgentSystemPromptDefault: string;
  canvasAgentTemperature: number | null;
  canvasAgentModelEffective: string;
  canvasAgentTemperatureEffective: number;
  promptEnhancerModel: string | null;
  promptEnhancerSystemPrompt: string | null;
  promptEnhancerSystemPromptDefault: string;
  promptEnhancerModelEffective: string;
  inpaintWorkflowId: string | null;
  outpaintWorkflowId: string | null;
  rembgWorkflowId: string | null;
};

// ========== Admin Asset Types ==========

export type AdminAssetType = {
  id: string;
  displayName: string;
  description: string | null;
  aspectRatio: string;
  displaySortOrder: number;
  gridRow: string;
  gridSizeClass: string;
  defaultPromptTemplate: string | null;
  defaultWidth: number;
  defaultHeight: number;
  isDownloadable: boolean;
  isRegenable: boolean;
  isInpaintable: boolean;
  isVisible: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

// ========== Outpaint ==========

export type OutpaintParams = {
  expandLeft: number;
  expandRight: number;
  expandTop: number;
  expandBottom: number;
  denoise: number;
  edgeBlend: number;
};

// ========== Canvas Agent ==========

export type CanvasAgentToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type CanvasChatSseEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_call"; tool_call: CanvasAgentToolCall }
  | { type: "done"; finish_reason: string }
  | { type: "error"; message: string };

export type CanvasChatMessage = {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: CanvasAgentToolCall[];
  tool_call_id?: string;
};

export type CanvasStateResponse = {
  gameId: string;
  nodes: unknown[];
  chatMessages: unknown[];
  chatWorkflowId: string | null;
  nextZIndex: number;
  pinnedModelIds: string[];
  pinnedWorkflowIds: string[];
  selectedProviderModelId: string | null;
  activeEngine: string | null;
  updatedAt: string | null;
  updatedByEmail: string | null;
};

export type CanvasNodeSummary = {
  id: string;
  type: string;
  prompt?: string;
  assetType?: string;
  src?: string;
  width: number;
  height: number;
  x: number;
  y: number;
  text?: string;
  title?: string;
  parentFrameId?: string;
  locked?: boolean;
};

// ========== Model Discovery ==========

export type DiscoveredModel = {
  provider: string;
  modelId: string;
  displayName: string;
  description: string | null;
  category?: string | null;
  thumbnailUrl?: string | null;
  tags?: string[];
  owner?: string;
  runCount?: number;
  inputSchema?: Record<string, any> | null;
  outputSchema?: Record<string, any> | null;
};

// ========== Compare ==========

export type CompareModel = {
  id: string;
  provider: "comfyui" | "openrouter" | "replicate" | "fal" | "kie";
  displayName: string;
  description: string | null;
  thumbnailUrl: string | null;
  workflowId: string;
  replicateModel?: string;
  falModel?: string;
  openrouterModel?: string;
  supportsAspectRatio: boolean;
  supportedAspectRatios?: string[];
  supportsImageInput: boolean;
};

export type CompareGroup = {
  groupId: string;
  prompt: string;
  createdAt: string;
  entries: Array<{
    generationId: string;
    workflowId: string;
    workflowLabel: string;
    provider: string;
    status: string;
    assets: import("./types").Asset[];
  }>;
};
