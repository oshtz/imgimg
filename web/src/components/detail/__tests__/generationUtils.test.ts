// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { assetKey, isVideoAsset, isAudioAsset, displayItemIndex, statusPill, workflowLabel, makeSortAssets, pickDefaultAsset, downloadUrl } from "../generationUtils";
import type { Asset, Generation } from "../../../types";
import type { AdminAssetType } from "../../../api";
import { AssetTypeRegistry } from "../../../assetTypeRegistry";

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "a1",
    generationId: "g1",
    type: "square",
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

describe("detail/generationUtils", () => {
  describe("assetKey", () => {
    it("combines type and itemIndex", () => {
      expect(assetKey(makeAsset({ type: "square", itemIndex: 0 }))).toBe("square:0");
    });

    it("uses 'null' for null itemIndex", () => {
      expect(assetKey(makeAsset({ type: "portrait", itemIndex: null }))).toBe("portrait:null");
    });

    it("handles different types and indices", () => {
      expect(assetKey(makeAsset({ type: "video", itemIndex: 2 }))).toBe("video:2");
    });
  });

  describe("isVideoAsset", () => {
    it("returns true when type is video", () => {
      expect(isVideoAsset(makeAsset({ type: "video" }))).toBe(true);
    });

    it("returns true for .mp4 URL", () => {
      expect(isVideoAsset(makeAsset({ url: "http://x.com/clip.mp4" }))).toBe(true);
    });

    it("returns true for .webm URL", () => {
      expect(isVideoAsset(makeAsset({ url: "http://x.com/clip.webm" }))).toBe(true);
    });

    it("returns true for .mov URL", () => {
      expect(isVideoAsset(makeAsset({ url: "http://x.com/clip.MOV" }))).toBe(true);
    });

    it("returns false for .png URL", () => {
      expect(isVideoAsset(makeAsset({ url: "http://x.com/image.png" }))).toBe(false);
    });
  });

  describe("isAudioAsset", () => {
    it("returns true when type is audio", () => {
      expect(isAudioAsset(makeAsset({ type: "audio" }))).toBe(true);
    });

    it("returns true for .wav URL", () => {
      expect(isAudioAsset(makeAsset({ url: "http://x.com/sound.wav" }))).toBe(true);
    });

    it("returns true for .mp3 URL", () => {
      expect(isAudioAsset(makeAsset({ url: "http://x.com/sound.mp3" }))).toBe(true);
    });

    it("returns true for .ogg URL", () => {
      expect(isAudioAsset(makeAsset({ url: "http://x.com/sound.ogg" }))).toBe(true);
    });

    it("returns true for .m4a URL", () => {
      expect(isAudioAsset(makeAsset({ url: "http://x.com/sound.M4A" }))).toBe(true);
    });

    it("returns false for .png URL", () => {
      expect(isAudioAsset(makeAsset({ url: "http://x.com/image.png" }))).toBe(false);
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

  describe("workflowLabel", () => {
    const workflows = [
      { id: "wf1", label: "Workflow One" },
      { id: "wf2", label: "Workflow Two" },
    ] as any[];

    it("returns the label for a matching workflow", () => {
      expect(workflowLabel(workflows, "wf1")).toBe("Workflow One");
    });

    it("returns the label for another matching workflow", () => {
      expect(workflowLabel(workflows, "wf2")).toBe("Workflow Two");
    });

    it("falls back to the id when no workflow matches", () => {
      expect(workflowLabel(workflows, "wf_unknown")).toBe("wf_unknown");
    });
  });

  describe("makeSortAssets", () => {
    it("sorts by registry displaySortOrder first", () => {
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "portrait", displaySortOrder: 2 }),
        makeAssetType({ id: "square", displaySortOrder: 1 }),
      ]);
      const sortFn = makeSortAssets(registry);
      const assets = [
        makeAsset({ id: "p", type: "portrait", itemIndex: 0 }),
        makeAsset({ id: "s", type: "square", itemIndex: 0 }),
      ];
      assets.sort(sortFn);
      expect(assets[0].id).toBe("s");
      expect(assets[1].id).toBe("p");
    });

    it("sorts by itemIndex when types have same sort order", () => {
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "square", displaySortOrder: 1 }),
      ]);
      const sortFn = makeSortAssets(registry);
      const assets = [
        makeAsset({ id: "b", type: "square", itemIndex: 2 }),
        makeAsset({ id: "a", type: "square", itemIndex: 0 }),
      ];
      assets.sort(sortFn);
      expect(assets[0].id).toBe("a");
      expect(assets[1].id).toBe("b");
    });

    it("treats null itemIndex as -1", () => {
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "square", displaySortOrder: 1 }),
      ]);
      const sortFn = makeSortAssets(registry);
      const assets = [
        makeAsset({ id: "b", type: "square", itemIndex: 0 }),
        makeAsset({ id: "a", type: "square", itemIndex: null }),
      ];
      assets.sort(sortFn);
      expect(assets[0].id).toBe("a");
      expect(assets[1].id).toBe("b");
    });

    it("uses sort order 99 for unknown types", () => {
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "square", displaySortOrder: 1 }),
      ]);
      const sortFn = makeSortAssets(registry);
      const assets = [
        makeAsset({ id: "u", type: "unknown_type", itemIndex: 0 }),
        makeAsset({ id: "s", type: "square", itemIndex: 0 }),
      ];
      assets.sort(sortFn);
      expect(assets[0].id).toBe("s");
      expect(assets[1].id).toBe("u");
    });
  });

  describe("pickDefaultAsset", () => {
    it("returns the first visible asset sorted by registry order", () => {
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "portrait", displaySortOrder: 2, isVisible: true }),
        makeAssetType({ id: "square", displaySortOrder: 1, isVisible: true }),
      ]);
      const g = makeGeneration({
        assets: [
          makeAsset({ id: "p", type: "portrait", itemIndex: 0 }),
          makeAsset({ id: "s", type: "square", itemIndex: 0 }),
        ],
      });
      expect(pickDefaultAsset(g, registry)?.id).toBe("s");
    });

    it("returns null when generation has no assets", () => {
      const registry = new AssetTypeRegistry([makeAssetType()]);
      const g = makeGeneration({ assets: [] });
      expect(pickDefaultAsset(g, registry)).toBeNull();
    });

    it("excludes non-visible types", () => {
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "preview", displaySortOrder: 1, isVisible: false }),
        makeAssetType({ id: "square", displaySortOrder: 2, isVisible: true }),
      ]);
      const g = makeGeneration({
        assets: [
          makeAsset({ id: "p", type: "preview" }),
          makeAsset({ id: "s", type: "square" }),
        ],
      });
      expect(pickDefaultAsset(g, registry)?.id).toBe("s");
    });

    it("excludes placeholder type", () => {
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "placeholder", displaySortOrder: 1, isVisible: true }),
        makeAssetType({ id: "square", displaySortOrder: 2, isVisible: true }),
      ]);
      const g = makeGeneration({
        assets: [
          makeAsset({ id: "ph", type: "placeholder" }),
          makeAsset({ id: "s", type: "square" }),
        ],
      });
      expect(pickDefaultAsset(g, registry)?.id).toBe("s");
    });

    it("returns null when all assets are non-visible", () => {
      const registry = new AssetTypeRegistry([
        makeAssetType({ id: "preview", displaySortOrder: 1, isVisible: false }),
      ]);
      const g = makeGeneration({
        assets: [makeAsset({ type: "preview" })],
      });
      expect(pickDefaultAsset(g, registry)).toBeNull();
    });
  });

  describe("downloadUrl", () => {
    it("fetches URL, creates blob link, and triggers download", async () => {
      const fakeBlob = new Blob(["test-data"]);
      const fakeObjectUrl = "blob:http://localhost/fake";
      const clickMock = vi.fn();

      vi.stubGlobal("fetch", vi.fn(async () => ({
        blob: async () => fakeBlob,
      })));
      vi.stubGlobal("URL", {
        createObjectURL: vi.fn(() => fakeObjectUrl),
        revokeObjectURL: vi.fn(),
      });

      const fakeLink = { href: "", download: "", click: clickMock };
      vi.spyOn(document, "createElement").mockReturnValue(fakeLink as any);

      await downloadUrl("http://example.com/image.png", "image.png");

      expect(fetch).toHaveBeenCalledWith("http://example.com/image.png");
      expect(fakeLink.href).toBe(fakeObjectUrl);
      expect(fakeLink.download).toBe("image.png");
      expect(clickMock).toHaveBeenCalled();

      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it("handles fetch errors gracefully", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network error"); }));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Should not throw
      await downloadUrl("http://example.com/bad.png", "bad.png");

      expect(consoleSpy).toHaveBeenCalledWith("Download failed", expect.any(Error));

      consoleSpy.mockRestore();
      vi.unstubAllGlobals();
    });
  });
});
