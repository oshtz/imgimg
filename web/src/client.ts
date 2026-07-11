/**
 * Unified API client — all calls go through Tauri invoke().
 *
 * Import from "./client" for all backend operations.
 */

import * as tauri from "./tauri-api";
import type { ApiBaseUrl, WorkflowsResponse, WorkflowSummary, WorkflowOrganization, WorkflowFolder, WorkflowOrderItem, ModelsResponse, AdminSettingsSummary } from "./api";
import type { Asset, CurrentUser, Generation, Model } from "./types";

// ──────────── Helpers ────────────

/**
 * Transform a raw Tauri WorkflowRecord (with nested `meta`) into the
 * flat WorkflowSummary shape the frontend expects.
 */
function tauriRecordToSummary(rec: any): WorkflowSummary {
  const meta = rec.meta ?? {};
  const ui = meta.ui ?? {};
  const templateStr = JSON.stringify(rec.template ?? {});
  const hasImageToken = templateStr.includes("__IMAGE__");
  const engine: WorkflowSummary["engine"] =
    rec.engine === "openrouter" ? "openrouter"
    : rec.engine === "replicate" ? "replicate"
    : rec.engine === "fal" ? "fal"
    : rec.engine === "kie" ? "kie"
    : "comfyui";
  const supportsImageInput = meta.supportsImageInput === false
    ? false
    : Boolean(meta.supportsImageInput || engine === "openrouter" || engine === "replicate" || engine === "fal" || engine === "kie" || hasImageToken);

  return {
    id: rec.id,
    label: rec.label ?? meta.label ?? rec.id,
    outputMode: rec.outputMode ?? meta.outputMode ?? "single_image",
    ui: {
      aspectRatio: Boolean(ui.aspectRatio),
      batchSize: Boolean(ui.batchSize),
      canvasMode: Boolean(ui.canvasMode) || undefined,
      lastFrameImage: Boolean(ui.lastFrameImage) || undefined,
    },
    supportsImageInput,
    requiresImageInput: Boolean(meta.requiresImageInput) || undefined,
    supportsVideoInput: Boolean(meta.supportsVideoInput) || undefined,
    maxVideoInputs: typeof meta.maxVideoInputs === "number" ? meta.maxVideoInputs : undefined,
    supportsAudioInput: Boolean(meta.supportsAudioInput) || undefined,
    maxAudioInputs: typeof meta.maxAudioInputs === "number" ? meta.maxAudioInputs : undefined,
    supportsLora: meta.supportsLora === false
      ? false
      : engine !== "openrouter" && engine !== "replicate" && engine !== "fal" && engine !== "kie",
    parameters: Array.isArray(meta.parameters) ? meta.parameters : undefined,
    supportedAspectRatios: Array.isArray(meta.supportedAspectRatios) ? meta.supportedAspectRatios : undefined,
    maxImageInputs: typeof meta.maxImageInputs === "number" ? meta.maxImageInputs : undefined,
    appendAspectRatioToPrompt: Boolean(meta.appendAspectRatioToPrompt) || undefined,
    engine,
    fullSetItemCount: typeof meta.fullSetItemCount === "number" ? meta.fullSetItemCount : undefined,
    fullSetSlots: Array.isArray(meta.fullSetSlots) ? meta.fullSetSlots : undefined,
    supportsRemoveItemBackgrounds: Boolean(meta.supportsRemoveItemBackgrounds) || undefined,
    promptRequired: meta.promptRequired === false ? false : undefined,
    supportsPresets: Boolean(meta.supportsPresets) || undefined,
    dynamicModel: Boolean(meta.dynamicModel) || undefined,
  };
}

// ──────────── Health & User ────────────

export async function getHealth(_apiBaseUrl: ApiBaseUrl) {
  return tauri.getHealth();
}

export async function getCurrentUser(_apiBaseUrl: ApiBaseUrl): Promise<CurrentUser> {
  return tauri.getCurrentUser();
}

export async function getFeatureWorkflowConfig(_apiBaseUrl: ApiBaseUrl) {
  return tauri.getFeatureWorkflowConfig();
}

export async function getProviderStatus(_apiBaseUrl: ApiBaseUrl) {
  return tauri.getProviderStatus();
}

// ──────────── Workflows ────────────

