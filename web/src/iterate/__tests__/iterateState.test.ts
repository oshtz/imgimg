import { describe, expect, it } from "vitest";
import type { WorkflowSummary } from "../../api";
import type { Asset, Generation } from "../../types";
import {
  addIterateTurn,
  createIterateThread,
  findLatestThreadImage,
  getIterateWorkflowOptions,
  pickImageAsset,
  pickFirstImageFile,
} from "../iterateState";

function workflow(overrides: Partial<WorkflowSummary>): WorkflowSummary {
  return {
    id: "fal-image",
    label: "FAL Image",
    outputMode: "single_image",
    ui: { aspectRatio: true, batchSize: false },
    engine: "fal",
    providerAvailable: true,
    supportsImageInput: true,
    ...overrides,
  };
}

function asset(overrides: Partial<Asset>): Asset {
  return {
    id: "asset-1",
    generationId: "gen-1",
    type: "square",
    url: "/storage/gen-1/image.png",
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
    prompt: "a product photo",
    seed: 0,
    workflowUsed: "fal-image",
    status: "succeeded",
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z",
    error: null,
    assets: [asset({})],
    ...overrides,
  };
}

describe("iterate state helpers", () => {
  it("creates a thread title from the first prompt", () => {
    const thread = createIterateThread("make the label bolder and crop tighter");

    expect(thread.title).toBe("make the label bolder and crop tighter");
    expect(thread.turns).toEqual([]);
  });

  it("adds turns immutably", () => {
    const thread = createIterateThread("start");
    const next = addIterateTurn(thread, {
      prompt: "make it warmer",
      workflowId: "fal-image",
      generationId: "gen-2",
      sourceAssetId: "asset-1",
    });

    expect(thread.turns).toHaveLength(0);
    expect(next.turns).toHaveLength(1);
    expect(next.turns[0]).toMatchObject({
      prompt: "make it warmer",
      workflowId: "fal-image",
      generationId: "gen-2",
      sourceAssetId: "asset-1",
    });
  });

  it("keeps only visible image workflows as iterate options", () => {
    const options = getIterateWorkflowOptions(
      [
        workflow({ id: "fal-image", engine: "fal" }),
        workflow({ id: "fal-audio", outputMode: "single_audio", engine: "fal" }),
        workflow({ id: "replicate-image", engine: "replicate", providerAvailable: false }),
        workflow({ id: "openrouter-image", engine: "openrouter" }),
      ],
      { fal: true, replicate: true, openrouter: false },
    );

    expect(options.map((w) => w.id)).toEqual(["fal-image"]);
  });

  it("picks image assets and ignores previews/audio", () => {
    expect(
      pickImageAsset(
        generation({
          assets: [
            asset({ id: "preview", type: "preview" }),
            asset({ id: "audio", type: "audio" }),
            asset({ id: "image", type: "portrait" }),
          ],
        }),
      )?.id,
    ).toBe("image");
  });

  it("picks the first image file from pasted files", () => {
    const textFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    const imageFile = new File(["png"], "image.png", { type: "image/png" });
    const laterImage = new File(["jpg"], "later.jpg", { type: "image/jpeg" });

    expect(pickFirstImageFile([textFile, imageFile, laterImage])).toBe(imageFile);
    expect(pickFirstImageFile([textFile])).toBeNull();
  });

  it("finds the newest successful thread image by turn order", () => {
    const thread = addIterateTurn(
      addIterateTurn(createIterateThread("start"), {
        prompt: "first",
        workflowId: "fal-image",
        generationId: "gen-1",
      }),
      {
        prompt: "second",
        workflowId: "fal-image",
        generationId: "gen-2",
      },
    );

    const latest = findLatestThreadImage(thread, [
      generation({ id: "gen-1", assets: [asset({ id: "old", generationId: "gen-1" })] }),
      generation({ id: "gen-2", assets: [asset({ id: "new", generationId: "gen-2" })] }),
    ]);

    expect(latest?.asset.id).toBe("new");
  });

  it("skips failed or assetless generations while chaining", () => {
    const thread = addIterateTurn(
      addIterateTurn(createIterateThread("start"), {
        prompt: "first",
        workflowId: "fal-image",
        generationId: "gen-1",
      }),
      {
        prompt: "second",
        workflowId: "fal-image",
        generationId: "gen-2",
      },
    );

    const latest = findLatestThreadImage(thread, [
      generation({ id: "gen-1", assets: [asset({ id: "usable", generationId: "gen-1" })] }),
      generation({ id: "gen-2", status: "failed", assets: [asset({ id: "failed", generationId: "gen-2" })] }),
    ]);

    expect(latest?.asset.id).toBe("usable");
  });
});
