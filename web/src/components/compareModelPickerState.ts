import type { CompareModel, DiscoveredModel } from "../api";

const DYNAMIC_WORKFLOW_BY_PROVIDER: Partial<Record<CompareModel["provider"], string>> = {
  replicate: "replicate-image",
  fal: "fal-image",
  openrouter: "openrouter-image",
};

export function discoveredToCompareModel(model: DiscoveredModel): CompareModel {
  const provider = model.provider as CompareModel["provider"];

  return {
    id: `${model.provider}:${model.modelId}`,
    provider,
    displayName: model.displayName,
    description: model.description,
    thumbnailUrl: model.thumbnailUrl ?? null,
    workflowId: DYNAMIC_WORKFLOW_BY_PROVIDER[provider] ?? "",
    replicateModel: model.provider === "replicate" ? model.modelId : undefined,
    falModel: model.provider === "fal" ? model.modelId : undefined,
    openrouterModel: model.provider === "openrouter" ? model.modelId : undefined,
    supportsAspectRatio: true,
    supportsImageInput: true,
  };
}