export async function getWorkflows(_apiBaseUrl: ApiBaseUrl): Promise<WorkflowsResponse> {
  const [rawWorkflows, pinnedIds, org, providerStatus] = await Promise.all([
    tauri.listWorkflows(),
    tauri.getPinnedWorkflows(),
    tauri.getWorkflowOrganization(),
    tauri.getProviderStatus().catch(() => null),
  ]);
  const workflows = (rawWorkflows as any[]).map((rec) => {
    const summary = tauriRecordToSummary(rec);
    if (providerStatus) {
      switch (summary.engine) {
        case "replicate":
          summary.providerAvailable = providerStatus.replicate?.available ?? false;
          break;
        case "openrouter":
          summary.providerAvailable = providerStatus.openrouter?.available ?? false;
          break;
        case "fal":
          summary.providerAvailable = providerStatus.fal?.available ?? false;
          break;
        case "kie":
          summary.providerAvailable = providerStatus.kie?.available ?? false;
          break;
        case "comfyui":
        default:
          summary.providerAvailable = providerStatus.comfyui?.available ?? false;
          break;
      }
    }
    return summary;
  });
  return {
    workflows,
    providerStatus: providerStatus ?? undefined,
    pinnedWorkflowIds: pinnedIds,
    organization: org ?? null,
  };
}

export async function getModels(_apiBaseUrl: ApiBaseUrl, _params?: { tag?: string }): Promise<ModelsResponse> {
  const settings = await tauri.getLoraSettings() as any;
  const enabledList: string[] = settings?.enabled ?? [];
  const displayNames: Record<string, string> = settings?.displayNames ?? {};
  const previewUrls: Record<string, string> = settings?.previewUrls ?? {};
  const models: Model[] = enabledList.map((name) => ({
    id: name,
    name: displayNames[name] ?? name,
    tags: [] as import("./types").ModelTag[],
    triggerWords: [],
    workflowTemplate: "master" as const,
    previewImageUrl: previewUrls[name] ?? "",
  }));
  return { models, meta: { comfyAvailable: true, message: null } };
}

export async function pinWorkflow(_apiBaseUrl: ApiBaseUrl, workflowId: string) {
  return tauri.pinWorkflow(workflowId);
}

export async function unpinWorkflow(_apiBaseUrl: ApiBaseUrl, workflowId: string) {
  return tauri.unpinWorkflow(workflowId);
}

export async function saveWorkflowOrganization(_apiBaseUrl: ApiBaseUrl, items: WorkflowOrderItem[]) {
  return tauri.reorderWorkflowItems(items);
}

export async function createWorkflowFolder(_apiBaseUrl: ApiBaseUrl, name: string): Promise<WorkflowFolder> {
  return tauri.createWorkflowFolder(name);
}

export async function renameWorkflowFolder(_apiBaseUrl: ApiBaseUrl, folderId: string, name: string) {
  return tauri.renameWorkflowFolder(folderId, name);
}

export async function deleteWorkflowFolder(_apiBaseUrl: ApiBaseUrl, folderId: string) {
  return tauri.deleteWorkflowFolder(folderId);
}

export async function getWorkflowPreviews(_apiBaseUrl: ApiBaseUrl) {
  return {} as Record<string, string>;
}

// ──────────── Generations ────────────

export async function createGeneration(
  _apiBaseUrl: ApiBaseUrl,
  body: {
    modelId: string;
    prompt: string;
    seed?: number;
    workflowId: string;
    width?: number;
    height?: number;
    batchSize?: number;
    imageDataUrl?: string;
    imageDataUrls?: string[];
    videoDataUrl?: string;
    audioDataUrl?: string;
    aspectRatio?: string;
    workflowParams?: Record<string, number | boolean | string>;
    presetId?: string;
    replicateModel?: string;
    falModel?: string;
    openrouterModel?: string;
    fileInputKeys?: string[];
    promptField?: string;
  }
) {
  const gen = await tauri.createGeneration({
    prompt: body.prompt,
    modelId: body.modelId,
    workflowId: body.workflowId,
    seed: body.seed,
    batchSize: body.batchSize,
    width: body.width,
    height: body.height,
    aspectRatio: body.aspectRatio,
    image: body.imageDataUrl,
    images: body.imageDataUrls,
    workflowParams: body.workflowParams,
    replicateModel: body.replicateModel,
    falModel: body.falModel,
    openrouterModel: body.openrouterModel,
    fileInputKeys: body.fileInputKeys,
    promptField: body.promptField,
    presetId: body.presetId,
  });
  return {
    generationId: gen.id,
    jobId: gen.jobId ?? "",
    queuePosition: null as number | null,
  };
}

