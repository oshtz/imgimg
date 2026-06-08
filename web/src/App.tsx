import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TbMenu2, TbWand } from "react-icons/tb";
import {
  createGeneration,
  createInpaintAssetVersion,
  createOutpaintGeneration,
  deleteGeneration,
  streamEnhancedPrompt,
  getCurrentUser,
  getFeatureWorkflowConfig,
  getAdminGenerations,
  getHealth,
  getModels,
  regenerateItem,
  removeBackground,
  getAssetVersions,
  setActiveAssetVersion,
  downloadGenerationAssetsZip,
  type ApiBaseUrl,
  type AssetTypeForRegen,
  type AssetTypeForInpaint,
  buildAuthHeaders,
  getPresets,
  type UserPreset,
  getReplicateModelParameters,
  getFalModelParameters,
} from "./client";
import { PromptCenterpiece, type PromptCenterpieceState } from "./components/PromptCenterpiece";
import { GenerationHistoryList } from "./components/GenerationHistoryList";
import { GalleryPanel } from "./components/GalleryPanel";
import { GenerationDetailPanel, type GenerationDetailSelection, type OutpaintParams } from "./components/GenerationDetailPanel";
import { Sidebar, MobileSidebarOverlay } from "./components/Sidebar";
import type { ThemePreference, WidthPreference, CardSize, CardThumbnailMode, PromptPosition } from "./components/SettingsPanel";
import { TitleBar } from "./components/TitleBar";
import { AdminPanel, type SettingsTab } from "./components/admin/AdminPanel";
import { WorkflowCardGrid, isWorkflowVisibleInGrid } from "./components/WorkflowCardGrid";
import { CanvasWorkspace } from "./canvas";
import { CompareView } from "./components/CompareView";
import type { Asset, CurrentUser, Generation, Model, SavedPrompt } from "./types";
import { PromptManagerPanel } from "./components/PromptManagerPanel";
import { AudioDesk } from "./audioDesk/AudioDesk";
import { IterateWorkspace } from "./iterate/IterateWorkspace";
import type { WorkflowParameter, DiscoveredModel } from "./api";
import { useGenerationEvents } from "./useGenerationEvents";
import { aspectRatioToSize, isAspectRatio, nearestAspectRatio, type WorkflowId } from "./workflows";
import { cn } from "./utils/cn";
import { assetUrl, mergeAssets, initStorageBasePath, resolveStorageUrl, onStorageBasePathReady } from "./utils/assets";
import { clampBatchSize } from "./utils/clamp";
import { buildLoraTagCandidates, findLoraTagMatches } from "./utils/loraTags";
import { usePersistedState, usePersistedString, usePersistedBoolean, usePersistedNumber } from "./hooks/usePersistedState";
import { useSavedPrompts } from "./hooks/useSavedPrompts";
import { useCanvasManager } from "./hooks/useCanvasManager";
import { useWorkflowManager } from "./hooks/useWorkflowManager";
import { extractError } from "./utils/extractError";
import { WelcomeWizard } from "./components/onboarding/WelcomeWizard";
import { isOnboardingCompleted, loadBundledWorkflows, isFirstGenCompleted, setFirstGenCompleted } from "./lib/onboarding";
import {
  DEFAULT_UI_SCALE,
  UI_SCALE_STORAGE_KEY,
  applyUiScaleShortcut,
  clampUiScale,
  parseUiScale,
} from "./lib/uiScale";
import {
  getHistoryPaneClassName,
  getPromptFlowClassName,
  getPromptPaneClassName,
  isPromptSidebarPosition,
  parsePromptPosition,
} from "./lib/promptPosition";
import {
  DYNAMIC_MODEL_IDS_BY_WORKFLOW_STORAGE_KEY,
  PROMPT_DRAFT_STORAGE_KEY,
  PROMPT_UI_STORAGE_KEY,
  SELECTED_MODEL_IDS_BY_WORKFLOW_STORAGE_KEY,
  getWorkflowSelection,
  parseWorkflowSelectionMap,
  setWorkflowSelection,
  type WorkflowSelectionMap,
} from "./lib/workflowModelSelections";

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

type DynamicModelParameterResult = {
  parameters?: WorkflowParameter[];
  fileInputKeys?: string[];
  maxFileInputs?: number;
  promptField?: string;
  readme?: string | null;
};

