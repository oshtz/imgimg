import type { AdminAssetType } from "./api";

/**
 * Client-side cached registry for asset type definitions.
 * Provides fast synchronous lookups used throughout the frontend
 * to replace hardcoded type-specific behavior.
 */
export class AssetTypeRegistry {
  private byId: Map<string, AdminAssetType>;
  private sorted: AdminAssetType[];

  constructor(types: AdminAssetType[]) {
    this.sorted = [...types].sort((a, b) => a.displaySortOrder - b.displaySortOrder);
    this.byId = new Map(types.map((t) => [t.id, t]));
  }

  /** Get all types sorted by displaySortOrder. */
  all(): AdminAssetType[] {
    return this.sorted;
  }

  /** Get a type by id. */
  get(id: string): AdminAssetType | undefined {
    return this.byId.get(id);
  }

  /** Get the display sort order for a type (lower = first). Returns 99 for unknown types. */
  sortOrder(id: string): number {
    return this.byId.get(id)?.displaySortOrder ?? 99;
  }

  /** Get all type IDs. */
  allIds(): string[] {
    return this.sorted.map((t) => t.id);
  }

  /** Get IDs of visible (non-system-internal) types. */
  visibleIds(): Set<string> {
    return new Set(this.sorted.filter((t) => t.isVisible).map((t) => t.id));
  }

  /** Get IDs of regenable types. */
  regenableIds(): Set<string> {
    return new Set(this.sorted.filter((t) => t.isRegenable).map((t) => t.id));
  }

  /** Get IDs of inpaintable types. */
  inpaintableIds(): Set<string> {
    return new Set(this.sorted.filter((t) => t.isInpaintable).map((t) => t.id));
  }

  /** Get IDs of downloadable types. */
  downloadableIds(): Set<string> {
    return new Set(this.sorted.filter((t) => t.isDownloadable).map((t) => t.id));
  }

  /** Get grid row assignment for a type. */
  gridRow(id: string): string {
    return this.byId.get(id)?.gridRow ?? "row2";
  }

  /** Get grid size class for a type. */
  gridSizeClass(id: string): string {
    return this.byId.get(id)?.gridSizeClass ?? "w-1/4";
  }

  /** Get aspect ratio for a type. */
  aspectRatio(id: string): string {
    return this.byId.get(id)?.aspectRatio ?? "1:1";
  }

  /** Get display name for a type. */
  displayName(id: string): string {
    return this.byId.get(id)?.displayName ?? id;
  }

  /**
   * Convert an aspect ratio string like "4:3" to a CSS aspect class.
   * Returns Tailwind-style aspect class.
   */
  aspectClass(id: string): string {
    const ar = this.aspectRatio(id);
    switch (ar) {
      case "4:5": return "aspect-[4/5]";
      case "3:2": return "aspect-[3/2]";
      case "4:3": return "aspect-[4/3]";
      case "16:9": return "aspect-video";
      case "9:16": return "aspect-[9/16]";
      case "1:1": return "aspect-square";
      default: {
        // Parse "W:H" and convert to aspect-[W/H]
        const parts = ar.split(":");
        if (parts.length === 2) return `aspect-[${parts[0]}/${parts[1]}]`;
        return "aspect-square";
      }
    }
  }

  /** Check if a type is a system type (cannot be deleted). */
  isSystem(id: string): boolean {
    return this.byId.get(id)?.isSystem ?? false;
  }

  /** Types that can trigger full_set inference when present in a generation. */
  fullSetIndicatorIds(): Set<string> {
    // A generation is inferred as "full_set" if it has any visible, non-system-generic types
    // that are regenable and aren't basic media types (video, audio)
    return new Set(
      this.sorted
        .filter((t) => t.isVisible && t.isRegenable && t.id !== "video" && t.id !== "audio")
        .map((t) => t.id)
    );
  }
}

/** Empty registry for use before data loads. */
export const EMPTY_REGISTRY = new AssetTypeRegistry([]);
