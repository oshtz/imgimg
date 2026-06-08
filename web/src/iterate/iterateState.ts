import type { WorkflowSummary } from "../api";
import type { Asset, Generation } from "../types";

export type IterateTurn = {
  id: string;
  prompt: string;
  workflowId: string;
  generationId: string | null;
  sourceAssetId?: string | null;
  attachedImageName?: string | null;
  providerModelId?: string | null;
  createdAt: string;
};

export type IterateThread = {
  id: string;
  title: string;
  turns: IterateTurn[];
  createdAt: string;
  updatedAt: string;
};

export type AddIterateTurnInput = {
  prompt: string;
  workflowId: string;
  generationId: string | null;
  sourceAssetId?: string | null;
  attachedImageName?: string | null;
  providerModelId?: string | null;
};

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function makeTimestamp() {
  return new Date().toISOString();
}

export function titleFromPrompt(prompt: string) {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Untitled thread";
  return trimmed.length > 56 ? `${trimmed.slice(0, 53)}...` : trimmed;
}

export function createIterateThread(firstPrompt: string): IterateThread {
  const now = makeTimestamp();
  return {
    id: makeId("thread"),
    title: titleFromPrompt(firstPrompt),
    turns: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function addIterateTurn(thread: IterateThread, input: AddIterateTurnInput): IterateThread {
  const now = makeTimestamp();
  return {
    ...thread,
    updatedAt: now,
    turns: [
      ...thread.turns,
      {
        id: makeId("turn"),
        prompt: input.prompt,
        workflowId: input.workflowId,
        generationId: input.generationId,
        sourceAssetId: input.sourceAssetId ?? null,
        attachedImageName: input.attachedImageName ?? null,
        providerModelId: input.providerModelId ?? null,
        createdAt: now,
      },
    ],
  };
}

export function isImageAsset(asset: Asset) {
  if (asset.type === "audio" || asset.type === "video" || asset.type === "preview") return false;
  return true;
}

export function pickImageAsset(generation: Generation) {
  return generation.assets.find(isImageAsset) ?? null;
}

export function pickFirstImageFile(files: Iterable<File> | ArrayLike<File>) {
  return Array.from(files).find((file) => file.type.startsWith("image/")) ?? null;
}

export function findLatestThreadImage(thread: IterateThread, generations: Generation[]) {
  const generationById = new Map(generations.map((generation) => [generation.id, generation]));

  for (let index = thread.turns.length - 1; index >= 0; index--) {
    const generationId = thread.turns[index].generationId;
    if (!generationId) continue;
    const generation = generationById.get(generationId);
    if (!generation || generation.status !== "succeeded") continue;
    const asset = pickImageAsset(generation);
    if (!asset) continue;
    return { generation, asset };
  }

  return null;
}

export function getIterateWorkflowOptions(
  workflows: WorkflowSummary[],
  enabledProviders: Record<string, boolean>,
) {
  return workflows.filter((workflow) => {
    if (workflow.outputMode !== "single_image") return false;
    if (workflow.providerAvailable === false) return false;
    if (workflow.engine && enabledProviders[workflow.engine] === false) return false;
    return true;
  });
}

export function resolveTurnGeneration(turn: IterateTurn, generations: Generation[]) {
  if (!turn.generationId) return null;
  return generations.find((generation) => generation.id === turn.generationId) ?? null;
}
