import type { WorkflowSummary } from "../api";
import { isAspectRatio } from "../workflows";
import type { CanvasNode } from "./types";

type ValidationOk<T> = { ok: true; value: T };
type ValidationError = { ok: false; error: string };
export type ValidationResult<T> = ValidationOk<T> | ValidationError;

export type GenerateImageRequest = {
  workflowId: string;
  prompt: string;
  aspectRatio: string;
  modelId: string;
  providerOverrides: {
    replicateModel?: string;
    falModel?: string;
    openrouterModel?: string;
  };
};

type BuildGenerateImageRequestInput = {
  args: Record<string, unknown>;
  workflows: WorkflowSummary[];
  selectedModelId: string;
  activeEngine: string;
  selectedProviderModelId: string | null | undefined;
};

export type ToolValidationContext = {
  workflows: WorkflowSummary[];
  nodes: CanvasNode[];
};

const NOTE_COLORS = new Set(["yellow", "green", "blue", "pink", "orange", "purple"]);
const ARRANGEMENTS = new Set([
  "auto_masonry",
  "auto_grid",
  "auto_tree",
  "align_left",
  "align_center",
  "align_right",
  "align_top",
  "align_middle",
  "align_bottom",
  "distribute_horizontal",
  "distribute_vertical",
]);
const RESIZE_TARGETS = new Set(["small", "medium", "large", "original"]);

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function existingNodeIds(ids: string[], nodes: CanvasNode[]): string[] {
  const existing = new Set(nodes.map((node) => node.id));
  return ids.filter((id) => existing.has(id));
}

export function buildGenerateImageRequest({
  args,
  workflows,
  selectedModelId,
  activeEngine,
  selectedProviderModelId,
}: BuildGenerateImageRequestInput): ValidationResult<GenerateImageRequest> {
  const workflowId = stringValue(args.workflow_id);
  if (!workflowId) return { ok: false, error: "generate_image requires workflow_id" };

  const workflow = workflows.find((w) => w.id === workflowId);
  if (!workflow) return { ok: false, error: `generate_image workflow_id not found: ${workflowId}` };

  const prompt = stringValue(args.prompt);
  if (!prompt) return { ok: false, error: "generate_image requires prompt" };

  const aspectRatio = stringValue(args.aspect_ratio) ?? "1:1";
  if (!isAspectRatio(aspectRatio)) {
    return { ok: false, error: "generate_image aspect_ratio is invalid" };
  }

  const providerModel = selectedProviderModelId?.trim() || null;
  const requestedModel = stringValue(args.model_id);
  const providerOverrides: GenerateImageRequest["providerOverrides"] = {};
  let modelId = requestedModel || selectedModelId;

  if (activeEngine === "replicate" && providerModel) {
    modelId = providerModel;
    providerOverrides.replicateModel = providerModel;
  } else if (activeEngine === "fal" && providerModel) {
    modelId = providerModel;
    providerOverrides.falModel = providerModel;
  } else if (activeEngine === "openrouter" && providerModel) {
    modelId = providerModel;
    providerOverrides.openrouterModel = providerModel;
  }

  if (!modelId.trim()) return { ok: false, error: "generate_image requires a model selection" };

  return {
    ok: true,
    value: {
      workflowId,
      prompt,
      aspectRatio,
      modelId,
      providerOverrides,
    },
  };
}

export function validateCanvasAgentToolArgs(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolValidationContext,
): ValidationResult<Record<string, unknown>> {
  switch (toolName) {
    case "delete_nodes": {
      const nodeIds = existingNodeIds(stringArray(args.node_ids), context.nodes);
      if (nodeIds.length === 0) return { ok: false, error: "delete_nodes did not include any existing nodes" };
      return { ok: true, value: { node_ids: nodeIds } };
    }

    case "move_nodes": {
      const existing = new Set(context.nodes.map((node) => node.id));
      const moves = Array.isArray(args.moves)
        ? args.moves
            .map((move) => {
              if (!move || typeof move !== "object") return null;
              const raw = move as Record<string, unknown>;
              const nodeId = stringValue(raw.node_id);
              const x = numberValue(raw.x);
              const y = numberValue(raw.y);
              if (!nodeId || x === null || y === null || !existing.has(nodeId)) return null;
              return { node_id: nodeId, x, y };
            })
            .filter((move): move is { node_id: string; x: number; y: number } => move !== null)
        : [];
      if (moves.length === 0) return { ok: false, error: "move_nodes did not include any existing nodes" };
      return { ok: true, value: { moves } };
    }

    case "add_text_note": {
      const text = stringValue(args.text);
      if (!text) return { ok: false, error: "add_text_note requires text" };
      const color = stringValue(args.color) ?? "yellow";
      if (!NOTE_COLORS.has(color)) return { ok: false, error: "add_text_note color is invalid" };
      const x = numberValue(args.x);
      const y = numberValue(args.y);
      return {
        ok: true,
        value: {
          text,
          color,
          ...(x !== null && y !== null ? { x, y } : {}),
        },
      };
    }

    case "create_frame": {
      const title = stringValue(args.title);
      if (!title) return { ok: false, error: "create_frame requires title" };
      const nodeIds = existingNodeIds(stringArray(args.node_ids), context.nodes);
      const x = numberValue(args.x);
      const y = numberValue(args.y);
      const width = numberValue(args.width);
      const height = numberValue(args.height);
      return {
        ok: true,
        value: {
          title,
          node_ids: nodeIds,
          ...(x !== null ? { x } : {}),
          ...(y !== null ? { y } : {}),
          ...(width !== null && width > 0 ? { width } : {}),
          ...(height !== null && height > 0 ? { height } : {}),
        },
      };
    }

    case "arrange_nodes": {
      const nodeIds = existingNodeIds(stringArray(args.node_ids), context.nodes);
      if (nodeIds.length === 0) return { ok: false, error: "arrange_nodes did not include any existing nodes" };
      const arrangement = stringValue(args.arrangement);
      if (!arrangement || !ARRANGEMENTS.has(arrangement)) {
        return { ok: false, error: "arrange_nodes arrangement is invalid" };
      }
      return { ok: true, value: { node_ids: nodeIds, arrangement } };
    }

    case "resize_nodes": {
      const nodeIds = existingNodeIds(stringArray(args.node_ids), context.nodes);
      if (nodeIds.length === 0) return { ok: false, error: "resize_nodes did not include any existing nodes" };
      const target = stringValue(args.target);
      if (!target || !RESIZE_TARGETS.has(target)) return { ok: false, error: "resize_nodes target is invalid" };
      return { ok: true, value: { node_ids: nodeIds, target } };
    }

    default:
      return { ok: true, value: args };
  }
}
