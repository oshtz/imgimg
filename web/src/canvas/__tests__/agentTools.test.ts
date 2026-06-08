import { describe, expect, it } from "vitest";
import {
  buildGenerateImageRequest,
  validateCanvasAgentToolArgs,
} from "../agentTools";
import type { CanvasNode } from "../types";
import type { WorkflowSummary } from "../../api";

const workflows = [
  { id: "wf-comfy", label: "Comfy", engine: "comfyui", outputMode: "single_image" },
  { id: "wf-replicate", label: "Replicate", engine: "replicate", outputMode: "single_image" },
] as WorkflowSummary[];

const nodes = [
  { id: "node-1", x: 0, y: 0, width: 100, height: 100, naturalWidth: 100, naturalHeight: 100, zIndex: 1 },
] as CanvasNode[];

describe("buildGenerateImageRequest", () => {
  it("uses the selected provider model as the explicit Replicate model", () => {
    const result = buildGenerateImageRequest({
      args: { workflow_id: "wf-replicate", prompt: "a cat", aspect_ratio: "16:9", count: 4 },
      workflows,
      selectedModelId: "comfy-lora",
      activeEngine: "replicate",
      selectedProviderModelId: "black-forest-labs/flux-schnell",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      workflowId: "wf-replicate",
      prompt: "a cat",
      aspectRatio: "16:9",
      modelId: "black-forest-labs/flux-schnell",
      providerOverrides: { replicateModel: "black-forest-labs/flux-schnell" },
    });
  });

  it("rejects missing workflow ids before creating a loading node", () => {
    const result = buildGenerateImageRequest({
      args: { prompt: "a cat" },
      workflows,
      selectedModelId: "comfy-lora",
      activeEngine: "comfyui",
      selectedProviderModelId: null,
    });

    expect(result).toEqual({ ok: false, error: "generate_image requires workflow_id" });
  });

  it("rejects invalid aspect ratios", () => {
    const result = buildGenerateImageRequest({
      args: { workflow_id: "wf-comfy", prompt: "a cat", aspect_ratio: "banana" },
      workflows,
      selectedModelId: "comfy-lora",
      activeEngine: "comfyui",
      selectedProviderModelId: null,
    });

    expect(result).toEqual({ ok: false, error: "generate_image aspect_ratio is invalid" });
  });
});

describe("validateCanvasAgentToolArgs", () => {
  it("rejects move_nodes calls that reference unknown nodes", () => {
    const result = validateCanvasAgentToolArgs("move_nodes", {
      moves: [{ node_id: "missing", x: 50, y: 60 }],
    }, { workflows, nodes });

    expect(result).toEqual({ ok: false, error: "move_nodes did not include any existing nodes" });
  });

  it("normalizes valid add_text_note arguments", () => {
    const result = validateCanvasAgentToolArgs("add_text_note", {
      text: "Mood notes",
      color: "purple",
      x: 10,
      y: 20,
    }, { workflows, nodes });

    expect(result).toEqual({
      ok: true,
      value: {
        text: "Mood notes",
        color: "purple",
        x: 10,
        y: 20,
      },
    });
  });
});