export default function App() {
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3001") as ApiBaseUrl;

  const [storageReady, setStorageReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [workflow, setWorkflow] = usePersistedState<WorkflowId>("imgimg.workflow.v1", "", {
    serialize: (v) => v,
    deserialize: (v) => v?.trim() || "",
  });

  const [enabledProviders, setEnabledProviders] = usePersistedState<Record<string, boolean>>(
    "imgimg.enabledProviders",
    { comfyui: true, openrouter: true, replicate: true, fal: true, kie: true },
  );

  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingCompleted());
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminPanelTab, setAdminPanelTab] = useState<SettingsTab | undefined>(undefined);
  const [activeView, setActiveView] = useState<"generate" | "gallery" | "canvas" | "compare" | "prompts" | "audio" | "iterate">("generate");
  const [savedPrompts, setSavedPrompts] = useSavedPrompts();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedBoolean("imgimg.sidebarCollapsed", false);
  const [sidebarWidth, setSidebarWidth] = usePersistedNumber("imgimg.sidebarWidth", 288);

  // ── Multi-canvas state ──
  const {
    canvases,
    activeCanvasId,
    canvasPreviews,
    handleCanvasCreate,
    handleCanvasDelete,
    handleCanvasRename,
    handleCanvasSelect,
  } = useCanvasManager(apiBaseUrl, storageReady, setActiveView, setSidebarCollapsed);

  const [skipQueue, setSkipQueue] = usePersistedBoolean("imgimg.skipQueue.v1", false);
  const [theme, setTheme] = usePersistedState<ThemePreference>("imgimg.theme.v1", "dark", {
    serialize: (v) => v,
    deserialize: (v) => (v === "light" ? "light" : "dark"),
  });
  const [uiScale, setUiScale] = usePersistedState<number>(UI_SCALE_STORAGE_KEY, DEFAULT_UI_SCALE, {
    serialize: (v) => String(clampUiScale(v)),
    deserialize: parseUiScale,
  });
  const uiScaleRef = useRef(uiScale);
  const [widthPreference, setWidthPreference] = usePersistedState<WidthPreference>("imgimg.widthPreference.v1", "fixed", {
    serialize: (v) => v,
    deserialize: (v) => (v === "full" ? "full" : "fixed"),
  });
  const [promptPosition, setPromptPosition] = usePersistedState<PromptPosition>("imgimg.promptPosition.v1", "bottom", {
    serialize: (v) => v,
    deserialize: parsePromptPosition,
  });
  const [cardSize, setCardSize] = usePersistedState<CardSize>("imgimg.cardSize.v1", "medium", {
    serialize: (v) => v,
    deserialize: (v) => (v === "small" || v === "large" ? v : "medium"),
  });
  const [cardThumbnailMode, setCardThumbnailMode] = usePersistedState<CardThumbnailMode>("imgimg.cardThumbnailMode.v1", "latest", {
    serialize: (v) => v,
    deserialize: (v) => (v === "gradient" || v === "random-gradient" ? v : "latest"),
  });

  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelIdsByWorkflow, setSelectedModelIdsByWorkflow] = usePersistedState<WorkflowSelectionMap>(
    SELECTED_MODEL_IDS_BY_WORKFLOW_STORAGE_KEY,
    {},
    {
      serialize: (v) => JSON.stringify(v),
      deserialize: parseWorkflowSelectionMap,
    },
  );
  const [loraEnabled, setLoraEnabled] = usePersistedBoolean("imgimg.loraEnabled.v1", true);

  // ── Workflow & asset type management ──
  const {
    workflowsRemote,
    pinnedWorkflowIds,
    workflowOrg,
    workflowPreviewsFromApi,
    providerStatus,
    assetTypeRegistry,
    refreshWorkflows,
    refreshAssetTypes,
    refreshWorkflowPreviews,
    handleTogglePin,
    handleReorderWorkflows,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
  } = useWorkflowManager(apiBaseUrl);

  const visibleHomeWorkflows = useMemo(
    () => workflowsRemote.filter((w) => isWorkflowVisibleInGrid(w, enabledProviders)),
    [workflowsRemote, enabledProviders],
  );

  // Preset Studio state
  const [presets, setPresets] = useState<UserPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // Dynamic provider model picker state
  const [dynamicModelIdsByWorkflow, setDynamicModelIdsByWorkflow] = usePersistedState<WorkflowSelectionMap>(
    DYNAMIC_MODEL_IDS_BY_WORKFLOW_STORAGE_KEY,
    {},
    {
      serialize: (v) => JSON.stringify(v),
      deserialize: parseWorkflowSelectionMap,
    },
  );
  const [replicateModelParams, setReplicateModelParams] = useState<WorkflowParameter[] | null>(null);
  const [replicateModelFileInputKeys, setReplicateModelFileInputKeys] = useState<string[]>([]);
  const [replicateModelMaxImageInputs, setReplicateModelMaxImageInputs] = useState<number | undefined>(undefined);
  const [replicateModelPromptField, setReplicateModelPromptField] = useState<string>("prompt");
  const [replicateModelReadme, setReplicateModelReadme] = useState<string | null>(null);
  const [replicateModelLoading, setReplicateModelLoading] = useState(false);
  const [pinnedReplicateModelsByType, setPinnedReplicateModelsByType] = usePersistedState<
    Record<string, DiscoveredModel[]>
  >("imgimg.pinnedReplicateModels.v2", {});

  // One-time migration: move v1 pinned models (flat list) into v2 under "replicate:image"
  // Also migrate v2 bare asset-type keys (e.g. "image") to engine-prefixed keys (e.g. "replicate:image")
  useEffect(() => {
    try {
      const v1 = localStorage.getItem("imgimg.pinnedReplicateModels.v1");
      if (v1) {
        const parsed = JSON.parse(v1) as DiscoveredModel[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPinnedReplicateModelsByType((prev) => ({
            ...prev,
            "replicate:image": [...(prev["replicate:image"] ?? []), ...parsed.filter(
              (m) => !(prev["replicate:image"] ?? []).some((e) => e.modelId === m.modelId)
            )],
          }));
        }
        localStorage.removeItem("imgimg.pinnedReplicateModels.v1");
      }
    } catch { /* ignore */ }
    // Migrate bare asset-type keys to replicate-prefixed keys
    try {
      setPinnedReplicateModelsByType((prev) => {
        const bareKeys = ["image", "video", "audio"].filter((k) => k in prev && (prev[k]?.length ?? 0) > 0);
        if (bareKeys.length === 0) return prev;
        const next = { ...prev };
        for (const key of bareKeys) {
          const replicateKey = `replicate:${key}`;
          const existing = next[replicateKey] ?? [];
          const toMigrate = (next[key] ?? []).filter(
            (m) => !existing.some((e) => e.modelId === m.modelId)
          );
          next[replicateKey] = [...existing, ...toMigrate];
          delete next[key];
        }
        return next;
      });
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive asset type from current workflow ID string
  const currentAssetType: string =
    workflow?.includes("audio") ? "audio"
    : workflow?.includes("video") ? "video"
    : "image";

  // Derive engine from workflow ID (e.g. "fal-image" → "fal", "replicate-video" → "replicate")
  const currentEngine: string =
    workflow?.startsWith("fal-") ? "fal"
    : workflow?.startsWith("openrouter-") ? "openrouter"
    : "replicate";

  // Key pinned models by engine+assetType so each provider has its own set
  const currentPinnedKey: string = `${currentEngine}:${currentAssetType}`;
  const pinnedReplicateModels = pinnedReplicateModelsByType[currentPinnedKey] ?? [];

  const [prompt, setPrompt] = usePersistedString(PROMPT_DRAFT_STORAGE_KEY, "A beautiful landscape with vibrant colors");
  // Track the original prompt before enhancement to allow revert
  const [originalPromptBeforeEnhance, setOriginalPromptBeforeEnhance] = useState<string | null>(null);
  const [promptUi, setPromptUi] = usePersistedState<PromptCenterpieceState>(
    PROMPT_UI_STORAGE_KEY,
    { aspectRatio: "1:1", batchSize: 4, enhancePrompt: false, removeItemBackgrounds: false, imageInputs: [], workflowParams: {} },
    {
      serialize: (v) => JSON.stringify({ ...v, imageInputs: [] }),
      deserialize: (raw) => {
        const parsed = JSON.parse(raw) as Partial<PromptCenterpieceState>;
        return {
          aspectRatio: isAspectRatio(parsed.aspectRatio) ? parsed.aspectRatio : "1:1",
          batchSize: clampBatchSize(parsed.batchSize),
          enhancePrompt: typeof parsed.enhancePrompt === "boolean" ? parsed.enhancePrompt : false,
          removeItemBackgrounds: typeof parsed.removeItemBackgrounds === "boolean" ? parsed.removeItemBackgrounds : false,
          imageInputs: [], // Don't persist image input across sessions
          workflowParams: {} // Reset workflow params on page load
        };
      },
    }
  );
  const [history, setHistory] = useState<Generation[]>([]);
  const [galleryItems, setGalleryItems] = useState<Generation[]>([]);
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GenerationDetailSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enhancingPrompt, setEnhancingPrompt] = useState(false);
  const [loading, setLoading] = useState(false);
  // Track which individual slots are being filled (for non-blocking external workflows)
  const [fillingSlots, setFillingSlots] = useState<Set<string>>(new Set());
  // Track which individual slots are queued for regeneration (queue-based workflows)
  const [queuedSlots, setQueuedSlots] = useState<Set<string>>(new Set());
  // Track which assets are being processed for background removal
  const [rembgProcessing, setRembgProcessing] = useState<Set<string>>(new Set());
  // Asset version history for the currently selected asset
  const [assetVersions, setAssetVersions] = useState<Asset[]>([]);
  const [versionSwitching, setVersionSwitching] = useState(false);
  // Feature workflow configuration (inpaint/outpaint/rembg)
  const [featureWorkflows, setFeatureWorkflows] = useState<{
    inpaintWorkflowId: string | null;
    outpaintWorkflowId: string | null;
    rembgWorkflowId: string | null;
  }>({ inpaintWorkflowId: null, outpaintWorkflowId: null, rembgWorkflowId: null });

  const effectiveEmail = currentUser?.email ?? "user@imgimg.local";

  useGenerationEvents({
    apiBaseUrl,
    generationId: null,
    authToken: null,
    enabled: true,
    onEvent: (event) => {
      if (event.type === "job") {
        const nextStatus =
          event.data.state === "running"
            ? "running"
            : event.data.state === "succeeded"
              ? "succeeded"
              : event.data.state === "failed"
              ? "failed"
                : "queued";

        setHistory((prev) => {
          const id = event.data.generationId;
          const idx = id ? prev.findIndex((g) => g.id === id) : prev.findIndex((g) => g.jobId === event.data.jobId);
          if (idx < 0) return prev;
          const g = prev[idx]!;
          const nextQueuePosition = event.data.position ?? null;
          if (g.status === nextStatus && (g.queuePosition ?? null) === nextQueuePosition) return prev;
          const next = [...prev];
          next[idx] = { ...g, status: nextStatus, queuePosition: nextQueuePosition };
          return next;
        });
        return;
      }

      if (event.type === "generation") {
        setHistory((prev) => {
          const idx = prev.findIndex((g) => g.id === event.data.generationId);
          if (idx < 0) return prev;
          const g = prev[idx]!;
          const nextError = event.data.error ?? null;
          const nextAssets = event.data.assets ? mergeAssets(g.assets, event.data.assets) : g.assets;
          if (g.status === event.data.status && g.error === nextError && g.assets === nextAssets) return prev;
          const next = [...prev];
          next[idx] = { ...g, status: event.data.status, error: nextError, assets: nextAssets };
          return next;
        });
        // First-generation success toast
        if (event.data.status === "succeeded" && event.data.assets && event.data.assets.length > 0 && !isFirstGenCompleted()) {
          setFirstGenCompleted();
          import("sonner").then(({ toast }) => {
            toast("Your first generation!", {
              description: "Try next: change the aspect ratio, increase batch size, pin a different model, or drag the image onto a canvas.",
              duration: 8000,
            });
          });
        }
        if (event.data.assets && event.data.assets.length > 0) {
          const { generationId } = event.data;
          const keysToClear = new Set<string>();
          for (const asset of event.data.assets) {
            if (asset.itemIndex !== null && asset.itemIndex !== undefined) {
              keysToClear.add(`${generationId}:${asset.itemIndex}`);
            } else {
              keysToClear.add(`${generationId}:${asset.type}`);
            }
          }
          if (keysToClear.size > 0) {
            setFillingSlots((prev) => {
              let next = prev;
              for (const key of keysToClear) {
                if (next.has(key)) {
                  if (next === prev) next = new Set(prev);
                  next.delete(key);
                }
              }
              return next;
            });
            setQueuedSlots((prev) => {
              let next = prev;
              for (const key of keysToClear) {
                if (next.has(key)) {
                  if (next === prev) next = new Set(prev);
                  next.delete(key);
                }
              }
              return next;
            });
          }
        }
        return;
      }

      if (event.type === "generation_deleted") {
        setHistory((prev) => prev.filter((g) => g.id !== event.data.generationId));
        setActiveGenerationId((prev) => (prev === event.data.generationId ? null : prev));
        setDetail((prev) => (prev && prev.generationId === event.data.generationId ? null : prev));
        return;
      }

      // Handle slot-specific filling events (for non-blocking external workflows)
      if (event.type === "slot_filling") {
        const slotKey = `${event.data.generationId}:${event.data.slotIndex}`;
        if (event.data.status === "running") {
          setFillingSlots((prev) => {
            const next = new Set(prev);
            next.add(slotKey);
            return next;
          });
        } else {
          setFillingSlots((prev) => {
            const next = new Set(prev);
            next.delete(slotKey);
            return next;
          });
        }
      }

      // Handle rembg (remove background) events
      if (event.type === "rembg") {
        const rembgKey = `${event.data.generationId}:${event.data.itemIndex}`;
        if (event.data.status === "running") {
          setRembgProcessing((prev) => {
            const next = new Set(prev);
            next.add(rembgKey);
            return next;
          });
        } else {
          setRembgProcessing((prev) => {
            const next = new Set(prev);
            next.delete(rembgKey);
            return next;
          });
        }
      }
    }
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await getCurrentUser(apiBaseUrl);
        if (active) setCurrentUser(me);
      } catch {
        if (active) setCurrentUser(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

  const activeGeneration = useMemo(() => {
    if (!activeGenerationId) return null;
    return history.find((g) => g.id === activeGenerationId) ?? null;
  }, [history, activeGenerationId]);

  // Filter history by selected workflow and current user (per-user history only)
  const userAliases = useMemo(() => {
    if (!currentUser) return new Set<string>();
    return new Set(currentUser.aliases ?? [currentUser.id]);
  }, [currentUser]);

  const filteredHistory = useMemo(() => {
    if (!workflow) return [];
    return history.filter((g) => {
      if (g.workflowUsed !== workflow) return false;
      if (g.userId && currentUser?.id && !userAliases.has(g.userId)) return false;
      return true;
    });
  }, [history, workflow, currentUser?.id, userAliases]);

  // Compute workflow preview images - merge API previews with local data
  const workflowPreviews = useMemo(() => {
    const previews: Record<string, string> = {};

    for (const [workflowId, url] of Object.entries(workflowPreviewsFromApi)) {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        previews[workflowId] = url;
      } else {
        previews[workflowId] = resolveStorageUrl(apiBaseUrl, url);
      }
    }

    const allGenerations = [...history, ...galleryItems];
    const visibleTypes = assetTypeRegistry.visibleIds();

    for (const generation of allGenerations) {
      if (previews[generation.workflowUsed]) continue;
      if (generation.status !== "succeeded") continue;
      let bestAsset: Asset | null = null;
      let bestOrder = Infinity;
      for (const asset of generation.assets) {
        if (!asset.url) continue;
        if (!visibleTypes.has(asset.type)) continue;
        if (asset.type !== "image" && asset.type !== "video") continue;
        const order = assetTypeRegistry.sortOrder(asset.type);
        if (order < bestOrder) {
          bestAsset = asset;
          bestOrder = order;
        }
      }
      if (bestAsset) {
        previews[generation.workflowUsed] = assetUrl(apiBaseUrl, bestAsset);
      }
    }
    return previews;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowPreviewsFromApi, history, galleryItems, apiBaseUrl, storageReady]);

  const detailGeneration = useMemo(() => {
    if (!detail) return null;
    const fromHistory = history.find((g) => g.id === detail.generationId) ?? null;
    if (fromHistory) return fromHistory;
    const fromGallery = galleryItems.find((g) => g.id === detail.generationId) ?? null;
    if (!fromGallery) return null;
    return { ...fromGallery, assets: fromGallery.assets.filter((a) => a.isActive !== false) };
  }, [history, galleryItems, detail]);

  const selectedWorkflow = useMemo(() => {
    if (!workflow) return null;
    return workflowsRemote.find((w) => w.id === workflow) ?? null;
  }, [workflowsRemote, workflow]);

  const selectedModelId = useMemo(() => {
    const savedModelId = getWorkflowSelection(selectedModelIdsByWorkflow, workflow);
    if (savedModelId && models.some((model) => model.id === savedModelId)) return savedModelId;
    return models[0]?.id ?? "";
  }, [models, selectedModelIdsByWorkflow, workflow]);

  const setSelectedModelId = useCallback((next: string | ((previous: string) => string)) => {
    setSelectedModelIdsByWorkflow((previous) => {
      const previousSelection = getWorkflowSelection(previous, workflow);
      const resolved = typeof next === "function" ? next(previousSelection) : next;
      return setWorkflowSelection(previous, workflow, resolved);
    });
  }, [setSelectedModelIdsByWorkflow, workflow]);

  useEffect(() => {
    if (!workflow || models.length === 0) return;
    setSelectedModelId((previous) => (
      previous && models.some((model) => model.id === previous)
        ? previous
        : models[0]?.id ?? ""
    ));
  }, [models, setSelectedModelId, workflow]);

  const replicateModelId = selectedWorkflow?.dynamicModel
    ? getWorkflowSelection(dynamicModelIdsByWorkflow, workflow) || null
    : null;

  const setReplicateModelIdForWorkflow = useCallback((modelId: string | null) => {
    setDynamicModelIdsByWorkflow((previous) => setWorkflowSelection(previous, workflow, modelId));
  }, [setDynamicModelIdsByWorkflow, workflow]);

  useEffect(() => {
    if (!selectedWorkflow?.dynamicModel || !replicateModelId) {
      setReplicateModelParams(null);
      setReplicateModelFileInputKeys([]);
      setReplicateModelMaxImageInputs(undefined);
      setReplicateModelPromptField("prompt");
      setReplicateModelReadme(null);
      setReplicateModelLoading(false);
      return;
    }

    let cancelled = false;
    const engine = selectedWorkflow.engine;
    setReplicateModelParams(null);
    setReplicateModelFileInputKeys([]);
    setReplicateModelMaxImageInputs(undefined);
    setReplicateModelPromptField("prompt");
    setReplicateModelReadme(null);
    setReplicateModelLoading(true);

    (async () => {
      try {
        const result = (engine === "fal"
          ? await getFalModelParameters(apiBaseUrl, replicateModelId)
          : await getReplicateModelParameters(apiBaseUrl, replicateModelId)) as DynamicModelParameterResult;
        if (cancelled) return;
        setReplicateModelParams(result.parameters ?? []);
        setReplicateModelFileInputKeys(result.fileInputKeys ?? []);
        setReplicateModelMaxImageInputs(result.maxFileInputs ?? undefined);
        setReplicateModelPromptField(result.promptField ?? "prompt");
        setReplicateModelReadme(result.readme ?? null);
        setPromptUi((prev) => ({ ...prev, workflowParams: {} }));
      } catch (e) {
        if (cancelled) return;
        console.warn(`[${engine}] Failed to fetch model parameters:`, e);
        setReplicateModelParams([]);
        setReplicateModelFileInputKeys([]);
        setReplicateModelMaxImageInputs(undefined);
        setReplicateModelPromptField("prompt");
        setReplicateModelReadme(null);
      } finally {
        if (!cancelled) setReplicateModelLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, replicateModelId, selectedWorkflow?.dynamicModel, selectedWorkflow?.engine, setPromptUi]);

  const isCanvasMode = activeView === "canvas" && activeCanvasId != null;
  const promptIsSidebar = selectedWorkflow !== null && isPromptSidebarPosition(promptPosition);
  const hasDashboardItems = !selectedWorkflow && (visibleHomeWorkflows.length > 0 || canvases.length > 0);
  const isFluxLoraWorkflow = selectedWorkflow?.supportsLora === true;
  const loraTagCandidates = useMemo(() => buildLoraTagCandidates(models), [models]);
  const loraTagMatches = useMemo(() => {
    if (!isFluxLoraWorkflow) return null;
    return findLoraTagMatches(prompt, loraTagCandidates);
  }, [isFluxLoraWorkflow, prompt, loraTagCandidates]);
  const loraTagModelId = useMemo(() => {
    if (!isFluxLoraWorkflow || !loraTagMatches) return null;
    return loraTagMatches.length > 0 ? loraTagMatches[loraTagMatches.length - 1]?.id ?? null : null;
  }, [isFluxLoraWorkflow, loraTagMatches]);

  const modelNameById = useMemo(() => {
    const next: Record<string, string> = {};
    for (const model of models) next[model.id] = model.name;
    return next;
  }, [models]);

  useEffect(() => {
    if (!isFluxLoraWorkflow) return;
    if (loraTagModelId && loraTagModelId !== selectedModelId) {
      setSelectedModelId(loraTagModelId);
    }
  }, [isFluxLoraWorkflow, loraTagModelId, selectedModelId]);

  // Fetch asset versions when viewing an asset in the detail panel
  useEffect(() => {
    if (!detail?.generationId || !detail?.assetKey) {
      setAssetVersions([]);
      return;
    }

    const [assetType, itemIndexStr] = detail.assetKey.split(":");
    if (!assetType) {
      setAssetVersions([]);
      return;
    }
    const itemIndex = itemIndexStr === "null" ? null : Number(itemIndexStr);

    let cancelled = false;
    (async () => {
      try {
        const versions = await getAssetVersions(apiBaseUrl, detail.generationId, {
          assetType,
          itemIndex
        });
        if (!cancelled) {
          setAssetVersions(versions);
        }
      } catch (e) {
        console.error("Failed to fetch asset versions:", e);
        if (!cancelled) {
          setAssetVersions([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, detail?.generationId, detail?.assetKey, detailGeneration?.assets]);

  // Version switching callback
  async function onSetActiveVersion(generationId: string, assetId: string) {
    setVersionSwitching(true);
    setError(null);
    try {
      const updatedAssets = await setActiveAssetVersion(apiBaseUrl, generationId, { assetId });

      setHistory((prev) => {
        const idx = prev.findIndex((g) => g.id === generationId);
        if (idx < 0) return prev;
        const g = prev[idx]!;
        const next = [...prev];
        next[idx] = { ...g, assets: updatedAssets };
        return next;
      });
      setGalleryItems((prev) => {
        const idx = prev.findIndex((g) => g.id === generationId);
        if (idx < 0) return prev;
        const g = prev[idx]!;
        const nextAssets = g.assets.map((asset) => ({ ...asset }));
        for (const active of updatedAssets) {
          for (const asset of nextAssets) {
            if (asset.type === active.type && asset.itemIndex === active.itemIndex) {
              asset.isActive = asset.id === active.id;
            }
          }
        }
        const next = [...prev];
        next[idx] = { ...g, assets: nextAssets };
        return next;
      });
    } catch (e) {
      setError(extractError(e, "Failed to switch version"));
    } finally {
      setVersionSwitching(false);
    }
  }

  useEffect(() => {
    if (workflowsRemote.length === 0) {
      if (workflow) {
        setWorkflow("");
        setActiveGenerationId(null);
        setDetail(null);
      }
      return;
    }
    if (workflow && !workflowsRemote.some((w) => w.id === workflow)) {
      setWorkflow("");
      setActiveGenerationId(null);
      setDetail(null);
    }
  }, [workflowsRemote, workflow]);

  // Reset selected preset when workflow changes
  useEffect(() => {
    setSelectedPresetId(null);
  }, [workflow]);

  // Load presets — always available (used via # tags or dropdown)
  useEffect(() => {
    let cancelled = false;
    getPresets(apiBaseUrl)
      .then((list) => {
        if (!cancelled) setPresets(list);
      })
      .catch(() => {
        if (!cancelled) setPresets([]);
      });
    return () => { cancelled = true; };
  }, [apiBaseUrl]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const scale = clampUiScale(uiScale);
    uiScaleRef.current = scale;
    document.documentElement.style.setProperty("--imgimg-ui-scale", String(scale));
  }, [uiScale]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const nextScale = applyUiScaleShortcut(uiScaleRef.current, event);
      if (nextScale === null) return;

      event.preventDefault();
      uiScaleRef.current = nextScale;
      setUiScale(nextScale);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [setUiScale]);

  // Refresh models on startup
  useEffect(() => {
    void refreshModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl]);

  // Health check on startup + init Tauri storage path + load feature workflow config
  useEffect(() => {
    void getHealth(apiBaseUrl).catch(() => {});
    void initStorageBasePath();
    void getFeatureWorkflowConfig(apiBaseUrl).then(setFeatureWorkflows).catch(() => {});
    return onStorageBasePathReady(() => setStorageReady(true));
  }, [apiBaseUrl]);

  async function refresh() {
    setError(null);
    const generations = (await getAdminGenerations(apiBaseUrl)).generations;
    setHistory((prev) => {
      const prevById = new Map(prev.map((g) => [g.id, g]));
      return generations.map((g) => {
        const prevLocal = prevById.get(g.id);
        if (!prevLocal) return g;
        return prevLocal.queuePosition !== undefined ? { ...g, queuePosition: prevLocal.queuePosition } : g;
      });
    });
    setActiveGenerationId((prev) => (prev && generations.some((g) => g.id === prev) ? prev : null));
    setDetail((prev) => {
      if (!prev) return prev;
      const inHistory = generations.some((g) => g.id === prev.generationId);
      const inGallery = galleryItems.some((g) => g.id === prev.generationId);
      return inHistory || inGallery ? prev : null;
    });
  }

  async function refreshModels() {
    const result = await getModels(apiBaseUrl);
    setModels(result.models);
    setSelectedModelId((prev) => (result.models.some((m) => m.id === prev) ? prev : result.models[0]?.id ?? ""));
    if (!result.meta.comfyAvailable && result.meta.message) {
      console.warn("[Provider Status]", result.meta.message);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        await refresh();
        // Fetch workflow previews
        void refreshWorkflowPreviews();
      } catch (e) {
        setError(extractError(e, "Failed to load"));
      }
    })();
  }, [apiBaseUrl]);

  function registerGeneration(params: {
    generationId: string;
    jobId: string;
    workflowId: string;
    modelId: string;
    prompt: string;
    queuePosition?: number | null;
    imageInputUrl?: string | null;
    width?: number;
    height?: number;
  }) {
    const next: Generation = {
      id: params.generationId,
      jobId: params.jobId,
      modelId: params.modelId,
      prompt: params.prompt,
      seed: 0,
      workflowUsed: params.workflowId,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      assets: [],
      imageInputUrl: params.imageInputUrl ?? null,
      queuePosition: params.queuePosition ?? null,
      width: params.width ?? null,
      height: params.height ?? null,
    };
    setHistory((prev) => [next, ...prev.filter((g) => g.id !== next.id)]);
    setActiveGenerationId(params.generationId);
  }

  function handleDynamicModelSelect(modelId: string, _model: DiscoveredModel) {
    setReplicateModelIdForWorkflow(modelId);
    setPromptUi((prev) => ({ ...prev, workflowParams: {} }));
  }

  function handleReplicateModelClear() {
    setReplicateModelIdForWorkflow(null);
    setReplicateModelParams(null);
    setReplicateModelFileInputKeys([]);
    setReplicateModelMaxImageInputs(undefined);
    setReplicateModelPromptField("prompt");
    setReplicateModelReadme(null);
    setPromptUi((prev) => ({ ...prev, workflowParams: {} }));
  }

  function handlePinReplicateModel(model: DiscoveredModel) {
    setPinnedReplicateModelsByType((prev) => {
      const list = prev[currentPinnedKey] ?? [];
      if (list.some((m) => m.modelId === model.modelId)) return prev;
      return { ...prev, [currentPinnedKey]: [...list, model] };
    });
  }

  function handleUnpinReplicateModel(modelId: string) {
    setPinnedReplicateModelsByType((prev) => {
      const list = prev[currentPinnedKey] ?? [];
      return { ...prev, [currentPinnedKey]: list.filter((m) => m.modelId !== modelId) };
    });
  }

  async function onGenerate() {
    if (!selectedWorkflow) {
      setError("Select a workflow.");
      return;
    }
    if (selectedWorkflow.dynamicModel && !replicateModelId) {
      const providerLabel = selectedWorkflow.engine === "fal" ? "FAL"
        : selectedWorkflow.engine === "openrouter" ? "OpenRouter"
        : "Replicate";
      setError(`Select a ${providerLabel} model first.`);
      return;
    }
    if (selectedWorkflow.providerAvailable === false) {
      const engineLabel = selectedWorkflow.engine === "replicate" ? "Replicate"
        : selectedWorkflow.engine === "openrouter" ? "OpenRouter"
        : "ComfyUI";
      setError(`Cannot generate: ${engineLabel} provider is currently unavailable.`);
      return;
    }
    const loraActive = isFluxLoraWorkflow && loraEnabled;
    if (loraActive && loraTagMatches && loraTagMatches.length > 1) {
      setError("Only one LoRA tag is allowed. Remove extra @ tags.");
      return;
    }
    const taggedModelId = loraActive && loraTagMatches && loraTagMatches.length > 0
      ? loraTagMatches[loraTagMatches.length - 1]!.id
      : null;
    const effectiveModelId = loraActive ? (taggedModelId ?? selectedModelId) : "";
    if (loraActive && !effectiveModelId) return;
    if (taggedModelId && taggedModelId !== selectedModelId) {
      setSelectedModelId(taggedModelId);
    }
    setLoading(true);
    setError(null);
    let promptForGeneration = prompt;
    try {
      if (promptUi.enhancePrompt) {
        setEnhancingPrompt(true);
        const originalPrompt = prompt;
        setOriginalPromptBeforeEnhance(originalPrompt);
        setPrompt("");
        try {
          const enhancedPrompt = await streamEnhancedPrompt(apiBaseUrl, { prompt: originalPrompt }, (next) => {
            setPrompt(next);
          });
          if (!enhancedPrompt) throw new Error("Prompt enhancement returned empty output");
          promptForGeneration = enhancedPrompt;
          setPrompt(enhancedPrompt);
          setPromptUi((prev) => ({ ...prev, enhancePrompt: false }));
        } catch (e) {
          setPrompt(originalPrompt);
          setOriginalPromptBeforeEnhance(null);
          throw e;
        } finally {
          setEnhancingPrompt(false);
        }
      }
      const size = selectedWorkflow.ui?.aspectRatio ? aspectRatioToSize(promptUi.aspectRatio) : null;
      const batchSize = selectedWorkflow.ui?.batchSize ? promptUi.batchSize : undefined;
      const imageOnlyInputs = promptUi.imageInputs.filter((input) => input.mediaType !== "video" && input.mediaType !== "audio");
      const videoInput = promptUi.imageInputs.find((input) => input.mediaType === "video");
      const imageDataUrls = selectedWorkflow.supportsImageInput
        ? imageOnlyInputs.map((input) => input.dataUrl)
        : [];
      const imageDataUrl = imageDataUrls[0];
      const videoDataUrl = videoInput?.dataUrl;
      const audioInput = promptUi.imageInputs.find((input) => input.mediaType === "audio");
      const audioDataUrl = audioInput?.dataUrl;
      const workflowParamsToSend: Record<string, number | boolean | string> = { ...promptUi.workflowParams };
      if (selectedWorkflow.supportsRemoveItemBackgrounds && promptUi.removeItemBackgrounds) {
        workflowParamsToSend.remove_item_backgrounds = true;
      }
      const workflowParamsPayload = Object.keys(workflowParamsToSend).length > 0 ? workflowParamsToSend : undefined;
      let aspectRatio = selectedWorkflow.ui?.aspectRatio ? promptUi.aspectRatio : undefined;
      if (!aspectRatio && imageDataUrl) {
        try {
          const dims = await getImageDimensions(imageDataUrl);
          aspectRatio = nearestAspectRatio(dims.width, dims.height);
        } catch { /* fall through */ }
      }
      const { generationId, jobId, queuePosition } = await createGeneration(apiBaseUrl, {
        modelId: effectiveModelId,
        prompt: promptForGeneration,
        workflowId: selectedWorkflow.id,
        width: size?.width,
        height: size?.height,
        batchSize,
        imageDataUrl,
        imageDataUrls: imageDataUrls.length > 0 ? imageDataUrls : undefined,
        videoDataUrl,
        audioDataUrl,
        aspectRatio,
        workflowParams: workflowParamsPayload,
        presetId: selectedPresetId ?? undefined,
        replicateModel: selectedWorkflow.dynamicModel && selectedWorkflow.engine === "replicate" ? replicateModelId ?? undefined : undefined,
        falModel: selectedWorkflow.dynamicModel && selectedWorkflow.engine === "fal" ? replicateModelId ?? undefined : undefined,
        openrouterModel: selectedWorkflow.dynamicModel && selectedWorkflow.engine === "openrouter" ? replicateModelId ?? undefined : undefined,
        fileInputKeys: selectedWorkflow.dynamicModel ? replicateModelFileInputKeys : undefined,
        promptField: selectedWorkflow.dynamicModel && replicateModelPromptField !== "prompt" ? replicateModelPromptField : undefined,
      });
      registerGeneration({
        generationId,
        jobId,
        workflowId: selectedWorkflow.id,
        modelId: effectiveModelId,
        prompt: promptForGeneration,
        queuePosition,
        imageInputUrl: imageDataUrl ?? null
      });
    } catch (e) {
      setError(extractError(e, "Generate failed"));
    } finally {
      setEnhancingPrompt(false);
      setLoading(false);
    }
  }

  async function onRegen(
    generationId: string,
    itemIndex: number | null,
    assetType: AssetTypeForRegen = "item",
    options?: { closeDetail?: boolean; promptPrefix?: string }
  ) {
    if (options?.closeDetail) {
      setDetail(null);
    }
    setLoading(true);
    setError(null);
    const assetKey = assetType === "item" && itemIndex !== null
      ? `item:${itemIndex}`
      : `${assetType}:null`;
    const slotKey = `${generationId}:${itemIndex !== null ? itemIndex : assetType}`;
    setFillingSlots((prev) => {
      const next = new Set(prev);
      next.add(slotKey);
      return next;
    });
    try {
      const promptPrefix = options?.promptPrefix?.trim() || undefined;
      const { jobId, queuePosition, assets } = await regenerateItem(apiBaseUrl, generationId, {
        itemIndex: itemIndex ?? undefined,
        assetType,
        promptPrefix
      });

      const isNonBlocking = queuePosition === 0;

      if (isNonBlocking) {
        setQueuedSlots((prev) => {
          if (!prev.has(slotKey)) return prev;
          const next = new Set(prev);
          next.delete(slotKey);
          return next;
        });
        if (assets && assets.length > 0) {
          setHistory((prev) => {
            const idx = prev.findIndex((g) => g.id === generationId);
            if (idx < 0) return prev;
            const g = prev[idx]!;
            const nextAssets = mergeAssets(g.assets, assets);
            const next = [...prev];
            next[idx] = { ...g, assets: nextAssets, error: null };
            return next;
          });

          const keysToClear = new Set<string>();
          for (const asset of assets) {
            if (asset.itemIndex !== null && asset.itemIndex !== undefined) {
              keysToClear.add(`${generationId}:${asset.itemIndex}`);
            } else {
              keysToClear.add(`${generationId}:${asset.type}`);
            }
          }
          if (keysToClear.size > 0) {
            setFillingSlots((prev) => {
              let next = prev;
              for (const key of keysToClear) {
                if (next.has(key)) {
                  if (next === prev) next = new Set(prev);
                  next.delete(key);
                }
              }
              return next;
            });
            setQueuedSlots((prev) => {
              let next = prev;
              for (const key of keysToClear) {
                if (next.has(key)) {
                  if (next === prev) next = new Set(prev);
                  next.delete(key);
                }
              }
              return next;
            });
          }
        }
      } else {
        setFillingSlots((prev) => {
          if (!prev.has(slotKey)) return prev;
          const next = new Set(prev);
          next.delete(slotKey);
          return next;
        });
        setQueuedSlots((prev) => {
          const next = new Set(prev);
          next.add(slotKey);
          return next;
        });
        setHistory((prev) => {
          const idx = prev.findIndex((g) => g.id === generationId);
          if (idx < 0) return prev;
          const g = prev[idx]!;
          const updated: Generation = { ...g, jobId, status: "queued", queuePosition, error: null };
          const rest = prev.filter((x) => x.id !== generationId);
          return [updated, ...rest];
        });
        setActiveGenerationId(generationId);
        if (!options?.closeDetail) {
          setDetail({ generationId, assetKey });
        }
      }
    } catch (e) {
      setFillingSlots((prev) => {
        if (!prev.has(slotKey)) return prev;
        const next = new Set(prev);
        next.delete(slotKey);
        return next;
      });
      setQueuedSlots((prev) => {
        if (!prev.has(slotKey)) return prev;
        const next = new Set(prev);
        next.delete(slotKey);
        return next;
      });
      setError(extractError(e, "Regenerate failed"));
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(genId: string) {
    setLoading(true);
    setError(null);
    try {
      await deleteGeneration(apiBaseUrl, genId);
      setHistory((prev) => prev.filter((g) => g.id !== genId));
      setGalleryItems((prev) => prev.filter((g) => g.id !== genId));
      setActiveGenerationId((prev) => (prev === genId ? null : prev));
      setDetail((prev) => (prev && prev.generationId === genId ? null : prev));
    } catch (e) {
      setError(extractError(e, "Delete failed"));
    } finally {
      setLoading(false);
    }
  }

  async function onGenerateAgain(g: Generation) {
    setLoading(true);
    setError(null);
    try {
      const wf = workflowsRemote.find((w) => w.id === g.workflowUsed) ?? null;
      const size = wf?.ui?.aspectRatio ? aspectRatioToSize(promptUi.aspectRatio) : null;

      let imageDataUrl: string | undefined;
      if (g.imageInputUrl && wf?.supportsImageInput) {
        try {
          if (g.imageInputUrl.startsWith("data:")) {
            imageDataUrl = g.imageInputUrl;
          } else {
            const fullUrl = resolveStorageUrl(apiBaseUrl, g.imageInputUrl);
            const res = await fetch(fullUrl);
            const blob = await res.blob();
            imageDataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          }
        } catch {
          console.warn("Failed to load image input for regeneration");
        }
      }

      const aspectRatio = wf?.ui?.aspectRatio ? promptUi.aspectRatio : undefined;
      const origParams = g.workflowParams ?? {};
      const forwardedParams: Record<string, number | boolean | string> = {};
      for (const [k, v] of Object.entries(origParams)) {
        if (k === "image_inputs") continue;
        if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
          forwardedParams[k] = v;
        }
      }
      const workflowParams = Object.keys(forwardedParams).length > 0 ? forwardedParams : undefined;
      const { generationId, jobId, queuePosition } = await createGeneration(apiBaseUrl, {
        modelId: g.modelId,
        prompt: g.prompt,
        workflowId: g.workflowUsed as WorkflowId,
        width: size?.width,
        height: size?.height,
        imageDataUrl,
        aspectRatio,
        workflowParams
      });
      const next: Generation = {
        id: generationId,
        jobId,
        modelId: g.modelId,
        prompt: g.prompt,
        seed: 0,
        workflowUsed: g.workflowUsed,
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
        assets: [],
        imageInputUrl: imageDataUrl ?? null,
        queuePosition
      };
      setHistory((prev) => [next, ...prev]);
      setActiveGenerationId(generationId);
      setDetail({ generationId, assetKey: null });
    } catch (e) {
      setError(extractError(e, "Generate failed"));
    } finally {
      setLoading(false);
    }
  }

  async function onOutpaint(imageUrl: string, params: OutpaintParams, sourcePrompt: string) {
    setLoading(true);
    setError(null);
    try {
      // Convert image URL to data URL — fetch works for both http and asset:// (Tauri) URLs
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const imageDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const outpaintWorkflowId = featureWorkflows.outpaintWorkflowId;
      if (!outpaintWorkflowId) {
        setError("Outpaint workflow not configured. Set it in Settings > Feature Workflows.");
        return;
      }
      const outpaintPrompt = sourcePrompt || "Seamlessly extend the image, maintaining the style and content";
      const count = promptUi.batchSize || 1;

      // Outpaint workflow produces 1 image per run, so fire N separate generations
      let firstGenerationId: string | null = null;
      for (let i = 0; i < count; i++) {
        const { generationId, jobId, queuePosition } = await createOutpaintGeneration(apiBaseUrl, {
          modelId: selectedModelId,
          prompt: outpaintPrompt,
          imageDataUrl,
          outpaintWorkflowId,
          outpaintParams: params,
        });

        if (i === 0) firstGenerationId = generationId;

        const next: Generation = {
          id: generationId,
          jobId,
          modelId: selectedModelId,
          prompt: outpaintPrompt,
          seed: 0,
          workflowUsed: outpaintWorkflowId,
          status: "queued",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          error: null,
          assets: [],
          imageInputUrl: imageDataUrl,
          queuePosition
        };
        setHistory((prev) => [next, ...prev.filter((g) => g.id !== next.id)]);
      }

      setWorkflow(outpaintWorkflowId);
      if (firstGenerationId) setActiveGenerationId(firstGenerationId);
      setDetail(null);
    } catch (e) {
      setError(extractError(e, "Outpaint failed"));
    } finally {
      setLoading(false);
    }
  }

  async function onInpaint(params: {
    generationId: string;
    assetType: AssetTypeForInpaint;
    itemIndex: number | null;
    imageDataUrl: string;
    maskDataUrl: string;
    prompt: string;
    seed?: number;
  }) {
    setLoading(true);
    setError(null);
    const assetKey = params.itemIndex !== null && params.itemIndex !== undefined
      ? `${params.assetType}:${params.itemIndex}`
      : `${params.assetType}:null`;
    const slotKey = `${params.generationId}:${params.itemIndex !== null && params.itemIndex !== undefined ? params.itemIndex : params.assetType}`;
    setFillingSlots((prev) => {
      const next = new Set(prev);
      next.add(slotKey);
      return next;
    });
    try {
      const { jobId, queuePosition } = await createInpaintAssetVersion(apiBaseUrl, params.generationId, {
        assetType: params.assetType,
        itemIndex: params.itemIndex,
        prompt: params.prompt,
        seed: params.seed,
        imageDataUrl: params.imageDataUrl,
        maskDataUrl: params.maskDataUrl
      });

      const isNonBlocking = queuePosition === 0;
      if (isNonBlocking) {
        setQueuedSlots((prev) => {
          if (!prev.has(slotKey)) return prev;
          const next = new Set(prev);
          next.delete(slotKey);
          return next;
        });
      } else {
        setQueuedSlots((prev) => {
          const next = new Set(prev);
          next.add(slotKey);
          return next;
        });
        setHistory((prev) => {
          const idx = prev.findIndex((g) => g.id === params.generationId);
          if (idx < 0) return prev;
          const g = prev[idx]!;
          const updated: Generation = { ...g, jobId, status: "queued", queuePosition, error: null };
          const rest = prev.filter((x) => x.id !== params.generationId);
          return [updated, ...rest];
        });
        setActiveGenerationId(params.generationId);
        setDetail({ generationId: params.generationId, assetKey });
      }
    } catch (e) {
      setFillingSlots((prev) => {
        if (!prev.has(slotKey)) return prev;
        const next = new Set(prev);
        next.delete(slotKey);
        return next;
      });
      setQueuedSlots((prev) => {
        if (!prev.has(slotKey)) return prev;
        const next = new Set(prev);
        next.delete(slotKey);
        return next;
      });
      setError(extractError(e, "Inpaint failed"));
    } finally {
      setLoading(false);
    }
  }

  async function onDownloadAll(generationId: string) {
    setLoading(true);
    setError(null);
    try {
      const { blob, filename } = await downloadGenerationAssetsZip(apiBaseUrl, generationId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(extractError(e, "Download failed"));
    } finally {
      setLoading(false);
    }
  }

  async function onRemoveBackground(generationId: string, itemIndex: number) {
    const rembgKey = `${generationId}:${itemIndex}`;
    if (rembgProcessing.has(rembgKey)) return;

    setRembgProcessing((prev) => {
      const next = new Set(prev);
      next.add(rembgKey);
      return next;
    });

    try {
      await removeBackground(apiBaseUrl, generationId, { itemIndex });
    } catch (e) {
      setError(extractError(e, "Remove background failed"));
      setRembgProcessing((prev) => {
        const next = new Set(prev);
        next.delete(rembgKey);
        return next;
      });
    }
  }

  const detailRembgProcessing = useMemo(() => {
    if (!detail) return new Set<number>();
    const prefix = `${detail.generationId}:`;
    const result = new Set<number>();
    for (const key of rembgProcessing) {
      if (key.startsWith(prefix)) {
        const itemIndex = parseInt(key.slice(prefix.length), 10);
        if (!isNaN(itemIndex)) result.add(itemIndex);
      }
    }
    return result;
  }, [detail, rembgProcessing]);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <TitleBar apiBaseUrl={apiBaseUrl} enabledProviders={enabledProviders} />
      {/* Skip navigation link for accessibility */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-zinc-600 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg">
        Skip to main content
      </a>
      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar (hidden below lg) */}
        <Sidebar
          workflow={workflow}
          onWorkflowChange={(next) => {
            setWorkflow(next);
            setActiveView("generate");
            setActiveGenerationId(null);
            setDetail(null);
            setPromptUi((prev) => ({ ...prev, workflowParams: {}, removeItemBackgrounds: false }));
          }}
          workflows={workflowsRemote.map((w) => ({ id: w.id, label: w.label, providerAvailable: w.providerAvailable, engine: w.engine }))}
          pinnedWorkflowIds={pinnedWorkflowIds}
          onTogglePin={handleTogglePin}
          organization={workflowOrg}
          onReorderWorkflows={handleReorderWorkflows}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          activeView={activeView}
          onGalleryOpen={() => {
            setActiveView("gallery");
            setActiveGenerationId(null);
            setDetail(null);
          }}
          onPromptsOpen={() => {
            setActiveView("prompts");
            setActiveGenerationId(null);
            setDetail(null);
          }}
          onCompareOpen={() => {
            setActiveView("compare");
            setActiveGenerationId(null);
            setDetail(null);
          }}
          onAudioOpen={() => {
            setActiveView("audio");
            setActiveGenerationId(null);
            setDetail(null);
          }}
          onIterateOpen={() => {
            setActiveView("iterate");
            setActiveGenerationId(null);
            setDetail(null);
          }}
          onSettingsOpen={() => setAdminPanelOpen(true)}
          onLogoClick={() => {
            setWorkflow("");
            setActiveView("generate");
            setActiveGenerationId(null);
            setDetail(null);
            setSidebarCollapsed(false);
          }}
          canvases={canvases}
          activeCanvasId={activeCanvasId}
          onCanvasSelect={handleCanvasSelect}
          onCanvasCreate={handleCanvasCreate}
          onCanvasDelete={handleCanvasDelete}
          onCanvasRename={handleCanvasRename}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
          enabledProviders={enabledProviders}
        />

        {/* Mobile sidebar overlay (visible below lg) */}
        <MobileSidebarOverlay open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)}>
          <Sidebar
            className="flex h-full w-full flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black"
            workflow={workflow}
            onWorkflowChange={(next) => {
              setWorkflow(next); setActiveView("generate"); setActiveGenerationId(null); setDetail(null);
              setPromptUi((prev) => ({ ...prev, workflowParams: {}, removeItemBackgrounds: false }));
              setMobileSidebarOpen(false);
            }}
            workflows={workflowsRemote.map((w) => ({ id: w.id, label: w.label, providerAvailable: w.providerAvailable, engine: w.engine }))}
            pinnedWorkflowIds={pinnedWorkflowIds}
            onTogglePin={handleTogglePin}
            organization={workflowOrg}
            onReorderWorkflows={handleReorderWorkflows}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            activeView={activeView}
            onGalleryOpen={() => { setActiveView("gallery"); setMobileSidebarOpen(false); }}
            onPromptsOpen={() => { setActiveView("prompts"); setMobileSidebarOpen(false); }}
            onCompareOpen={() => { setActiveView("compare"); setMobileSidebarOpen(false); }}
            onAudioOpen={() => { setActiveView("audio"); setMobileSidebarOpen(false); }}
            onIterateOpen={() => { setActiveView("iterate"); setMobileSidebarOpen(false); }}
            onSettingsOpen={() => { setAdminPanelOpen(true); setMobileSidebarOpen(false); }}
            onLogoClick={() => { setWorkflow(""); setActiveView("generate"); setMobileSidebarOpen(false); }}
            canvases={canvases}
            activeCanvasId={activeCanvasId}
            onCanvasSelect={(id) => { handleCanvasSelect(id); setMobileSidebarOpen(false); }}
            onCanvasCreate={() => { handleCanvasCreate(); setMobileSidebarOpen(false); }}
            onCanvasDelete={handleCanvasDelete}
            onCanvasRename={handleCanvasRename}
            enabledProviders={enabledProviders}
          />
        </MobileSidebarOverlay>

        <div id="main-content" className="relative flex min-w-0 flex-1 flex-col">
          {/* Mobile hamburger button (visible below lg) */}
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="absolute top-3 left-3 z-10 rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 lg:hidden dark:text-zinc-400 dark:hover:bg-zinc-900"
            aria-label="Open sidebar"
          >
            <TbMenu2 className="h-5 w-5" />
          </button>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
             <div
              className={cn(
                "mx-auto flex w-full min-h-0 flex-1 flex-col overflow-hidden",
                isCanvasMode ? "max-w-none p-0" : "px-6 pb-6 pt-4",
                !isCanvasMode && (
                  widthPreference === "full" || activeView === "audio" || activeView === "iterate"
                    ? "max-w-none"
                    : promptIsSidebar ? "max-w-none" : "max-w-6xl"
                )
              )}
            >
              {activeView === "gallery" ? (
                <GalleryPanel
                  apiBaseUrl={apiBaseUrl}
                  workflows={workflowsRemote}
                  assetTypeRegistry={assetTypeRegistry}
                  models={models}
                  items={galleryItems}
                  onItemsChange={setGalleryItems}
                  selectedGenerationId={detail?.generationId ?? null}
                  assetUrl={assetUrl}
                  onOpenAsset={(g, asset) => {
                    setDetail({ generationId: g.id, assetKey: `${asset.type}:${asset.itemIndex ?? "null"}` });
                  }}
                  authToken={null}
                  eventsEnabled={true}
                />
              ) : activeView === "prompts" ? (
                <PromptManagerPanel
                  savedPrompts={savedPrompts}
                  onSavedPromptsChange={setSavedPrompts}
                />
              ) : activeView === "compare" ? (
                <CompareView
                  apiBaseUrl={apiBaseUrl}
                  providerStatus={providerStatus}
                  history={history}
                  assetUrl={(asset) => assetUrl(apiBaseUrl, asset)}
                  savedPrompts={savedPrompts}
                />
              ) : activeView === "audio" ? (
                <AudioDesk
                  apiBaseUrl={apiBaseUrl}
                  workflows={workflowsRemote}
                  history={history}
                  enabledProviders={enabledProviders}
                  loading={loading}
                  assetUrl={(asset) => assetUrl(apiBaseUrl, asset)}
                  onRegisterGeneration={registerGeneration}
                  onOpenAsset={(g, asset) => {
                    setActiveGenerationId(g.id);
                    setDetail({ generationId: g.id, assetKey: `${asset.type}:${asset.itemIndex ?? "null"}` });
                  }}
                />
              ) : activeView === "iterate" ? (
                <IterateWorkspace
                  apiBaseUrl={apiBaseUrl}
                  workflows={workflowsRemote}
                  history={history}
                  enabledProviders={enabledProviders}
                  assetUrl={(asset) => assetUrl(apiBaseUrl, asset)}
                  onRegisterGeneration={registerGeneration}
                  onOpenAsset={(g, asset) => {
                    setActiveGenerationId(g.id);
                    setDetail({ generationId: g.id, assetKey: `${asset.type}:${asset.itemIndex ?? "null"}` });
                  }}
                />
              ) : isCanvasMode ? (
                <CanvasWorkspace
                  key={activeCanvasId!}
                  apiBaseUrl={apiBaseUrl}
                  canvasWorkflowId={workflowsRemote.find((w) => w.ui?.canvasMode)?.id ?? workflowsRemote[0]?.id ?? ""}
                  canvasId={activeCanvasId!}
                  selectedModelId={selectedModelId}
                  models={models}
                  featureWorkflows={featureWorkflows}
                  history={history}
                  workflows={workflowsRemote}
                  assetUrl={(asset) => assetUrl(apiBaseUrl, asset)}
                  onRegisterGeneration={registerGeneration}
                  currentUser={currentUser ? { id: currentUser.id, email: currentUser.email } : null}
                  providerStatus={providerStatus}
                  pinnedReplicateModels={pinnedReplicateModels}
                  onPinReplicateModel={handlePinReplicateModel}
                  onUnpinReplicateModel={handleUnpinReplicateModel}
                />
              ) : (
                <div className={cn(
                  "flex min-h-0 flex-1 flex-col",
                  getPromptFlowClassName(promptPosition, selectedWorkflow !== null)
                )}>
                  <div className={getPromptPaneClassName({
                    position: promptPosition,
                    hasWorkflow: selectedWorkflow !== null,
                    hasDashboardItems,
                  })}>
                    {hasDashboardItems ? (
                      /* Workflow card grid when no workflow selected but workflows available */
                      <WorkflowCardGrid
                        workflows={visibleHomeWorkflows}
                        workflowPreviews={workflowPreviews}
                        organization={workflowOrg}
                        cardSize={cardSize}
                        cardThumbnailMode={cardThumbnailMode}
                        onSelectWorkflow={(id) => {
                          setWorkflow(id);
                          setActiveGenerationId(null);
                          setDetail(null);
                          setPromptUi((prev) => ({ ...prev, workflowParams: {}, removeItemBackgrounds: false }));
                          setSidebarCollapsed(true);
                        }}
                        canvases={canvases}
                        canvasPreviews={canvasPreviews}
                        onCanvasSelect={handleCanvasSelect}
                        onCanvasCreate={handleCanvasCreate}
                        enabledProviders={enabledProviders}
                      />
                    ) : !selectedWorkflow ? (
                      /* Empty state when no workflows available */
                      <div className="flex min-h-[300px] flex-col items-center justify-center">
                        <div className="text-center">
                          <div className="mb-4 flex justify-center">
                            <div className="rounded-xl bg-zinc-100 p-4 dark:bg-zinc-800">
                              <TbWand className="h-12 w-12 text-zinc-600 dark:text-zinc-400" />
                            </div>
                          </div>
                          <h2 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">No workflows available</h2>
                          <p className="mb-4 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
                            Workflows appear here when you connect a provider with an API key.
                          </p>
                          <div className="flex justify-center gap-3">
                            <button
                              type="button"
                              onClick={() => setShowOnboarding(true)}
                              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                            >
                              Set Up Providers
                            </button>
                            <button
                              type="button"
                              onClick={() => setAdminPanelOpen(true)}
                              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                            >
                              Open Settings
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <PromptCenterpiece
                        apiBaseUrl={apiBaseUrl}
                        models={models}
                        selectedModelId={selectedModelId}
                        onSelectedModelIdChange={setSelectedModelId}
                        prompt={prompt}
                        onPromptChange={(next) => {
                          setPrompt(next);
                          if (!enhancingPrompt) {
                            setOriginalPromptBeforeEnhance(null);
                          }
                        }}
                        onGenerate={() => void onGenerate()}
                        disabled={loading}
                        enhancing={enhancingPrompt}
                        workflowSelected={selectedWorkflow !== null}
                        status={activeGeneration?.status ?? "idle"}
                        queuePosition={activeGeneration?.queuePosition ?? null}
                        state={promptUi}
                        onStateChange={setPromptUi}
                        workflowLabel={selectedWorkflow?.label ?? "Select workflow"}
                        showAspectRatio={Boolean(selectedWorkflow?.ui?.aspectRatio)}
                        showBatchSize={Boolean(selectedWorkflow?.ui?.batchSize)}
                        supportsImageInput={Boolean(selectedWorkflow?.supportsImageInput)}
                        requiresImageInput={Boolean(selectedWorkflow?.requiresImageInput)}
                        supportsVideoInput={Boolean(selectedWorkflow?.supportsVideoInput)}
                        supportsAudioInput={Boolean(selectedWorkflow?.supportsAudioInput)}
                        maxAudioInputs={selectedWorkflow?.maxAudioInputs}
                        maxImageInputs={selectedWorkflow?.dynamicModel ? replicateModelMaxImageInputs ?? selectedWorkflow?.maxImageInputs : selectedWorkflow?.maxImageInputs}
                        lastFrameImage={Boolean(selectedWorkflow?.ui?.lastFrameImage)}
                        supportsLora={selectedWorkflow?.supportsLora === true}
                        loraEnabled={loraEnabled}
                        onLoraEnabledChange={setLoraEnabled}
                        enableLoraTagging={isFluxLoraWorkflow && loraEnabled}
                        savedPrompts={savedPrompts}
                        workflowParameters={selectedWorkflow?.dynamicModel ? replicateModelParams ?? undefined : selectedWorkflow?.parameters}
                        supportedAspectRatios={selectedWorkflow?.supportedAspectRatios}
                        appendAspectRatioToPrompt={selectedWorkflow?.appendAspectRatioToPrompt}
                        promptRequired={selectedWorkflow?.promptRequired}
                        outputMode={selectedWorkflow?.outputMode}
                        showRemoveItemBackgrounds={Boolean(selectedWorkflow?.supportsRemoveItemBackgrounds)}
                        supportsPresets={Boolean(selectedWorkflow?.supportsPresets)}
                        presets={presets}
                        selectedPresetId={selectedPresetId}
                        onPresetChange={setSelectedPresetId}
                        originalPrompt={originalPromptBeforeEnhance}
                        onRevertPrompt={() => {
                          if (originalPromptBeforeEnhance) {
                            setPrompt(originalPromptBeforeEnhance);
                            setOriginalPromptBeforeEnhance(null);
                          }
                        }}
                        dynamicModel={selectedWorkflow?.dynamicModel}
                        dynamicModelProvider={
                          selectedWorkflow?.engine === "fal" ? "fal"
                          : selectedWorkflow?.engine === "openrouter" ? "openrouter"
                          : "replicate"
                        }
                        dynamicModelAssetType={
                          selectedWorkflow?.id?.includes("audio") ? "audio"
                          : selectedWorkflow?.id?.includes("video") ? "video"
                          : "image"
                        }
                        selectedDynamicModelId={replicateModelId}
                        onDynamicModelSelect={handleDynamicModelSelect}
                        onDynamicModelClear={handleReplicateModelClear}
                        dynamicModelReadme={replicateModelReadme}
                        pinnedDynamicModels={pinnedReplicateModels}
                        onPinDynamicModel={handlePinReplicateModel}
                        onUnpinDynamicModel={handleUnpinReplicateModel}
                        providerAvailable={selectedWorkflow?.providerAvailable}
                        engine={selectedWorkflow?.engine}
                        onOpenSettings={() => { setAdminPanelTab("prompt-enhancer"); setAdminPanelOpen(true); }}
                        promptPosition={promptPosition}
                      />
                    )}

                    {error && selectedWorkflow ? (
                      <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                        {error}
                      </div>
                    ) : null}
                  </div>

                  {/* Show history only inside workflow view, not on card dashboard */}
                  {selectedWorkflow ? (
                    <div className={getHistoryPaneClassName(promptPosition)}>
                      <GenerationHistoryList
                        apiBaseUrl={apiBaseUrl}
                        title="History"
                        generations={filteredHistory}
                        selectedGenerationId={activeGenerationId}
                        workflows={workflowsRemote}
                        assetTypeRegistry={assetTypeRegistry}
                        loading={loading}
                        fillingSlots={fillingSlots}
                        queuedSlots={queuedSlots}
                        onRefresh={() => void refresh()}
                        onOpenGeneration={(g) => {
                          setActiveGenerationId(g.id);
                          setDetail({ generationId: g.id, assetKey: null });
                        }}
                        onDelete={(generationId) => void onDelete(generationId)}
                        assetUrl={assetUrl}
                        onOpenAsset={(g, asset) => {
                          setActiveGenerationId(g.id);
                          setDetail({ generationId: g.id, assetKey: `${asset.type}:${asset.itemIndex ?? "null"}` });
                        }}
                        onFillSlot={(generationId, slotIndex) => void onRegen(generationId, slotIndex, "image")}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <GenerationDetailPanel
        open={detail !== null}
        selection={detail}
        generation={detailGeneration}
        workflows={workflowsRemote}
        assetTypeRegistry={assetTypeRegistry}
        apiBaseUrl={apiBaseUrl}
        assetUrl={assetUrl}
        modelNameById={modelNameById}
        isAdmin={true}
        loading={loading}
        onClose={() => setDetail(null)}
        onSelectAssetKey={(next) => setDetail((prev) => (prev ? { ...prev, assetKey: next } : prev))}
        onDeleteGeneration={(generationId) => void onDelete(generationId)}
        onUsePrompt={(nextPrompt, imageInputUrl, imageInputUrls) => {
          setPrompt(nextPrompt);
          const sources =
            imageInputUrls && imageInputUrls.length > 0
              ? imageInputUrls
              : imageInputUrl
                ? [imageInputUrl]
                : [];
          if (sources.length === 0) {
            setPromptUi((prev) => ({ ...prev, imageInputs: [] }));
            return;
          }
          void (async () => {
            const results = await Promise.allSettled(
              sources.map(async (source, index) => {
                const name = `reused-image-${index + 1}.png`;
                if (source.startsWith("data:")) {
                  return { dataUrl: source, file: null, name };
                }
                const fullUrl = resolveStorageUrl(apiBaseUrl, source);
                const res = await fetch(fullUrl);
                if (!res.ok) {
                  throw new Error("Failed to load image input for reuse");
                }
                const blob = await res.blob();
                const dataUrl = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
                });
                return { dataUrl, file: null, name };
              })
            );
            const imageInputs = results
              .filter((result): result is PromiseFulfilledResult<{ dataUrl: string; file: null; name: string }> => result.status === "fulfilled")
              .map((result) => result.value);
            if (imageInputs.length === 0) {
              console.warn("Failed to load image input for reuse");
              setPromptUi((prev) => ({ ...prev, imageInputs: [] }));
              return;
            }
            setPromptUi((prev) => ({ ...prev, imageInputs }));
          })();
        }}
        onGenerateAgain={(g) => void onGenerateAgain(g)}
        onRegenerateItem={(generationId, itemIndex, assetType, promptPrefix) =>
          void onRegen(generationId, itemIndex, assetType, { closeDetail: true, promptPrefix })
        }
        onSendToWorkflow={(targetWorkflowId, imageUrl) => {
          setWorkflow(targetWorkflowId);
          fetch(imageUrl, { headers: buildAuthHeaders(), credentials: "include" })
            .then((res) => res.blob())
            .then((blob) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                setPromptUi((prev) => ({
                  ...prev,
                  imageInputs: [{ dataUrl, file: null, name: "sent-image.png" }]
                }));
              };
              reader.readAsDataURL(blob);
            })
            .catch(() => {
              setError("Failed to load image for transfer");
            });
          setDetail(null);
          setActiveGenerationId(null);
        }}
        onOutpaint={featureWorkflows.outpaintWorkflowId ? (imageUrl, params, sourcePrompt) => void onOutpaint(imageUrl, params, sourcePrompt) : undefined}
        onInpaint={featureWorkflows.inpaintWorkflowId ? (params) => void onInpaint(params) : undefined}
        onDownloadAll={(generationId) => void onDownloadAll(generationId)}
        onRemoveBackground={featureWorkflows.rembgWorkflowId ? (generationId, itemIndex) => onRemoveBackground(generationId, itemIndex) : undefined}
        rembgProcessing={detailRembgProcessing}
        featureWorkflowStatus={{
          inpaintConfigured: !!featureWorkflows.inpaintWorkflowId,
          outpaintConfigured: !!featureWorkflows.outpaintWorkflowId,
          rembgConfigured: !!featureWorkflows.rembgWorkflowId,
        }}
        assetVersions={assetVersions}
        onSetActiveVersion={(generationId, assetId) => onSetActiveVersion(generationId, assetId)}
        versionSwitching={versionSwitching}
      />

      <AdminPanel
        isOpen={adminPanelOpen}
        onClose={() => { setAdminPanelOpen(false); setAdminPanelTab(undefined); void refreshWorkflows(); void refreshAssetTypes(); void refreshModels(); void getFeatureWorkflowConfig(apiBaseUrl).then(setFeatureWorkflows).catch(() => {}); }}
        apiBaseUrl={apiBaseUrl}
        theme={theme}
        onThemeChange={setTheme}
        widthPreference={widthPreference}
        onWidthPreferenceChange={setWidthPreference}
        enabledProviders={enabledProviders}
        onEnabledProvidersChange={setEnabledProviders}
        cardSize={cardSize}
        onCardSizeChange={setCardSize}
        cardThumbnailMode={cardThumbnailMode}
        onCardThumbnailModeChange={setCardThumbnailMode}
        promptPosition={promptPosition}
        onPromptPositionChange={setPromptPosition}
        onWorkflowsChanged={() => void refreshWorkflows()}
        initialTab={adminPanelTab}
      />

      {showOnboarding && (
        <WelcomeWizard
          onComplete={() => {
            setShowOnboarding(false);
            void refreshWorkflows();
          }}
        />
      )}
    </main>
  );
}
