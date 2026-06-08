import { describe, it, expect } from "vitest";
import { AssetTypeRegistry, EMPTY_REGISTRY } from "../assetTypeRegistry";
import type { AdminAssetType } from "../api";

function makeType(overrides: Partial<AdminAssetType> & { id: string }): AdminAssetType {
  return {
    displayName: overrides.id,
    description: null,
    displaySortOrder: 0,
    isVisible: true,
    isRegenable: false,
    isInpaintable: false,
    isDownloadable: false,
    isSystem: false,
    gridRow: "row1",
    gridSizeClass: "w-1/3",
    aspectRatio: "1:1",
    defaultPromptTemplate: null,
    defaultWidth: 1024,
    defaultHeight: 1024,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

const sampleTypes: AdminAssetType[] = [
  makeType({ id: "portrait", displaySortOrder: 3, aspectRatio: "4:5", isRegenable: true, isDownloadable: true }),
  makeType({ id: "square", displaySortOrder: 1, isVisible: true, isRegenable: true, isInpaintable: true, isDownloadable: true }),
  makeType({ id: "landscape", displaySortOrder: 2, aspectRatio: "3:2", isRegenable: true, isDownloadable: true }),
  makeType({ id: "video", displaySortOrder: 5, isVisible: true, isRegenable: true }),
  makeType({ id: "audio", displaySortOrder: 6, isVisible: true, isRegenable: true }),
  makeType({ id: "preview", displaySortOrder: 10, isVisible: false, isSystem: true }),
  makeType({ id: "placeholder", displaySortOrder: 11, isVisible: false, isSystem: true }),
];

describe("AssetTypeRegistry", () => {
  const registry = new AssetTypeRegistry(sampleTypes);

  describe("constructor", () => {
    it("sorts types by displaySortOrder", () => {
      const orders = registry.all().map((t) => t.displaySortOrder);
      expect(orders).toEqual([1, 2, 3, 5, 6, 10, 11]);
    });
  });

  describe("all()", () => {
    it("returns all types sorted", () => {
      const ids = registry.all().map((t) => t.id);
      expect(ids).toEqual(["square", "landscape", "portrait", "video", "audio", "preview", "placeholder"]);
    });
  });

  describe("get()", () => {
    it("finds a type by id", () => {
      const t = registry.get("square");
      expect(t).toBeDefined();
      expect(t!.id).toBe("square");
    });

    it("returns undefined for unknown id", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
    });
  });

  describe("sortOrder()", () => {
    it("returns the displaySortOrder for a known type", () => {
      expect(registry.sortOrder("portrait")).toBe(3);
    });

    it("returns 99 for unknown type", () => {
      expect(registry.sortOrder("unknown")).toBe(99);
    });
  });

  describe("allIds()", () => {
    it("returns all ids in sorted order", () => {
      expect(registry.allIds()).toEqual(["square", "landscape", "portrait", "video", "audio", "preview", "placeholder"]);
    });
  });

  describe("visibleIds()", () => {
    it("returns only visible type ids", () => {
      const visible = registry.visibleIds();
      expect(visible.has("square")).toBe(true);
      expect(visible.has("video")).toBe(true);
      expect(visible.has("preview")).toBe(false);
      expect(visible.has("placeholder")).toBe(false);
    });
  });

  describe("regenableIds()", () => {
    it("returns only regenable type ids", () => {
      const ids = registry.regenableIds();
      expect(ids.has("square")).toBe(true);
      expect(ids.has("portrait")).toBe(true);
      expect(ids.has("video")).toBe(true);
      expect(ids.has("preview")).toBe(false);
    });
  });

  describe("inpaintableIds()", () => {
    it("returns only inpaintable type ids", () => {
      const ids = registry.inpaintableIds();
      expect(ids.has("square")).toBe(true);
      expect(ids.has("portrait")).toBe(false);
    });
  });

  describe("downloadableIds()", () => {
    it("returns only downloadable type ids", () => {
      const ids = registry.downloadableIds();
      expect(ids.has("square")).toBe(true);
      expect(ids.has("landscape")).toBe(true);
      expect(ids.has("video")).toBe(false);
    });
  });

  describe("gridRow()", () => {
    it("returns gridRow for known type", () => {
      expect(registry.gridRow("square")).toBe("row1");
    });

    it("returns 'row2' for unknown type", () => {
      expect(registry.gridRow("unknown")).toBe("row2");
    });
  });

  describe("gridSizeClass()", () => {
    it("returns gridSizeClass for known type", () => {
      expect(registry.gridSizeClass("square")).toBe("w-1/3");
    });

    it("returns 'w-1/4' for unknown type", () => {
      expect(registry.gridSizeClass("unknown")).toBe("w-1/4");
    });
  });

  describe("aspectRatio()", () => {
    it("returns aspectRatio for known type", () => {
      expect(registry.aspectRatio("portrait")).toBe("4:5");
    });

    it("returns '1:1' for unknown type", () => {
      expect(registry.aspectRatio("unknown")).toBe("1:1");
    });
  });

  describe("displayName()", () => {
    it("returns displayName for known type", () => {
      expect(registry.displayName("square")).toBe("square");
    });

    it("returns the id itself for unknown type", () => {
      expect(registry.displayName("mystery")).toBe("mystery");
    });
  });

  describe("aspectClass()", () => {
    it("maps 4:5 to aspect-[4/5]", () => {
      expect(registry.aspectClass("portrait")).toBe("aspect-[4/5]");
    });

    it("maps 3:2 to aspect-[3/2]", () => {
      expect(registry.aspectClass("landscape")).toBe("aspect-[3/2]");
    });

    it("maps 1:1 to aspect-square", () => {
      expect(registry.aspectClass("square")).toBe("aspect-square");
    });

    it("maps unknown type (defaults to 1:1) to aspect-square", () => {
      expect(registry.aspectClass("unknown")).toBe("aspect-square");
    });

    it("maps 16:9 to aspect-video", () => {
      const reg = new AssetTypeRegistry([makeType({ id: "wide", aspectRatio: "16:9" })]);
      expect(reg.aspectClass("wide")).toBe("aspect-video");
    });

    it("maps 9:16 to aspect-[9/16]", () => {
      const reg = new AssetTypeRegistry([makeType({ id: "tall", aspectRatio: "9:16" })]);
      expect(reg.aspectClass("tall")).toBe("aspect-[9/16]");
    });

    it("maps 4:3 to aspect-[4/3]", () => {
      const reg = new AssetTypeRegistry([makeType({ id: "classic", aspectRatio: "4:3" })]);
      expect(reg.aspectClass("classic")).toBe("aspect-[4/3]");
    });

    it("parses custom W:H ratio", () => {
      const reg = new AssetTypeRegistry([makeType({ id: "custom", aspectRatio: "7:3" })]);
      expect(reg.aspectClass("custom")).toBe("aspect-[7/3]");
    });

    it("returns aspect-square for malformed aspect ratio (no colon)", () => {
      const reg = new AssetTypeRegistry([makeType({ id: "weird", aspectRatio: "square" })]);
      expect(reg.aspectClass("weird")).toBe("aspect-square");
    });
  });

  describe("isSystem()", () => {
    it("returns true for system types", () => {
      expect(registry.isSystem("preview")).toBe(true);
      expect(registry.isSystem("placeholder")).toBe(true);
    });

    it("returns false for non-system types", () => {
      expect(registry.isSystem("square")).toBe(false);
    });

    it("returns false for unknown types", () => {
      expect(registry.isSystem("unknown")).toBe(false);
    });
  });

  describe("fullSetIndicatorIds()", () => {
    it("includes visible, regenable types that are not video or audio", () => {
      const ids = registry.fullSetIndicatorIds();
      expect(ids.has("square")).toBe(true);
    });

    it("excludes video and audio", () => {
      const ids = registry.fullSetIndicatorIds();
      expect(ids.has("video")).toBe(false);
      expect(ids.has("audio")).toBe(false);
    });

    it("excludes non-visible types", () => {
      const ids = registry.fullSetIndicatorIds();
      expect(ids.has("preview")).toBe(false);
    });

    it("excludes non-regenable types even if visible", () => {
      const reg = new AssetTypeRegistry([
        makeType({ id: "noregen", isVisible: true, isRegenable: false }),
      ]);
      expect(reg.fullSetIndicatorIds().has("noregen")).toBe(false);
    });
  });

  describe("EMPTY_REGISTRY", () => {
    it("has zero types", () => {
      expect(EMPTY_REGISTRY.all()).toHaveLength(0);
      expect(EMPTY_REGISTRY.allIds()).toHaveLength(0);
    });

    it("returns defaults for lookups", () => {
      expect(EMPTY_REGISTRY.sortOrder("any")).toBe(99);
      expect(EMPTY_REGISTRY.gridRow("any")).toBe("row2");
      expect(EMPTY_REGISTRY.displayName("any")).toBe("any");
    });
  });
});
