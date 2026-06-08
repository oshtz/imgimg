import type { WorkflowSummary } from "../api";
import type { Asset, Generation } from "../types";

export type AudioMeta = {
  tags: string[];
};

export type AudioMetaByGeneration = Record<string, AudioMeta>;

export type AudioItem = {
  generation: Generation;
  asset: Asset;
  workflow: WorkflowSummary | null;
  tags: string[];
};

export type AudioFilter = {
  query: string;
  workflowId: string;
  tag: string;
};

export function isAudioWorkflowVisible(
  workflow: WorkflowSummary,
  enabledProviders: Record<string, boolean>,
) {
  if (workflow.outputMode !== "single_audio") return false;
  if (workflow.providerAvailable === false) return false;
  if (workflow.engine && enabledProviders[workflow.engine] === false) return false;
  return true;
}

export function isAudioAsset(asset: Asset) {
  return asset.type === "audio" || asset.url.toLowerCase().match(/\.(mp3|wav|m4a|flac|ogg|aac)(\?|$)/) !== null;
}

export function findAudioAsset(generation: Generation) {
  return generation.assets.find((asset) => isAudioAsset(asset) && asset.type !== "preview") ?? null;
}

export function buildAudioItems(
  generations: Generation[],
  workflows: WorkflowSummary[],
  metaByGeneration: AudioMetaByGeneration,
) {
  const workflowById = new Map(workflows.map((workflow) => [workflow.id, workflow]));

  return generations
    .map<AudioItem | null>((generation) => {
      const workflow = workflowById.get(generation.workflowUsed) ?? null;
      const asset = findAudioAsset(generation);
      const isAudioGeneration = workflow?.outputMode === "single_audio" || asset !== null;
      if (!isAudioGeneration || !asset) return null;
      const meta = metaByGeneration[generation.id];

      return {
        generation,
        asset,
        workflow,
        tags: meta?.tags ?? [],
      };
    })
    .filter((item): item is AudioItem => Boolean(item))
    .sort((a, b) => b.generation.createdAt.localeCompare(a.generation.createdAt));
}

export function filterAudioItems(items: AudioItem[], filter: AudioFilter) {
  const query = filter.query.trim().toLowerCase();
  const tag = filter.tag.trim().toLowerCase();

  return items.filter((item) => {
    if (filter.workflowId !== "all" && item.generation.workflowUsed !== filter.workflowId) return false;
    if (tag !== "all" && !item.tags.some((candidate) => candidate.toLowerCase() === tag)) return false;
    if (!query) return true;

    const haystack = [
      item.generation.prompt,
      item.workflow?.label,
      item.generation.workflowUsed,
      ...item.tags,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

export function normalizeAudioTag(tag: string) {
  return tag.trim().replace(/\s+/g, " ").toLowerCase();
}

export function toggleAudioTag(tags: string[], rawTag: string) {
  const tag = normalizeAudioTag(rawTag);
  if (!tag) return tags;
  const existingIndex = tags.findIndex((candidate) => candidate.toLowerCase() === tag);
  if (existingIndex >= 0) {
    return tags.filter((_, index) => index !== existingIndex);
  }
  return [...tags, tag];
}

export function downsampleWaveform(samples: Float32Array, barCount: number) {
  const count = Math.max(0, Math.floor(barCount));
  if (count === 0) return [];
  if (samples.length === 0) return Array.from({ length: count }, () => 0);

  const bars: number[] = [];
  const bucketSize = Math.max(1, Math.ceil(samples.length / count));
  for (let index = 0; index < count; index++) {
    const start = index * bucketSize;
    const end = Math.min(samples.length, start + bucketSize);
    let peak = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
      peak = Math.max(peak, Math.abs(samples[sampleIndex] ?? 0));
    }
    bars.push(Number(Math.min(1, peak).toFixed(4)));
  }
  return bars;
}

export function makeFallbackWaveform(seed: string, barCount: number) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Array.from({ length: barCount }, (_, index) => {
    hash ^= index + 0x9e3779b9;
    hash = Math.imul(hash, 16777619);
    const value = ((hash >>> 0) % 72) / 100 + 0.18;
    return Number(Math.min(1, value).toFixed(4));
  });
}

export function listAudioTags(items: AudioItem[]) {
  const tags = new Set<string>();
  for (const item of items) {
    for (const tag of item.tags) tags.add(tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}
