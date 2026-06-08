import type { DiscoveredModel } from "../../api";

export type ModelChooserProvider = "replicate" | "fal" | "openrouter";
export type ModelChooserAssetType = "image" | "video" | "audio";

const PROVIDER_LABELS: Record<ModelChooserProvider, string> = {
  replicate: "Replicate",
  fal: "FAL",
  openrouter: "OpenRouter",
};

const PROVIDER_LOGOS: Record<ModelChooserProvider, string> = {
  replicate: "/replicate.svg",
  fal: "/fal.svg",
  openrouter: "/openrouter.svg",
};

const COLLECTION_FOR_ASSET: Record<ModelChooserAssetType, string> = {
  image: "text-to-image",
  video: "text-to-video",
  audio: "text-to-speech",
};

export function getProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider as ModelChooserProvider] ?? provider;
}

export function getProviderLogo(provider: string): string | null {
  return PROVIDER_LOGOS[provider as ModelChooserProvider] ?? null;
}

export function getProviderSearchCollection(
  provider: ModelChooserProvider,
  assetType: ModelChooserAssetType | undefined,
  query: string
): string | undefined {
  if (provider !== "replicate" || query.trim()) return undefined;
  if (!assetType) return "official";
  return COLLECTION_FOR_ASSET[assetType] ?? "official";
}

export function isPinnedModel(
  pinnedModels: Array<Pick<DiscoveredModel, "provider" | "modelId">>,
  provider: string,
  modelId: string
): boolean {
  return pinnedModels.some((model) => model.provider === provider && model.modelId === modelId);
}

export function filterPinnedModels<T extends Pick<DiscoveredModel, "provider">>(
  pinnedModels: T[],
  provider: string
): T[] {
  return pinnedModels.filter((model) => model.provider === provider);
}

function getOwnerFromModelId(modelId: string): string | null {
  const slashIndex = modelId.indexOf("/");
  if (slashIndex <= 0) return null;
  return modelId.slice(0, slashIndex);
}

export function summarizeModel(model: DiscoveredModel) {
  const title = model.displayName || model.modelId;
  const subtitle = model.owner || getOwnerFromModelId(model.modelId) || model.modelId;

  return {
    title,
    subtitle,
    providerLabel: getProviderLabel(model.provider),
    logo: getProviderLogo(model.provider),
  };
}