export async function getAdminGenerations(_apiBaseUrl: ApiBaseUrl) {
  const gens = await tauri.listGenerations();
  return { generations: gens };
}

export async function getMyGenerations(_apiBaseUrl: ApiBaseUrl) {
  const gens = await tauri.listGenerations();
  return { generations: gens };
}

export async function getGallery(
  _apiBaseUrl: ApiBaseUrl,
  params: {
    workflowId?: string;
    userId?: string;
    modelId?: string;
    q?: string;
    limit?: number;
    cursor?: string | null;
  }
) {
  const result = await tauri.listGallery({
    workflowId: params.workflowId,
    modelId: params.modelId,
    query: params.q,
    limit: params.limit,
    cursor: params.cursor ?? undefined,
  });
  return { items: result.items, nextCursor: result.nextCursor ?? null };
}

export async function getAssetVersions(
  _apiBaseUrl: ApiBaseUrl,
  generationId: string,
  opts: { assetType: string; itemIndex?: number | null }
) {
  return tauri.getAssetVersions(generationId, opts.assetType, opts.itemIndex ?? null);
}

export async function setActiveAssetVersion(
  _apiBaseUrl: ApiBaseUrl,
  generationId: string,
  opts: { assetId: string }
) {
  await tauri.setActiveAssetVersion(generationId, opts.assetId);
  const gen = await tauri.getGeneration(generationId);
  return gen?.assets ?? [];
}

export async function deleteGeneration(_apiBaseUrl: ApiBaseUrl, generationId: string) {
  return tauri.deleteGeneration(generationId);
}

export async function cancelGeneration(_apiBaseUrl: ApiBaseUrl, generationId: string) {
  return tauri.cancelGeneration(generationId);
}

export async function retryGeneration(_apiBaseUrl: ApiBaseUrl, generationId: string) {
  const generation = await tauri.retryGeneration(generationId);
  return {
    generation,
    generationId: generation.id,
    jobId: generation.jobId ?? "",
    queuePosition: null as number | null,
  };
}

export async function getAssetTypes(_apiBaseUrl: ApiBaseUrl) {
  return tauri.listAssetTypes();
}

export async function getPresets(_apiBaseUrl: ApiBaseUrl) {
  const list = await tauri.getPresets();
  return list.map((p: any) => ({
    id: p.id,
    name: p.name,
    preview_url: p.previewUrl ?? p.preview_url ?? "",
    image_count: Array.isArray(p.imageUrls)
      ? p.imageUrls.length
      : Array.isArray(p.image_urls)
        ? p.image_urls.length
        : 0,
  }));
}

// ──────────── Regenerate / Inpaint / Outpaint / RemoveBG ────────────

export async function regenerateItem(
  _apiBaseUrl: ApiBaseUrl,
  generationId: string,
  body: { itemIndex?: number; assetType?: string; seed?: number; promptPrefix?: string }
): Promise<{ generationId: string; jobId: string; queuePosition: number; assets?: Asset[] }> {
  const operation = await tauri.regenerateItem(generationId, body.itemIndex, body.assetType, body.seed);
  // Tauri regen runs synchronously — already complete when we reach here
  return { ...operation, assets: undefined };
}

export async function createInpaintAssetVersion(
  _apiBaseUrl: ApiBaseUrl,
  generationId: string,
  body: {
    assetType: string;
    itemIndex?: number | null;
    prompt: string;
    seed?: number;
    imageDataUrl: string;
    maskDataUrl: string;
  }
) {
  return tauri.createInpaint(
    generationId,
    body.assetType,
    body.itemIndex,
    body.prompt,
    body.seed,
    body.imageDataUrl,
    body.maskDataUrl,
  );
  // Tauri inpaint runs synchronously — already complete when we reach here
}

