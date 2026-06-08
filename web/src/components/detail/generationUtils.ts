import type { WorkflowSummary } from "../../api";
import type { Asset, Generation } from "../../types";
import type { AssetTypeRegistry } from "../../assetTypeRegistry";

export function assetKey(asset: Asset) {
  return `${asset.type}:${asset.itemIndex ?? "null"}`;
}

export function isVideoAsset(asset: Asset) {
  // Check by type or by file extension
  if (asset.type === "video") return true;
  const url = asset.url.toLowerCase();
  return url.endsWith(".mp4") || url.endsWith(".webm") || url.endsWith(".mov");
}

export function isAudioAsset(asset: Asset) {
  if (asset.type === "audio") return true;
  const url = asset.url.toLowerCase();
  return url.endsWith(".wav") || url.endsWith(".mp3") || url.endsWith(".ogg") || url.endsWith(".m4a");
}

export async function downloadUrl(url: string, filename: string) {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (err) {
    console.error("Download failed", err);
  }
}

export function displayItemIndex(itemIndex: number | null | undefined) {
  return itemIndex === null || itemIndex === undefined ? null : itemIndex + 1;
}

export function makeSortAssets(registry: AssetTypeRegistry) {
  return (a: Asset, b: Asset) => {
    const d = registry.sortOrder(a.type) - registry.sortOrder(b.type);
    if (d !== 0) return d;
    return (a.itemIndex ?? -1) - (b.itemIndex ?? -1);
  };
}

export function workflowLabel(workflows: WorkflowSummary[], workflowId: string) {
  return workflows.find((w) => w.id === workflowId)?.label ?? workflowId;
}

export function pickDefaultAsset(g: Generation, registry: AssetTypeRegistry) {
  // Pick the first visible asset sorted by the registry's display sort order
  const sortFn = makeSortAssets(registry);
  const visibleTypes = registry.visibleIds();
  const visible = g.assets
    .filter((a) => visibleTypes.has(a.type) && a.type !== "placeholder")
    .sort(sortFn);
  return visible[0] ?? null;
}

export function statusPill(status: Generation["status"]) {
  if (status === "succeeded") return "bg-accent-forest/10 text-accent-forest";
  if (status === "failed") return "bg-red-500/10 text-red-700 dark:text-red-300";
  if (status === "running") return "bg-accent-sky/10 text-accent-sky";
  return "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";
}
