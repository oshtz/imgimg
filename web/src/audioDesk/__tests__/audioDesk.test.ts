import { describe, expect, it } from "vitest";
import type { WorkflowSummary } from "../../api";
import type { Asset, Generation } from "../../types";
import {
  buildAudioItems,
  downsampleWaveform,
  filterAudioItems,
  isAudioWorkflowVisible,
  toggleAudioTag,
} from "../audioDeskState";

function workflow(overrides: Partial<WorkflowSummary>): WorkflowSummary {
  return {
    id: "fal-audio",
    label: "FAL Audio",
    outputMode: "single_audio",
    ui: { aspectRatio: false, batchSize: false },
    engine: "fal",
    providerAvailable: true,
    ...overrides,
  };
}

function asset(overrides: Partial<Asset>): Asset {
  return {
    id: "asset-1",
    generationId: "gen-1",
    type: "audio",
    url: "/storage/gen-1/audio.wav",
    itemIndex: null,
    createdAt: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}

function generation(overrides: Partial<Generation>): Generation {
  return {
    id: "gen-1",
    jobId: null,
    modelId: "",
    prompt: "short synth loop",
    seed: 0,
    workflowUsed: "fal-audio",
    status: "succeeded",
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z",
    error: null,
    assets: [asset({})],
    ...overrides,
  };
}

describe("audioDesk helpers", () => {
  it("keeps audio workflows hidden when their provider is disabled", () => {
    expect(isAudioWorkflowVisible(workflow({ engine: "fal" }), { fal: true })).toBe(true);
    expect(isAudioWorkflowVisible(workflow({ engine: "fal" }), { fal: false })).toBe(false);
    expect(isAudioWorkflowVisible(workflow({ providerAvailable: false }), { fal: true })).toBe(false);
    expect(isAudioWorkflowVisible(workflow({ outputMode: "single_image" }), { fal: true })).toBe(false);
  });

  it("builds audio items from audio generations and preserves metadata", () => {
    const items = buildAudioItems(
      [
        generation({ id: "gen-a", prompt: "menu pulse", assets: [asset({ id: "a-a", generationId: "gen-a" })] }),
        generation({ id: "gen-b", workflowUsed: "fal-image", assets: [asset({ id: "a-b", type: "square", url: "/storage/gen-b/image.png" })] }),
      ],
      [workflow({ id: "fal-audio" })],
      { "gen-a": { tags: ["loop", "menu"] } },
    );

    expect(items).toHaveLength(1);
    expect(items[0].generation.id).toBe("gen-a");
    expect(items[0].tags).toEqual(["loop", "menu"]);
  });

  it("filters audio items by prompt, workflow, and tags", () => {
    const items = buildAudioItems(
      [
        generation({ id: "gen-a", prompt: "bright menu loop", assets: [asset({ generationId: "gen-a" })] }),
        generation({ id: "gen-b", prompt: "dark impact", assets: [asset({ id: "a-b", generationId: "gen-b" })] }),
      ],
      [workflow({ id: "fal-audio" })],
      {
        "gen-a": { tags: ["menu", "loop"] },
        "gen-b": { tags: ["hit"] },
      },
    );

    expect(filterAudioItems(items, { query: "bright", workflowId: "all", tag: "all" }).map((i) => i.generation.id)).toEqual(["gen-a"]);
    expect(filterAudioItems(items, { query: "", workflowId: "all", tag: "hit" }).map((i) => i.generation.id)).toEqual(["gen-b"]);
    expect(filterAudioItems(items, { query: "", workflowId: "fal-audio", tag: "all" }).map((i) => i.generation.id)).toEqual(["gen-a", "gen-b"]);
  });

  it("normalizes and toggles tags", () => {
    expect(toggleAudioTag(["Loop"], " loop ")).toEqual([]);
    expect(toggleAudioTag(["Loop"], " Menu Hook ")).toEqual(["Loop", "menu hook"]);
    expect(toggleAudioTag([], "  ")).toEqual([]);
  });

  it("downsamples waveform samples into normalized bar peaks", () => {
    expect(downsampleWaveform(new Float32Array([0, 0.5, -1, 0.25]), 2)).toEqual([0.5, 1]);
    expect(downsampleWaveform(new Float32Array([]), 3)).toEqual([0, 0, 0]);
  });
});
