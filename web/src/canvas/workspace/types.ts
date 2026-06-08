import type { Asset, Generation, Model } from "../../types";
import type { ApiBaseUrl, DiscoveredModel, ProviderStatus, WorkflowSummary } from "../../api";

/** Asset types that should NOT be placed on the canvas (previews, media, system types) */
export const NON_PLACEABLE_TYPES = new Set(["preview", "video", "audio", "placeholder", "rembg"]);

export type CanvasWorkspaceProps = {
  apiBaseUrl: ApiBaseUrl;
  canvasWorkflowId: string;
  /** Local canvas ID for multi-canvas mode. */
  canvasId?: string;
  selectedModelId: string;
  models: Model[];
  history: Generation[];
  workflows: WorkflowSummary[];
  assetUrl: (asset: Asset) => string;
  onRegisterGeneration: (params: {
    generationId: string;
    jobId: string;
    workflowId: string;
    modelId: string;
    prompt: string;
    queuePosition?: number | null;
    imageInputUrl?: string | null;
    width?: number;
    height?: number;
  }) => void;
  currentUser: { id: string; email: string } | null;
  providerStatus: ProviderStatus | null;
  pinnedReplicateModels: DiscoveredModel[];
  onPinReplicateModel: (model: DiscoveredModel) => void;
  onUnpinReplicateModel: (modelId: string) => void;
  featureWorkflows?: {
    inpaintWorkflowId: string | null;
    outpaintWorkflowId: string | null;
    rembgWorkflowId: string | null;
  };
};
