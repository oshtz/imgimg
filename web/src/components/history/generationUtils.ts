import type { WorkflowSummary } from "../../client";
import type { Asset, Generation } from "../../types";
import type { AssetTypeRegistry } from "../../assetTypeRegistry";

export function findWorkflow(workflows: WorkflowSummary[], workflowId: string) {
  return workflows.find((w) => w.id === workflowId) ?? null;
}

export function isVideoAsset(asset: Asset) {
  if (asset.type === "video") return true;
  const url = asset.url.toLowerCase();
  return url.endsWith(".mp4") || url.endsWith(".webm") || url.endsWith(".mov");
}

export function isAudioAsset(asset: Asset) {
  if (asset.type === "audio") return true;
  const url = asset.url.toLowerCase();
  return url.endsWith(".wav") || url.endsWith(".mp3") || url.endsWith(".ogg") || url.endsWith(".m4a");
}

export function displayItemIndex(itemIndex: number | null | undefined) {
  return itemIndex === null || itemIndex === undefined ? null : itemIndex + 1;
}

export function statusPill(status: Generation["status"]) {
  if (status === "succeeded") return "bg-accent-forest/10 text-accent-forest";
  if (status === "failed") return "bg-red-500/10 text-red-700 dark:text-red-300";
  if (status === "running") return "bg-accent-sky/10 text-accent-sky";
  return "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";
}

export function getOutputMode(g: Generation, workflows: WorkflowSummary[], registry: AssetTypeRegistry) {
  const workflow = findWorkflow(workflows, g.workflowUsed);
  if (workflow?.outputMode) return workflow.outputMode;
  const fullSetTypes = registry.fullSetIndicatorIds();
  return g.assets.some((a) => fullSetTypes.has(a.type)) ? "full_set" : "single_image";
}

export function pickPreviewAssets(g: Generation, workflows: WorkflowSummary[], registry: AssetTypeRegistry) {
  const outputMode = getOutputMode(g, workflows, registry);
  const visibleTypes = registry.visibleIds();

  if (outputMode === "single_image" || outputMode === "layered_image" || outputMode === "single_audio") {
    const slots: (Asset | null)[] = Array.from({ length: 4 }, () => null);
    const finals = g.assets.filter((a) => visibleTypes.has(a.type));
    const previews = g.assets.filter((a) => a.type === "preview" && a.itemIndex !== null && a.itemIndex !== undefined);

    for (const asset of finals) {
      const idx = asset.itemIndex ?? 0;
      if (idx >= 0 && idx < slots.length && !slots[idx]) slots[idx] = asset;
    }

    for (const asset of previews) {
      const idx = asset.itemIndex ?? 0;
      if (idx >= 0 && idx < slots.length && !slots[idx]) slots[idx] = asset;
    }

    if (slots.some(Boolean)) return slots;

    const preferred = g.assets.find((a) => a.type === "preview") ?? null;
    return preferred ? [preferred] : [];
  }

  const indexed = g.assets
    .filter((a) => visibleTypes.has(a.type) && a.itemIndex !== null && a.itemIndex !== undefined)
    .sort((a, b) => (a.itemIndex ?? 0) - (b.itemIndex ?? 0))
    .slice(0, 4);

  if (indexed.length > 0) return indexed;
  const sorted = [...g.assets]
    .filter((a) => visibleTypes.has(a.type) || a.type === "preview")
    .sort((a, b) => registry.sortOrder(a.type) - registry.sortOrder(b.type));
  return sorted.length > 0 ? [sorted[0]] : [];
}

export function pickFullSetAssets(g: Generation, fullSetSlots?: Array<{ type: string; aspectRatio: string; itemIndex?: number }>): (Asset | null)[] {
  if (fullSetSlots) {
    return fullSetSlots.map((slot) => {
      return g.assets.find((a) =>
        a.type === slot.type &&
        (slot.itemIndex === undefined || a.itemIndex === slot.itemIndex)
      ) ?? null;
    });
  }

  const visible = g.assets
    .filter((a) => a.type !== "rembg" && a.type !== "preview" && a.type !== "placeholder")
    .sort((a, b) => (a.itemIndex ?? 0) - (b.itemIndex ?? 0));

  return visible.length > 0 ? visible : [];
}