export async function createOutpaintGeneration(
  apiBaseUrl: ApiBaseUrl,
  body: {
    modelId: string;
    prompt: string;
    seed?: number;
    imageDataUrl: string;
    outpaintWorkflowId: string;
    outpaintParams: {
      expandLeft: number;
      expandRight: number;
      expandTop: number;
      expandBottom: number;
      denoise: number;
      edgeBlend: number;
    };
  }
) {
  return createGeneration(apiBaseUrl, {
    modelId: body.modelId,
    prompt: body.prompt,
    seed: body.seed,
    workflowId: body.outpaintWorkflowId,
    imageDataUrl: body.imageDataUrl,
    batchSize: 1,
    workflowParams: {
      expand_left: body.outpaintParams.expandLeft,
      expand_right: body.outpaintParams.expandRight,
      expand_top: body.outpaintParams.expandTop,
      expand_bottom: body.outpaintParams.expandBottom,
      denoise: body.outpaintParams.denoise,
      edge_blend: body.outpaintParams.edgeBlend,
    },
  });
}

export async function removeBackground(
  _apiBaseUrl: ApiBaseUrl,
  generationId: string,
  body: { itemIndex: number }
) {
  const operation = await tauri.removeBackground(generationId, body.itemIndex, {});
  return {
    jobId: operation.jobId,
    generationId,
    itemIndex: body.itemIndex,
    queuePosition: operation.queuePosition,
    alreadyExists: false,
  };
}

export async function downloadGenerationAssetsZip(_apiBaseUrl: ApiBaseUrl, generationId: string) {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const filename = `generation_${generationId}.zip`;
  const destination = await save({ defaultPath: filename, filters: [{ name: "ZIP archive", extensions: ["zip"] }] });
  if (!destination) return { saved: false, filename };
  await tauri.exportGenerationAssetsZip(generationId, destination);
  return { saved: true, filename };
}

// ──────────── Prompts ────────────

export async function streamEnhancedPrompt(
  _apiBaseUrl: ApiBaseUrl,
  body: { prompt: string },
  onChunk: (next: string) => void
) {
  return tauri.streamEnhancedPrompt(body.prompt, onChunk);
}

export async function generatePromptVariants(
  _apiBaseUrl: ApiBaseUrl,
  body: { prompt: string; count: number; creativity: number }
): Promise<{ variants: string[] }> {
  const variants = await tauri.exploreVariants(body.prompt, body.count, body.creativity);
  return { variants };
}

// ──────────── Canvas ────────────

export async function getCanvasState(_apiBaseUrl: ApiBaseUrl) {
  const state = await tauri.getCanvasState();
  return state ?? {
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
  };
}

export async function putCanvasState(
  _apiBaseUrl: ApiBaseUrl,
  body: {
    nodes: unknown[];
    chatMessages: unknown[];
    chatWorkflowId: string | null;
    nextZIndex: number;
    connectors?: unknown[];
    pinnedModelIds?: string[];
    pinnedWorkflowIds?: string[];
    selectedProviderModelId?: string | null;
    activeEngine?: string | null;
  }
) {
  await tauri.saveCanvasState({
    nodes: body.nodes as any[],
    chatMessages: body.chatMessages as any[],
    chatWorkflowId: body.chatWorkflowId ?? undefined,
    nextZIndex: body.nextZIndex,
    pinnedModelIds: body.pinnedModelIds,
    pinnedWorkflowIds: body.pinnedWorkflowIds,
    selectedProviderModelId: body.selectedProviderModelId,
    activeEngine: body.activeEngine,
  });
}

