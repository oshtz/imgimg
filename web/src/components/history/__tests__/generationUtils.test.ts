import { describe, it, expect } from "vitest";
import { isVideoAsset, isAudioAsset, displayItemIndex, statusPill, findWorkflow, getOutputMode, pickPreviewAssets, pickFullSetAssets } from "../generationUtils";
import type { Asset, Generation } from "../../../types";
import type { WorkflowSummary } from "../../../api";
import type { AdminAssetType } from "../../../api";
import { AssetTypeRegistry } from "../../../assetTypeRegistry";

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "a1",
    generationId: "g1",
    type: "image",
    url: "http://example.com/image.png",
    itemIndex: null,
    createdAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeGeneration(overrides: Partial<Generation> = {}): Generation {
  return {
    id: "g1",
    jobId: "j1",
    modelId: "m1",
    prompt: "test",
    seed: 0,
    workflowUsed: "wf1",
    status: "succeeded",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    error: null,
    assets: [],
    ...overrides,
  };
}

function makeAssetType(overrides: Partial<AdminAssetType> = {}): AdminAssetType {
  return {
    id: "image",
    displayName: "Image",
    description: null,
    displaySortOrder: 1,
    isVisible: true,
    isRegenable: true,
    isInpaintable: false,
    isDownloadable: true,
    isSystem: false,
    gridRow: "row2",
    gridSizeClass: "w-1/4",
    aspectRatio: "1:1",
    defaultPromptTemplate: null,
    defaultWidth: 512,
    defaultHeight: 512,
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    ...overrides,
  };
}

function makeWorkflow(overrides: Partial<WorkflowSummary> = {}): WorkflowSummary {
  return {
    id: "wf1",
    label: "Test Workflow",
    outputMode: "single_image",
    ui: { aspectRatio: true, batchSize: true },
    ...overrides,
  } as WorkflowSummary;
}