export async function streamCanvasChat(
  _apiBaseUrl: ApiBaseUrl,
  body: {
    canvasWorkflowId: string;
    messages: any[];
    canvasContext?: any[];
    pinnedModelIds?: string[];
    pinnedWorkflowIds?: string[];
    providerModelId?: string;
  }
) {
  const { listen } = await import("@tauri-apps/api/event");
  const encoder = new TextEncoder();
  const requestId = crypto.randomUUID();

  // Create a ReadableStream that bridges Tauri events into SSE-formatted data
  // that ChatPanel's existing parser can consume.
  // Register listener BEFORE firing the command to avoid race conditions
  let unlisten: (() => void) | null = null;
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;

  const cleanup = () => {
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  };

  const closeStream = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    closed = true;
    controller.close();
    cleanup();
  };

  const listenerReady = listen<{
    requestId: string;
    type: string;
    text?: string | null;
    toolCall?: any | null;
    error?: string | null;
  }>("canvas-chat-event", (event) => {
    const payload = event.payload;
    if (payload.requestId !== requestId) return;
    const ctrl = streamController;
    if (!ctrl || closed) return;

    try {
      if (payload.type === "content" && payload.text) {
        const sseData = JSON.stringify({ content: payload.text });
        ctrl.enqueue(encoder.encode(`data:${sseData}\n\n`));
      } else if (payload.type === "tool_call" && payload.toolCall) {
        const sseData = JSON.stringify({ tool_call: payload.toolCall });
        ctrl.enqueue(encoder.encode(`data:${sseData}\n\n`));
      } else if (payload.type === "finish" && payload.text) {
        const sseData = JSON.stringify({ finish_reason: payload.text });
        ctrl.enqueue(encoder.encode(`data:${sseData}\n\n`));
      } else if (payload.type === "error" && payload.error) {
        const sseData = JSON.stringify({ message: payload.error });
        ctrl.enqueue(encoder.encode(`data:${sseData}\n\n`));
      } else if (payload.type === "done") {
        const sseData = JSON.stringify({ finish_reason: "stop" });
        ctrl.enqueue(encoder.encode(`data:${sseData}\n\n`));
        closeStream(ctrl);
      }
    } catch {
      // controller may already be closed
      cleanup();
    }
  });

  unlisten = await listenerReady;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;

      // Fire the Tauri command (don't await; events will stream in)
      tauri.canvasChat({
        requestId,
        messages: body.messages,
        canvasContext: body.canvasContext,
        canvasWorkflowId: body.canvasWorkflowId,
        pinnedModelIds: body.pinnedModelIds,
        pinnedWorkflowIds: body.pinnedWorkflowIds,
        providerModelId: body.providerModelId,
      }).catch((err) => {
        const sseData = JSON.stringify({ message: String(err) });
        if (closed) return;
        controller.enqueue(encoder.encode(`data:${sseData}\n\n`));
        closeStream(controller);
      });
    },
    cancel() {
      closed = true;
      cleanup();
      void tauri.cancelCanvasChat(requestId);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

// ──────────── Provider Model Discovery ────────────

export async function searchProviderModels(
  _apiBaseUrl: ApiBaseUrl,
  provider: "replicate" | "fal" | "openrouter",
  params: { q?: string; category?: string; collection?: string; assetType?: string; limit?: number; cursor?: string }
) {
  return tauri.searchProviderModels(provider, params.q, params.limit, params.cursor);
}

export async function getProviderModelDetail(
  _apiBaseUrl: ApiBaseUrl,
  provider: "replicate" | "fal" | "openrouter",
  modelId: string
) {
  return tauri.getProviderModelDetail(provider, modelId);
}

export async function getReplicateModelParameters(
  _apiBaseUrl: ApiBaseUrl,
  modelId: string
) {
  const parts = modelId.split("/");
  const raw = await tauri.getReplicateModelParameters(parts[0] ?? "", parts[1] ?? "");
  if (raw && typeof raw === "object" && !raw.parameters) {
    const { convertSchemaToParameters } = await import("./utils/schemaToParameters");
    const inputSchema = raw.input ?? raw;
    const definitions = raw.definitions ?? {};
    const result = convertSchemaToParameters(inputSchema, definitions);
    return { ...result, readme: raw.readme ?? null, description: raw.description ?? null };
  }
  return raw;
}

export async function getFalModelParameters(
  _apiBaseUrl: ApiBaseUrl,
  endpointId: string
) {
  const raw = await tauri.getFalModelParameters(endpointId);
  if (raw && typeof raw === "object" && !raw.parameters) {
    const { convertSchemaToParameters } = await import("./utils/schemaToParameters");
    const inputSchema = raw.input ?? raw;
    const definitions = raw.definitions ?? {};
    const result = convertSchemaToParameters(inputSchema, definitions);
    return { ...result, readme: null, description: raw.description ?? null };
  }
  return raw;
}

export async function createWorkflowFromModel(
  _apiBaseUrl: ApiBaseUrl,
  provider: "replicate" | "fal" | "openrouter",
  modelId: string
) {
  const detail = await tauri.getProviderModelDetail(provider, modelId) as any;
  const workflowId = `${provider}-${modelId.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`;
  const label = detail?.name ?? detail?.title ?? modelId;
  const meta: Record<string, unknown> = {
    engine: provider,
    label,
    supportsImageInput: Boolean(detail?.supportsImageInput),
    outputMode: "single_image",
  };
  if (provider === "replicate") {
    meta.replicateModel = modelId;
  }
  const template = detail?.template ?? {};
  await tauri.upsertWorkflow({
    id: workflowId,
    label,
    engine: provider,
    outputMode: "single_image",
    meta,
    template,
  });
  return { workflowId, workflow: { id: workflowId, label, engine: provider } };
}

// ──────────── Admin Settings ────────────

export async function getAdminSettings(_apiBaseUrl: ApiBaseUrl) {
  const [settings, defaults] = await Promise.all([
    tauri.getAdminSettings(),
    tauri.getDefaultSystemPrompts(),
  ]);
  return formatAdminSettings(settings, defaults);
}

function formatAdminSettings(
  settings: Awaited<ReturnType<typeof tauri.getAdminSettings>> | null,
  defaults: Record<string, string>,
) {
  const s = settings ?? {} as any;
  return {
    openrouterApiKeyPresent: Boolean(s.openrouterApiKeyPresent),
    openrouterApiKeyHint: s.openrouterApiKeyHint ?? null,
    replicateApiKeyPresent: Boolean(s.replicateApiKeyPresent),
    replicateApiKeyHint: s.replicateApiKeyHint ?? null,
    falApiKeyPresent: Boolean(s.falApiKeyPresent),
    falApiKeyHint: s.falApiKeyHint ?? null,
    kieApiKeyPresent: Boolean(s.kieApiKeyPresent),
    kieApiKeyHint: s.kieApiKeyHint ?? null,
    adminEmails: s.adminEmails ?? [],
    allowedEmailDomains: s.allowedEmailDomains ?? [],
    comfyBaseUrls: s.comfyBaseUrls ?? [],
    adminEmailsSource: "settings" as const,
    allowedEmailDomainsSource: "settings" as const,
    comfyBaseUrlsSource: "settings" as const,
    canvasAgentModel: s.canvasAgentModel ?? null,
    canvasAgentSystemPrompt: s.canvasAgentSystemPrompt ?? null,
    canvasAgentSystemPromptDefault: defaults.canvasAgent ?? "",
    canvasAgentTemperature: s.canvasAgentTemperature ?? null,
    canvasAgentModelEffective: s.canvasAgentModel ?? "openai/gpt-4o-mini",
    canvasAgentTemperatureEffective: s.canvasAgentTemperature ?? 0.7,
    promptEnhancerModel: s.promptEnhancerModel ?? null,
    promptEnhancerSystemPrompt: s.promptEnhancerSystemPrompt ?? null,
    promptEnhancerSystemPromptDefault: defaults.promptEnhancer ?? "",
    promptEnhancerModelEffective: s.promptEnhancerModel ?? "openai/gpt-4o-mini",
    inpaintWorkflowId: s.inpaintWorkflowId ?? null,
    outpaintWorkflowId: s.outpaintWorkflowId ?? null,
    rembgWorkflowId: s.rembgWorkflowId ?? null,
  } satisfies AdminSettingsSummary;
}

export async function putAdminSettings(
  _apiBaseUrl: ApiBaseUrl,
  body: {
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
  }
) {
  const [settings, defaults] = await Promise.all([
    tauri.updateAdminSettings(body),
    tauri.getDefaultSystemPrompts(),
  ]);
  return formatAdminSettings(settings, defaults);
}

// ──────────── Re-export utilities and types ────────────

export type {
  ApiBaseUrl,
  WorkflowSummary,
  WorkflowFolder,
  WorkflowOrderItem,
  WorkflowOrganization,
  WorkflowsResponse,
  ModelsResponse,
  AssetTypeForRegen,
  AssetTypeForInpaint,
  ProviderStatus,
  UserPreset,
  AdminSettingsSummary,
  AdminAssetType,
  AdminWorkflowSummary,
  AdminLoraRow,
  AdminPreset,
  CanvasStateResponse,
  CanvasNodeSummary,
  CanvasChatMessage,
  CanvasChatSseEvent,
  CanvasAgentToolCall,
  GalleryUser,
  HookSuggestion,
  DiscoveredModel,
  OutpaintParams,
  CompareModel,
  CompareGroup,
} from "./api";

export async function getCompareModels(_apiBaseUrl: ApiBaseUrl) {
  return tauri.getCompareModels();
}

export async function getCompareGroups(_apiBaseUrl: ApiBaseUrl) {
  return tauri.getCompareGroups();
}