describe("history/generationUtils", () => {
  describe("isVideoAsset", () => {
    it("returns true when type is video", () => {
      expect(isVideoAsset(makeAsset({ type: "video", url: "http://x.com/file.png" }))).toBe(true);
    });

    it("returns true for .mp4 URL", () => {
      expect(isVideoAsset(makeAsset({ type: "square", url: "http://x.com/clip.mp4" }))).toBe(true);
    });

    it("returns true for .webm URL", () => {
      expect(isVideoAsset(makeAsset({ type: "square", url: "http://x.com/clip.webm" }))).toBe(true);
    });

    it("returns true for .mov URL", () => {
      expect(isVideoAsset(makeAsset({ type: "square", url: "http://x.com/clip.MOV" }))).toBe(true);
    });

    it("returns false for .png URL with non-video type", () => {
      expect(isVideoAsset(makeAsset({ type: "square", url: "http://x.com/image.png" }))).toBe(false);
    });
  });

  describe("isAudioAsset", () => {
    it("returns true when type is audio", () => {
      expect(isAudioAsset(makeAsset({ type: "audio", url: "http://x.com/file.png" }))).toBe(true);
    });

    it("returns true for .wav URL", () => {
      expect(isAudioAsset(makeAsset({ type: "square", url: "http://x.com/sound.wav" }))).toBe(true);
    });

    it("returns true for .mp3 URL", () => {
      expect(isAudioAsset(makeAsset({ type: "square", url: "http://x.com/sound.mp3" }))).toBe(true);
    });

    it("returns true for .ogg URL", () => {
      expect(isAudioAsset(makeAsset({ type: "square", url: "http://x.com/sound.ogg" }))).toBe(true);
    });

    it("returns true for .m4a URL", () => {
      expect(isAudioAsset(makeAsset({ type: "square", url: "http://x.com/sound.M4A" }))).toBe(true);
    });

    it("returns false for .png URL with non-audio type", () => {
      expect(isAudioAsset(makeAsset({ type: "square", url: "http://x.com/image.png" }))).toBe(false);
    });
  });

  describe("displayItemIndex", () => {
    it("returns null for null", () => {
      expect(displayItemIndex(null)).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(displayItemIndex(undefined)).toBeNull();
    });

    it("returns 1 for 0", () => {
      expect(displayItemIndex(0)).toBe(1);
    });

    it("returns 4 for 3", () => {
      expect(displayItemIndex(3)).toBe(4);
    });
  });

  describe("statusPill", () => {
    it("returns green classes for succeeded", () => {
      expect(statusPill("succeeded")).toBe("bg-accent-forest/10 text-accent-forest");
    });

    it("returns red classes for failed", () => {
      expect(statusPill("failed")).toBe("bg-red-500/10 text-red-700 dark:text-red-300");
    });

    it("returns blue classes for running", () => {
      expect(statusPill("running")).toBe("bg-accent-sky/10 text-accent-sky");
    });

    it("returns gray classes for queued", () => {
      expect(statusPill("queued")).toBe("bg-zinc-500/10 text-zinc-700 dark:text-zinc-300");
    });
  });

  describe("findWorkflow", () => {
    const workflows = [makeWorkflow({ id: "wf1", label: "One" }), makeWorkflow({ id: "wf2", label: "Two" })];

    it("returns the matching workflow", () => {
      expect(findWorkflow(workflows, "wf1")).toEqual(workflows[0]);
    });

    it("returns null when no match", () => {
      expect(findWorkflow(workflows, "wf999")).toBeNull();
    });

    it("returns null for empty array", () => {
      expect(findWorkflow([], "wf1")).toBeNull();
    });
  });

  describe("getOutputMode", () => {
    it("returns workflow outputMode when workflow is found", () => {
      const workflows = [makeWorkflow({ id: "wf1", outputMode: "full_set" })];
      const registry = new AssetTypeRegistry([makeAssetType()]);
      const g = makeGeneration({ workflowUsed: "wf1" });
      expect(getOutputMode(g, workflows, registry)).toBe("full_set");
    });

    it("infers full_set when assets contain full-set indicator types", () => {
      const workflows: WorkflowSummary[] = [];
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "square", isVisible: true, isRegenable: true }),
      ]);
      const g = makeGeneration({
        workflowUsed: "wf_missing",
        assets: [makeAsset({ type: "square" })],
      });
      expect(getOutputMode(g, workflows, registry)).toBe("full_set");
    });

    it("returns single_image when no full-set indicators present", () => {
      const workflows: WorkflowSummary[] = [];
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "preview", isVisible: false, isRegenable: false }),
      ]);
      const g = makeGeneration({
        workflowUsed: "wf_missing",
        assets: [makeAsset({ type: "preview" })],
      });
      expect(getOutputMode(g, workflows, registry)).toBe("single_image");
    });

    it("falls through to fullSetIndicatorIds check when workflow has no outputMode", () => {
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "square", isVisible: true, isRegenable: true }),
      ]);
      // Workflow exists but has no outputMode
      const workflows = [makeWorkflow({ id: "wf1", outputMode: undefined as any })];
      const g = makeGeneration({
        workflowUsed: "wf1",
        assets: [makeAsset({ type: "square" })],
      });
      expect(getOutputMode(g, workflows, registry)).toBe("full_set");
    });

    it("returns single_image when workflow has no outputMode and no full-set assets", () => {
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "image", isVisible: true, isRegenable: false }),
      ]);
      const workflows = [makeWorkflow({ id: "wf1", outputMode: undefined as any })];
      const g = makeGeneration({
        workflowUsed: "wf1",
        assets: [makeAsset({ type: "image" })],
      });
      expect(getOutputMode(g, workflows, registry)).toBe("single_image");
    });
  });

  describe("pickPreviewAssets", () => {
    const registry = new AssetTypeRegistry([
      makeAssetType({ id: "image", displaySortOrder: 1, isVisible: true, isRegenable: false }),
      makeAssetType({ id: "preview", displaySortOrder: 99, isVisible: false, isRegenable: false }),
    ]);

    it("returns slots with visible assets for single_image mode", () => {
      const workflows = [makeWorkflow({ id: "wf1", outputMode: "single_image" })];
      const g = makeGeneration({
        assets: [
          makeAsset({ id: "a0", type: "image", itemIndex: 0 }),
          makeAsset({ id: "a1", type: "image", itemIndex: 1 }),
        ],
      });
      const result = pickPreviewAssets(g, workflows, registry);
      expect(result).toHaveLength(4);
      expect(result[0]?.id).toBe("a0");
      expect(result[1]?.id).toBe("a1");
      expect(result[2]).toBeNull();
      expect(result[3]).toBeNull();
    });

    it("falls back to preview asset when no visible finals exist", () => {
      const workflows = [makeWorkflow({ id: "wf1", outputMode: "single_image" })];
      const g = makeGeneration({
        assets: [makeAsset({ id: "p1", type: "preview", itemIndex: null })],
      });
      const result = pickPreviewAssets(g, workflows, registry);
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("p1");
    });

    it("returns empty array when no assets at all", () => {
      const workflows = [makeWorkflow({ id: "wf1", outputMode: "single_image" })];
      const g = makeGeneration({ assets: [] });
      const result = pickPreviewAssets(g, workflows, registry);
      expect(result).toEqual([]);
    });

    it("returns indexed visible assets for full_set mode", () => {
      const fsRegistry = new AssetTypeRegistry([
        makeAssetType({ id: "square", displaySortOrder: 1, isVisible: true, isRegenable: true }),
      ]);
      const workflows = [makeWorkflow({ id: "wf1", outputMode: "full_set" })];
      const g = makeGeneration({
        assets: [
          makeAsset({ id: "s0", type: "square", itemIndex: 0 }),
          makeAsset({ id: "s1", type: "square", itemIndex: 1 }),
        ],
      });
      const result = pickPreviewAssets(g, workflows, fsRegistry);
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("s0");
    });

    it("falls back to sorted visible asset for full_set with no indexed assets", () => {
      const fsRegistry = new AssetTypeRegistry([
        makeAssetType({ id: "square", displaySortOrder: 2, isVisible: true, isRegenable: true }),
        makeAssetType({ id: "portrait", displaySortOrder: 1, isVisible: true, isRegenable: true }),
      ]);
      const workflows = [makeWorkflow({ id: "wf1", outputMode: "full_set" })];
      const g = makeGeneration({
        assets: [
          makeAsset({ id: "s0", type: "square", itemIndex: null }),
          makeAsset({ id: "p0", type: "portrait", itemIndex: null }),
        ],
      });
      const result = pickPreviewAssets(g, workflows, fsRegistry);
      // Should return first by sort order (portrait has lower displaySortOrder)
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("p0");
    });

    it("fills preview slots when finals are missing", () => {
      const workflows = [makeWorkflow({ id: "wf1", outputMode: "single_image" })];
      const g = makeGeneration({
        assets: [
          makeAsset({ id: "a0", type: "image", itemIndex: 0 }),
          makeAsset({ id: "p1", type: "preview", itemIndex: 1 }),
        ],
      });
      const result = pickPreviewAssets(g, workflows, registry);
      expect(result[0]?.id).toBe("a0");
      expect(result[1]?.id).toBe("p1");
    });
  });

  describe("pickFullSetAssets", () => {
    it("maps fullSetSlots to matching assets", () => {
      const g = makeGeneration({
        assets: [
          makeAsset({ id: "a1", type: "square", itemIndex: 0 }),
          makeAsset({ id: "a2", type: "portrait", itemIndex: 0 }),
        ],
      });
      const slots = [
        { type: "square", aspectRatio: "1:1", itemIndex: 0 },
        { type: "portrait", aspectRatio: "4:5", itemIndex: 0 },
        { type: "landscape", aspectRatio: "3:2", itemIndex: 0 },
      ];
      const result = pickFullSetAssets(g, slots);
      expect(result).toHaveLength(3);
      expect(result[0]?.id).toBe("a1");
      expect(result[1]?.id).toBe("a2");
      expect(result[2]).toBeNull();
    });

    it("returns sorted visible assets when no fullSetSlots provided", () => {
      const g = makeGeneration({
        assets: [
          makeAsset({ id: "a2", type: "square", itemIndex: 1 }),
          makeAsset({ id: "a1", type: "square", itemIndex: 0 }),
          makeAsset({ id: "r1", type: "rembg", itemIndex: 0 }),
        ],
      });
      const result = pickFullSetAssets(g);
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("a1");
      expect(result[1]?.id).toBe("a2");
    });

    it("excludes rembg, preview, placeholder when no slots", () => {
      const g = makeGeneration({
        assets: [
          makeAsset({ id: "p1", type: "preview" }),
          makeAsset({ id: "ph1", type: "placeholder" }),
          makeAsset({ id: "r1", type: "rembg" }),
        ],
      });
      const result = pickFullSetAssets(g);
      expect(result).toEqual([]);
    });

    it("returns empty array for generation with no assets and no slots", () => {
      const g = makeGeneration({ assets: [] });
      expect(pickFullSetAssets(g)).toEqual([]);
    });

    it("matches slot by type only when itemIndex is undefined", () => {
      const g = makeGeneration({
        assets: [
          makeAsset({ id: "a1", type: "square", itemIndex: 0 }),
          makeAsset({ id: "a2", type: "square", itemIndex: 1 }),
        ],
      });
      const slots = [{ type: "square", aspectRatio: "1:1" }];
      const result = pickFullSetAssets(g, slots);
      expect(result).toHaveLength(1);
      // Should match first asset of type "square" regardless of itemIndex
      expect(result[0]?.id).toBe("a1");
    });

    it("returns null for unmatched slot types", () => {
      const g = makeGeneration({
        assets: [makeAsset({ id: "a1", type: "square", itemIndex: 0 })],
      });
      const slots = [
        { type: "portrait", aspectRatio: "4:5", itemIndex: 0 },
      ];
      const result = pickFullSetAssets(g, slots);
      expect(result).toEqual([null]);
    });
  });

  describe("pickPreviewAssets additional branches", () => {
    it("returns empty array for full_set mode with no visible and no preview assets", () => {
      const fsRegistry = new AssetTypeRegistry([
        makeAssetType({ id: "square", displaySortOrder: 1, isVisible: true, isRegenable: true }),
      ]);
      const workflows = [makeWorkflow({ id: "wf1", outputMode: "full_set" })];
      const g = makeGeneration({
        assets: [makeAsset({ id: "r1", type: "rembg", itemIndex: null })],
      });
      const result = pickPreviewAssets(g, workflows, fsRegistry);
      // rembg is not visible, no preview either → sorted array empty → returns empty
      expect(result).toHaveLength(0);
    });

    it("fills preview slots only where finals are absent for single_image", () => {
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "image", displaySortOrder: 1, isVisible: true, isRegenable: false }),
        makeAssetType({ id: "preview", displaySortOrder: 99, isVisible: false, isRegenable: false }),
      ]);
      const workflows = [makeWorkflow({ id: "wf1", outputMode: "single_image" })];
      const g = makeGeneration({
        assets: [
          makeAsset({ id: "a0", type: "image", itemIndex: 0 }),
          makeAsset({ id: "a1", type: "image", itemIndex: 1 }),
          makeAsset({ id: "p2", type: "preview", itemIndex: 2 }),
          makeAsset({ id: "p3", type: "preview", itemIndex: 3 }),
        ],
      });
      const result = pickPreviewAssets(g, workflows, registry);
      expect(result).toHaveLength(4);
      expect(result[0]?.id).toBe("a0");
      expect(result[1]?.id).toBe("a1");
      expect(result[2]?.id).toBe("p2");
      expect(result[3]?.id).toBe("p3");
    });

    it("uses layered_image output mode same as single_image", () => {
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "image", displaySortOrder: 1, isVisible: true, isRegenable: false }),
      ]);
      const workflows = [makeWorkflow({ id: "wf1", outputMode: "layered_image" })];
      const g = makeGeneration({
        assets: [makeAsset({ id: "a0", type: "image", itemIndex: 0 })],
      });
      const result = pickPreviewAssets(g, workflows, registry);
      expect(result).toHaveLength(4);
      expect(result[0]?.id).toBe("a0");
    });

    it("uses single_audio output mode same as single_image", () => {
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "audio", displaySortOrder: 1, isVisible: true, isRegenable: false }),
      ]);
      const workflows = [makeWorkflow({ id: "wf1", outputMode: "single_audio" })];
      const g = makeGeneration({
        assets: [makeAsset({ id: "a0", type: "audio", itemIndex: 0 })],
      });
      const result = pickPreviewAssets(g, workflows, registry);
      expect(result).toHaveLength(4);
      expect(result[0]?.id).toBe("a0");
    });

    it("limits full_set indexed visible assets to 4", () => {
      const fsRegistry = new AssetTypeRegistry([
        makeAssetType({ id: "square", displaySortOrder: 1, isVisible: true, isRegenable: true }),
      ]);
      const workflows = [makeWorkflow({ id: "wf1", outputMode: "full_set" })];
      const g = makeGeneration({
        assets: [
          makeAsset({ id: "s0", type: "square", itemIndex: 0 }),
          makeAsset({ id: "s1", type: "square", itemIndex: 1 }),
          makeAsset({ id: "s2", type: "square", itemIndex: 2 }),
          makeAsset({ id: "s3", type: "square", itemIndex: 3 }),
          makeAsset({ id: "s4", type: "square", itemIndex: 4 }),
        ],
      });
      const result = pickPreviewAssets(g, workflows, fsRegistry);
      expect(result).toHaveLength(4);
    });

    it("ignores out-of-range itemIndex for single_image mode", () => {
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "image", displaySortOrder: 1, isVisible: true, isRegenable: false }),
      ]);
      const workflows = [makeWorkflow({ id: "wf1", outputMode: "single_image" })];
      const g = makeGeneration({
        assets: [makeAsset({ id: "a5", type: "image", itemIndex: 5 })],
      });
      const result = pickPreviewAssets(g, workflows, registry);
      // itemIndex 5 is out of range (0-3), so slots are all null, falls through to preview fallback
      expect(result).toEqual([]);
    });
  });
});
